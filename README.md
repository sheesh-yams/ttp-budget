# The Third Place — Budget & Invoice Platform

Internal tool for The Third Place Creative. Builds production budgets, sends sleek proposals to clients, and tracks invoices.

Inspired by Saturation.io but stripped down to the parts that matter for an agency: **budgets → proposals → invoices**. No banking, no expense cards, no QuickBooks. Just the three core artifacts done extremely well.

## Stack

| Layer        | Choice                              |
|--------------|-------------------------------------|
| Framework    | Next.js 15 (App Router) + TypeScript|
| UI           | Tailwind + shadcn/ui                |
| Database     | Postgres (Neon)                     |
| ORM          | Prisma                              |
| Auth         | Clerk                               |
| Email        | Resend                              |
| File storage | Vercel Blob                         |
| PDF          | @react-pdf/renderer                 |
| Tables/grid  | TanStack Table + TanStack Virtual   |
| Hosting      | Vercel                              |

## Data Model — at a glance

```
Workspace (1)
  ├── Users (you + 1-2 producers, via Clerk)
  ├── RateCards (the master rate list — drives line-item autocomplete)
  ├── BudgetTemplates (saved budget skeletons by shoot type)
  ├── Clients
  │     └── Projects
  │           ├── Budgets
  │           │     └── Phases (v1, v2, Approved, …)
  │           │           └── Accounts (nested tree)
  │           │                 └── LineItems (snapshots RateCard at insert time)
  │           ├── Proposals (public /p/[token] page + PDF)
  │           └── Invoices (public /i/[token] page + PDF)
```

Money is stored in cents (integer) everywhere. Percentages are `Decimal(6,4)` (so 0.2000 = 20%).

Rate cards are the **source of defaults** but never retroactively change historical line items — every line item snapshots `description`, `unit`, and `rateCents` at insert. This is the same pattern Saturation uses and it's correct.

## App Routes

### Internal (auth required)
- `/dashboard` — outstanding invoices, recent projects, draft proposals
- `/clients`, `/clients/[id]`
- `/projects/[id]` — hub: budgets, proposals, invoices
- `/projects/[id]/budgets/[budgetId]` — the spreadsheet-like editor
- `/proposals/[id]/edit`
- `/invoices/[id]/edit`
- `/rates` — master rate card
- `/templates` — budget templates
- `/settings` — branding, payment instructions, team

### Public (no auth, tokenized)
- `/p/[token]` — branded proposal page with "Download PDF", "Approve", "Request Changes"
- `/i/[token]` — branded invoice page with wire/ACH details and "Download PDF"

## The Three Hard Parts

### 1. Budget editor (`/projects/[id]/budgets/[budgetId]`)

A virtualized spreadsheet-like grid. Three row types: **Account** (folder), **LineItem** (data), **Subtotal** (computed). The whole thing scrolls, supports keyboard navigation, and the autocomplete-from-rate-card flow is the single most important UX moment in the app.

Keyboard:
- `Enter` — new line item below
- `Tab` / `Shift+Tab` — next/prev cell
- `⌘D` — duplicate row
- `⌘↑` / `⌘↓` — reorder
- `⌘K` — command palette (insert rate from master, jump to account, etc.)
- `Esc` — exit edit mode

The description cell is the autocomplete — typing queries `RateCard` ordered by (favorite desc, usageCount desc, name asc). Selecting fills `unit`, `rateCents`, links `rateCardId`, and bumps `usageCount` on save.

Phase tabs at the top. "Duplicate phase" deep-clones the account/line-item tree.

### 2. Proposal builder + dual render (web + PDF)

The proposal is JSON in `Proposal.content`. Rendered by a single set of React components that work in both `@react-pdf/renderer` (PDF) and regular JSX (web view at `/p/[token]`).

The shared components live in `/components/proposal/` and accept a `target: "web" | "pdf"` prop that switches the underlying primitives (`<View>` / `<Text>` for PDF, `<div>` / `<p>` for web). Brand tokens (colors, fonts, logos) come from `Workspace` and can be overridden per-proposal via `Proposal.brandOverrides`.

Default sections, in order: Cover, About, Scope/Deliverables, Budget (summary or itemized), Terms. Each section is optional and reorderable in the editor.

Approval flow: client types their name, clicks "Approve" → we record `signatureName`, `signatureIp`, `approvedAt`, and snapshot the total into `approvedTotalCents`. Email fires to you via Resend. The public page flips into an "Approved by [Name] on [Date]" state and the typed name renders in a script font on the approved version.

### 3. Invoice generation & status tracking

Invoices can be:
- Generated from a budget (one-click "Create deposit invoice — 50%")
- Standalone (ad-hoc line items)

Numbering is auto-incrementing per year: `TTP-2026-001`. The workspace holds the counter.

Status auto-flips: `SENT → VIEWED` on first public-page open, `SENT → OVERDUE` via a cron when `dueDate < now()` and not paid. `PAID` is manual in v1 (you click "Mark as paid", optionally record the payment method + reference).

Public invoice page shows your wire/ACH details from workspace settings, big total, due date, line items, and a "Download PDF" button. Looks like a million bucks because that's what the brand demands.

## Suggested File Structure

```
ttp-budget/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/                  # Clerk-protected admin app
│   │   │   ├── dashboard/
│   │   │   ├── clients/[id]/
│   │   │   ├── projects/[id]/
│   │   │   │   └── budgets/[budgetId]/
│   │   │   ├── proposals/[id]/edit/
│   │   │   ├── invoices/[id]/edit/
│   │   │   ├── rates/
│   │   │   ├── templates/
│   │   │   └── settings/
│   │   ├── (public)/                # Tokenized client pages
│   │   │   ├── p/[token]/page.tsx
│   │   │   └── i/[token]/page.tsx
│   │   └── api/
│   │       ├── pdf/proposal/[id]/   # PDF stream endpoints
│   │       ├── pdf/invoice/[id]/
│   │       ├── proposals/[id]/approve/
│   │       └── webhooks/clerk/
│   ├── components/
│   │   ├── ui/                      # shadcn primitives
│   │   ├── budget/
│   │   │   ├── BudgetGrid.tsx       # the virtualized editor
│   │   │   ├── LineItemRow.tsx
│   │   │   ├── AccountRow.tsx
│   │   │   ├── RateAutocomplete.tsx
│   │   │   ├── PhaseTabs.tsx
│   │   │   └── GlobalsPanel.tsx
│   │   ├── proposal/                # shared web+PDF components
│   │   │   ├── ProposalDocument.tsx
│   │   │   ├── CoverSection.tsx
│   │   │   ├── BudgetSection.tsx
│   │   │   └── primitives.tsx       # the View/Text switchers
│   │   └── invoice/
│   │       ├── InvoiceDocument.tsx
│   │       └── primitives.tsx
│   ├── lib/
│   │   ├── db.ts                    # prisma client singleton
│   │   ├── money.ts                 # cents <-> display helpers
│   │   ├── totals.ts                # budget/invoice math
│   │   ├── formulas.ts              # globals/variables evaluator
│   │   ├── invoice-numbering.ts
│   │   └── auth.ts                  # Clerk helpers
│   └── server/
│       └── actions/                 # server actions for mutations
│           ├── budgets.ts
│           ├── proposals.ts
│           ├── invoices.ts
│           ├── rates.ts
│           └── clients.ts
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## Environment Variables (`.env.example`)

```
DATABASE_URL="postgresql://..."

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

RESEND_API_KEY=
RESEND_FROM_EMAIL="proposals@thethirdplace.co"

BLOB_READ_WRITE_TOKEN=

NEXT_PUBLIC_APP_URL="https://budget.thethirdplace.co"
```

## Build Order

1. **Phase 1 — Core data + budget editor** (no PDFs yet). Get to "I can build a budget for a real project in the app instead of a spreadsheet."
2. **Phase 2 — Proposals + public page + PDF**. The visual win. Send your first real proposal through it.
3. **Phase 3 — Invoices + public page + PDF**. Replace whatever you use today.
4. **Phase 4 — Polish.** Phases, templates, globals/variables, markups, tags, command palette, email notifications, view tracking.
