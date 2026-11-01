import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { BudgetStep, budgetValid } from '@/components/create/BudgetStep'
import { ProductStep } from '@/components/create/ProductStep'
import { ReviewStep } from '@/components/create/ReviewStep'
import { EMPTY_FORM, productErrors, type CampaignForm } from '@/components/create/types'
import { CampaignVisual, PageTitle } from '@/components/shared'
import { Badge, Button, Card } from '@/components/ui'
import { useUsdc } from '@/hooks/useChainData'
import { cn } from '@/lib/cn'
import { fmtUsdc, safeParseUsdc } from '@/lib/format'

const STEPS = ['Product', 'Budget', 'Launch']

function Preview({ form }: { form: CampaignForm }) {
  const rate = safeParseUsdc(form.rate)
  const deposit = safeParseUsdc(form.deposit)
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-subtle">What creators will see</div>
      <Card className="overflow-hidden">
        <CampaignVisual title={form.title || 'Your product'} imageUrl={form.imageUrl} id={form.title.length} className="h-32 w-full" />
        <div className="p-5">
          <Badge>{form.category}</Badge>
          <h3 className="display mt-3 text-lg font-medium text-ink">{form.title || 'Your product name'}</h3>
          <p className="mt-1 text-sm text-muted">{form.tagline || 'Your one-line pitch appears here.'}</p>
          <div className="mt-4 flex items-baseline justify-between">
            <div>
              <span className="display text-2xl font-medium tabular-nums text-ink">{rate ? fmtUsdc(rate) : '0.00'}</span>
              <span className="ml-1 text-sm text-subtle">USDC / click</span>
            </div>
            <span className="text-xs font-medium tabular-nums text-muted">{deposit ? fmtUsdc(deposit) : '0.00'} locked</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

export function CreateCampaign() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM)
  const [showErrors, setShowErrors] = useState(false)
  const { balance } = useUsdc()
  const set = (patch: Partial<CampaignForm>) => setForm((f) => ({ ...f, ...patch }))

  const productOk = Object.values(productErrors(form)).every((e) => e === null)
  const next = () => {
    if (step === 0 && !productOk) return setShowErrors(true)
    if (step === 1 && !budgetValid(form, balance)) return
    setStep((s) => s + 1)
  }

  return (
    <div className="space-y-8">
      <Link to="/business" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Your campaigns
      </Link>
      <PageTitle title="Launch a campaign" subtitle="Describe your product, lock a pot of USDC and invite creators. You only pay for verified clicks." />

      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                i <= step ? 'bg-accent text-white' : 'bg-surface-muted text-subtle',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span className={cn('hidden text-sm font-medium sm:block', i <= step ? 'text-ink' : 'text-subtle')}>{label}</span>
            {i < STEPS.length - 1 && <span className={cn('h-0.5 flex-1 rounded-full', i < step ? 'bg-accent' : 'bg-surface-muted')} />}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
              {step === 0 && <ProductStep form={form} set={set} showErrors={showErrors} />}
              {step === 1 && <BudgetStep form={form} set={set} balance={balance} />}
              {step === 2 && <ReviewStep form={form} />}
            </motion.div>
          </AnimatePresence>

          {step < 2 && (
            <div className="mt-8 flex items-center justify-between gap-3">
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
              ) : (
                <span />
              )}
              <Button size="lg" onClick={next} disabled={step === 1 && !budgetValid(form, balance)}>
                {step === 0 ? 'Set your budget' : 'Review'} <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
          {step === 2 && (
            <button onClick={() => setStep(1)} className="mt-5 text-sm font-medium text-muted hover:text-ink">
              Edit details
            </button>
          )}
        </Card>
        <div className="lg:sticky lg:top-24">
          <Preview form={form} />
        </div>
      </div>
    </div>
  )
}
