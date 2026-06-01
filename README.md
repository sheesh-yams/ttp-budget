# The Third Place — Budget & Invoice Platform

Internal tool for The Third Place Creative. Builds production budgets, sends sleek proposals to clients, tracks invoices, and distributes call sheets to crew.

Inspired by Saturation.io but stripped down to the parts that matter for an agency: **budgets → proposals → invoices → call sheets**. No banking, no expense cards, no QuickBooks. Just the core production artifacts done extremely well.

## Stack

| Layer        | Choice                               |
|--------------|--------------------------------------|
| Framework    | Next.js 15 (App Router) + TypeScript |
| UI           | Tailwind + shadcn/ui                 |
| Database     | Postgres (Neon)                      |
| ORM          | Prisma (`prisma db push`, no migrations folder) |
| Auth         | Clerk                                |
| Email        | Resend                               |
| File storage | Vercel Blob                          |
| PDF          | @react-pdf/renderer                  |
| Hosting      | Vercel                               |

## Multi-tenant Architecture

The app is fully multi-tenant. Every user signs up into their own **workspace**, backed by a **Clerk Organization**. The workspace owns all data — rate cards, templates, clients, projects, budgets, proposals, invoices, call sheets.

- `auth().orgId` → `Workspace.clerkOrgId` is the source of truth for which workspace is active
- All server actions use `getScopedDb()` — a Prisma `$extends()` wrapper that auto-injects `workspaceId` into every query on scoped models. A query cannot return data from another workspace.
- Users can create additional workspaces and switch between them via the sidebar dropdown. Switching does a hard navigation (`window.location.href`) to guarantee a fresh auth context.
- **Onboarding gate** — new users go through a one-time setup wizard before reaching the app. `user.onboarded` is set on completion.
- **Danger zone** (Settings) — workspace owner can permanently delete the workspace with name confirmation. Non-owner members can leave.

### Row-level security scoped models
`Client`, `Project`, `RateCard`, `BudgetTemplate`, `Budget`, `Proposal`, `Invoice`, `CallSheet`

Non-scoped (shared or workspace-metadata): `Workspace`, `User`, `Phase`, `Account`, `LineItem`, `ProposalView`, `InvoiceView`

## Global Library

Every new workspace is seeded with a **global library** of rate cards and budget templates so users have useful defaults on day one.

- **`GlobalRateCard`** and **`GlobalTemplate`** tables hold the master catalog. These are never workspace-scoped.
- On workspace creation (both `user.created` webhook and the "New workspace" sidebar button), `seedWorkspaceFromGlobals()` copies all `isFeatured` globals into the new workspace atomically.
- Seeded copies are **fully owned by the workspace** — editing or deleting them never touches the globals, and future global updates do not propagate to existing workspaces.
- **`/library` page** — read-only catalog where users can browse the full global library at any time and selectively pull individual rate cards or templates into their workspace. Shows "✓ In workspace" with a link to where it landed; never creates duplicates.
- **Reset library** (Settings → Workspace data) — additive re-seed that adds any missing featured items without modifying existing rows. Useful after deletions or when new globals are added.
- **`scripts/seed-existing-workspaces.ts`** — one-time backfill script for empty test workspaces. Dry-run by default (`--seed` to apply). Skips workspaces that already have rate cards.

## Data Model — at a glance

```
GlobalRateCard  ─┐
GlobalTemplate  ─┘  (global catalog; seeded into new workspaces on creation)

Workspace (1)
  ├── Users (you + producers, via Clerk org membership)
  ├── RateCards (workspace-owned copies, seeded from global library)
  ├── BudgetTemplates (workspace-owned copies, seeded from global library)
  ├── Clients
  │     └── Projects
  │           ├── Budgets
  │           │     ├── markupPct  (agency fee %)
  │           │     ├── taxPct     (global tax %)
  │           │     └── Phases (v1, v2, Approved, …)
  │           │           ├── description   (shown on proposal cover / "The Project" section)
  │           │           ├── deliverables  (JSON array — shown in proposal scope section)
  │           │           └── Accounts (nested tree)
  │           │                 └── LineItems
  │           │                       ├── rateCents        (snapshot at insert)
  │           │                       ├── lineItemCategory (CREW / TALENT / EQUIPMENT / …)
  │           │                       ├── hasMarkup        (opt-out of agency fee)
  │           │                       ├── taxRate          (per-item tax override)
  │           │                       └── quantityFormula  (A×B multiplier, e.g. "3x2" = 3 people × 2 days)
  │           ├── Proposals (public /p/[token] page + PDF)
  │           ├── Invoices  (public /i/[token] page + PDF)
  │           └── CallSheets (public /cs/[token] page)
  │                 ├── crew          JSON — [{ dept, members: [{ name, role, callTime, phone, email }] }]
  │                 ├── talent        JSON — [{ name, role, callTime, phone, email }]
  │                 ├── schedule      JSON — [{ startTime, endTime, label, whoNeeded, notes }]
  │                 ├── pointOfContact JSON — { name, title, phone, email }
  │                 ├── weather       JSON — fetched from Open-Meteo
  │                 └── hospitalInfo  JSON — nearest hospital fetched via geocoding
```

Money is stored in **integer cents** everywhere. Percentages are `Decimal(6,4)` (0.2000 = 20%).

Rate cards are the **source of defaults** but never retroactively change historical line items — every line item snapshots `description`, `unit`, and `rateCents` at insert time.

## App Routes

### Internal (auth required)
| Route | Description |
|-------|-------------|
| `/dashboard` | Outstanding invoices, recent projects, draft proposals |
| `/clients` | Client list |
| `/clients/[id]` | Client detail + project history |
| `/projects/[id]` | Project hub — budgets, proposals, invoices, call sheets, proposal overview |
| `/projects/[id]/budgets/[budgetId]` | Spreadsheet-like budget editor |
| `/projects/[id]/call-sheets/[csId]` | Call sheet editor |
| `/proposals` | All proposals — Kanban view + full list table |
| `/invoices` | Invoice list with metrics |
| `/invoices/[id]/edit` | Invoice editor |
| `/rates` | Workspace rate card list |
| `/templates` | Budget templates — full templates & add-on packages |
| `/templates/[id]` | Template detail + structure editor |
| `/library` | Global library catalog — browse + add to workspace |
| `/settings` | Branding, payment instructions, workspace data, danger zone |
| `/onboarding` | First-time setup wizard (redirected automatically for new users) |

### Public (no auth, tokenized)
| Route | Description |
|-------|-------------|
| `/p/[token]` | Branded proposal — approve, download PDF, request changes. DRAFT status renders a preview banner instead of 404. |
| `/i/[token]` | Branded invoice — wire/ACH details, download PDF |
| `/cs/[token]` | Call sheet for crew — desktop 2-col layout, mobile single-column. DRAFT shows a preview banner. |

## The Four Core Artifacts

### 1. Budget editor (`/projects/[id]/budgets/[budgetId]`)

A table-based editor with account groups (collapsible) and line items. Supports multiple phases (tabs) within a single budget.

Key behaviours:
- **Add account** via prompt or bulk import
- **Add line item** via modal — description, qty, unit, rate
- **QTY × Unit display** — line items show headcount (QTY, dimmed if 1) and unit period (e.g. "2 Days", "Week", "Flat") as separate columns. Stored as `quantityFormula = "3x2"` (A people × B days). Consistent across editor, web proposal, and PDF.
- **Insert package** — pulls in a saved template package (add-on accounts + line items) into any phase
- **Bulk import** — drag-and-drop a `.csv` or `.json` file; preview grouped line items before committing
- **Inline editing** — click any cell in the budget table to edit in place; drag handles for reordering accounts
- **Cross-account drag** — drag line items between account sections
- **Delete account** — removes account and all children; auto-renumbers codes
- **Per-item markup & tax** — each line item can override the budget-level markup or tax, or opt out of the agency fee entirely
- **Sticky summary bar** — fixed at the bottom: Net Subtotal, Markups & Taxes, Agency Fee & Tax, Grand Total
- **Line item categories** — each item carries a `lineItemCategory` (CREW, TALENT, EQUIPMENT, etc.) used by call sheet crew import

**Phase versioning** — each budget can have multiple phases (tabs):
- Rename, duplicate (copies all accounts + line items), make primary, delete
- The primary phase is used by default for proposals and invoices

### 2. Proposal builder + dual render (web + PDF)

**Proposal Overview** (on the project page) — a dedicated section where you fill in the project description and deliverables. These live on the `Phase` record, so they travel with the budget version you choose to send.

**Payment schedule** — flexible multi-payment terms set in the proposal modal:
- Default: 2 payments (50% on signing, 50% on delivery)
- Add/remove payments freely
- Each payment has a trigger: On signing, On shoot day, On delivery, Net 30/60/90, or Custom date
- Amount can be entered as a **percentage** or a **fixed dollar amount** (toggle per row) — dollar amounts auto-convert to percentages before saving
- Pre-fills from previous proposal versions
- Running total indicator; save/send blocked if payments don't sum to 100%

**Draft preview** — "Save Draft" stores the proposal and shows a "Preview draft" button. The public `/p/[token]` URL works for drafts too, with a sticky amber "Draft Preview" banner at the top and the sign-off section hidden.

**Status lifecycle:** `DRAFT → SENT → VIEWED → CHANGES_NEEDED → SENT → …` or `APPROVED`, `LOST`, `EXPIRED`.

**Version auto-increment** — each new proposal for a project increments the `version` counter. The Kanban shows only the latest sent version per thread.

**Proposals Kanban** (`/proposals`): CRM-style drag-and-drop board — DRAFTS | SENT | VIEWED | CHANGES NEEDED | WON | LOST. Lost column hidden by default. Drag cards to update status.

**Approval flow:** client types their name → `signatureName`, `signatureIp`, `approvedAt`, and `approvedTotalCents` recorded → Resend email fires → public page flips to approved state with the typed signature in script font.

### 3. Invoice generation & status tracking

Invoices can be:
- Generated from a budget (one-click, choose percentage or flat amount)
- Standalone (ad-hoc line items)

Numbering: `TTP-2026-001` — auto-incrementing per year, counter stored on `Workspace`.

**Status auto-flips:** `SENT → VIEWED` on first public page open. `PAID` is set manually. Overdue detection via `dueDate`.

### 4. Call sheets (`/projects/[id]/call-sheets/[csId]`)

Day-of documents distributed to the full crew and talent via a secret token URL.

**Editor sections:**
- **Shoot Info** — date, general call time, point of contact (name, title, phone, email)
- **Client Contacts** — auto-populated from the project's Client record (read-only)
- **Location** — name, address, parking, entry notes. "Fetch weather & hospital" button auto-populates forecast (Open-Meteo) and nearest hospital (geocoding)
- **Schedule** — time blocks with start + end time, description, "who's needed", and optional notes. Drag handles to reorder.
- **Talent** — flat list (name, role/character, call time, phone, email)
- **Crew** — grouped by department (name, role, call time, phone, email). Collapsible dept sections.
  - **Import from budget** — pulls CREW/TALENT line items from the primary budget phase; uses the A value from `quantityFormula` as headcount (e.g. "3x2" → 3 crew slots)
- **Logistics** — catering/craft services info, additional notes

**Status lifecycle:** `DRAFT → SENT → FINAL`. Finalized call sheets are locked. Reopening returns to DRAFT.

**Draft preview** — the Preview button in the editor opens the public crew view in a new tab with a "Draft Preview" banner. View analytics are skipped for drafts.

**Public crew view (`/cs/[token]`):**
- Desktop: 2-column layout — left (weather, location, POC, client contacts, hospital) + right (schedule, talent, crew by dept, catering, notes)
- Mobile: single-column stack
- Phone/email shown as tappable links throughout
- Schedule shows `startTime – endTime` and "Who:" per block

## Budget Templates (`/templates`)

Two template kinds:
- **Full Template** — seeds an entire project budget (all accounts + line items)
- **Add-on Package** — a building block inserted into any existing budget phase via "Insert package"

Templates are tagged by shoot type with a primary type and optional additional tags. The template detail page has a structure editor plus bulk import support.

## Bulk Import Format

Both budgets and templates accept `.csv` or `.json` import files.

**CSV columns:**

| Column | Required | Description |
|--------|----------|-------------|
| `accountName` | ✓ | Account group — created if it doesn't exist, extended if it does |
| `description` | — | Line item label. Falls back to `accountName` if blank |
| `qty` | — | Quantity, decimals allowed (default: 1) |
| `unit` | — | Hour / Half Day / Day / Week / Flat / Each / Mile (default: Flat) |
| `rate` | ✓* | Rate in **dollars** — `1500` for $1,500/day |
| `rateCents` | ✓* | Rate in cents (legacy) — `150000` for $1,500/day |
| `markupPct` | — | Per-item markup as decimal — 10% → `0.10` |
| `hasMarkup` | — | `true`/`false` — whether agency fee applies (default: true) |
| `taxRate` | — | Per-item tax as decimal — 8.75% → `0.0875` |
| `notes` | — | Internal note shown next to the description |

*Provide either `rate` (preferred) or `rateCents` — not both.

## File Structure

```
ttp-budget/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                              # Populates GlobalRateCard + GlobalTemplate; preserves TTP workspace data
├── scripts/
│   ├── backfill-clerk-orgs.ts              # One-time: create Clerk orgs for workspaces that lack one
│   ├── dedupe-workspaces.ts                # Find + remove duplicate workspaces by name/owner
│   ├── fix-workspace-links.ts              # Audit + repair Clerk org ↔ DB workspace mapping
│   └── seed-existing-workspaces.ts         # Backfill empty workspaces with global library (--seed flag)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── dashboard/
│   │   │   ├── clients/[id]/
│   │   │   ├── projects/[id]/
│   │   │   │   ├── call-sheets/[csId]/      # Call sheet editor page
│   │   │   │   └── budgets/[budgetId]/
│   │   │   ├── proposals/
│   │   │   ├── invoices/
│   │   │   ├── rates/
│   │   │   ├── templates/[id]/
│   │   │   ├── library/                     # Global library catalog — browse + add to workspace
│   │   │   ├── onboarding/                  # First-time setup wizard
│   │   │   └── settings/
│   │   ├── (public)/
│   │   │   ├── p/[token]/page.tsx           # Proposal public view (draft-aware)
│   │   │   ├── i/[token]/page.tsx           # Invoice public view
│   │   │   └── cs/[token]/page.tsx          # Call sheet public view (draft-aware)
│   │   └── api/
│   │       ├── pdf/proposal/[id]/
│   │       ├── pdf/invoice/[id]/
│   │       ├── proposals/[id]/approve/
│   │       └── webhooks/clerk/              # user.created, organization.created, organizationMembership.created
│   ├── components/
│   │   ├── ui/                              # shadcn primitives
│   │   ├── budget/
│   │   │   └── BulkImportModal.tsx
│   │   ├── call-sheets/
│   │   │   ├── CallSheetEditor.tsx          # Full call sheet editor with all sections
│   │   │   ├── CrewEditor.tsx               # Dept-grouped crew table (name/role/call/phone/email)
│   │   │   ├── TalentEditor.tsx             # Flat talent list
│   │   │   ├── ScheduleEditor.tsx           # Time blocks with start/end/whoNeeded
│   │   │   └── ProjectCallSheets.tsx        # Call sheets section on project page
│   │   ├── library/
│   │   │   └── LibraryPageClient.tsx        # Tabbed rate cards + templates catalog with add buttons
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx                  # Workspace switcher, nav, user footer + sign-out
│   │   │   └── TopBar.tsx
│   │   ├── proposals/
│   │   │   └── ProposalsKanban.tsx
│   │   ├── projects/
│   │   │   ├── BudgetEditor.tsx
│   │   │   ├── BudgetSummaryBar.tsx
│   │   │   ├── ProposalModal.tsx            # Create/edit/send proposals + payment schedule
│   │   │   ├── ProjectProposals.tsx
│   │   │   ├── ProjectInvoices.tsx
│   │   │   └── ProposalOverview.tsx
│   │   ├── proposal/
│   │   │   ├── ProposalPublicView.tsx       # Web render (draft-aware, sign-off hidden for drafts)
│   │   │   └── ProposalPDF.tsx
│   │   ├── settings/
│   │   │   ├── DangerZone.tsx               # Leave / Delete workspace
│   │   │   └── WorkspaceDataSection.tsx     # Reset workspace library button
│   │   └── invoice/
│   ├── lib/
│   │   ├── db.ts
│   │   ├── db-scoped.ts                     # getScopedDb() — Prisma $extends() for row-level security
│   │   ├── auth.ts                          # getCurrentUser, getWorkspaceId (orgId-first), getActiveWorkspace
│   │   ├── workspace-seeder.ts              # seedWorkspaceFromGlobals + reseedWorkspaceFromGlobals
│   │   ├── money.ts                         # cents ↔ display, parseQtyFormula, fmtUnit
│   │   ├── totals.ts
│   │   ├── importSchema.ts
│   │   ├── invoice-numbering.ts
│   │   └── email.ts
│   └── server/
│       └── actions/
│           ├── budgets.ts
│           ├── call-sheets.ts               # CRUD + importCrewFromBudget + fetchLocationData
│           ├── import.ts
│           ├── library.ts                   # copyGlobalRateCardToWorkspace, copyGlobalTemplateToWorkspace
│           ├── proposals.ts                 # createDraft, createSent, send, update — all use milestones[]
│           ├── invoices.ts
│           ├── rates.ts
│           ├── templates.ts
│           ├── clients.ts
│           ├── projects.ts
│           └── workspace.ts                 # createWorkspace, leaveWorkspace, deleteWorkspace, reseedWorkspace
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## Environment Variables

```bash
DATABASE_URL="postgresql://..."

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

RESEND_API_KEY=
RESEND_FROM_EMAIL="proposals@thethirdplace.co"

BLOB_READ_WRITE_TOKEN=

NEXT_PUBLIC_APP_URL="https://budget.thethirdplace.co"
```

## Development

```bash
npm install
npm run dev          # localhost:3000

# After schema changes:
npx prisma db push
npx prisma generate

# Populate global library (idempotent — safe to run multiple times):
npm run db:seed

# Maintenance scripts:
npx tsx scripts/fix-workspace-links.ts            # audit Clerk org ↔ DB workspace mapping
npx tsx scripts/fix-workspace-links.ts --fix      # repair orphan orgs + stale links
npx tsx scripts/seed-existing-workspaces.ts       # preview empty workspaces
npx tsx scripts/seed-existing-workspaces.ts --seed  # seed them
```

## Clerk Webhook Setup

The `/api/webhooks/clerk` endpoint must be registered in the Clerk dashboard. Required events:

| Event | Purpose |
|-------|---------|
| `user.created` | Creates the DB workspace + user, creates a Clerk org, seeds rate cards + templates |
| `organization.created` | Fallback linker for orgs created outside the app (dashboard, etc.) |
| `organizationMembership.created` | Attaches invited members to the org's workspace |

The webhook uses `svix` signature verification. Set `CLERK_WEBHOOK_SECRET` from the Clerk dashboard endpoint page.

## Engineering Conventions

- **Money:** always integer cents. Never floats. `$1,500 → 150000`.
- **Percentages:** always decimals stored as `Decimal(6,4)`. Exception: `PaymentMilestone.percentPct` is stored as display percent (50 = 50%) in JSON.
- **Row-level security:** all server actions use `getScopedDb()` (from `src/lib/db-scoped.ts`), a Prisma `$extends()` wrapper that auto-injects `workspaceId` on every query for scoped models. Webhook handlers and the workspace seeder use raw `db` — those run without an active Clerk session.
- **Return type:** all actions return `ActionResult<T>` — `{ success: true; data: T } | { success: false; error: string }`. Narrow with `'error' in result` (not `!result.success`) inside `startTransition` callbacks.
- **ESLint:** the project does not include `@typescript-eslint` plugin. **Never** add `// eslint-disable-next-line @typescript-eslint/...` comments — they cause Vercel build failures. Use proper casts instead (`as unknown as T`).
- **JSON fields:** all Prisma JSON field writes must go through `JSON.parse(JSON.stringify(value))` to avoid Decimal serialization issues.
- **Workspace switching:** use `window.location.href = '/dashboard'` after `setActive()` — not `router.refresh()`. `router.refresh()` can hit the Next.js route cache and serve stale auth context from the previous org.
- **`router.refresh()`** syncs server-rendered data after mutations. For client state that needs to update immediately (e.g. crew list after import), update React state directly from the action's return value — don't rely solely on refresh.
- **Schema changes:** `prisma db push` (no migrations folder). Run locally; Vercel runs `prisma generate` on deploy.
- **Quantity formula:** `quantityFormula = "AxB"` encodes headcount (A) × days (B). Use `parseQtyFormula()` from `money.ts` everywhere it's displayed. `fmtUnit(days, unit)` formats the unit column ("2 Days", "Week", "Flat").
- **Call sheet draft preview:** public `/cs/[token]` and `/p/[token]` both render for DRAFT status with a sticky amber banner. View analytics are skipped for drafts. The sign-off section is hidden on draft proposals.
- **Global library isolation:** `GlobalRateCard` and `GlobalTemplate` are seeded once by the app. Workspace copies are independent — never update globals from workspace data, and never propagate global changes to existing workspaces.
