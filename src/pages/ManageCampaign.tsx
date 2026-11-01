import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Lock } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ConnectGate } from '@/components/ConnectGate'
import { ApplicationsPanel } from '@/components/manage/ApplicationsPanel'
import { FundsPanel } from '@/components/manage/FundsPanel'
import { ClicksChart, PageTitle } from '@/components/shared'
import { Card, EmptyState, Skeleton, Stat } from '@/components/ui'
import { useChainCampaign } from '@/hooks/useChainData'
import { useCampaignDetail } from '@/lib/api'
import { phaseOf } from '@/lib/contract'
import { fmtUsdc } from '@/lib/format'

export function ManageCampaign() {
  const id = Number(useParams().id)
  const { address } = useAccount()
  const { data: meta } = useCampaignDetail(id)
  const { campaign: chain, isLoading, refetch } = useChainCampaign(id)

  if (!address) {
    return (
      <div className="mx-auto max-w-md pt-6">
        <Card className="p-8 text-center">
          <Lock className="mx-auto size-8 text-accent-hover" />
          <h1 className="display mt-4 text-2xl font-medium text-ink">Connect to manage</h1>
          <p className="mt-2 text-sm text-muted">Use the wallet that funded this campaign.</p>
          <div className="mt-6">
            <ConnectGate />
          </div>
        </Card>
      </div>
    )
  }
  if (isLoading || !chain) return <Skeleton className="h-96 rounded-2xl" />
  if (chain.owner.toLowerCase() !== address.toLowerCase()) {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="size-6" />}
          title="This is not your campaign"
          body="Only the wallet that funded a campaign can manage it."
          action={
            <Link to={`/campaign/${id}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white">
              View public page
            </Link>
          }
        />
      </Card>
    )
  }

  const phase = phaseOf(chain)
  const ctr = meta && meta.views > 0 ? Math.round((meta.clicks / meta.views) * 100) : null
  const canApprove = !chain.closing && phase !== 'ended'

  return (
    <div className="space-y-8">
      <Link to="/business" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Your campaigns
      </Link>
      <PageTitle
        title={meta?.title ?? `Campaign #${id}`}
        subtitle={meta ? meta.tagline : 'This campaign is funded but its listing has not been published.'}
        action={
          meta && (
            <Link to={`/campaign/${id}`} className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-ink hover:bg-surface-strong">
              Public page <ExternalLink className="size-4" />
            </Link>
          )
        }
      />

      <FundsPanel id={id} chain={chain} refetch={refetch} />

      {meta && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Verified clicks" value={meta.clicks} sub={meta.inFlight > 0 ? `${meta.inFlight} paying now` : undefined} />
            <Stat label="Link visits" value={meta.views} sub={ctr !== null ? `${ctr}% clicked through` : 'No visits yet'} />
            <Stat label="Active creators" value={meta.partners} />
            <Stat label="Paid out" value={fmtUsdc(chain.totalPaid)} sub="USDC" />
          </div>

          <Card className="p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-xl font-medium text-ink">Clicks, last 14 days</h2>
            </div>
            <ClicksChart data={meta.daily} />
          </Card>

          <Card className="p-6 sm:p-8">
            <ApplicationsPanel id={id} canApprove={canApprove} />
          </Card>
        </>
      )}
    </div>
  )
}
