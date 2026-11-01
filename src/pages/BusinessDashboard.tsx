import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Building2, ChevronRight, Lock, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { ConnectGate } from '@/components/ConnectGate'
import { CampaignVisual, PageTitle, PhaseBadge } from '@/components/shared'
import { Badge, Button, Card, EmptyState, Progress, Skeleton, Stat } from '@/components/ui'
import { useChainCampaigns, useOwnedCampaignIds } from '@/hooks/useChainData'
import { usePublish } from '@/hooks/usePublish'
import { useCampaignList, type CampaignMeta } from '@/lib/api'
import { phaseOf, type ChainCampaign } from '@/lib/contract'
import { friendlyError, isCancelled } from '@/lib/errors'
import { fmtUsdc } from '@/lib/format'
import { loadDraft } from '@/lib/local'

function CampaignRow({ meta, chain }: { meta: CampaignMeta; chain?: ChainCampaign }) {
  const left = chain && chain.totalDeposited > 0n ? Number((chain.balance * 100n) / chain.totalDeposited) : 0
  return (
    <Link
      to={`/business/campaign/${meta.id}`}
      className="glass group flex items-center gap-4 rounded-2xl p-4 transition-all hover:-translate-y-0.5 sm:gap-5 sm:p-5"
    >
      <CampaignVisual title={meta.title} imageUrl={meta.imageUrl} id={meta.id} className="size-16 shrink-0 rounded-2xl sm:size-20" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="display truncate text-lg font-medium text-ink">{meta.title}</h3>
          {chain && <PhaseBadge phase={phaseOf(chain)} />}
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-3 text-xs sm:max-w-md">
          <div>
            <div className="text-subtle">Pot left</div>
            <div className="mt-0.5 text-sm font-medium tabular-nums text-ink">{chain ? fmtUsdc(chain.balance) : '—'}</div>
          </div>
          <div>
            <div className="text-subtle">Clicks</div>
            <div className="mt-0.5 text-sm font-medium tabular-nums text-ink">{meta.clicks}</div>
          </div>
          <div>
            <div className="text-subtle">Creators</div>
            <div className="mt-0.5 text-sm font-medium tabular-nums text-ink">{meta.partners}</div>
          </div>
        </div>
        <Progress value={left} className="mt-3 sm:max-w-md" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {meta.applicants > meta.partners && (
          <Badge tone="warn">
            <Users className="size-3" /> {meta.applicants - meta.partners} new
          </Badge>
        )}
        <ChevronRight className="size-5 text-subtle transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}

function Unpublished({ id }: { id: number }) {
  const publish = usePublish()
  const [busy, setBusy] = useState(false)
  const draft = loadDraft(id)
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-warn-soft p-5">
      <div className="flex gap-3 text-sm text-warn">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <div className="font-medium">Campaign #{id} is funded but not published</div>
          <div className="mt-0.5 text-warn/80">{draft ? 'Sign once to make it visible to creators.' : 'Its details were not saved on this device. You can still manage the funds.'}</div>
        </div>
      </div>
      <div className="flex gap-2">
        {draft && (
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await publish(id, draft)
                toast.success('Campaign is live')
              } catch (e) {
                if (!isCancelled(e)) toast.error(friendlyError(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Publish now
          </Button>
        )}
        <Link to={`/business/campaign/${id}`} className="inline-flex min-h-9 items-center rounded-full border border-ink bg-white px-4 text-[13px] font-medium text-ink">
          Manage funds
        </Link>
      </div>
    </div>
  )
}

function Dashboard({ address }: { address: `0x${string}` }) {
  const { ids, isLoading: idsLoading } = useOwnedCampaignIds(address)
  const { data: metas, isLoading: metaLoading } = useCampaignList(address.toLowerCase())
  const { map } = useChainCampaigns(ids)

  const published = new Set((metas ?? []).map((m) => m.id))
  const orphans = ids.filter((id) => !published.has(id) && !metaLoading)
  const totals = ids.reduce(
    (acc, id) => {
      const c = map.get(id)
      return { locked: acc.locked + (c?.balance ?? 0n), paid: acc.paid + (c?.totalPaid ?? 0n) }
    },
    { locked: 0n, paid: 0n },
  )
  const clicks = (metas ?? []).reduce((s, m) => s + m.clicks, 0)
  const loading = idsLoading || metaLoading

  return (
    <div className="space-y-8">
      <PageTitle
        title="Your campaigns"
        subtitle="Money you have locked, what it has earned you in clicks, and the creators waiting for your decision."
        action={
          <Link to="/business/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-ink">
            <Plus className="size-4" /> New campaign
          </Link>
        }
      />

      <Card className="overflow-hidden">
        <div className="spectral-bar h-1" />
        <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Lock className="size-3.5" /> Locked in your pots
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="display text-5xl font-medium tabular-nums text-ink">{loading ? '…' : fmtUsdc(totals.locked)}</span>
              <span className="text-lg font-medium text-subtle">USDC</span>
            </div>
            <p className="mt-2 text-sm text-muted">Across {ids.length} {ids.length === 1 ? 'campaign' : 'campaigns'} on Arc Testnet.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Paid to creators" value={fmtUsdc(totals.paid)} sub="USDC" />
            <Stat label="Verified clicks" value={clicks} />
          </div>
        </div>
      </Card>

      {orphans.map((id) => (
        <Unpublished key={id} id={id} />
      ))}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : (metas?.length ?? 0) === 0 && orphans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="Launch your first campaign"
            body="Lock a pot of USDC, set a price per click and let approved creators bring you traffic."
            action={
              <Link to="/business/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-ink">
                <Plus className="size-4" /> Create campaign
              </Link>
            }
          />
        </Card>
      ) : (
        <motion.div className="space-y-3" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
          {metas?.map((m) => (
            <motion.div key={m.id} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <CampaignRow meta={m} chain={map.get(m.id)} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

export function BusinessDashboard() {
  const { address } = useAccount()
  if (!address) {
    return (
      <div className="mx-auto max-w-md pt-6">
        <Card className="p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-hover">
            <Building2 className="size-7" />
          </div>
          <h1 className="display mt-5 text-2xl font-medium text-ink">Business dashboard</h1>
          <p className="mt-2 text-pretty text-sm text-muted">Connect the wallet you fund campaigns with to see your pots, creators and results.</p>
          <div className="mt-6">
            <ConnectGate label="Connect wallet" />
          </div>
        </Card>
      </div>
    )
  }
  return <Dashboard address={address} />
}
