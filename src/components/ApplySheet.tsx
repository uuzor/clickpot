import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useAccount, useSignMessage } from 'wagmi'
import { ConnectGate } from '@/components/ConnectGate'
import { Sheet } from '@/components/Sheet'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { api } from '@/lib/api'
import { friendlyError, isCancelled } from '@/lib/errors'
import { applyMessage, contentHash, PLATFORMS, type ApplicationContent } from '@/shared/messages'

interface Props {
  open: boolean
  onClose: () => void
  campaignId: number
  campaignTitle: string
}

/** Accepts "x.com/me" or a full link and returns a valid https URL, or null. */
function normalizeUrl(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    return u.hostname.includes('.') ? u.toString() : null
  } catch {
    return null
  }
}

export function ApplySheet({ open, onClose, campaignId, campaignTitle }: Props) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const qc = useQueryClient()
  const [form, setForm] = useState({ handle: '', platform: PLATFORMS[0], profileUrl: '', audience: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const [touched, setTouched] = useState(false)
  const profileUrl = normalizeUrl(form.profileUrl)
  const errors = {
    handle: form.handle.trim().length >= 2 ? null : 'Add your handle, at least 2 characters.',
    profileUrl: profileUrl ? null : 'Add a link to your profile, like x.com/yourname.',
  }
  const valid = !errors.handle && !errors.profileUrl

  async function submit() {
    if (!address) return
    if (!valid || !profileUrl) {
      setTouched(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const content: ApplicationContent = {
        handle: form.handle.trim(),
        platform: form.platform,
        profileUrl,
        audience: form.audience.trim(),
        note: form.note.trim(),
      }
      const signature = await signMessageAsync({ message: applyMessage(campaignId, address, contentHash(content)) })
      await api(`/campaigns/${campaignId}/apply`, { body: { ...content, creator: address, signature } })
      await qc.invalidateQueries({ queryKey: ['me', campaignId] })
      await qc.invalidateQueries({ queryKey: ['creator'] })
      setSent(true)
    } catch (e) {
      if (!isCancelled(e)) setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    onClose()
    setTimeout(() => setSent(false), 300)
  }

  return (
    <Sheet open={open} onClose={close} locked={busy} title={sent ? 'Application sent' : 'Apply to promote'} subtitle={sent ? undefined : campaignTitle}>
      {sent ? (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <p className="mx-auto mt-4 max-w-xs text-pretty text-sm text-muted">
            The business will review your profile. Once approved, your personal tracked link appears here and on your creator dashboard.
          </p>
          <Button className="mt-6" block onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Handle" error={touched ? errors.handle : null}>
              <Input value={form.handle} onChange={set('handle')} placeholder="@yourname" maxLength={40} />
            </Field>
            <Field label="Main platform">
              <Select value={form.platform} onChange={set('platform')}>
                {PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Profile link" hint="Where the business can see your work." error={touched ? errors.profileUrl : null}>
            <Input value={form.profileUrl} onChange={set('profileUrl')} placeholder="x.com/yourname" inputMode="url" />
          </Field>
          <Field label="Audience size" hint="Optional. For example 12k followers.">
            <Input value={form.audience} onChange={set('audience')} placeholder="12k followers" maxLength={40} />
          </Field>
          <Field label="Why you are a fit" hint="Optional. A sentence or two.">
            <Textarea value={form.note} onChange={set('note')} maxLength={400} rows={3} />
          </Field>
          {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <ConnectGate label="Connect wallet to apply">
            <Button size="lg" block loading={busy} onClick={submit}>
              {busy ? 'Confirm in your wallet…' : 'Sign and send application'}
            </Button>
            <p className="mt-2 text-center text-xs text-subtle">Signing proves the application is yours. It is free and sends no transaction.</p>
          </ConnectGate>
        </div>
      )}
    </Sheet>
  )
}
