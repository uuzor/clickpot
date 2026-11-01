import { ExternalLink } from 'lucide-react'
import { Logo } from '@/components/Header'
import { useHealth } from '@/lib/api'
import { CLICKPOT_ADDRESS, CHAIN_ID } from '@/lib/contract'
import { buildAddressExplorerUrl } from '@/onchain-facts'

export function Footer() {
  const { data: health, isError } = useHealth()
  const online = !!health?.ok && health.operatorFunded
  const label = isError ? 'Tracker offline' : !health ? 'Checking tracker…' : online ? 'Payouts live' : 'Payouts paused: tracker needs gas'
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
        <Logo />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="inline-flex items-center gap-2" role="status">
            <span className={`size-2 rounded-full ${online ? 'bg-success' : isError ? 'bg-danger' : 'bg-warn'}`} />
            {label}
          </span>
          <a
            href={buildAddressExplorerUrl(CHAIN_ID, CLICKPOT_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-ink-2 hover:underline"
          >
            Escrow contract <ExternalLink className="size-3.5" />
          </a>
          <span>Arc Testnet · USDC</span>
        </div>
      </div>
    </footer>
  )
}
