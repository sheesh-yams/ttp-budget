# SlateSuite (ttp-budget)

Studio OS for production companies: projects → budgets → proposals → invoices,
plus call sheets, actuals, delivery pages, rolodex and a rate/contract library.
Built by and for The Third Place Creative.

Stack: Next.js 15 App Router · Prisma 5 + Postgres (Neon) · Clerk (orgs = workspaces)
· Railway (auto-deploys `main`) · Resend email · Helcim payments · @react-pdf/renderer.

## How we work

- **Commit and push straight to `main`.** No feature branches. Railway deploys on
  push, so never push code that depends on a migration the user hasn't applied yet.
- **New features and multi-file changes follow `/feature`**: audit → questions →
  approved plan → build → verify → review → ship → log. If the user says
  "plan first" or "don't edit code", make no edits until they approve.
- **Schema changes are hand-written SQL.** Never run `prisma migrate dev`,
  `npm run db:push` or `npm run db:migrate`.
  1. Edit `prisma/schema.prisma`.
  2. Write `prisma/migrations/<YYYYMMDD>00000N_<name>/migration.sql` by hand:
     additive, with defaults, commented.
  3. Show the user the exact SQL and **stop**. They run it in Neon's SQL console
     and confirm.
  4. `npx prisma generate`, finish, then push.
- **Never change real data without asking.** Find affected rows with a read-only
  script, show them (separate definite cases from ambiguous ones), ask, then run a
  guarded transaction that re-checks the condition in its `where`, and write an
  `AuditEvent` per changed row.
- **No login in agent sessions.** Authenticated pages can't be clicked through.
  Verify with DB scripts and public pages, and tell the user exactly what still
  needs a manual pass.

## Architecture rules (each one has caused a real bug)

**Tenancy and auth**
- Server-action writes: `requireRole(['OWNER','PRODUCER'])`, then
  `const sdb = await getScopedDb()` (`src/lib/db-scoped.ts`). It injects
  `workspaceId` on every `SCOPED_MODELS` query and **throws on `findUnique` /
  `upsert`** for them — use `findFirst` / `updateMany`.
- New model with a `workspaceId` column → add it to `SCOPED_MODELS`, then
  `npm run audit:scoping`.
- Public token routes (`/p/[token]`, `/i/[token]`, `/api/proposals/[id]/approve`)
  have no session. Use raw `db` keyed off the token-verified row, and
  `scopedDbFor(row.workspaceId)` to reuse scoped helpers. Never pass a
  user-supplied workspace id.
- Collaborators are margin-blind: budgets go through `stripBudgetForRole`
  server-side before reaching the client (`src/lib/budget-visibility.ts`).

**`'use server'` files** (`src/server/actions/*`)
- Every export is a public RPC endpoint and must be an async function. Shared
  logic, constants and types live in `src/lib/*` (see `proposal-snapshot.ts`,
  `proposal-won.ts`).
- `ActionResult<T>` with `strict: false`: narrow errors as
  `(res as { success: false; error: string }).error`.

**Money**
- Integer cents everywhere. Display only through `formatMoney`
  (`src/lib/money.ts`) — it shows cents only when non-zero. No local formatters.
- Totals via `calcBudgetTotals` (`src/lib/totals.ts`). A project's value is its
  primary phase's grand total (net + markup − discount + tax).
- `budgetSnapshot.productionCents` is the **pre-fee** subtotal; consumers add the
  agency fee. Invoices never re-apply the fee (a 50% invoice already includes it).

**Domain model**
- `Phase` = a budget version (v1, v2…) with its own overview, description,
  deliverables and accounts. Markup, tax and discount live on the parent `Budget`.
  One `isPrimary` phase per budget drives proposals and invoices;
  `showAsProposalOption` adds client-facing option tabs.
- Inconsistent names: `Account.order` / `LineItem.order` but
  `BudgetSection.orderIndex`; the tree is `Account.parentId`. `Proposal.phaseId`
  is unused.
- Proposal content is **frozen at send** (`content.budgetSnapshot`,
  `content.proposalOptions`); drafts recompute live on the public page.
- View/webhook status writes never overwrite a decided status. Proposals: only
  SENT → VIEWED. Invoices: only SENT/OVERDUE → VIEWED; PAID and VOID are terminal.
- Winning a proposal (manually or by e-signature) runs `applyProposalWonEffects`
  (`src/lib/proposal-won.ts`). "Won" is the UI label for `APPROVED`.
- `sendProposal` / `createProposal` in `proposals.ts` are dead legacy code.

**UI**
- `useConfirm()` defaults to a red **Delete** button — pass `confirmLabel` for
  anything non-destructive.
- No toast system: success feedback is inline (checkmark + text for ~1.5s).
- Tailwind + shadcn primitives in `src/components/ui`; `cn()` uses tailwind-merge.

## Verify before every push

1. `npx tsc --noEmit` and `npx jest`.
2. `npx next build`. Locally it fails at "Collecting page data" with
   `Missing API key … Resend` — pre-existing. Everything before that must be clean.
3. Logic or data changes: a throwaway `scripts/_verify_*.ts` run with `npx tsx`
   that creates rows under a real workspace/client, asserts, and deletes them in
   `finally`. Delete the script before committing.
4. UI: `preview_start` the `dev` config and check logs for errors.
5. Features: run the `pitfall-reviewer` agent on the diff before shipping.

Commit messages explain why (root cause, change, how it was verified). Stage
files by name — never `git add -A` (`.claude/settings.local.json` is personal).

## Where things are

- `docs/FEATURE_LOG.md` — what shipped, decisions, known follow-ups, backlog.
  Read it before related work; append to it after shipping.
- `/feature` builds a feature end-to-end. `/health-check` sweeps for known bug
  classes and data drift (`npx tsx scripts/health-data-checks.ts`).
