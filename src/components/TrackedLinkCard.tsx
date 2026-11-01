import { QRCodeSVG } from 'qrcode.react'
import { ExternalLink, Link2, Send } from 'lucide-react'
import { CopyButton } from '@/components/shared'
import { useShareLink } from '@/hooks/useShareBase'

/** The creator's personal tracked link with copy and share actions. */
export function TrackedLinkCard({ code, title }: { code: string; title: string }) {
  const link = useShareLink(`/r/${code}`)
  const text = `Check out ${title}`
  const intents = link
    ? [
        { label: 'X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}` },
        { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}` },
        { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}` },
      ]
    : []
  return (
    <div className="inner rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Link2 className="size-3.5" /> Your tracked link
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="mono min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2.5 text-[13px] text-ink" title={link ?? undefined}>
          {link ?? 'Preparing your link…'}
        </div>
        {link && (
          <div className="shrink-0 rounded-xl bg-white p-1.5" aria-label="QR code for your link" role="img">
            <QRCodeSVG value={link} size={64} />
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton value={link} label="Copy link" />
        {intents.map((i) => (
          <a
            key={i.label}
            href={i.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-white"
          >
            <Send className="size-3.5" /> {i.label}
          </a>
        ))}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent-hover hover:underline"
          >
            Preview <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
