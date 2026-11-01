import { forwardRef, type MouseEvent, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-ink',
  secondary: 'border border-ink bg-white text-ink hover:bg-surface-muted',
  ghost: 'text-ink hover:bg-surface-muted',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
}

const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-4 text-[13px] rounded-full',
  md: 'min-h-11 px-6 text-sm rounded-full',
  lg: 'min-h-12 px-7 text-[15px] rounded-full',
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      onClick={onClick ? (event) => void onClick(event) : undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('glass rounded-2xl', className)}>{children}</section>
}

const TONES = {
  neutral: 'bg-surface-muted text-ink-2',
  accent: 'bg-accent-soft text-brand',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof TONES; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('inner rounded-2xl p-4', className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="display mt-1 text-2xl font-medium tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  )
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-muted', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-muted', className)} />
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-hover">{icon}</div>
      <h3 className="display mt-4 text-lg font-medium text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-pretty text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const FIELD =
  'w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-subtle transition-colors focus:border-ink focus:outline-none focus:ring-2 focus:ring-focus/40'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(FIELD, className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(FIELD, 'min-h-24 resize-y', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(FIELD, 'appearance-none bg-[length:16px] pr-10', className)} {...rest}>
      {children}
    </select>
  )
})

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-subtle">{hint}</span>
      )}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full bg-surface-muted p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-9 rounded-full px-4 text-[13px] font-medium transition-all',
            value === o.value ? 'bg-ink text-white' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
