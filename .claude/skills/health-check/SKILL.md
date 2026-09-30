---
name: health-check
description: Periodic SlateSuite sweep for regressions, the specific bug classes this codebase has hit before, and data drift in the live database. Produces a ranked read-only report; fixes only what the user approves. Use when asked for a health check, audit, sweep, "what's broken", or at the start of a batch of improvements.
---

# /health-check — continuous-improvement sweep

Read-only until the user approves fixes. Run the steps, then report.

## 1. Baseline
```bash
git log --oneline -15
npx tsc --noEmit
npx jest
npm run audit:scoping
```
Note the "Last health check" date in `docs/FEATURE_LOG.md` and focus on commits
since then.

## 2. Known bug classes
Each check maps to a bug that shipped before. Inspect every hit; most are fine.

1. **Status write that clobbers a decided status** — flag a view, webhook or cron
   write whose `where` doesn't restrict the current status.
   ```bash
   grep -rnE "status: '(VIEWED|PAID|OVERDUE|SENT)'" src/server src/app/api src/lib
   ```
2. **Non-async export from a `'use server'` file** — any hit is a bug.
   ```bash
   grep -rl "^'use server'" src | xargs grep -nE "^export (const|let|var|class|function) "
   ```
3. **Scoped model queried with findUnique/upsert** — any hit throws at runtime.
   ```bash
   grep -rnE "sdb\.[a-zA-Z]+\.(findUnique|findUniqueOrThrow|upsert)\(" src
   ```
4. **Session-scoped db in a token route** — flag routes reached by public token
   with no Clerk session (`api/pdf/wrap-report/[projectId]` is signed-in; fine).
   ```bash
   grep -rln "getScopedDb" "src/app/(public)" src/app/api
   ```
5. **Money formatted outside `formatMoney`** — any money hit.
   ```bash
   grep -rnE "maximumFractionDigits: 0|/ ?100\)\.toLocaleString\(\)|toFixed\(0\)" src | grep -v src/lib/money.ts
   ```
6. **Mislabeled confirm dialog** — a non-destructive action with no
   `confirmLabel` shows a red "Delete".
   ```bash
   grep -rn "await confirm(" src -A5
   ```
7. **Won-effects bypass** — an approval path that doesn't call
   `applyProposalWonEffects`.
   ```bash
   grep -rn "status: 'APPROVED'" src
   ```
8. **Hardcoded placeholder data** — UI rendering a literal instead of data (the
   dashboard Value column once did).
   ```bash
   grep -rnE "TODO|FIXME|placeholder" src --include=*.tsx
   ```

## 3. Data drift
```bash
npx tsx scripts/health-data-checks.ts
```
Read-only. Every FAIL is a row state the app shouldn't produce. When a new bug
class creates bad rows, add a check for it to that script as part of the fix.

## 4. Report
Ranked, most severe first. For each finding: file:line or row, the concrete
failure (who sees what go wrong), and a proposed fix sized small / medium /
large. Mark findings already listed under follow-ups in `docs/FEATURE_LOG.md`
as known. End with the one or two you'd do first. **STOP** for approval.

## 5. Fix (approved items only)
Small fixes: verify per `CLAUDE.md`, commit, push. Anything multi-file or
schema-touching: run `/feature`. Data fixes: the backfill protocol in `CLAUDE.md`.

## 6. Log
Update "Last health check" in `docs/FEATURE_LOG.md` with the date, what was
found, what was fixed, and what was deferred.
