import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowUpRight, ShieldCheck, Link2Off } from 'lucide-react'
import { useAccount } from 'wagmi'
import { Logo } from '@/components/Header'
import { CampaignVisual } from '@/components/shared'
import { Badge, Skeleton } from '@/components/ui'
import { api, type LinkInfo } from '@/lib/api'
import { visitorId } from '@/lib/local'

/**
 * Public landing page behind a creator's tracked link. A visit is counted when the
 * visitor presses the button, which keeps accidental opens and link previews from being billed.
 */
export function TrackedLink() {
  const code = useParams().code ?? ''
  const { address } = useAccount()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['link', code],
    queryFn: () => api<LinkInfo>(`/links/${code}`),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const onVisit = () => {
    void api(`/links/${code}/click`, { body: { visitor: visitorId(), wallet: address ?? null }, keepalive: true }).catch(() => undefined)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <Logo className="mb-8" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass w-full max-w-md overflow-hidden rounded-2xl">
        {isLoading && (
          <div className="space-y-4 p-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-12" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center px-8 py-14 text-center">
            <Link2Off className="size-10 text-subtle" />
            <h1 className="display mt-4 text-xl font-medium text-ink">This link is not active</h1>
            <p className="mt-2 text-sm text-muted">It may have been mistyped or removed. Ask whoever shared it for a fresh link.</p>
          </div>
        )}
        {data && (
          <>
            <CampaignVisual title={data.title} imageUrl={data.imageUrl} id={data.campaignId} className="h-44 w-full" />
            <div className="p-6">
              <div className="flex items-center gap-2">
                <Badge>{data.category}</Badge>
                {data.creatorHandle && <span className="text-xs text-subtle">Shared by {data.creatorHandle}</span>}
              </div>
              <h1 className="display mt-3 text-balance text-2xl font-medium text-ink">{data.title}</h1>
              <p className="mt-1.5 text-pretty text-muted">{data.tagline}</p>
              <p className="mt-4 line-clamp-5 whitespace-pre-line text-pretty text-sm text-ink-2">{data.description}</p>

              <a
                href={data.destinationUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={onVisit}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-white transition-all hover:bg-ink active:scale-[0.98]"
              >
                Visit {data.destinationHost} <ArrowUpRight className="size-4" />
              </a>
              <p className="mt-4 flex items-start gap-2 text-xs text-subtle">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                Opens in a new tab. Clickpot counts this visit so the creator who shared it gets paid. No account needed.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
