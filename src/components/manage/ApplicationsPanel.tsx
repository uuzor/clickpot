import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Inbox, UserX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useSignMessage } from 'wagmi'
import { Badge, Button, EmptyState, Segmented, Skeleton } from '@/components/ui'
import { useChainTx } from '@/hooks/useChainTx'
import { api, useApplications, type ApplicationItem } from '@/lib/api'
import { CHAIN_ID, CLICKPOT_ADDRESS, clickPotAbi } from '@/lib/contract'
import { friendlyError, isCancelled } from '@/lib/errors'
import { fmtUsdc, initials, shortAddr, timeAgo } from '@/lib/format'
import { dismissMessage } from '@/shared/messages'

type Tab = 'requests' | 'creators'

function Avatar({ name }: { name: string }) {
  return <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-sm font-medium text-accent-hover">{initials(name)}</span>
}

export function ApplicationsPanel({ id, canApprove }: { id: number; canApprove: boolean }) {
  const { data, isLoading } = useApplications(id)
  const tx = useChainTx()
  const qc = useQueryClient()
  const { signMessageAsync } = useSignMessage()
  const [tab, setTab] = useState<Tab>('requests')
  const [working, setWorking] = useState<string | null>(null)

  const requests = (data ?? []).filter((a) => a.status === 'pending')
  const creators = (data ?? []).filter((a) => a.status !== 'pending')
  const refresh = () => qc.invalidateQueries({ queryKey: ['applications', id] })

  async function setStatus(a: ApplicationItem, fn: 'approveCreator' | 'revokeCreator') {
    setWorking(a.creator)
    const res = await tx.exec((w) =>
      w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: fn, args: [BigInt(id), a.creator as `0x${string}`], chainId: CHAIN_ID }),
    )
    setWorking(null)
    if (res) {
      toast.success(fn === 'approveCreator' ? `${a.handle} approved. Their link is being created.` : `${a.handle} paused`)
      await refresh()
      void qc.invalidateQueries({ queryKey: ['campaign', id] })
    }
  }

  async function dismiss(a: ApplicationItem) {
    setWorking(a.creator)
    try {
      const signature = await signMessageAsync({ message: dismissMessage(id, a.creator) })
      await api(`/campaigns/${id}/dismiss`, { body: { creator: a.creator, signature } })
      await refresh()
    } catch (e) {
      if (!isCancelled(e)) toast.error(friendlyError(e))
    } finally {
      setWorking(null)
    }
  }

  const rows = tab === 'requests' ? requests : creators

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-xl font-medium text-ink">Creators</h2>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'requests', label: `Requests${requests.length ? ` (${requests.length})` : ''}` },
            { value: 'creators', label: `Approved (${creators.length})` },
          ]}
        />
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && <Skeleton className="h-24 rounded-2xl" />}
        {!isLoading && rows.length === 0 && (
          <div className="inner rounded-2xl">
            <EmptyState
              icon={tab === 'requests' ? <Inbox className="size-6" /> : <Users className="size-6" />}
              title={tab === 'requests' ? 'No requests waiting' : 'No approved creators yet'}
              body={tab === 'requests' ? 'When a creator applies to your campaign, they show up here for you to review.' : 'Approve a request and the creator gets a tracked link right away.'}
            />
          </div>
        )}
        {rows.map((a) => (
          <div key={a.creator} className="inner rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-4">
              <Avatar name={a.handle} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{a.handle}</span>
                  <Badge>{a.platform}</Badge>
                  {a.audience && <span className="text-xs text-subtle">{a.audience}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                  <span className="mono">{shortAddr(a.creator)}</span>
                  <span>{timeAgo(a.createdAt)}</span>
                  <a href={a.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-hover hover:underline">
                    Profile <ExternalLink className="size-3" />
                  </a>
                </div>
                {a.note && <p className="mt-2 text-pretty text-sm text-ink-2">{a.note}</p>}

                {tab === 'creators' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={a.status === 'approved' ? 'success' : 'warn'}>{a.status === 'approved' ? 'Active' : 'Paused'}</Badge>
                    <span className="text-muted">
                      {a.clicks} clicks · {fmtUsdc(a.paid)} USDC paid
                    </span>
                    {a.status === 'approved' && !a.code && <span className="text-subtle">Creating link…</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {tab === 'requests' ? (
                  <>
                    <Button size="sm" disabled={!canApprove || tx.busy} loading={working === a.creator && tx.busy} onClick={() => setStatus(a, 'approveCreator')}>
                      <Check className="size-4" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" disabled={working === a.creator} onClick={() => dismiss(a)}>
                      <UserX className="size-4" /> Dismiss
                    </Button>
                  </>
                ) : a.status === 'approved' ? (
                  <Button size="sm" variant="secondary" disabled={tx.busy} loading={working === a.creator && tx.busy} onClick={() => setStatus(a, 'revokeCreator')}>
                    Pause
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={!canApprove || tx.busy} loading={working === a.creator && tx.busy} onClick={() => setStatus(a, 'approveCreator')}>
                    Restore
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
        {tx.error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{tx.error}</p>}
        {!canApprove && requests.length > 0 && <p className="text-xs text-subtle">Approvals are disabled because this campaign is closing or has ended.</p>}
      </div>
    </div>
  )
}
