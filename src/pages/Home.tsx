import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Lock, Megaphone, MousePointerClick, Radio, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { Card, Skeleton } from '@/components/ui'
import { useFeed, useGlobalStats } from '@/lib/api'
import { useProtocolTotals } from '@/hooks/useChainData'
import { fmtUsdc, shortAddr, timeAgo } from '@/lib/format'
import { TxLink } from '@/components/shared'

function LiveFeed() {
  const { data, isLoading } = useFeed()
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Radio className="size-4 text-success" /> Live payouts
        </div>
        <span className="text-xs text-subtle">Settled onchain</span>
      </div>
      <div className="mt-4 space-y-2">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
        {data?.length === 0 && (
          <div className="inner rounded-2xl px-4 py-8 text-center text-sm text-muted">
            No payouts yet. The first verified click lands here within seconds.
          </div>
        )}
        {data?.slice(0, 5).map((p) => (
          <motion.div key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="inner flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">{p.title ?? `Campaign #${p.campaignId}`}</div>
              <div className="text-xs text-subtle">
                {shortAddr(p.creator)} · {p.clicks} {p.clicks === 1 ? 'click' : 'clicks'} · {timeAgo(p.ts)}
              </div>
            </div>
            <div className="text-right">
              <div className="display text-base font-medium tabular-nums text-success">+{fmtUsdc(p.amount)}</div>
              <TxLink hash={p.txHash} label="Receipt" />
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  )
}

function Totals() {
  const chain = useProtocolTotals()
  const { data: stats } = useGlobalStats()
  const items = [
    { label: 'Paid to creators', value: chain.paid !== undefined ? fmtUsdc(chain.paid) : null, usdc: true },
    { label: 'Locked by businesses', value: chain.deposited !== undefined ? fmtUsdc(chain.deposited) : null, usdc: true },
    { label: 'Campaigns', value: chain.count !== undefined ? String(chain.count) : null },
    { label: 'Clicks paid', value: stats ? String(stats.clicks) : null },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="inner rounded-2xl p-4">
          <div className="text-xs font-medium text-muted">{s.label}</div>
          <div className="display mt-1 flex items-center gap-1.5 text-xl font-medium tabular-nums text-ink">
            {s.value === null ? <Skeleton className="h-7 w-16" /> : s.value}
            {s.usdc && s.value !== null && <TokenUSDC variant="branded" size={16} />}
          </div>
        </div>
      ))}
    </div>
  )
}

const BUSINESS_STEPS = [
  { icon: Megaphone, title: 'List your product', body: 'Add your link, a short pitch and who you want to reach.' },
  { icon: Lock, title: 'Lock a pot of USDC', body: 'Set a price per click. Your deposit stays locked, so creators know the money is real.' },
  { icon: ShieldCheck, title: 'Approve creators', body: 'Pick the creators you trust. You only pay for verified clicks they bring.' },
]

const CREATOR_STEPS = [
  { icon: Sparkles, title: 'Find a campaign', body: 'Browse products and see exactly what each click pays.' },
  { icon: MousePointerClick, title: 'Apply and share', body: 'Once approved you get a personal tracked link to post anywhere.' },
  { icon: Wallet, title: 'Get paid per click', body: 'Every verified click is paid in USDC straight to your wallet, with no gas for you to pay.' },
]

function Steps({ title, tone, steps }: { title: string; tone: string; steps: typeof BUSINESS_STEPS }) {
  return (
    <Card className="p-6 sm:p-7">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">{tone}</div>
      <h3 className="display mt-1 text-2xl font-medium text-ink">{title}</h3>
      <ol className="mt-5 space-y-5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-hover">
              <s.icon className="size-5" />
            </span>
            <div>
              <div className="font-medium text-ink">
                {i + 1}. {s.title}
              </div>
              <p className="mt-0.5 text-pretty text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-2">
            <TokenUSDC variant="branded" size={14} /> Pay-per-click, settled in USDC on Arc
          </span>
          <h1 className="display mt-5 text-balance text-4xl font-medium leading-[1.05] text-ink sm:text-6xl">
            Pay creators for every click. Automatically.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg text-muted">
            Businesses lock USDC in a pot and set a price per click. Creators share a tracked link, and each verified click pays them straight from the pot.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/business/new" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-white transition-all hover:bg-ink active:scale-[0.98]">
              Launch a campaign <ArrowRight className="size-4" />
            </Link>
            <Link to="/explore" className="glass inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium text-ink transition-all hover:bg-surface-strong active:scale-[0.98]">
              Start earning
            </Link>
          </div>
        </div>
        <div className="sky-band rounded-2xl p-4 sm:p-6">
          <LiveFeed />
        </div>
      </section>

      <Totals />

      <section className="grid gap-5 md:grid-cols-2">
        <Steps tone="For businesses" title="Pay only for clicks you get" steps={BUSINESS_STEPS} />
        <Steps tone="For creators" title="Get paid the moment it counts" steps={CREATOR_STEPS} />
      </section>

      <div className="sky-band overflow-hidden rounded-2xl">
        <div className="grid gap-6 p-6 sm:grid-cols-3 sm:p-10">
          {[
            { t: 'Locked, not promised', b: 'Pots live in a smart contract. A business cannot pull funds back until the campaign ends or a safety window passes.' },
            { t: 'Paid in seconds', b: 'Verified clicks are reviewed briefly, then batched and paid automatically. No invoices, no 30-day waits.' },
            { t: 'Verifiable by anyone', b: 'Every deposit and payout is an onchain transaction you can open on the explorer.' },
          ].map((x) => (
            <div key={x.t}>
              <div className="display text-xl text-brand">{x.t}</div>
              <p className="mt-1.5 text-pretty text-sm text-ink-2">{x.b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
