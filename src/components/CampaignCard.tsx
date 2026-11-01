import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Users } from 'lucide-react'
import { Badge, Progress } from '@/components/ui'
import { CampaignVisual, PhaseBadge } from '@/components/shared'
import { clicksLeft, fmtUsdc, timeLeft } from '@/lib/format'
import { phaseOf, type ChainCampaign } from '@/lib/contract'
import type { CampaignMeta } from '@/lib/api'

export function CampaignCard({ meta, chain, index = 0 }: { meta: CampaignMeta; chain?: ChainCampaign; index?: number }) {
  const phase = chain ? phaseOf(chain) : null
  const remaining = chain && chain.totalDeposited > 0n ? Number((chain.balance * 100n) / chain.totalDeposited) : 0
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link
        to={`/campaign/${meta.id}`}
        className="glass group flex h-full flex-col overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 "
      >
        <CampaignVisual title={meta.title} imageUrl={meta.imageUrl} id={meta.id} className="h-36 w-full" />
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <Badge>{meta.category}</Badge>
            {phase && <PhaseBadge phase={phase} />}
          </div>
          <h3 className="display mt-3 text-lg font-medium leading-snug text-ink">{meta.title}</h3>
          <p className="mt-1 line-clamp-2 text-pretty text-sm text-muted">{meta.tagline}</p>

          <div className="mt-auto pt-5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="display text-2xl font-medium tabular-nums text-ink">{chain ? fmtUsdc(chain.ratePerClick, 2) : '—'}</span>
                <span className="ml-1 text-sm text-subtle">USDC / click</span>
              </div>
              {chain && <span className={`text-xs font-medium tabular-nums ${remaining < 10 ? 'text-warn' : 'text-muted'}`}>~{clicksLeft(chain.balance, chain.ratePerClick).toString()} clicks left</span>}
            </div>
            <Progress value={remaining} className="mt-2.5" />
            <div className="mt-3 flex items-center gap-4 text-xs text-subtle">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {meta.partners} {meta.partners === 1 ? 'creator' : 'creators'}
              </span>
              {chain && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {timeLeft(chain.endsAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
