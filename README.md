# The Third Place — Budget & Invoice Platform

Internal tool for The Third Place Creative. Builds production budgets, sends sleek proposals to clients, and tracks invoices.

Inspired by Saturation.io but stripped down to the parts that matter for an agency: **budgets → proposals → invoices**. No banking, no expense cards, no QuickBooks. Just the three core artifacts done extremely well.

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

## Data Model — at a glance

```
Workspace (1)
  ├── Users (you + producers, via Clerk)
  ├── RateCards (master rate list — drives line-item autocomplete)
  ├── BudgetTemplates (saved budget skeletons, full or package, by shoot type)
  ├── Clients
  │     └── Projects
  │           ├── Budgets
  │           │     ├── markupPct  (agency fee %)
  │           │     ├── taxPct     (global tax %)
  │           │     └── Phases (v1, v2, Approved, …)
  │           │           └── Accounts (nested tree)
  │           │                 └── LineItems
  │           │                       ├── rateCents  (snapshot at insert)
  │           │                       ├── hasMarkup  (opt-out of agency fee)
  │           │                       └── taxRate    (per-item tax override)
  │           ├── Proposals (public /p/[token] page + PDF)
  │           └── Invoices  (public /i/[token] page + PDF)
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
| `/projects/[id]` | Project hub — budgets, proposals, invoices |
| `/projects/[id]/budgets/[budgetId]` | Spreadsheet-like budget editor |
| `/proposals` | All proposals — Kanban view + full list table |
| `/proposals/[id]/edit` | Proposal builder |
| `/invoices` | Invoice list with metrics |
| `/invoices/[id]/edit` | Invoice editor |
| `/rates` | Master rate card |
| `/templates` | Budget templates — full templates & add-on packages |
| `/templates/[id]` | Template detail + structure editor |
| `/settings` | Branding, payment instructions, team |

### Public (no auth, tokenized)
| Route | Description |
|-------|-------------|
| `/p/[token]` | Branded proposal — approve, download PDF, request changes |
| `/i/[token]` | Branded invoice — wire/ACH details, download PDF |

## The Three Core Artifacts

### 1. Budget editor (`/projects/[id]/budgets/[budgetId]`)

A table-based editor with account groups (collapsible) and line items. Supports multiple phases (tabs) within a single budget.

Key behaviours:
- **Add account** via prompt or bulk import
- **Add line item** via modal — description, qty, unit, rate
- **Insert package** — pulls in a saved template package (add-on accounts + line items) into any phase
- **Bulk import** — drag-and-drop a `.csv` or `.json` file; preview grouped line items before committing (see [Import Format](#bulk-import-format))
- **Sticky summary bar** — fixed at the bottom of the viewport, always visible:
  - Net Subtotal (raw line totals)
  - Markups & Taxes (per-item `markupPct` + `taxRate` overrides)
  - Agency Fee & Tax (budget-level `markupPct` + `taxPct`)
  - Grand Total

Budget-level markup (`markupPct`) and tax (`taxPct`) are set on the budget record itself. Individual line items can opt out of the agency fee via `hasMarkup: false`, or carry their own tax rate via `taxRate` (useful for equipment sales tax, workers' comp, etc.).

### 2. Proposal builder + dual render (web + PDF)

The proposal is JSON in `Proposal.content`. A shared set of React components renders in both `@react-pdf/renderer` (PDF) and regular JSX (web view at `/p/[token]`), switching primitives via a `target: "web" | "pdf"` prop.

Brand tokens (colors, fonts, logo) come from `Workspace` settings, overridable per-proposal via `Proposal.brandOverrides`.

Default sections: Cover, About, Scope/Deliverables, Budget (summary or itemized), Terms. Each section is optional.

**Approval flow:** client types their name → `signatureName`, `signatureIp`, `approvedAt`, and `approvedTotalCents` are recorded → Resend email fires to you → public page flips into an approved state with the typed signature in script font.

**Status lifecycle:** `DRAFT → SENT → VIEWED → CHANGES_NEEDED → SENT → …` or `CLOSED` (expired proposals auto-routed to closed column in Kanban).

**Proposals Kanban** (`/proposals`): CRM-style drag-and-drop board with columns DRAFTS | SENT | VIEWED | CHANGES NEEDED | CLOSED. Drag cards between columns to update status; use the status dropdown pill on each card for quick changes. Full proposal list table below the board.

### 3. Invoice generation & status tracking

Invoices can be:
- Generated from a budget (one-click, choose percentage or flat amount)
- Standalone (ad-hoc line items)

Numbering: `TTP-2026-001` — auto-incrementing per year, counter stored on `Workspace`.

**Status auto-flips:** `SENT → VIEWED` on first public page open. `PAID` is set manually (click "Mark as paid", record method + reference). Overdue detection via `dueDate`.

Public invoice page shows wire/ACH details from workspace settings, big total, due date, and "Download PDF".

## Budget Templates (`/templates`)

Two template kinds:
- **Full Template** — seeds an entire project budget (all accounts + line items). Used when creating a budget from scratch.
- **Add-on Package** — a building block inserted into any existing budget phase via "Insert package". Good for recurring crew packages, equipment packages, post bundles, etc.

Templates are tagged by shoot type (Music Video, Brand Campaign, Product Shoot, etc.) with a primary type and optional additional tags. The template detail page has a structure editor for managing accounts and line items within the JSON `structure` field, plus bulk import support.

## Bulk Import Format

Both budgets and templates accept `.csv` or `.json` import files.

**CSV columns** (download a template from the Import modal):

| Column | Required | Description |
|--------|----------|-------------|
| `accountName` | ✓ | Account group (created if it doesn't exist) |
| `description` | ✓ | Line item description |
| `qty` | — | Quantity (default: 1) |
| `unit` | ✓ | Hour / Half Day / Day / Week / Flat / Each / Mile |
| `rateCents` | ✓ | Rate as whole cents — $1,500 → `150000` |
| `markupPct` | — | Per-item markup as decimal — 10% → `0.10` |
| `hasMarkup` | — | `true`/`false` — whether agency fee applies (default: true) |
| `taxRate` | — | Per-item tax as decimal — 8.75% → `0.0875` |
| `notes` | — | Internal note shown next to description |

**JSON format:** array of objects using the same field names.

The import modal shows a grouped preview of all accounts and line items before writing anything to the database. Existing accounts are extended (not duplicated); new accounts are created in order.

## File Structure

```
ttp-budget/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/                        # Clerk-protected admin app
│   │   │   ├── dashboard/
│   │   │   ├── clients/[id]/
│   │   │   ├── projects/[id]/
│   │   │   │   └── budgets/[budgetId]/
│   │   │   ├── proposals/                 # Kanban + list table
│   │   │   ├── proposals/[id]/edit/
│   │   │   ├── invoices/
│   │   │   ├── invoices/[id]/edit/
│   │   │   ├── rates/
│   │   │   ├── templates/
│   │   │   ├── templates/[id]/
│   │   │   └── settings/
│   │   ├── (public)/                      # Tokenized client pages
│   │   │   ├── p/[token]/page.tsx
│   │   │   └── i/[token]/page.tsx
│   │   └── api/
│   │       ├── pdf/proposal/[id]/
│   │       ├── pdf/invoice/[id]/
│   │       ├── proposals/[id]/approve/
│   │       └── webhooks/clerk/
│   ├── components/
│   │   ├── ui/                            # shadcn primitives
│   │   ├── budget/
│   │   │   └── BulkImportModal.tsx        # drag-drop import, preview, success
│   │   ├── proposals/
│   │   │   └── ProposalsKanban.tsx        # HTML5 DnD Kanban + status select
│   │   ├── projects/
│   │   │   ├── BudgetEditor.tsx           # phase tabs, account table, modals
│   │   │   ├── BudgetSummaryBar.tsx       # sticky bottom summary bar
│   │   │   ├── AddLineItemModal.tsx
│   │   │   ├── InsertPackageModal.tsx
│   │   │   ├── ProjectProposals.tsx
│   │   │   └── ProjectInvoices.tsx
│   │   ├── templates/
│   │   │   ├── TemplateDetailClient.tsx   # metadata + tags + bulk import
│   │   │   └── TemplateStructureEditor.tsx
│   │   ├── proposal/                      # shared web+PDF components
│   │   └── invoice/
│   ├── lib/
│   │   ├── db.ts                          # Prisma client singleton
│   │   ├── auth.ts                        # Clerk helpers (getCurrentUser)
│   │   ├── money.ts                       # cents ↔ display helpers
│   │   ├── totals.ts                      # budget/invoice math
│   │   ├── importSchema.ts                # Zod schema + CSV parser + UNIT_MAP
│   │   ├── invoice-numbering.ts
│   │   └── email.ts
│   └── server/
│       └── actions/                       # Server actions (all auth-gated)
│           ├── budgets.ts
│           ├── import.ts                  # importToBudget + importToTemplate
│           ├── proposals.ts
│           ├── invoices.ts
│           ├── rates.ts
│           ├── templates.ts
│           ├── clients.ts
│           ├── projects.ts
│           └── workspace.ts
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
```

## Engineering Conventions

- **Money:** always integer cents. Never floats. `$1,500 → 150000`.
- **Percentages:** always decimals. `10% → 0.10`. Stored as `Decimal(6,4)`.
- **Server actions:** every mutation goes through a `'use server'` action that calls `getCurrentUser()` first and verifies workspace ownership before touching any DB row.
- **Return type:** all actions return `ActionResult<T>` — `{ success: true; data: T } | { success: false; error: string }`.
- **No `any`:** project ESLint does not include `@typescript-eslint` plugin. Never use `// eslint-disable-next-line @typescript-eslint/...` — it causes build failures. Use proper casts like `as Parameters<typeof db.model.method>[0]['data']['field']`.
- **`router.refresh()`** after optimistic state mutations to sync server-rendered data.
- **Schema changes:** `prisma db push` (no migrations folder). Run locally and Vercel runs `prisma generate` on deploy.
