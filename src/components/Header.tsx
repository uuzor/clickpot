import { Link, NavLink } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { Wallet } from 'lucide-react'
import { useAccount } from 'wagmi'
import { cn } from '@/lib/cn'
import { fmtUsdc, shortAddr } from '@/lib/format'
import { useUsdc } from '@/hooks/useChainData'

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label="Clickpot home">
      <span className="flex size-9 items-center justify-center rounded-full bg-accent">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="#fff" strokeWidth="2" />
          <path d="M14.5 14.5 21 17.6l-3.1 1.2-1.2 3.1-2.2-7.4Z" fill="#fff" />
        </svg>
      </span>
      <span className="display text-2xl text-brand">Clickpot</span>
    </Link>
  )
}

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/creator', label: 'Creators' },
  { to: '/business', label: 'Businesses' },
]

function BalancePill() {
  const { balance } = useUsdc()
  if (balance === undefined) return null
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pl-2 pr-3 text-sm font-medium tabular-nums text-ink sm:inline-flex" title="Your USDC balance on Arc Testnet">
      <TokenUSDC variant="branded" size={18} />
      {fmtUsdc(balance)}
    </span>
  )
}

export function Header() {
  const { isConnected } = useAccount()
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn('rounded-full px-4 py-2 text-sm font-medium transition-colors', isActive ? 'bg-accent text-white' : 'text-ink hover:bg-surface-muted')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isConnected && <BalancePill />}
          <ConnectKitButton.Custom>
            {({ show, isConnected: connected, address, isConnecting }) => (
              <button
                onClick={show}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-ink"
              >
                <Wallet className="size-4" />
                {connected && address ? shortAddr(address) : isConnecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Primary mobile">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cn('shrink-0 rounded-full px-4 py-1.5 text-sm font-medium', isActive ? 'bg-accent text-white' : 'bg-surface-muted text-ink')
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
