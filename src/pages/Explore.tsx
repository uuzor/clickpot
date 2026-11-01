import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Search } from 'lucide-react'
import { CampaignCard } from '@/components/CampaignCard'
import { PageTitle } from '@/components/shared'
import { EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { useChainCampaigns } from '@/hooks/useChainData'
import { useCampaignList } from '@/lib/api'
import { cn } from '@/lib/cn'
import { phaseOf } from '@/lib/contract'
import { CATEGORIES } from '@/shared/messages'

type Sort = 'newest' | 'rate' | 'pot'

export function Explore() {
  const { data: list, isLoading, isError } = useCampaignList()
  const { map, isLoading: chainLoading } = useChainCampaigns(list?.map((c) => c.id) ?? [])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('All')
  const [sort, setSort] = useState<Sort>('rate')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = (list ?? []).filter((c) => {
      const chain = map.get(c.id)
      if (chain && phaseOf(chain) !== 'live') return false
      if (category !== 'All' && c.category !== category) return false
      return !q || `${c.title} ${c.tagline} ${c.destinationHost}`.toLowerCase().includes(q)
    })
    return rows.sort((a, b) => {
      const ca = map.get(a.id)
      const cb = map.get(b.id)
      if (sort === 'newest') return b.createdAt - a.createdAt
      if (sort === 'rate') return Number((cb?.ratePerClick ?? 0n) - (ca?.ratePerClick ?? 0n))
      return Number((cb?.balance ?? 0n) - (ca?.balance ?? 0n))
    })
  }, [list, map, query, category, sort])

  const loading = isLoading || (chainLoading && (list?.length ?? 0) > 0)

  return (
    <div className="space-y-8">
      <PageTitle title="Find a campaign to promote" subtitle="Every campaign has its pot locked onchain. Pick one that fits your audience and see exactly what a click pays." />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by product or website" className="pl-11" aria-label="Search campaigns" />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="md:w-52" aria-label="Sort campaigns">
          <option value="rate">Highest pay per click</option>
          <option value="pot">Biggest pot</option>
          <option value="newest">Newest</option>
        </Select>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Categories">
        {['All', ...CATEGORIES].map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              'shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-colors',
              category === c ? 'bg-accent text-white' : 'bg-surface-muted text-ink hover:bg-accent-soft',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="glass rounded-2xl">
          <EmptyState icon={<Megaphone className="size-6" />} title="Campaigns can't load right now" body="The campaign service is not reachable. Try again in a moment." />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-2xl">
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title={list?.length ? 'No campaigns match' : 'No campaigns yet'}
            body={list?.length ? 'Try another category or clear your search.' : 'Be the first business to lock a pot and invite creators.'}
            action={
              <Link to="/business/new" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-ink">
                Launch a campaign
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c, i) => (
            <CampaignCard key={c.id} meta={c} chain={map.get(c.id)} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
