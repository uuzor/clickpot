import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import { PHASE_LABEL, type Phase } from '@/lib/contract'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID } from '@/lib/contract'

const PHASE_TONE = { live: 'success', paused: 'warn', closing: 'warn', ended: 'neutral', exhausted: 'danger' } as const

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <Badge tone={PHASE_TONE[phase]}>
      {phase === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-success" />}
      {PHASE_LABEL[phase]}
    </Badge>
  )
}

const TILES = [
  { bg: 'var(--sky-tint)', fg: 'var(--brand-blue)' },
  { bg: 'var(--deep-sky)', fg: 'var(--brand-blue)' },
  { bg: 'var(--stone)', fg: '#ffffff' },
  { bg: 'var(--obsidian)', fg: '#ffffff' },
  { bg: 'var(--brand-blue)', fg: 'var(--sky-tint)' },
]

/** Product tile: the business image when provided, otherwise a calm initials tile. */
export function CampaignVisual({ title, imageUrl, id, className }: { title: string; imageUrl?: string; id: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (imageUrl && !failed) {
    return <img src={imageUrl} alt="" onError={() => setFailed(true)} className={cn('object-cover', className)} loading="lazy" />
  }
  return (
    <div className={cn('flex items-center justify-center', className)} style={{ background: TILES[id % TILES.length].bg, color: TILES[id % TILES.length].fg }} aria-hidden>
      <span className="display text-4xl">{initials(title)}</span>
    </div>
  )
}

export function CopyButton({ value, label = 'Copy', disabled, className }: { value: string | null; label?: string; disabled?: boolean; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      disabled={disabled || !value}
      onClick={() => {
        if (!value) return
        navigator.clipboard.writeText(value).then(
          () => {
            setDone(true)
            setTimeout(() => setDone(false), 1800)
          },
          () => toast.error('Could not copy. Select the link and copy it manually.'),
        )
      }}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-ink active:scale-[0.98] disabled:opacity-40',
        className,
      )}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? 'Copied' : label}
    </button>
  )
}

export function TxLink({ hash, label = 'View on ArcScan' }: { hash: string; label?: string }) {
  return (
    <a
      href={buildTxExplorerUrl(CHAIN_ID, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-accent-hover hover:underline"
    >
      {label} <ExternalLink className="size-3" />
    </a>
  )
}

export function ClicksChart({ data, height = 120 }: { data: { day: string; clicks: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.clicks))
  const total = data.reduce((s, d) => s + d.clicks, 0)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={`${total} clicks over the last ${data.length} days`}>
        {data.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${d.clicks} clicks`}>
            <motion.div
              className={cn('w-full origin-bottom rounded-t-md', d.clicks > 0 ? 'bg-deep-sky' : 'bg-surface-muted')}
              style={{ height: `${Math.max(4, (d.clicks / max) * 100)}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.02, type: 'spring', stiffness: 260, damping: 26 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-subtle">
        <span>{data[0]?.day.slice(5)}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

/** Step list for multi-transaction flows. Each state comes from real wallet and receipt events. */
export type StepState = 'todo' | 'active' | 'done'
export function Steps({ steps }: { steps: { label: string; state: StepState; hint?: string }[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
              s.state === 'done' && 'bg-success text-white',
              s.state === 'active' && 'bg-accent text-white',
              s.state === 'todo' && 'bg-surface-muted text-subtle',
            )}
          >
            {s.state === 'done' ? <Check className="size-3.5" /> : s.state === 'active' ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
          </span>
          <div>
            <div className={cn('text-sm font-medium', s.state === 'todo' ? 'text-subtle' : 'text-ink')}>{s.label}</div>
            {s.hint && s.state === 'active' && <div className="text-xs text-muted">{s.hint}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-balance text-3xl font-medium text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-pretty text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
