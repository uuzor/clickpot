import { useState } from 'react'
import { erc20Abi } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { Banknote, Lock, Pause, Play, Plus, Power } from 'lucide-react'
import { toast } from 'sonner'
import { AmountInput } from '@/components/create/BudgetStep'
import { Sheet } from '@/components/Sheet'
import { PhaseBadge, Steps, type StepState } from '@/components/shared'
import { Button, Card, Progress } from '@/components/ui'
import { useChainTx } from '@/hooks/useChainTx'
import { useProtocolParams, useUsdc } from '@/hooks/useChainData'
import { usePermit, type PermitSig } from '@/hooks/usePermit'
import { CHAIN_ID, CLICKPOT_ADDRESS, USDC_ADDRESS, canWithdraw, clickPotAbi, phaseOf, type ChainCampaign } from '@/lib/contract'
import { clicksLeft, fmtDuration, fmtUsdc, safeParseUsdc, timeLeft } from '@/lib/format'

function TopUpSheet({ id, open, onClose, onDone }: { id: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const tx = useChainTx()
  const signPermit = usePermit()
  const { balance, allowance, refetch } = useUsdc()
  const [amount, setAmount] = useState('25')
  const [stage, setStage] = useState<'idle' | 'approve' | 'topup'>('idle')
  const raw = safeParseUsdc(amount)
  const tooMuch = raw !== null && balance !== undefined && raw > balance
  const needsApproval = raw !== null && (allowance ?? 0n) < raw

  async function run() {
    if (!raw) return
    let permit: PermitSig | null = null
    if (needsApproval) {
      setStage('approve')
      try {
        permit = await signPermit(raw)
      } catch {
        return setStage('idle')
      }
      if (!permit) {
        const ok = await tx.exec((w) => w({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [CLICKPOT_ADDRESS, raw], chainId: CHAIN_ID }))
        if (!ok) return setStage('idle')
        await refetch()
      }
    }
    setStage('topup')
    const done = await tx.exec((w) =>
      permit
        ? w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'topUpWithPermit', args: [BigInt(id), raw, permit.deadline, permit.v, permit.r, permit.s], chainId: CHAIN_ID })
        : w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'topUp', args: [BigInt(id), raw], chainId: CHAIN_ID }),
    )
    setStage('idle')
    if (done) {
      toast.success(`${fmtUsdc(raw)} USDC added to the pot`)
      onDone()
      onClose()
    }
  }

  const steps: { label: string; state: StepState }[] = []
  if (needsApproval || stage === 'approve') {
    steps.push({ label: 'Authorize your USDC', state: stage === 'approve' ? 'active' : stage === 'topup' ? 'done' : 'todo' })
  }
  steps.push({ label: 'Add to the pot', state: stage === 'topup' ? 'active' : 'todo' })

  return (
    <Sheet open={open} onClose={onClose} locked={stage !== 'idle'} title="Add to the pot" subtitle="More funds means more clicks creators can earn from.">
      <div className="space-y-5">
        <AmountInput
          label="Amount"
          value={amount}
          onChange={setAmount}
          chips={['10', '25', '50', '100']}
          error={tooMuch ? `You have ${fmtUsdc(balance ?? 0n)} USDC. Use "Get test USDC" in the sidebar.` : null}
        />
        {stage !== 'idle' && <Steps steps={steps} />}
        {tx.error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{tx.error}</p>}
        <Button size="lg" block disabled={!raw || tooMuch} loading={stage !== 'idle'} onClick={run}>
          {stage === 'idle' ? `Add ${raw ? fmtUsdc(raw) : ''} USDC` : tx.phase === 'wallet' ? 'Confirm in your wallet…' : 'Confirming…'}
        </Button>
      </div>
    </Sheet>
  )
}

export function FundsPanel({ id, chain, refetch }: { id: number; chain: ChainCampaign; refetch: () => unknown }) {
  const tx = useChainTx()
  const qc = useQueryClient()
  const { closeNotice } = useProtocolParams()
  const [topUp, setTopUp] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const phase = phaseOf(chain)
  const left = chain.totalDeposited > 0n ? Number((chain.balance * 100n) / chain.totalDeposited) : 0
  const unlocked = canWithdraw(chain)
  const editable = !chain.closing && phase !== 'ended'

  async function act(label: string, fn: Parameters<typeof tx.exec>[0], success: string) {
    const res = await tx.exec(fn)
    if (res) {
      toast.success(success)
      await refetch()
      await qc.invalidateQueries({ queryKey: ['campaign', id] })
    } else if (label === 'close') setConfirmClose(false)
  }

  return (
    <Card className="overflow-hidden">
      <div className="spectral-bar h-1" />
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Lock className="size-3.5" /> Remaining pot
          </div>
          <PhaseBadge phase={phase} />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="display text-5xl font-medium tabular-nums text-ink">{fmtUsdc(chain.balance)}</span>
          <span className="text-lg font-medium text-subtle">USDC</span>
        </div>
        <Progress value={left} className="mt-4" />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          About {clicksLeft(chain.balance, chain.ratePerClick).toString()} clicks of runway
          {phase === 'live' && left < 10 && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">Running low, add funds</span>}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-subtle">
          <span>{fmtUsdc(chain.totalPaid)} paid to creators</span>
          <span>{fmtUsdc(chain.totalDeposited)} deposited in total</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Button variant="primary" onClick={() => setTopUp(true)} disabled={!editable}>
            <Plus className="size-4" /> Add funds
          </Button>
          <Button
            variant="secondary"
            disabled={!editable || tx.busy}
            onClick={() =>
              act('pause', (w) => w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'setPaused', args: [BigInt(id), !chain.paused], chainId: CHAIN_ID }), chain.paused ? 'Campaign resumed' : 'Campaign paused')
            }
          >
            {chain.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {chain.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="secondary" disabled={chain.closing || phase === 'ended'} onClick={() => setConfirmClose(true)}>
            <Power className="size-4" /> Close early
          </Button>
          <Button
            variant="secondary"
            disabled={!unlocked || tx.busy}
            loading={tx.busy && unlocked}
            onClick={() => act('withdraw', (w) => w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'withdraw', args: [BigInt(id)], chainId: CHAIN_ID }), 'Remaining pot returned to your wallet')}
          >
            <Banknote className="size-4" /> Withdraw
          </Button>
        </div>
        <p className="mt-4 text-xs text-subtle">
          {unlocked
            ? 'The safety window has passed. You can withdraw what is left.'
            : chain.balance === 0n
              ? 'The pot is empty.'
              : `Funds stay locked to protect creators. You can withdraw in ${timeLeft(chain.unlockAt)}${chain.closing ? ' (closing)' : ''}.`}
        </p>
        {tx.error && <p className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{tx.error}</p>}
      </div>

      <TopUpSheet id={id} open={topUp} onClose={() => setTopUp(false)} onDone={() => void refetch()} />
      <Sheet open={confirmClose} onClose={() => setConfirmClose(false)} locked={tx.busy} title="Close this campaign?" subtitle="Creators stop earning right away.">
        <ul className="space-y-2 text-sm text-muted">
          <li>No new clicks are counted from this moment.</li>
          <li>Clicks already earned are still paid out.</li>
          <li>You can withdraw what is left {fmtDuration(closeNotice)} from now, so creators have time to be paid.</li>
        </ul>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmClose(false)} disabled={tx.busy}>
            Keep running
          </Button>
          <Button
            variant="danger"
            loading={tx.busy}
            onClick={async () => {
              await act('close', (w) => w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'requestClose', args: [BigInt(id)], chainId: CHAIN_ID }), 'Campaign closing')
              setConfirmClose(false)
            }}
          >
            Close campaign
          </Button>
        </div>
      </Sheet>
    </Card>
  )
}
