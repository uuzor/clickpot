import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { erc20Abi, parseEventLogs } from 'viem'
import { AlertTriangle, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectGate } from '@/components/ConnectGate'
import { Steps, TxLink, type StepState } from '@/components/shared'
import { Button } from '@/components/ui'
import { useChainTx } from '@/hooks/useChainTx'
import { useProtocolParams, useUsdc } from '@/hooks/useChainData'
import { usePermit, type PermitSig } from '@/hooks/usePermit'
import { usePublish } from '@/hooks/usePublish'
import { CHAIN_ID, CLICKPOT_ADDRESS, USDC_ADDRESS, clickPotAbi } from '@/lib/contract'
import { friendlyError, isCancelled } from '@/lib/errors'
import { fmtDuration, fmtUsdc, safeParseUsdc } from '@/lib/format'
import { saveDraft } from '@/lib/local'
import { toContent, type CampaignForm } from './types'

type Stage = 'idle' | 'approve' | 'create' | 'publish'

export function ReviewStep({ form }: { form: CampaignForm }) {
  const navigate = useNavigate()
  const tx = useChainTx()
  const publish = usePublish()
  const { allowance, refetch } = useUsdc()
  const [stage, setStage] = useState<Stage>('idle')
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [hashes, setHashes] = useState<{ approve?: string; create?: string }>({})
  const [publishError, setPublishError] = useState<string | null>(null)
  const [done, setDone] = useState<Stage[]>([])
  const [approvalPlanned, setApprovalPlanned] = useState(true)
  const [usedPermit, setUsedPermit] = useState(false)
  const signPermit = usePermit()
  const { closeNotice } = useProtocolParams()

  const rate = safeParseUsdc(form.rate)
  const deposit = safeParseUsdc(form.deposit)
  const needsApproval = deposit !== null && (allowance ?? 0n) < deposit
  const content = toContent(form)

  async function publishNow(id: number) {
    setStage('publish')
    setPublishError(null)
    try {
      await publish(id, content)
      toast.success('Campaign is live')
      void navigate(`/business/campaign/${id}`)
    } catch (e) {
      if (!isCancelled(e)) setPublishError(friendlyError(e))
      else setPublishError('Signing was cancelled. Your funds are safely locked, sign again to publish.')
      setStage('idle')
    }
  }

  async function launch() {
    if (!rate || !deposit) return
    if (createdId) return publishNow(createdId)

    setApprovalPlanned(needsApproval)
    let permit: PermitSig | null = null
    if (!needsApproval) {
      setDone((d) => [...d, 'approve'])
    } else {
      setStage('approve')
      try {
        permit = await signPermit(deposit)
      } catch {
        return setStage('idle')
      }
      if (permit) {
        setUsedPermit(true)
        setDone((d) => [...d, 'approve'])
      } else {
        const approved = await tx.exec((write) =>
          write({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [CLICKPOT_ADDRESS, deposit], chainId: CHAIN_ID }),
        )
        if (!approved) return setStage('idle')
        setHashes((h) => ({ ...h, approve: approved.hash }))
        setDone((d) => [...d, 'approve'])
        await refetch()
      }
    }

    setStage('create')
    const duration = BigInt(form.days) * 86_400n
    const created = await tx.exec((write) =>
      permit
        ? write({
            address: CLICKPOT_ADDRESS,
            abi: clickPotAbi,
            functionName: 'createCampaignWithPermit',
            args: [rate, deposit, duration, permit.deadline, permit.v, permit.r, permit.s],
            chainId: CHAIN_ID,
          })
        : write({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'createCampaign', args: [rate, deposit, duration], chainId: CHAIN_ID }),
    )
    if (!created) return setStage('idle')
    setHashes((h) => ({ ...h, create: created.hash }))
    setDone((d) => [...d, 'create'])
    const event = parseEventLogs({ abi: clickPotAbi, logs: created.receipt.logs, eventName: 'CampaignCreated' })[0]
    if (!event) {
      toast.error('Funds locked, but the campaign id could not be read. Check your dashboard.')
      return setStage('idle')
    }
    const id = Number(event.args.id)
    setCreatedId(id)
    saveDraft(id, content)
    await publishNow(id)
  }

  const stateOf = (s: Stage): StepState => (stage === s ? 'active' : done.includes(s) ? 'done' : 'todo')
  const steps = [
    { label: !approvalPlanned ? 'USDC already approved' : usedPermit ? 'Authorize your USDC with a free signature' : 'Allow Clickpot to hold your USDC', state: stateOf('approve'), hint: tx.phase === 'wallet' ? 'Confirm in your wallet' : 'Sign the USDC permit in your wallet. It is free.' },
    { label: 'Lock your pot in the contract', state: stateOf('create'), hint: tx.phase === 'wallet' ? 'Confirm in your wallet' : 'Waiting for confirmation' },
    { label: 'Sign and publish your listing', state: stateOf('publish'), hint: 'Sign the message in your wallet. It is free.' },
  ]
  const running = stage !== 'idle'

  return (
    <div className="space-y-6">
      <div className="inner space-y-3 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted">Campaign</div>
            <div className="display truncate text-lg font-medium text-ink">{content.title || 'Untitled'}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-muted">Pay per click</div>
            <div className="display text-lg font-medium tabular-nums text-ink">{rate ? fmtUsdc(rate) : '—'}</div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Lock className="size-4" /> You lock
          </span>
          <span className="display text-2xl font-medium tabular-nums text-ink">{deposit ? fmtUsdc(deposit) : '—'} USDC</span>
        </div>
        <div className="text-xs text-subtle">
          For {form.days} days. Creators are only paid for verified clicks. Your pot stays locked until the campaign ends, or {fmtDuration(closeNotice)} after you ask to close early. Clicks already earned are paid first.
        </div>
      </div>

      {(running || createdId) && <Steps steps={steps} />}
      {hashes.create && (
        <div className="flex gap-4">
          {hashes.approve && <TxLink hash={hashes.approve} label="Approval receipt" />}
          <TxLink hash={hashes.create} label="Deposit receipt" />
        </div>
      )}

      {createdId && publishError && (
        <div className="flex gap-3 rounded-2xl bg-warn-soft p-4 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>Your pot is locked onchain, but the listing is not published yet. {publishError}</div>
        </div>
      )}
      {!createdId && tx.error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{tx.error}</p>}

      <ConnectGate label="Connect wallet to launch">
        <Button size="lg" block loading={running} disabled={!rate || !deposit} onClick={launch}>
          {running ? (stage === 'publish' ? 'Waiting for signature…' : tx.phase === 'wallet' ? 'Confirm in your wallet…' : 'Confirming…') : createdId ? 'Publish listing' : 'Lock pot and launch'}
        </Button>
        {!running && !createdId && <p className="mt-2 text-center text-xs text-subtle">{needsApproval ? 'You will sign a free USDC permit, confirm 1 transaction and sign 1 message.' : 'You will confirm 1 transaction and sign 1 message.'}</p>}
      </ConnectGate>
    </div>
  )
}
