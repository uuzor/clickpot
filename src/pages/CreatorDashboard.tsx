import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Coins, Sparkles, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { ConnectGate } from '@/components/ConnectGate'
import { ClicksChart, PageTitle, TxLink } from '@/components/shared'
import { TrackedLinkCard } from '@/components/TrackedLinkCard'
import { Badge, Button, Card, EmptyState, Skeleton, Stat } from '@/components/ui'
import { useChainTx } from '@/hooks/useChainTx'
import { useClaimable } from '@/hooks/useChainData'
import { useCreatorOverview, type Partnership } from '@/lib/api'
import { CHAIN_ID, CLICKPOT_ADDRESS, clickPotAbi } from '@/lib/contract'
import { fmtUsdc, timeAgo } from '@/lib/format'

function ClaimBanner({ address }: { address: `0x${string}` }) {
  const { amount, refetch } = useClaimable(address)
  const tx = useChainTx()
  if (amount === 0n) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-warn-soft p-5">
      <div className="text-sm text-warn">
        <div className="font-medium">{fmtUsdc(amount)} USDC is waiting for you</div>
        <div className="mt-0.5 text-warn/80">A payout could not be sent directly, so it was set aside for you to claim.</div>
      </div>
      <Button
        size="sm"
        loading={tx.busy}
        onClick={async () => {
          const res = await tx.exec((w) => w({ address: CLICKPOT_ADDRESS, abi: clickPotAbi, functionName: 'claim', chainId: CHAIN_ID }))
          if (res) {
            toast.success('Payout claimed')
            void refetch()
          }
        }}
      >
        Claim now
      </Button>
    </div>
  )
}

function PartnershipCard({ p }: { p: Partnership }) {
  const statusBadge =
    p.status === 'approved' ? (
      <Badge tone={p.live ? 'success' : 'neutral'}>{p.live ? 'Earning' : 'Campaign not live'}</Badge>
    ) : p.status === 'revoked' ? (
      <Badge tone="warn">Paused by business</Badge>
    ) : (
      <Badge tone="accent">
        <Clock className="size-3" /> Waiting for approval
      </Badge>
    )
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/campaign/${p.campaignId}`} className="display block truncate text-lg font-medium text-ink hover:underline">
            {p.title}
          </Link>
          <div className="mt-0.5 text-sm text-muted">
            {p.destinationHost} · {fmtUsdc(p.ratePerClick)} USDC per click
          </div>
        </div>
        {statusBadge}
      </div>

      {p.status === 'approved' && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Link visits" value={p.views} />
            <Stat label="Paid clicks" value={p.clicks} sub={p.pendingClicks ? `${p.pendingClicks} paying now` : undefined} />
            <Stat label="Earned" value={fmtUsdc(p.earned)} sub="USDC" />
          </div>
          <div className="mt-4">{p.code ? <TrackedLinkCard code={p.code} title={p.title} /> : <p className="inner rounded-2xl px-4 py-3 text-sm text-muted">Creating your link. This takes a few seconds.</p>}</div>
        </>
      )}
    </Card>
  )
}

function Dashboard({ address }: { address: `0x${string}` }) {
  const { data, isLoading, isError } = useCreatorOverview(address.toLowerCase())

  if (isError) {
    return (
      <Card>
        <EmptyState icon={<Wallet className="size-6" />} title="Your earnings can't load right now" body="The campaign service is not reachable. Try again in a moment." />
      </Card>
    )
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }

  const pendingValue = data.partnerships.reduce((s, p) => s + BigInt(p.pendingClicks) * BigInt(p.ratePerClick), 0n)
  const active = data.partnerships.filter((p) => p.status !== 'pending')
  const waiting = data.partnerships.filter((p) => p.status === 'pending')

  return (
    <div className="space-y-8">
      <PageTitle
        title="Your earnings"
        subtitle="Every verified click is paid to your wallet in USDC. Share your links and watch it add up."
        action={
          <Link to="/explore" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-ink">
            Find campaigns <ArrowRight className="size-4" />
          </Link>
        }
      />

      <ClaimBanner address={address} />

      <Card className="overflow-hidden">
        <div className="spectral-bar h-1" />
        <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Coins className="size-3.5" /> Total earned
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="display text-5xl font-medium tabular-nums text-ink">{fmtUsdc(data.earned)}</span>
              <span className="text-lg font-medium text-subtle">USDC</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {data.pendingClicks > 0 ? `${fmtUsdc(pendingValue)} USDC from ${data.pendingClicks} ${data.pendingClicks === 1 ? 'click' : 'clicks'} is being paid out now.` : `${data.clicks} paid ${data.clicks === 1 ? 'click' : 'clicks'} so far.`}
            </p>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Clicks, last 14 days</div>
            <ClicksChart data={data.daily} height={90} />
          </div>
        </div>
      </Card>

      {data.partnerships.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles className="size-6" />}
            title="Apply to your first campaign"
            body="Pick a product you would happily recommend. Once the business approves you, your personal link shows up here."
            action={
              <Link to="/explore" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-ink">
                Browse campaigns <ArrowRight className="size-4" />
              </Link>
            }
          />
        </Card>
      ) : (
        <section className="space-y-4">
          <h2 className="display text-xl font-medium text-ink">Your campaigns</h2>
          {[...active, ...waiting].map((p) => (
            <PartnershipCard key={p.campaignId} p={p} />
          ))}
        </section>
      )}

      {data.payouts.length > 0 && (
        <Card className="p-6 sm:p-8">
          <h2 className="display text-xl font-medium text-ink">Recent payouts</h2>
          <div className="mt-4 divide-y divide-line">
            {data.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{p.title}</div>
                  <div className="text-xs text-subtle">
                    {p.clicks} {p.clicks === 1 ? 'click' : 'clicks'} · {timeAgo(p.ts)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="display font-medium tabular-nums text-success">+{fmtUsdc(p.amount)}</div>
                  <TxLink hash={p.txHash} label="Receipt" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export function CreatorDashboard() {
  const { address } = useAccount()
  if (!address) {
    return (
      <div className="mx-auto max-w-md pt-6">
        <Card className="p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-hover">
            <Wallet className="size-7" />
          </div>
          <h1 className="display mt-5 text-2xl font-medium text-ink">Creator dashboard</h1>
          <p className="mt-2 text-pretty text-sm text-muted">Connect your wallet to see your applications, tracked links and USDC earnings.</p>
          <div className="mt-6">
            <ConnectGate />
          </div>
        </Card>
      </div>
    )
  }
  return <Dashboard address={address} />
}
