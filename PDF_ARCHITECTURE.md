# PDF Generator Architecture

## Overview

PDFs are generated server-side on-demand via Next.js App Router API routes using `@react-pdf/renderer`. When a client GETs the route, the server fetches data from the database, serialises it into a plain data object, renders a React PDF component tree to a binary buffer, and streams the buffer back as an `application/pdf` response with a `Content-Disposition: attachment` header.

There is no caching, no pre-generation, and no file storage — every request renders a fresh PDF from live data.

---

## Entry Points

| Route | File | Access control |
|---|---|---|
| `GET /api/pdf/invoice/[id]` | `src/app/api/pdf/invoice/[id]/route.ts` | Public — keyed by `publicToken` |
| `GET /api/pdf/proposal/[id]` | `src/app/api/pdf/proposal/[id]/route.ts` | Public — keyed by `publicToken` |

The `[id]` segment is the record's `publicToken` (a random UUID-like string stored on the database row), not the internal database ID. This means anyone with the link can download the PDF without authentication. DRAFT records return 404.

---

## Request Lifecycle

### Invoice

1. Look up `Invoice` by `publicToken`, including `client`, `project`, and a specific subset of `workspace` fields (name, legalName, contactEmail, website, wireInstructions, achInstructions, checkPayableTo, checkMailingAddress).
2. Return 404 if not found or status is `DRAFT`.
3. Serialise the Prisma record into a plain `invoiceData` object — all `Date` fields converted to ISO strings, `Decimal` fields (taxPct) cast to `Number`, `lineItems` JSON column cast to `InvoiceLineItem[]`.
4. Call `renderToBuffer(React.createElement(InvoicePDF, { invoice: invoiceData }))`.
5. Return the buffer as `Uint8Array` with filename `TTP-Invoice-{number}-{project-slug}.pdf`.

### Proposal

1. Look up `Proposal` by `publicToken`, including `project → client` and a subset of `workspace` fields (name, legalName, contactEmail, website).
2. Return 404 if not found or status is `DRAFT`.
3. Resolve budget data — two paths:
   - **Snapshot path** (preferred): if `proposal.content.budgetSnapshot` exists, use its `accounts` array and `totalCents` directly. This is a frozen point-in-time copy of the budget stored when the proposal was sent.
   - **Live path** (legacy fallback): query the primary phase of the linked budget, then any phase in order. Map Prisma Decimal fields to numbers. Sum accounts using `sumAccount()`.
4. Serialise the proposal record to a plain object with all `Date` fields as ISO strings.
5. Call `renderToBuffer(React.createElement(ProposalPDF, { proposal, accounts, totalCents }))`.
6. Return the buffer as `Uint8Array` with filename `TTP-Proposal-{project-slug}.pdf`.

---

## PDF Components

### `InvoicePDF` — `src/components/invoice/InvoicePDF.tsx`

Renders a single LETTER-size page. Sections rendered in order, each conditional on data being present:

- **Cover** (always): dark (`#0A0612`) header with logo, invoice kind label, title, and a metadata strip showing bill-to, project, issue date, due date, PO number, and amount due / balance due / total paid depending on payment status.
- **Services** (if `lineItems.length > 0`): bordered table with description, qty, unit, rate, and total columns. Followed by a totals block showing subtotal, tax, discount, payments received, and a grand total bar.
- **How to Pay** (if workspace has any payment instructions and invoice is not paid): up to three side-by-side cards for Wire Transfer, ACH / Direct Deposit, and Check, each showing the relevant workspace-level instructions.
- **Notes** (if `invoice.notes` is set).
- **Terms** (if `invoice.terms` is set).
- **Footer** (fixed, repeats on every page): workspace name, contact email, website, and invoice number.

Props type: `InvoicePDFData` (defined in the same file).

### `ProposalPDF` — `src/components/proposal/ProposalPDF.tsx`

Renders a single A4-size page (with a page break before the budget summary). Content is driven by the `sections` array stored in `proposal.content` (a JSON column typed as `ProposalContent`). Sections rendered in order:

- **Cover** (always): dark header with logo, "Prepared for {client}" label, proposal title, a 180-character excerpt of the About body, and a metadata strip showing shoot dates, client, shoot type, valid-through date, and total.
- **The Project** (if an `about` section exists): full body text.
- **Deliverables** (if a `scope` section exists with items): 30%-width cards in a flex-wrap grid, each showing a number, title, and description.
- **Budget Summary** (if accounts present, starts on a new page): bordered table showing account headers with totals, line items with qty/unit/amount, child account line items, a subtotal row, an optional production fee row (accounts matching `/production fee/i` are separated out), and a total bar.
- **Payment Terms** (if a `terms` section exists with milestones): side-by-side milestone cards showing percentage, name, trigger label, and computed dollar amount.
- **Footer** (fixed, repeats on every page): workspace name, email, website, proposal number, and valid-through date.

Props: `{ proposal: ProposalData, accounts: Account[], totalCents: number }` (all typed locally in the file).

---

## Styling

Both components use `StyleSheet.create()` from `@react-pdf/renderer`. All styles are defined as a single `s` object at the top of each file. Fonts are Helvetica and Helvetica-Bold (both built into PDF, no network font loading). Brand colours are defined as constants at the top of each file:

| Token | Hex | Usage |
|---|---|---|
| `V` | `#5D00A4` | Violet — section lines, accent borders, labels |
| `MINT` | `#04FFCC` | Mint — dark-background labels, total bar, logo |
| `INK` | `#0A0612` | Near-black — cover and footer backgrounds |
| `BODY` | `#2C2C2A` | Default text colour |
| `MUT` | `#888780` | Muted text, secondary values |
| `BDR` | `#E8E0F0` | Border colour |
| `CAN` | `#F7F4FA` | Alternate section background |

---

## Module Resolution Fix

`@react-pdf/renderer` v3.x ships as a dual CJS/ESM package. Its `package.json` exports map points the `import` condition to `react-pdf.js`, an ESM bundle that includes a self-contained React reconciler. On Vercel Lambda, Node's ESM loader loads this ESM build even when the route is compiled as CJS, creating two React instances — the app's React and the one bundled inside `react-pdf.js`. The reconciler's element-type check then fails, throwing minified React error #31.

The fix is in `next.config.js`: at startup, before any webpack compilation, the config file reads `@react-pdf/renderer/package.json` and rewrites the `import` and `default` conditions to point to `react-pdf.cjs` instead of `react-pdf.js`. `react-pdf.cjs` uses external `require('react')`, so it shares the same React instance as the rest of the app. The package is listed in `serverExternalPackages` so Node loads it from the patched node_modules at runtime rather than having webpack attempt to bundle it.

This patch runs on every `next build`. Because Vercel includes `serverExternalPackages` dependencies (with their `package.json` files) in the Lambda deployment, the patch is present at both build time and runtime.

---

## Key Files

```
next.config.js                                  — exports-map patch + serverExternalPackages
src/app/api/pdf/invoice/[id]/route.ts           — invoice route handler
src/app/api/pdf/proposal/[id]/route.ts          — proposal route handler
src/components/invoice/InvoicePDF.tsx           — invoice PDF component + types
src/components/proposal/ProposalPDF.tsx         — proposal PDF component + types
src/lib/money.ts                                — formatMoney(), lineTotal()
src/lib/totals.ts                               — sumAccount()
src/types/index.ts                              — InvoiceLineItem, ProposalContent, PaymentMilestone
```
