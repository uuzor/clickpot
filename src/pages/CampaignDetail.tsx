import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, ExternalLink, Lock, MousePointerClick, Users } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ApplySheet } from '@/components/ApplySheet'
import { ConnectGate } from '@/components/ConnectGate'
import { CampaignVisual, PhaseBadge } from '@/components/shared'
import { TrackedLinkCard } from '@/components/TrackedLinkCard'
import { Badge, Button, Card, EmptyState, Progress, Skeleton, Stat } from '@/components/ui'
import { useChainCampaign, useProtocolParams } from '@/hooks/useChainData'
import { useCampaignDetail, useHealth, useMyStatus } from '@/lib/api'
import { phaseOf, type ChainCampaign, type Phase } from '@/lib/contract'
import { clicksLeft, fmtDuration, fmtUsdc, timeLeft } from '@/lib/format'

function ApplyPanel({ id, title, chain, phase }: { id: number; title: string; chain: ChainCampaign; phase: Phase }) {
  const { address } = useAccount()
  const { data: me } = useMyStatus(id, address)
  const [open, setOpen] = useState(false)
  const isOwner = !!address && chain.owner.toLowerCase() === address.toLowerCase()

  if (isOwner) {
    return (
      <Link to={`/business/campaign/${id}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[15px] font-medium text-white hover:bg-ink">
        Manage your campaign
      </Link>
    )
  }
  if (me?.status === 'approved' && me.code) {
    return (
      <div className="space-y-3">
        <Badge tone="success">You are approved</Badge>
        <TrackedLinkCard code={me.code} title={title} />
        <Link to="/creator" className="block text-center text-sm font-medium text-accent-hover hover:underline">
          See your earnings
        </Link>
      </div>
    )
  }
  if (me?.status === 'approved') {
    return <p className="inner rounded-2xl px-4 py-3 text-sm text-muted">Approved. Your tracked link is being created, this takes a few seconds.</p>
  }
  if (me?.status === 'revoked') {
    return <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">The business paused your access to this campaign. Clicks you already earned are still paid.</p>
  }
  if (phase !== 'live') {
    return <p className="inner rounded-2xl px-4 py-3 text-sm text-muted">This campaign is not taking new creators right now.</p>
  }
  return (
    <>
      <ConnectGate label="Connect wallet to apply">
        {me?.applied ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-hover">Application sent. You will get your link here as soon as the business approves you.</p>
            <Button variant="ghost" block onClick={() => setOpen(true)}>
              Update application
            </Button>
          </div>
        ) : (
          <Button size="lg" block onClick={() => setOpen(true)}>
            {me?.dismissed ? 'Apply again' : 'Apply to promote'}
          </Button>
        )}
      </ConnectGate>
      <ApplySheet open={open} onClose={() => setOpen(false)} campaignId={id} campaignTitle={title} />
    </>
  )
}

export function CampaignDetail() {
  const id = Number(useParams().id)
  const { data: meta, isLoading, isError } = useCampaignDetail(id)
  const { campaign: chain, isLoading: chainLoading } = useChainCampaign(id)
  const { data: health } = useHealth()
  const { closeNotice, settleGrace } = useProtocolParams()

  if (isError) {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="size-6" />}
          title="Campaign not found"
          body="It may not be published yet, or the link is wrong."
          action={
            <Link to="/explore" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white">
              Browse campaigns
            </Link>
          }
        />
      </Card>
    )
  }
  if (isLoading || chainLoading || !meta || !chain) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[480px] rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  const phase = phaseOf(chain)
  const left = chain.totalDeposited > 0n ? Number((chain.balance * 100n) / chain.totalDeposited) : 0
  const runway = clicksLeft(chain.balance, chain.ratePerClick)

  return (
    <div className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All campaigns
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CampaignVisual title={meta.title} imageUrl={meta.imageUrl} id={meta.id} className="h-56 w-full sm:h-64" />
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{meta.category}</Badge>
                <PhaseBadge phase={phase} />
              </div>
              <h1 className="display mt-4 text-balance text-3xl font-medium text-ink sm:text-4xl">{meta.title}</h1>
              <p className="mt-2 text-pretty text-lg text-muted">{meta.tagline}</p>
              <a
                href={meta.destinationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-hover hover:underline"
              >
                {meta.destinationHost} <ExternalLink className="size-3.5" />
              </a>
              <p className="mt-6 whitespace-pre-line text-pretty leading-relaxed text-ink-2">{meta.description}</p>
              {meta.requirements && (
                <div className="inner mt-6 rounded-2xl p-5">
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-subtle">Who they are looking for</div>
                  <p className="mt-2 whitespace-pre-line text-pretty text-sm text-ink-2">{meta.requirements}</p>
                </div>
              )}
            </div>
          </Card>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Verified clicks" value={meta.clicks} />
            <Stat label="Creators" value={meta.partners} />
            <Stat label="Paid out" value={fmtUsdc(chain.totalPaid)} sub="USDC" />
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="overflow-hidden">
            <div className="spectral-bar h-1" />
            <div className="p-6">
              <div className="text-xs font-medium text-muted">You earn per verified click</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="display text-5xl font-medium tabular-nums text-ink">{fmtUsdc(chain.ratePerClick)}</span>
                <span className="text-lg font-medium text-subtle">USDC</span>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                    <Lock className="size-3.5" /> Locked in the pot
                  </span>
                  <span className="font-medium tabular-nums text-ink">{fmtUsdc(chain.balance)} USDC</span>
                </div>
                <Progress value={left} className="mt-2" />
                <div className="mt-2 flex justify-between text-xs text-subtle">
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick className="size-3.5" /> ~{runway.toString()} clicks left
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" /> {timeLeft(chain.endsAt)}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <ApplyPanel id={id} title={meta.title} chain={chain} phase={phase} />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Users className="size-4" /> How you get paid
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>The business approves you onchain, then you get a personal link.</li>
              <li>Each visitor counts once every {health?.dedupeMinutes ?? 60} minutes per link.</li>
              <li>Verified clicks are paid in USDC straight from the pot, usually within about a minute ({health?.holdSeconds ?? 30}s review hold, then payout).</li>
            </ul>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Lock className="size-4" /> Payout protection
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>The pot is held by the contract. The business can only withdraw after the campaign ends (plus {fmtDuration(settleGrace)}), or {fmtDuration(closeNotice)} after asking to close early.</li>
              <li>Pausing stops new clicks from counting. Clicks you already earned are still paid.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  )
}
