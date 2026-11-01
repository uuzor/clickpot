import { useState } from 'react'
import { TokenUSDC } from '@web3icons/react'
import { Field, Segmented } from '@/components/ui'
import { fmtUsdc, safeParseUsdc } from '@/lib/format'
import { formatUsdc } from '@/onchain-money'
import { cn } from '@/lib/cn'
import { DURATIONS, type CampaignForm } from './types'

const RATE_CHIPS = ['0.01', '0.05', '0.10', '0.25']
const DEPOSIT_CHIPS = ['25', '50', '100', '250']

export function AmountInput({ value, onChange, label, hint, error, chips, trailing }: { value: string; onChange: (v: string) => void; label: string; hint?: string; error?: string | null; chips: string[]; trailing?: React.ReactNode }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="inner rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (/^\d*\.?\d{0,6}$/.test(v)) onChange(v)
            }}
            placeholder="0.00"
            className="display w-full bg-transparent text-4xl font-medium tabular-nums text-ink outline-none placeholder:text-slate-300"
          />
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-subtle">
            <TokenUSDC variant="branded" size={20} /> USDC
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn('min-h-8 rounded-full px-3 text-xs font-medium transition-colors', value === c ? 'bg-accent text-white' : 'bg-white text-ink-2 hover:bg-accent-soft')}
            >
              {c}
            </button>
          ))}
          {trailing}
        </div>
      </div>
    </Field>
  )
}

interface Props {
  form: CampaignForm
  set: (patch: Partial<CampaignForm>) => void
  balance: bigint | undefined
}

export function BudgetStep({ form, set, balance }: Props) {
  const [now] = useState(() => Date.now())
  const rate = safeParseUsdc(form.rate)
  const deposit = safeParseUsdc(form.deposit)
  const clicks = rate && deposit ? deposit / rate : 0n
  const rateError = form.rate && !rate ? 'Enter a rate above zero (up to 6 decimals).' : null
  const depositError =
    form.deposit && !deposit
      ? 'Enter an amount above zero.'
      : deposit && rate && deposit < rate
        ? 'The deposit must cover at least one click.'
        : deposit && balance !== undefined && deposit > balance
          ? `You have ${fmtUsdc(balance)} USDC. Use "Get test USDC" in the sidebar to top up.`
          : null

  return (
    <div className="space-y-6">
      <AmountInput label="Pay per verified click" hint="Creators see this rate on your listing. It cannot change once the campaign starts." value={form.rate} onChange={(rate) => set({ rate })} chips={RATE_CHIPS} error={rateError} />
      <AmountInput
        label="Pot to lock"
        hint="Held by the contract and only paid out to approved creators."
        value={form.deposit}
        onChange={(deposit) => set({ deposit })}
        chips={DEPOSIT_CHIPS}
        error={depositError}
        trailing={
          balance !== undefined && balance > 0n ? (
            <button type="button" onClick={() => set({ deposit: formatUsdc(balance) })} className="ml-auto text-xs font-medium text-accent-hover hover:underline">
              Balance {fmtUsdc(balance)} · Max
            </button>
          ) : null
        }
      />
      <Field label="Campaign length">
        <Segmented value={String(form.days)} onChange={(v) => set({ days: Number(v) })} options={DURATIONS.map((d) => ({ value: String(d), label: `${d} days` }))} />
      </Field>
      <div className="inner space-y-2.5 rounded-2xl p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Clicks this pot can pay for</span>
          <span className="font-medium tabular-nums text-ink">{clicks.toString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Ends</span>
          <span className="font-medium text-ink">{new Date(now + form.days * 86_400_000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Unspent funds return to you</span>
          <span className="font-medium text-ink">1 hour after it ends</span>
        </div>
      </div>
    </div>
  )
}

export const budgetValid = (f: CampaignForm, balance: bigint | undefined) => {
  const rate = safeParseUsdc(f.rate)
  const deposit = safeParseUsdc(f.deposit)
  return !!rate && !!deposit && deposit >= rate && (balance === undefined || deposit <= balance)
}
