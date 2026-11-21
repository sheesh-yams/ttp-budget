// Dev-only: the app's shared UI pieces in light and dark side by side, to
// check dark-mode contrast without signing in. 404 in production.
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { buildBrandStyles } from '@/lib/brand'
import { AppearancePicker } from '@/components/theme/AppearancePicker'

export const metadata = { title: 'Theme swatches', robots: { index: false } }

const CHIPS = [
  ['Won', 'bg-emerald-100 text-emerald-700'], ['Paid', 'bg-green-100 text-green-700'],
  ['Overdue', 'bg-red-100 text-red-700'], ['Follow up', 'bg-amber-100 text-amber-800'],
  ['Sent', 'bg-blue-100 text-blue-700'], ['Viewed', 'bg-violet-100 text-violet-700'],
  ['Lead', 'bg-yellow-100 text-yellow-800'], ['Wrapped', 'bg-gray-100 text-gray-600'],
] as const

function Panel() {
  return (
    <div className="space-y-5 bg-background p-6 text-foreground">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Muted text · <a className="text-[color:var(--primary-text)] underline">a link</a></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button>Primary</Button><Button variant="outline">Outline</Button><Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button><Button variant="destructive">Delete</Button>
        <button className="btn-mint px-3 py-2 text-sm">Send proposal</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map(([t, c]) => <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c}`}>{t}</span>)}
        {(['lead', 'active', 'wrapped', 'draft', 'sent', 'viewed', 'paid', 'overdue', 'approved', 'declined', 'void', 'primary'] as const).map(v => <Badge key={v} variant={v}>{v}</Badge>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[10px] border bg-card p-4"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-600">$26,330</p><p className="text-xs text-red-500">$5,587 overdue</p></div>
        <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid var(--color-border)' }}><p className="text-[10px] uppercase text-gray-500">bg-white tile (override)</p><p className="mt-2 text-2xl font-semibold text-emerald-600">$19,650</p></div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Account note callout — invoices need a PO number.</div>
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Error callout — this invoice is void.</div>
      <div className="overflow-hidden rounded-[10px] border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="bg-[color:var(--surface-sunken)] text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
          <tbody>
            <tr className="bg-secondary font-semibold text-[color:var(--primary-text)]"><td className="px-3 py-2">200 Production crew</td><td className="px-3 py-2 text-right tabular-nums">$9,180</td></tr>
            <tr className="border-t hover:bg-[color:var(--row-hover)]"><td className="px-3 py-2">Director of Photography</td><td className="px-3 py-2 text-right tabular-nums">$3,600</td></tr>
            <tr className="border-t hover:bg-muted/50"><td className="px-3 py-2">Gaffer</td><td className="px-3 py-2 text-right tabular-nums">$2,250</td></tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-3"><Input placeholder="Input" /><Input defaultValue="Filled value" /></div>
      <div className="rounded-[10px] border bg-card p-4"><AppearancePicker initial="DARK" /></div>
      <div className="light-scope rounded-lg border bg-background p-3 text-sm">
        <p className="font-medium">.light-scope (client preview)</p>
        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 text-[10px] font-semibold uppercase text-emerald-700">Stays light</span>
      </div>
    </div>
  )
}

export default function ThemeSwatches() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: buildBrandStyles('#5D00A4', '#04FFCC') }} />
      <div className="grid min-h-screen md:grid-cols-2">
        <Panel />
        <div className="dark"><Panel /></div>
      </div>
    </>
  )
}
