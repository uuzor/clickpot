import { formatUsdc, parseUsdc } from '@/onchain-money'

/** USDC raw units (6 decimals) as a display string, at least `minDp` decimals. */
export function fmtUsdc(raw: bigint | number | string, minDp = 2): string {
  const exact = formatUsdc(toBig(raw))
  const [whole, frac = ''] = exact.split('.')
  const padded = frac.padEnd(minDp, '0')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return padded ? `${grouped}.${padded}` : grouped
}

function toBig(raw: bigint | number | string): bigint {
  return typeof raw === 'bigint' ? raw : BigInt(Math.round(Number(raw)))
}

/** Parses user input into raw USDC units, or null when it is not a valid positive amount. */
export function safeParseUsdc(input: string): bigint | null {
  if (!input.trim()) return null
  try {
    const raw = parseUsdc(input)
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** "5d 3h", "42m", or "ended" for a unix-seconds deadline. */
export function timeLeft(endSec: bigint | number): string {
  const diff = Number(endSec) - Math.floor(Date.now() / 1000)
  if (diff <= 0) return 'ended'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${Math.max(1, m)}m`
}

export const compact = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const initials = (s: string) =>
  s
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?'

/** "24 hours", "1 hour", "3 days" for a duration in seconds. */
export function fmtDuration(sec: number | undefined): string {
  if (sec === undefined) return 'a notice period'
  const h = Math.round(sec / 3600)
  if (h >= 48 && h % 24 === 0) return `${h / 24} days`
  return h === 1 ? '1 hour' : `${h} hours`
}

/** Whole clicks a pot can still pay for. */
export const clicksLeft = (balance: bigint, rate: bigint): bigint => (rate > 0n ? balance / rate : 0n)
