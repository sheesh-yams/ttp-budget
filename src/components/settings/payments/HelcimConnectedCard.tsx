import { cn } from '@/lib/utils'

export function HelcimConnectedCard({
  isActiveProvider,
}: {
  isActiveProvider: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-base font-semibold text-foreground">Helcim</h2>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
            isActiveProvider
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isActiveProvider ? 'bg-green-500' : 'bg-muted-foreground',
            )}
          />
          {isActiveProvider ? 'Active' : 'Connected'}
        </span>
      </div>

      {/* ── Sub-copy ──────────────────────────────────────────────────────── */}
      <p className="text-sm text-muted-foreground">
        {isActiveProvider
          ? 'Helcim is the active payment provider for this workspace.'
          : 'Helcim credentials are on file but not the active provider.'}
      </p>

      <p className="mt-1 text-sm text-muted-foreground">
        Credentials secured on file · Contact support to make changes.
      </p>
    </div>
  )
}
