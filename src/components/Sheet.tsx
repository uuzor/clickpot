import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Block closing while a transaction is in flight. */
  locked?: boolean
}

export function Sheet({ open, onClose, title, subtitle, children, locked }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, locked])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !locked && onClose()}
        >
          <div className="absolute inset-0 bg-black/30" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative max-h-[92dvh] w-full max-w-lg overflow-hidden rounded-t-3xl border border-line bg-white sm:rounded-2xl"
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="spectral-bar h-1" />
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <div>
                <h2 className="display text-xl font-medium text-ink">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                disabled={locked}
                aria-label="Close"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/5 disabled:opacity-40"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="max-h-[calc(92dvh-5.5rem)] overflow-y-auto px-6 pb-6 pt-4">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
