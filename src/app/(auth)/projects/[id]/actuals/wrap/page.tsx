import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react'
import { getWrapReportData } from '@/server/actions/actuals'
import { formatMoney } from '@/lib/money'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Wrap Report — TTP Budget` }
}

function formatDate(d: Date | null | string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pct(n: number) {
  return `${n >= 0 ? '' : ''}${n.toFixed(1)}%`
}

export default async function WrapReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getWrapReportData(id)

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-semibold text-foreground">No actuals data yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Start an actuals sheet before generating a wrap report.</p>
        <Link
          href={`/projects/${id}/actuals`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Actuals
        </Link>
      </div>
    )
  }

  const marginColor =
    data.marginPct >= 30 ? 'text-green-600' :
    data.marginPct >= 15 ? 'text-yellow-600' :
    data.marginPct >= 0  ? 'text-orange-500' :
    'text-red-600'

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Link
            href={`/projects/${id}/actuals`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Actuals
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{data.projectName}</h1>
          <p className="text-sm text-muted-foreground">
            {data.clientName} · {data.budgetName} · {data.phaseName}
          </p>
          {(data.firstEntryDate || data.lastEntryDate) && (
            <p className="text-xs text-muted-foreground">
              {formatDate(data.firstEntryDate)} – {formatDate(data.lastEntryDate)}
            </p>
          )}
        </div>
        <a
          href={`/api/pdf/wrap-report/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>

      {/* ── Top-level summary cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Billed"
          value={formatMoney(data.billedCents)}
          sub="client revenue"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <SummaryCard
          label="Budget"
          value={formatMoney(data.totalBudgetCents)}
          sub="approved budget"
        />
        <SummaryCard
          label="Actual Cost"
          value={formatMoney(data.totalActualCents)}
          sub="total spent"
          valueClass={data.totalActualCents > data.totalBudgetCents ? 'text-red-600' : 'text-foreground'}
        />
        <SummaryCard
          label="Margin"
          value={pct(data.marginPct)}
          sub={formatMoney(data.profitCents) + (data.profitCents >= 0 ? ' profit' : ' loss')}
          valueClass={marginColor}
        />
      </div>

      {/* ── Account breakdown ────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold text-foreground">Budget vs. Actuals by Department</h2>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_110px_110px_100px_90px] gap-2 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground bg-muted/30">
          <span>Account</span>
          <span className="text-right">Budgeted</span>
          <span className="text-right">Actual</span>
          <span className="text-right">Variance</span>
          <span className="text-right">Status</span>
        </div>

        {data.accounts.filter(a => a.budgetedCents > 0 || a.actualCents > 0).map(acc => {
          const over = acc.varianceCents < 0
          const pctUsed = acc.budgetedCents > 0
            ? Math.min((acc.actualCents / acc.budgetedCents) * 100, 150)
            : 0

          return (
            <div key={acc.accountId} className="border-b last:border-b-0">
              <div className="grid grid-cols-[1fr_110px_110px_100px_90px] items-center gap-2 px-5 py-3">
                <div className="min-w-0">
                  <span className="font-medium text-sm text-foreground">{acc.accountName}</span>
                  {acc.accountCode && (
                    <span className="ml-2 text-xs text-muted-foreground">{acc.accountCode}</span>
                  )}
                  {/* Burn bar */}
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(pctUsed, 100)}%`,
                        background: pctUsed >= 100 ? '#ef4444' : pctUsed >= 80 ? '#f59e0b' : 'var(--brand-primary)',
                      }}
                    />
                  </div>
                </div>
                <span className="text-right text-sm tabular text-muted-foreground">
                  {formatMoney(acc.budgetedCents)}
                </span>
                <span className="text-right text-sm tabular font-medium">
                  {formatMoney(acc.actualCents)}
                </span>
                <span className={`text-right text-sm tabular font-medium ${over ? 'text-red-500' : 'text-green-600'}`}>
                  {over ? '−' : '+'}{formatMoney(Math.abs(acc.varianceCents))}
                </span>
                <span className="flex justify-end">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    pctUsed >= 100 ? 'bg-red-100 text-red-700' :
                    pctUsed >= 80  ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {Math.round(pctUsed)}%
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Top overages ─────────────────────────────────────────────────── */}
      {data.topOverages.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-5 py-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Top Overages
            </h2>
          </div>
          <div className="divide-y">
            {data.topOverages.map((acc, i) => (
              <div key={acc.accountId} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{acc.accountName}</p>
                    <p className="text-xs text-muted-foreground">
                      Budgeted {formatMoney(acc.budgetedCents)} · Actual {formatMoney(acc.actualCents)}
                    </p>
                  </div>
                </div>
                <span className="flex-shrink-0 text-sm font-semibold text-red-600 tabular ml-4">
                  +{formatMoney(Math.abs(acc.varianceCents))} over
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <p className="text-center text-xs text-muted-foreground">
        Generated {formatDate(data.generatedAt)}
      </p>
    </div>
  )
}

// ─── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, valueClass = 'text-foreground', icon,
}: {
  label: string
  value: string
  sub: string
  valueClass?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-0.5 text-xl font-semibold tabular ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}
