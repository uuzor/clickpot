import { Field, Input, Select, Textarea } from '@/components/ui'
import { CATEGORIES } from '@/shared/messages'
import { productErrors, type CampaignForm } from './types'

export function ProductStep({ form, set, showErrors }: { form: CampaignForm; set: (patch: Partial<CampaignForm>) => void; showErrors: boolean }) {
  const errors = productErrors(form)
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : null)
  return (
    <div className="space-y-5">
      <Field label="Product or brand name" error={err('title')}>
        <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Acme Budgeting App" maxLength={80} autoFocus />
      </Field>
      <Field label="One-line pitch" hint="Shown on the campaign card." error={err('tagline')}>
        <Input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Track every dollar without a spreadsheet" maxLength={120} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Where clicks should land" hint="Your product page or store." error={err('destinationUrl')}>
          <Input value={form.destinationUrl} onChange={(e) => set({ destinationUrl: e.target.value })} placeholder="https://acme.app" inputMode="url" />
        </Field>
      </div>
      <Field label="Cover image link" hint="Optional. Leave empty for a clean initials tile." error={err('imageUrl')}>
        <Input value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://acme.app/cover.png" inputMode="url" />
      </Field>
      <Field label="What are you promoting?" error={err('description')}>
        <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={4} maxLength={1000} placeholder="Describe the product, who it is for and what makes it worth a click." />
      </Field>
      <Field label="Who should apply?" hint="Optional. Audience, platforms, content style.">
        <Textarea value={form.requirements} onChange={(e) => set({ requirements: e.target.value })} rows={2} maxLength={500} placeholder="Personal finance creators with 5k+ followers on X or YouTube." />
      </Field>
    </div>
  )
}
