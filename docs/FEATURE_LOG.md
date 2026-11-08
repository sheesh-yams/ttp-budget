# SlateSuite feature log

What shipped, the decisions behind it, and what's still open. Newest first.
Append an entry after every feature or notable fix (see `/feature`, step 9).

**Last health check:** 2026-09-30 (initial run of `scripts/health-data-checks.ts`,
2 findings — both listed under follow-ups).

---

## Open follow-ups

Bugs and gaps noticed but deliberately left out of scope. Pick these up in a
`/health-check` or when working nearby.

- **7 Clerk orgs have no linked workspace** (e.g. "The Third Place Creative",
  "Crossover Productions"). Found by the roles backfill and skipped.

- **View-only delivery / call sheets use a disabled fieldset,** which also
  disables "Copy link" and the analytics toggle. Drag-to-reorder still moves
  things on screen until a refresh (the server refuses). A proper read-only
  mode in DeliverablesManager / ClientPagePreview / CallSheetEditor would fix
  both. Only custom roles with View hit this; defaults are Edit or None.
- **Roles Phase 2 is converting area by area.**
  - Done: budget and overview; crew and deal memos; schedule, call sheets
    and delivery; money (proposals, invoices, actuals, contract, and the
    /proposals and /invoices lists).
  - Workspace pages (clients, rolodex, rates/templates/library, settings,
    projects) shipped in 2b.
  - Team & roles and the last UI flags shipped in 2c. The legacy role was
    removed from the code in the cleanup (`20261005000003_drop_legacy_roles`
    drops the columns once that deploy is live). **Roles are done.**
- **Actuals sync runs for view-only users too.** `syncActualSheetEntries`
  runs on every Actuals page load. It adds $0 entries for new budget lines
  (now validated against the sheet's phase) and refreshes deal-memo
  prefills, so a View user's page load writes. The writes are idempotent and
  only use server data, but moving the sync into `src/lib` and running it on
  edit would be cleaner.
- **Call-sheet "Sync to Rolodex?" fails silently without Rolodex Edit.**
  `CrewEditor` and `TalentEditor` ignore `patchContactField`'s result. This
  was already true before 2b. Hide the prompt, or show the error.
- **Start from a template needs browse-all.** The budget empty state's picker
  mixes templates and other projects' budgets, so someone with costs EDIT but
  not Producer-level browse can only create a blank budget.
- **Invited people get a throwaway personal workspace.** Every sign-up gets
  its own workspace (the `user.created` webhook, or a lazy create if a page
  loads first — "Ashish TEST's Workspace" has no Clerk org). Accepting an
  invite moves them, leaving the empty one behind.
- **Crew page shows edit controls to Collaborators.** Saving is refused by
  the server; roles Phase 2 hides the controls.

- **Concurrent won-effects can duplicate team placeholders.** A client
  e-signing while a producer marks Won manually runs two reconciles that both
  read the team before either writes. `updateProposalStatus` also re-runs the
  effects when a proposal is already APPROVED. (Low — found by pitfall-reviewer.)
- **"Sheeshyams Project Testing" is LEAD with an APPROVED proposal.** Same
  e-signature gap fixed in fe6d9e2. Test project — ask before changing.
- **Hulu Summer Sizzle proposal:** `approvedAt` set but status VIEWED. Ambiguous
  (last write wasn't a view; project archived). User chose to leave it.
- **Restored proposals skipped team reconciliation.** Daadi v2, Chopstx v2 and
  PMH were set back to APPROVED directly (fe6d9e2 backfill). Re-marking Won from
  the Status dropdown runs it if wanted.
- **Draft invoices can't be previewed.** `/i/[token]` 404s for DRAFT, so there's
  no way to see the client view before sending. The proposal overview's
  in-app `ProposalPublicView isDraft` preview is the pattern to copy.
- **Local `next build` never completes.** Resend is constructed at module load
  and throws without `RESEND_API_KEY`, so page-data collection fails locally.
  Lazy-initialising the client would make build a full verification step.
- **Toast system deferred.** Inline success feedback everywhere for now; a
  shared Sonner/Radix toast would standardise it.
- **Dead code:** `sendProposal` / `createProposal` in `proposals.ts` are
  unreferenced — delete.
- **Deal memo Phase 1 unclicked in a browser:** board, bid dialog, memo
  editor, vendor preview, Settings → Contracts vendor tab + defaults panel,
  crew pills, rolodex history, Actuals "Deal memo" tags + Unbudgeted group.
- **Budget lines without a formula count quantity as headcount** (`2` = 2
  people × 1 day), the same as the team reconcile and the PDF. A 2-day solo
  line should be entered as `1x2` for deal memo days to prefill correctly.
- **Never clicked through in a browser** (agent sessions have no login):
  proposal option tabs + PDF sequential options, option-visibility switch,
  proposal overview version dropdown + full-screen preview, dashboard KPI links.

## Backlog (requested directions)

- **Roles — finish Phase 2 (parked 2026-10-05, user's call):** convert the
  remaining areas, which still say "Not enforced yet" and follow the closest
  built-in role:
  1. ~~Money~~ (shipped 2026-10-05, roles 2a).
  2. ~~Workspace pages~~ (shipped 2026-10-05, roles 2b).
  3. ~~Team & roles~~ (shipped 2026-10-05, roles 2c).
  ~~Then cleanup~~ (shipped 2026-10-05). The drop SQL runs after that
  deploy.
  Process per slice: access diff → convert → hide controls → review → ship.

Run each through `/feature`. Check the overlap first:
- **Deal memos** — likely extends project members/crew (roles, rates, days, kit
  fees already exist) plus the e-signature + PDF patterns from proposals.
- **Vendor tracking** — check rolodex contacts and receipts/actuals before adding
  a model; vendors may be a contact type plus spend rollups.
- **Contracts** — proposal contract sections + contract library already exist
  (`ContractTab`, frozen `contractSnapshot` on signing). Standalone contracts
  should reuse that, not fork it.

---

## Shipped

### 2026-11-08 — Client page (Phase 2): people + billing defaults

- **Asked:** several contacts per client, and defaults that fill in by themselves.
  - **Decisions (user):**
    - With a billing contact, invoices go To billing, with the main contact CC'd.
    - Defaults: payment terms, standard invoice CC, standard proposal CC. No "PO required".
    - Contacts live on the client, not in the Rolodex.
- **Migration** `20261108000001_client_contacts_defaults` (run by the user in Neon):
  - **`Client`** gains `paymentTermsDays INT NULL`, plus `invoiceCcEmails` and `proposalCcEmails` (`TEXT[]`, default empty).
  - **New `ClientContact` table:** name, title, email, phone, `isBilling`, order. It cascades with the client and is in `SCOPED_MODELS`.
- **The main contact stays on `Client.contact*`.** E-sign allowed emails, PDFs, public pages and call sheets are unchanged. Extra people sit in `ClientContact`, with at most one billing contact, enforced in the action's transaction.
- **Client page:**
  - **People card** (`ClientPeople.tsx`): Main first, then extra people with a Billing tag. Add, edit and remove through a dialog. A line says where invoices go.
  - **Billing defaults card:** payment terms in days (blank = the workspace default), "Always CC on invoices" and "Always CC on proposals".
  - **Actions:** `addClientContact`, `updateClientContact`, `deleteClientContact` and `updateClientDefaults`. All need Clients EDIT and log AuditEvents (`client.contact.*`, `client.defaults.updated`).
- **Where the defaults apply** (`src/lib/client-recipients.ts`, jest-tested):
  - **Invoice send window** (`getInvoiceSendData` → `invoiceSendRecipients`):
    - **To:** always follows the client (the billing contact, else the main contact). The To isn't stored on an invoice.
    - **CC on a never-sent invoice:** main contact (when billing is the To) + standard invoice CC.
    - **CC after sending:** the saved list, plus the main contact whenever the To is someone else.
    - The billing and CC addresses only go to people who can send (Invoices EDIT).
  - **Proposal window:** a new proposal, or a never-sent draft with no CC, pre-fills the client's proposal CC. Revisions keep what they were sent with. Anyone CC'd can e-sign, same as a typed CC; the defaults card says so.
  - **Due dates:** the client's terms replace the workspace default. This covers the project page (`NewInvoiceModal`), the project invoices page, /invoices and the client page. `NewStandaloneInvoiceModal` updates the due date when the project or client changes, until the user edits it.
- **Verified:**
  - jest (595; new `client-recipients.test.ts`), tsc, lint, `audit:scoping`
  - next build up to the known Resend error
  - **Throwaway live-DB script, on a test client, cleaned up:**
    - Only one billing contact.
    - Never-sent invoice: To billing, CC main + AP.
    - A sent invoice keeps its recipients.
    - Terms → due days.
    - The page loader returns contacts and defaults.
    - Contacts are workspace-scoped.
  - **pitfall-reviewer**, all fixed:
    - **High:** a resend would have dropped the billing contact. The To is never stored, so the old rule fell back to the main contact.
    - The client page ignored the client's terms.
    - Reopening the invoice window carried over a stale due date.
    - The "Saved" checkmark vanished early.
    - Invoices VIEW-only roles could read the billing and CC addresses.
- **Follow-ups:**
  - The due-date fallback is the workspace's `invoiceExpiryDays`. `Workspace.defaultPaymentTermsDays` is editable in Settings but nothing reads it. Decide which one is "payment terms".
  - Contacts can't be reordered yet (they keep the order they were added in).
  - The billing contact isn't used on the invoice PDF or public page; those still show the client's main contact.

### 2026-11-08 — Client page (Phase 1)

- **Asked:** one place for everything about a client. Internal only; the user doesn't want a client-facing portal.
- **New `/clients/[id]`** (`ClientDetail.tsx`, loader `src/lib/client-page.ts`):
  - **Header:** logo, name, legal name, "client since", plus the actions:
    - New project, with the client preselected (`defaultClientId` on `NewProjectModal`)
    - New invoice, with the client preselected (`defaultClientId` through `NewInvoiceButton`)
    - Edit (`ClientModal`)
    - Archive
  - **Account note** callout.
  - **Money strip:** Billed · Collected · Outstanding · Overdue · Open pipeline · Win rate (won of decided, plus the average won value).
  - **Projects:** value and collected; archived projects behind a toggle.
  - **Proposals:** the same deal rows as /proposals, via `loadDeals` with a new `clientId` filter.
  - **Invoices:** open first and overdue at the top. Archived invoices are behind a toggle and tagged, as on /invoices.
  - **Contact and billing address.**
  - **Notes, edited in place:** new `updateClientNotes`, which needs Clients EDIT.
  - **Activity:** built from row timestamps (`src/lib/client-activity.ts`), not the audit log. It covers project created; proposal sent / opened / won / declined; invoice sent / opened / paid; and a deliverable's first view. Latest 25.
- **Links in:** a client card's name and logo, and the client name on the project page (with Clients VIEW).
- **Who sees what:**
  - **Page:** Clients VIEW. The edit controls are hidden without Clients EDIT, rather than greying out the whole page, so New project and New invoice still work for someone who can create those.
  - **Projects:** same scope rule as /projects (ASSIGNED → their assignments).
  - **Proposals, invoices, delivery activity:** `projectsWithArea` for each area.
  - **Money:** only with `dashboardMoney`. Before, the /clients cards showed money to anyone with Clients VIEW.
  - **Tab title:** checks Clients access before reading the client name.
- **Card money fixed** (`src/lib/client-money.ts`, shared with the page):
  - **"Lifetime value" → "Collected":** what's actually been paid, partial payments included. Before, it summed the totals of fully PAID invoices only.
  - **"Outstanding":** the balance still owed, not the full total.
  - Both now include archived projects' invoices (real money, same call as the Dashboard).
  - **Example:** Taptap Send - India went from LTV $35,568 to Collected $35,568 of $71,136 billed.
- **Cleanup:** `ClientModal`'s `existing` prop narrowed to the fields it edits. `ProjectNotesPanel` no longer pads it with fake money fields.
- **Verified:**
  - jest (581; new `client-page.test.ts`), tsc, lint
  - next build up to the known Resend error
  - **Read-only live-DB script, 4 clients:**
    - Collected and outstanding match an independent recompute from the invoice rows.
    - Deals match /proposals filtered to the client.
    - Another workspace gets null.
    - No openable projects leak nothing.
    - No money access shows no money and no invoices.
  - **pitfall-reviewer:** two low findings, both fixed: archived invoices in the list and feed; the client name in the tab title before the access check.
  - The page itself still needs a signed-in pass.
- **Follow-ups:**
  - **Phase 2 (planned, needs a migration):** several named contacts per client (billing vs. creative, as the default To for invoices and proposals), and client defaults (payment terms, PO required, standard CC).
  - **Dead code:** `src/components/projects/ClientInfoPanel.tsx` isn't imported anywhere.
  - **ASSIGNED scope on /clients:** the cards still list every project and workspace-wide money for these roles (money only with `dashboardMoney`). Same as the existing Dashboard follow-up.

### 2026-11-07 — Security + invoice bug batch

Six logged follow-ups, fixed together.
- **Shade thumbnails were an open proxy.**
  - **Before:** `getShadeThumbnailUrl` took any Shade asset id from the browser and called Shade with our API key.
  - **Now:** it takes a deliverable version id. The server reads that version's stored link (`src/lib/shade-url.ts`).
  - **Public pages** (`/d`, `/m/d`) pass their page token. The version must be Shade, on a SHARED asset of that PUBLISHED page.
  - **Signed in** (DeliverablesManager): delivery View on the version's project.
- **View recorders were public RPC endpoints.** `recordProposalView`, `recordInvoiceView` and `recordDeliverableView` moved out of `'use server'` files into `src/lib/view-recording.ts` (server-only). Only the token pages call them.
  - **Deliverable views** take the workspace from the version row, not a caller argument.
- **An invoice's first view counted twice.** It's now one count per view, then the guarded SENT/OVERDUE → VIEWED.
- **Invoice numbers follow the invoice date's year** (`src/lib/invoice-numbering.ts`):
  - **Current year:** the running counter, as before.
  - **Backdated into an earlier year:** one past the highest number that year has used, including numbers of deleted invoices. Those come from the `invoice.deleted` audit events, and `project.deleted` now records its `invoiceNumbers`. A number a client may hold is never reissued.
  - **A future date or a typo** (e.g. 2062) numbers under the current year, so the counter can't be pushed ahead.
  - **Changing the date later** doesn't renumber.
- **Online payments when the invoice changed during checkout:**
  - **Before:** `settle.ts` always marked the invoice PAID. If the total had gone up, it showed PAID for less than the total.
  - **Now:** it records the payment and marks PAID only when payments cover the total (`settledInvoiceStatus`). Otherwise the balance stays due and the public page shows "Partially Paid". A VOID invoice stays VOID; the money is still recorded and an error is logged.
  - **Reopened checkout:** it charges today's balance, and the payment attempt now expects that amount too. Before, a reopened checkout after an edit was refused as an amount mismatch: the client was charged and nothing was recorded.
  - **Receipt email:** shows this payment, not the running total, plus "A balance of $X remains" when one does.
- **Decision (mine):** invoices can still be edited during a checkout. Blocking edits for 2 hours after an abandoned checkout would get in the way, and settlement now records what actually happened.
- **Verified:**
  - jest (575; new `payment-and-view-fixes.test.ts`), tsc, lint
  - next build up to the known Resend error
  - **Throwaway scripts on the live DB:**
    - Invoice views: SENT → VIEWED, one count per view; VOID stays VOID.
    - Settle: short payment (not PAID), then the balance (PAID); a replay is a no-op; VOID stays VOID.
    - Numbering inside rolled-back transactions: this year, a future/typo year, an empty past year, skipping deleted numbers. The real counter was untouched.
    - Shade gate: passes for a shared version on its page. Refused for a wrong token, a draft asset, an unpublished page, and no token without a session.
    - Deliverable views take the version's workspace; a mismatched pair records nothing.
  - **Dev server:** `/d` and `/m/d` load with no errors, and thumbnail requests pass the gate.
  - **pitfall-reviewer:** three findings, all fixed: deleted numbers reused and a typo year sticking the counter; a comment that overstated the reopened checkout; the receipt amount.
- **Follow-ups:**
  - **Reopened checkout, earlier window still open:** if the client pays in the earlier checkout (another tab) after reopening it at a new balance, the charge is logged but not recorded. The confirm route refuses it (token replaced) and the webhook sees an amount mismatch. Recording the Helcim amount on a webhook mismatch would close it.
  - **Concurrent backdated invoices:** two invoices backdated into the same year at the same instant can compute the same number. The unique constraint refuses the second, with a generic error.

### 2026-11-07 — Delete projects permanently; archived projects out of the Dashboard pipeline

- **Asked:** do archived projects affect the sales pipeline? There are many test projects to remove, beyond archiving.
- **Pipeline:** /proposals and /projects already excluded archived projects. The **Dashboard** didn't. Its proposal figures now filter `project.archivedAt: null`:
  - **"Proposals sent":** this is now a real server-side count. It used to count from the 5-item queue, so it could never show more than 5.
  - **The ProposalQueue:** the same filter.
  - **Added-scope totals:** the same filter.
  - In The Third Place, 14 proposals on archived projects dropped out.
- **Deliberately unchanged:** "Outstanding" and "Collected this month" (and the invoice tracker) still include archived projects' invoices. That money is real, the invoices can still be paid, and it matches /invoices.
- **Delete permanently** (`deleteProject` / `getProjectDeletePreview` in `src/server/actions/projects.ts`, transaction in `src/lib/project-delete-run.ts`):
  - **Decisions (user):**
    - owners only
    - allowed even when invoices were paid, behind a warning
  - **Decision (mine):** archived projects only. Archive stays the reversible step.
  - **`DeleteProjectDialog`:**
    - lists what goes (budgets, proposals, invoices, call sheets, deal memos, receipts)
    - a red warning with the amount paid ("No money is refunded")
    - the user types the project name to confirm
  - **Where:** the Projects row menu (archived rows) and the archived project's header.
  - **The transaction (raw db, workspaceId in every where):**
    1. refuses while a client is mid-checkout on one of its invoices, using `paymentInProgress`, the same rule as `deleteInvoice`
    2. deletes proposals first, because `Proposal.budget` is `onDelete: Restrict`
    3. a guarded `project.deleteMany`; `status ARCHIVED` and `archivedAt` are re-checked so a restore meanwhile rolls back
    4. FK cascades remove the rest
    5. `PaymentAttempt` rows are deleted afterwards (a soft ref with no FK)
    6. an AuditEvent `project.deleted` with the name and counts
  - The mobile "+" sheet forgets a deleted project (`forgetLastProject`).
- **Verified:**
  - jest (2 new tests, 569 total), tsc, lint
  - next build up to the known Resend error
  - **Throwaway scripts on the live DB:**
    - Every child row was gone: budget, phase, proposal, invoice, payment attempt, call sheet, deal memo and fee.
    - A non-archived project was refused and rolled back.
    - Another workspace couldn't delete it.
    - A mid-checkout attempt blocked the delete and rolled back.
    - An abandoned attempt didn't block.
    - Rows were cleaned up.
  - The read-only dashboard counts were checked.
  - **pitfall-reviewer:** findings fixed:
    - the mid-checkout payment guard
    - money metrics restored to unfiltered
    - the "Proposals sent" count capped at 5
    - forgetting the last project
- **Follow-ups:**
  - Uploaded files (receipts, shot-list images) stay in R2 after a delete.
  - DeliverableView analytics rows (no FK) are left behind.
  - Already there before this change: the Dashboard money queries aren't limited to assigned projects for ASSIGNED-scope roles with Dashboard money access.

### 2026-11-07 — Data: legacy proposal discounts copied to their budgets

- **Reported:** Chopstx's won proposal showed a $300 discount ($7,650), but the project total, Budget Breakdown and payment schedule used $7,950. New 50% invoices came to $3,975.
- **Root cause:** before 28b631b (Jul 17) discounts lived on the proposal (`content.discount`). That commit moved them to the Budget but never copied existing ones over, so those budgets had no discount.
- **Discovery (read-only):** 3 budgets had a proposal-level discount the budget lacked.
  - **Definite:** Chopstx (v2 won, $300) and Service95 (archived, v4 won, $1,050). In both, the live total minus the discount equals `approvedTotalCents` exactly.
  - **Left alone:** Project Test 2. It's archived and only had a draft.
- **Fix (user approved):** a guarded `updateMany` on each budget (`discountType: null` in the where), with a flat discount set from the proposal, plus an AuditEvent `budget.discountBackfilled` per budget.
- **Verified after:** live totals Chopstx $7,650 and Service95 $5,250 both match the signed totals. Chopstx's milestones are now $3,825 each, and the first is already paid.
- **No code change.** Proposals can no longer carry their own discount, so this can't recur.
- **Follow-up idea:** a /health-check drift check that flags won proposals whose `approvedTotalCents` differs from the live primary-phase total.

### 2026-11-07 — Won proposals lock instead of expiring

- **Asked:** a won proposal still expired. It should never expire, and should become locked.
- **What was still expiring:** the valid-through check already skipped APPROVED (`isProposalExpired`). Three things didn't:
  - **The client's link (`publicTokenExpiresAt`).** It's set to 90 days after sending, then `/p/[token]` showed "This link has expired" and `/sign` redirected.
    - 5 of 12 won proposals were already unreachable: Service95, PMH Social Content, Sheeshyams Project Testing, AMEX - Videographer, Chopstx v2.
  - **"Valid through {date}"** on the public page, sign page, PDF and project page. The date had passed on 11 of the 12 won proposals.
  - **`updateProposalStatus`.** It would move an APPROVED proposal to any status when called without `onlyFrom`.
- **Fix (code only, no data change; the 5 links work again on deploy):**
  - **`isProposalLinkExpired`** (`src/lib/proposal-expiry.ts`) is never true for APPROVED. The public page and sign page use it. To revoke a won proposal's link, regenerate it.
  - **`proposalTermLabel`:** a won proposal shows **Accepted {approvedAt}** in place of Valid Through (manual wins with no date show "Status · Accepted"), on the public page header and footer, the sign page footer, and the PDF meta and footer. The PDF route now passes `status` / `approvedAt`.
  - **Project page:** the Valid through column shows 🔒 **Locked** for won rows.
  - **`updateProposalStatus`** refuses when the stored status is APPROVED ("This proposal is won and locked."). Its un-guarded write is now `updateMany` with `status: { not: 'APPROVED' }`, so an e-signature landing after the page loaded can't be overwritten.
- **Already locked, unchanged:**
  - contract edits (`CONTRACT_LOCKED_ERROR`)
  - content edits (drafts only)
  - reopen (not offered when won)
  - the approve route (only SENT/VIEWED)
  - Revisions still make a new draft. Delete keeps its "marked Won" warning.
- **Verified:**
  - jest (2 new tests, 567 total), tsc, lint
  - next build up to the known Resend error
  - **Dev server:**
    - A won proposal whose link date had passed now renders, with "Accepted" in its header and footer.
    - Its PDF reads "Accepted July 10, 2026".
    - A lapsed VIEWED proposal still shows the expired page.
  - **Throwaway script:** the guarded write refuses to move a won proposal and still moves an open one. The row was deleted.
  - **pitfall-reviewer:**
    - **Fixed:** the project page's status dropdown kept showing a change the server refused (it now rolls back and says why).
    - **Fixed:** the header and footer label didn't flip to "Accepted" right after an inline signature.
- **Follow-ups (pre-existing, found in review):**
  - **"Accepted" date:** it uses the UTC date of `approvedAt` (via `parseLocalDate`), the same as the existing "Signed by … on" line, so a US evening signature reads as the next day. Fixing it needs a workspace timezone.
  - **Won multi-option proposals:** they still open on the original primary option's tab. The option the client chose isn't recorded in `content`.
  - **Won proposals with no `content.budgetSnapshot`** (legacy sends, or a draft marked Won from the dropdown) render the live budget. With links no longer expiring, that view now lasts.

### 2026-11-07 — Deal memos: Duplicate + "Start from" an earlier memo

- **Asked:** duplicate a deal memo, or start a new one from earlier memos, so several people on a similar SOW can be set up quickly.
- **Decision (user):** Duplicate, plus "Start from" any earlier memo on any project. No saved-template table and no schema change.
- **Duplicate:**
  - On every memo row on the board, and as a button on the memo page (pending edits are saved first).
  - It opens Add bid for the same role (titled "Duplicate — {role}") with that memo pre-selected, so you only pick the next person.
  - Off-budget memos stay off budget, with the role name prefilled.
- **Add bid → "Start from"** (it was "Contract template"). The options are grouped:
  - contract templates (as before)
  - memos on this project
  - memos from other projects
  - Each memo shows name — title · project · day rate · section count.
  - To copy someone onto a *different* role, use that role's Add bid and pick the memo there.
- **What a copy carries** (`buildDealMemoCopy`, `src/lib/deal-memo-copy.ts`, jest-tested):
  - the work day and OT/DT terms
  - every fee: rate, unit, quantity, terms and auto-OT
  - every terms section as written, including edited library sections and ad-hoc ones
  - The copy uses the working rows, not the signed snapshot.
- **What a copy doesn't carry:** the person, internal notes, status, vendor link, sent/viewed/signed stamps, crew link. The copy is always a new **BID**.
- **Rules:**
  - The custom vendor title carries over only for the same role. A different role takes its own name.
  - **Same project, same line** (a true duplicate): days, dates and fee → budget-line mappings are kept.
  - **Same project, another line:**
    - dates are kept (same shoot)
    - days come from the new line
    - fees pinned to the source's own line reset to the default mapping, so the new role's actuals don't book there
    - mappings to other lines are kept
  - **Another project:**
    - days come from the new line (or the source's days if there's no line)
    - dates come from the new project's shoot dates
    - fees billed per day whose quantity equalled the memo's days follow the new days
    - mappings are cleared
- **Access:**
  - `createDealMemo({ sourceMemoId })` needs dealMemos EDIT on the target project and dealMemos VIEW on the source's project.
  - `listDealMemoSources` returns this project's memos first, in their own query, then the 100 most recent elsewhere, limited by `projectsWithArea('dealMemos')` (archived projects included). It returns nothing without EDIT on the target.
  - Each copy logs a `dealMemo.duplicated` audit event.
- **Verified:**
  - jest (7 new tests, 565 total) and tsc
  - next build up to the known Resend error
  - a throwaway script on the live DB: it made a signed source memo with notes, an edited section and an ad-hoc section, then confirmed the copy is a clean BID with equal fees and sections, the source is unchanged, and another workspace can't load the source. The rows were deleted.
  - the dev server logs are clean
  - pitfall-reviewer: 3 findings, all fixed:
    - the same-project, different-line days and mapping
    - the template list overriding a memo picked while it loaded
    - the 100-row cap hiding this project's memos

### 2026-11-05 — Proposals: editable "To" in the send window (CC kept)

- **The proposal window** (new, edit draft, revision) now has a **To** field above **CC**.
  - To starts as the client's contact email and can be changed per proposal.
  - It's required for Send, but not for Save draft or Mark as sent.
  - "Additional recipients" is now labelled **CC**, with the same behaviour as before.
- **Invoices needed no change.** Every invoice send already goes through `SendInvoiceModal`, which has an editable To and CC.
- **Storage:** new nullable `Proposal.toEmail` (migration `20261105000001_proposal_to_email`, applied in Neon).
  - `null` means the client's contact email. `storedToEmail` (`src/lib/proposal-recipients.ts`) stores null when the field is blank or equal to that email, so the proposal keeps following the client profile.
  - Existing proposals are unchanged.
- **Every send uses `proposalTo(toEmail, clientEmail)`:** create & send, send draft (including from the success screen), the Reopen dialog's To / CC, and the reopen email.
  - `createProposalRevision` now copies To and CC. It previously dropped CC.
- **E-signature:** the approve route allows the client contact, the To address and the CC list.
- **Access:**
  - Only people with proposals EDIT get the client email pre-filled. A view-only role without Clients access never receives it.
  - `updateDraftProposal` now refuses anything that isn't a DRAFT. It used to be able to rewrite content, To or CC on a sent proposal, which would have widened who may sign.
- **Verified:**
  - jest (new `proposal-recipients` tests).
  - A throwaway script against the dev server: a stranger gets 403; To (any case), CC and the client contact pass the email check.
  - Test row deleted.
  - pitfall-reviewer.
- **Follow-up:** `NewProposalModal` is dead code (never imported), alongside `sendProposal` / `createProposal`.

### 2026-11-05 — Proposals page: Inbox list + Ledger board ("what am I bidding for")

- /proposals was rebuilt from the approved mockup (`docs/mockups/proposals/v4.html`). It uses the same flush Ramp page as Projects:
  - square stat boxes
  - segmented tabs: Open, Follow up, Won, Lost & expired, All
  - a toolbar strip with search and Owner / Client / Status filters
  - a List / Board toggle. List is the default, and Board opens on All.
- **One row per deal:** each non-archived project's representative proposal (the latest non-draft, or the newest draft), plus LEAD projects with no proposal and no sent invoice ("Not started"). Invoiced leads count as booked work, as on Projects.
- **Value:**
  - Won: `approvedTotalCents`.
  - Sent: the total frozen at send (`content.totalCents` → `budgetSnapshot.totalCents`), read with a small `$queryRaw`.
  - Drafts and leads: the live primary-phase gross.
  - Amounts appear only with `dashboardMoney`, the same gate as Projects.
- **Stats** follow the filters but not the tab: Pipeline (open, sent), Drafting (not started and drafts), Won this quarter (± vs last quarter), and Win rate (won ÷ decided).
- **Follow up** uses the same thresholds as Projects' next step: viewed more than 5 days ago, not opened 3+ days after sending, expiring within 2 days, or changes asked for.
- **List:** one table, banded by last activity (7 days, 30 days, not started, older), with Copy link / Draft proposal and a ⋯ menu. The menu has Open project, Open / copy client link, Reopen, Mark won / lost (with a confirm) and Delete draft.
- **Board:** Not started, Sent, Viewed, Won · this quarter, and Lost · expired (last 90 days). Plain cards with Notion-style badges.
  - There is no drag-and-drop. The old kanban's drop into "Sent" marked a proposal sent without sending it.
- **New proposal** lists the leads waiting for one. Picking a lead opens `/projects/{id}?proposal=new`, and the project page opens the create modal.
- **Decision dates:** won and lost dates come from `approvedAt`, else the `proposal.approved` / `proposal.lost` audit events, and never `updatedAt`. Every client-link view bumps `updatedAt`, so old wins would otherwise jump into "Won this quarter".
- **`markProposalWon` / `markProposalLost` are now guarded.** They only apply while the stored status is SENT, VIEWED or CHANGES_NEEDED, using `updateMany` with the status in the `where`. A stale page can't overwrite a client's e-signature. `updateProposalStatus` takes an optional `{ onlyFrom }`.
- **Other changes:**
  - `FilterChip` moved to `src/components/projects/table/FilterChip.tsx` (shared).
  - The Projects page primary-phase query is now scoped through `budget.workspaceId`. Phase isn't auto-scoped, so it was reading every workspace's phases.
  - `ProposalsKanban` and `ProposalsTable` were removed.
- **Live on Nov 5:**
  - Pipeline $88,673 (6 out)
  - Drafting $27,750 (4)
  - Won Q4 $18,377
  - Win rate 10 of 13
- **Follow-ups:**
  - Manually won proposals still show "Signed by  on …" (a blank name) on the client page. This was already there before this change.
  - Bulk actions and saved views.
  - The project page's status dropdown still uses the unguarded `updateProposalStatus`.

### 2026-11-05 — Projects page shows booked work: Booked / Collected / Outstanding / Not invoiced

- /projects now lists only won work. That means projects past Lead, **plus leads that already have a sent invoice**: money is being collected, so it counts as booked. (Today that's Sheeshyams Testing, Salute and Grey Goose Atlanta. Without this, $8.5k of unpaid invoices would drop out of Outstanding.)
- Leads moved to a separate "Leads" tab at the far right of the tab row (`?tab=leads`). Its count turns amber when a lead needs a follow-up, since leads are no longer in Needs attention. A workspace with no booked work opens on Leads.
- **New stats:** Booked, Collected (% of booked), Outstanding (overdue count, or the invoiced-unpaid part), Not invoiced yet, and Shoots next 30 days.
  - They're computed client-side by `summarizeBooked` (`src/lib/projects-table.ts`) over the filtered rows. Filtering by client gives that client's position. The tab doesn't change them, and archived projects are excluded.
  - Per project: outstanding = value − collected, and not invoiced = value − invoiced, both floored at 0. That makes outstanding = invoiced-unpaid + not invoiced.
- A row's value is now `max(expected, invoiced)`, so invoice-first projects with no budget show what they've billed rather than $0.
- Pipeline and Won this quarter were removed from Projects. They belong on the Proposals revamp ("what am I bidding for"); mockups are in `docs/mockups/proposals/`.
- Live on Nov 5: Booked $182,387 · Collected $113,588 · Outstanding $68,799 ($49,629 invoiced + $19,170 not invoiced yet).
- Follow-up: the 3 invoiced leads should probably move to an active phase (data change, ask first).

### 2026-11-04 — Projects page → table, with Phase and a calculated Status
- **Asked:** a table instead of cards on /projects (logo, project, client,
  status, phase, budget), in the shot list's Ramp style. Mockup approved
  (`docs/mockups/projects-table/`).
- **Decisions (user):**
  - Phase (Lead → Pre-prod → Production → Post → Invoicing → Offboarding)
    replaces Lead / Active / Wrapped in the UI. Winning a proposal moves
    Lead → Pre-prod. Later phases are only suggested ("Move to Post?"),
    never moved automatically.
  - Status is calculated (the next step), not set by hand.
  - Clients without a logo get a monogram; no logo fetching.
- **Model:** `Project.status` is kept as the coarse bucket everything else
  reads (dashboard, clients, proposals, archive permission). New
  `Project.phase` + `phaseChangedAt`; `src/lib/project-phase.ts` keeps them
  in step on every write:
  - LEAD = phase LEAD; ACTIVE = phases 2–6; WRAPPED / ARCHIVED keep their
    last phase.
  - `effectivePhase` reads an ACTIVE project still at LEAD as Pre-prod, so
    old status-only writes can't make the Edit modal demote a won project.
  - Write paths: create (Lead), invoice-first (Invoicing), proposal won
    (Pre-prod), proposal lost (back to Lead **only** from Lead / Pre-prod,
    with an AuditEvent), Edit modal "Stage", archive / restore (restore
    goes to Lead or Active by phase), legacy `updateProjectStatus`.
  - New actions `setProjectPhase` (guarded `updateMany`, AuditEvent
    `project.phaseChanged`) and `wrapProject`.
- **Status (`src/lib/project-next-step.ts`):** first match wins:
  1. invoice overdue
  2. call sheet not sent (shoot within 4 days)
  3. proposal expiring (within 2 days)
  4. no reply in 5+ days
  5. awaiting deposit
  6. proposal sent / viewed
  7. draft the proposal
  8. paid in full
  9. on track

  Red / amber is the **Needs attention** tab, replacing the attention
  sidebar. Amounts appear in the detail only with money access.
- **UI (`src/components/projects/table/`):**
  - Tabs: In progress / Leads / Needs attention / Wrapped / Archived / All.
  - Stats, search, filters (Phase / Client / Type / Team) and sortable
    columns. Group by phase and the column picker (localStorage).
  - Export CSV, in-place phase menu, row menu (edit team, wrap,
    archive / restore) and a phone list.
  - Table state lives in the URL via `history.replaceState`, so there's no
    server round trip.
  - Removed: ProjectsPageClient, ProjectCard, ProjectStatusPills,
    ProjectsAttentionSidebar, ProjectMetricsStrip, projects-types.
  - The phase label also shows on the project header, dashboard recent
    projects, client cards and the rolodex.
- **Data:** migration `20261104000002_project_phase` (additive; run by the
  user). Backfill approved by the user: 10 non-Lead projects set from
  dates and payments, each with AuditEvent `project.phaseBackfilled`. The 7
  archived projects that never won stay Lead.
- **Metrics:** Outstanding no longer counts payments on VOID invoices as
  collected. Pipeline is unchanged (workspace-wide, budget totals).
- **Verified:**
  - tsc, jest (533; new `project-phase.test.ts`), lint, build up to the
    known Resend step.
  - A throwaway DB script: won / lost / set phase / wrap / guarded writes /
    other workspace / 0 other rows changed.
  - A throwaway page with real data at desktop and 375px, with and without
    money (no amounts in the payload).
- **Review (pitfall-reviewer), all fixed:**
  - Pre-deploy ACTIVE+LEAD rows could be demoted by the Edit modal.
  - Margin-blind roles saw "Paid in full" on half-paid projects.
  - Losing a proposal wiped a manually set phase.
  - `wrapProject` audited no-op writes.
  - The pipeline scope had changed.
- **Follow-ups:**
  - Sheeshyams Project Testing is status LEAD with a won, paid proposal.
    This drift predates the change; ask before fixing.
  - Fetch client logos from their websites.
  - Bulk phase change.
  - Phase history on the project page.

### 2026-11-04 — Shot list
- **Asked:** a shot list per project, StudioBinder-style, with references
  (upload, paste or link) and on-set tracking. Mockup approved at v3
  (`docs/mockups/shot-list/` — Ramp-like, 4px corners).
- **Decisions (user):**
  - Shots link optionally to a Schedule scene; free sections cover B-roll
    and product shots.
  - Links get a saved preview copy.
  - Statuses To shoot / Done / Skipped (no priority flag).
  - First ship: storyboard view, PDF, view-only share link.
- **Data:** migration `20261104000001_shot_list`.
  - `ShotList` (one per project, created on first edit; share token).
  - `ShotSection` (`sceneId` SET NULL on scene delete; the title is a
    copy, so the section survives).
  - `Shot`, and `ShotReference` (lowest `orderIndex` = ★ thumbnail).
  - All four are in `SCOPED_MODELS`.
- **Permissions:** new project area `shotList`. The migration backfilled
  every role's JSON from its Schedule level, so Producers keep access. The
  Collaborator preset is VIEW; ticking shots needs Edit.
- **References:**
  - Uploads are downsized in the browser to a JPEG (≤2000px; react-pdf
    can't read WebP) and go through the `shot-references` R2 folder.
    `addUploadedReference` only accepts that workspace's own R2 keys.
  - Links: `src/lib/link-preview(-fetch).ts`, SSRF-guarded:
    - every DNS answer is checked at connect time (custom `lookup`)
    - redirects are followed by hand, each hop re-checked
    - byte caps and timeouts
    - `linkPreview` rate limit
  - Link images: YouTube thumbnail, Vimeo oEmbed, or the page's og:image,
    turned into a JPEG with `sharp` (now a direct dependency) and stored
    in R2.
  - Instagram, Pinterest and IMDb block bots → link card.
- **Share:** `/sl/[token]` and `/api/pdf/shot-list-share/[token]` work only
  while sharing is on. They expire 14 days after the last shoot day (else
  30 days after enabling). Crew notes are stripped.
  - Turning sharing off revokes the link: turning it back on issues a new
    token.
  - The signed-in PDF (`/api/pdf/shot-list/[projectId]`) includes notes.
- **Also:** `getPresignedUploadUrl` now checks the folder at runtime.
  'use server' args are unchecked, so before this any folder string was
  accepted.
- **Verified:**
  - tsc, jest (518: shot codes, expiry, day map, URL/IP guard,
    redirect-to-private, slow-drip timeout), lint, build.
  - A throwaway DB script: codes, day labels, cross-section move, duplicate
    scene link refused, scene delete keeps the section, access targets
    resolve and are refused from another workspace; row counts unchanged.
  - Live link previews:
    - YouTube, Vimeo, FilmGrab, Wikipedia and a direct image → frames
    - `169.254.169.254` and a public name resolving to 127.0.0.1 → refused
  - Share page and PDF: 404 when off, expired page / 410, notes absent.
  - The editor, the storyboard and the phone list on a throwaway page.
  - PDF rendered with embedded frames.
  - R2 isn't configured locally, so real uploads still need a pass on
    Railway.
  - pitfall-reviewer — all fixed:
    - link fetches had no wall-clock limit (a slow drip held the action
      open) → hard timeout, plus DNS via c-ares so slow DNS can't stall the
      thread pool
    - direct image links over 1 MB got no preview → separate page / image
      caps
    - PDF frames over 2 MB were dropped → a 4.5 MB cap for frames
    - the share popover showed no expiry until refresh
    - undo restored a whole snapshot → each undo reverses only its own
      change
    - re-enabling kept the old token; expired links leaked the project
      name in the tab title
    - the 20-reference cap was checked after storing in R2
  - Also found in the browser: the Delete shot confirm opened behind the
    modal panel and couldn't be clicked → the panel closes first and
    reopens on Cancel.
  - Old prod code drops unknown role keys on save, so the backfill can be
    undone between the migration and the deploy → re-checked after deploy.
- **Follow-ups:**
  - shots on call sheets
  - a must-have flag
  - deleting R2 objects when a reference is removed (thumbnails don't
    either)
  - an app-wide Ramp restyle

### 2026-11-04 — Deal memos: custom work day
- **Asked:** a work day other than 10 or 12 hours (e.g. a 4- or 6-hour shoot),
  kept clean and minimal.
- **UI:** `WorkDayPicker` (`src/components/deal-memos/WorkDayPicker.tsx`)
  shows 10-hour / 12-hour / Custom. Custom becomes a small inline "6-hour"
  input in the same pill.
  - Whole hours, 1–24.
  - Saved on Enter or blur, not per keystroke, so typing "14" never saves a
    1-hour day.
  - Empty or out of range snaps back to the saved value. Typing 10 or 12
    lights that button.
- **Server:** `updateDealMemo` zod accepts any int 1–24 (was `10 | 12`). The
  column was already `Int`. No migration.
- **Unchanged:** auto overtime (day rate ÷ hours × OT) and the
  `{{dealMemo.workDayHours}}` terms already handle any number.
- **Warning:** an amber note shows when the work day reaches the "Double time
  after" hours. Otherwise a 16-hour day with default terms would read "1.5x
  after 16 hours; 2x after 14 hours".
- **Not changed:** the workspace default in Settings still offers 10 or 12
  only. Ask if Custom is wanted there.
- **Verified:**
  - Picker on a throwaway page: presets, custom, Enter/blur, out-of-range
    snap-back, clearing, typing a preset value, an outside value change.
  - Jest (439) with a short-day overtime test.
  - tsc, lint, build.
  - pitfall-reviewer: its 3 findings (clear left a ghost placeholder, no
    double-time guard, preset typed into Custom stayed custom) are fixed.

### 2026-10-20 — Proposal Overview preview missing the agency fee
- **Bug:** the Preview button on Proposal Overview (before any proposal
  exists) showed no Agency Fee row and no production subtotal.
- **Cause:** `buildPreviewProposal` built content without `budgetSnapshot`.
  `ProposalPublicView` reads the markup and tax from there and fell back to
  0%.
- **Fix:** pass the phase's `captureSinglePhaseSnapshot` (`phase.preview`, the
  same shape a send freezes) as `content.budgetSnapshot`. No server or data
  change.
- **Verified:** a server-side render with Modern Mangal's real budget (20%
  fee).
  - Before: no fee row.
  - After: the fee row and the $18,125 production subtotal, with a $21,750
    total.

### 2026-10-20 — Proposal deliverables show quantity and type
- **Asked:** the type (Deliverable / Service / Raw Footage / Other) and
  quantity set in Proposal Overview never reached the client page or the PDF.
  - The user approved mockup Option A (`docs/mockups/proposal-deliverables/`,
    not committed).
  - Decision: leave already-sent proposals as sent.
- **Root cause:** `buildProposalContent` and the draft live patch on
  `/p/[token]` built scope items from title, description and sectionIds
  only. The views only rendered those fields.
- **Change:** `src/lib/deliverable-display.ts`.
  - `toScopeItems()` is now the one builder. It's used by the frozen content,
    the draft live patch, option tabs (snapshot + live draft) and the overview
    preview.
  - `deliverableBadges()` drives the card on the client page and the PDF:
    - a "× N" pill opposite the number, only when the quantity is above 1
    - a small type label above the title, only when the type isn't
      "Deliverable"
- **Frozen content:** option tabs sent before this froze the raw
  `Phase.deliverables`, which has type and quantity but no `number`.
  `deliverableBadges` only badges items that have a `number`, so those keep
  looking as sent. Checked: 42 sent proposals (3 with option tabs), 0
  newly show badges.
- **No migration.**
- **Verified:**
  - jest (438)
  - the Modern Mangal draft in dev
  - a PDF render
  - a read-only check of the sent proposals
  - pitfall-reviewer (its frozen-options finding is fixed)
- **Follow-ups:**
  - A revision copied from a proposal sent before this shows no badges until
    it's saved once through the modal. `createProposalRevision` copies the
    frozen content, and `updateDraftProposal` rebuilds it.
  - Side effect: the deliverables merge tag in contract text now reads
    "× N" on new proposals. Signed contracts use `contractSnapshot` and
    don't change.

### 2026-10-19 — Reopen an expired proposal
- **Asked:** expired proposals were a dead end. Plan approved first:
  - both paths
  - an email checkbox, ticked by default
  - expired only, not lost or declined
- **What expired means:** derived as `expiresAt < now` on SENT, VIEWED or
  CHANGES_NEEDED, or a literal EXPIRED status. Defined in
  `src/lib/proposal-expiry.ts`, which also has `canReopenProposal`,
  `reopenedStatus`, `earliestReopenDate`, `reopenedLinkExpiry` and the
  `ProposalReopenInfo` type.
- **Where:** an amber Reopen action on expired proposals in:
  - the project's Proposals list
  - the /proposals table
  - Kanban cards (in the footer, not inside the card link)
- **`ReopenProposalDialog`:**
  - Header: expired date and last viewed.
  - New valid-through date: defaults to today + `proposalExpiryDays`.
  - **Same proposal, new date:** `reopenProposal`. Same link, same frozen
    content. It optionally re-emails the client with the same To and cc as
    a send. The reopen stands if the email fails, and the dialog says so.
  - **Make changes first:** in the project, this opens the existing revision
    modal with the new date. On the /proposals page it goes to the project.
- **`reopenProposal`:**
  - Gate: proposals EDIT.
  - Guarded on exactly the status and `expiresAt` it read, so a decision or a
    second reopen made in between wins and a double-click can't send two
    emails.
  - Extends `publicTokenExpiresAt` past the new date.
  - EXPIRED and CHANGES_NEEDED go back to VIEWED, or SENT if never opened.
    The approve route only accepts SENT or VIEWED, and the review caught
    that an expired CHANGES_NEEDED proposal would otherwise be emailed but
    unsignable.
  - Audit `proposal.reopened`, recording from/to date and status.
- **Dates:** stored as UTC midnight like sends, so the earliest pick is
  tomorrow in UTC. Late in a US day that means the day after tomorrow.
- **Client page:** `/p/[token]` and `/p/[token]/sign` show
  `ExpiredProposalNotice` ("has expired — contact {studio}") instead of a
  sign form that 410s.
- **No migration.**
- **Verified:**
  - Throwaway proposals: reopen writes, guards, statuses; won, lost,
    declined and drafts refused; 0 real rows changed.
  - Public pages in dev: the notice shows on inline sign-off, the contract
    CTA and /sign, and signing returns after a reopen.
  - tsc, jest (434), lint, build.
  - pitfall-reviewer.
- **Follow-up:**
  - Valid-through is midnight UTC, so a proposal "valid through Oct 20"
    stops being signable at about 5pm PT on Oct 19. This is a pre-existing
    send behaviour; consider end-of-day in the studio's timezone.
  - Of the 23 already-expired proposals, 18 also have dead links. Reopen
    revives them.

### 2026-10-13 — Call sheet PDF (traditional layout, "Option A · SlateSuite Classic")
- **Asked:** "Download PDF" opened the web page and called print, which
  wasn't a real call sheet. Three mockups were made (`docs/mockups/
  call-sheet-pdf/`, not committed); the user picked A.
  - Also: include the client's contacts, and don't indent concurrent
    items.
- **Layout** (`src/components/call-sheets/CallSheetPDF.tsx`, react-pdf,
  US Letter):
  - **Top row:** logo / wordmark, project, client and key contacts on the
    left; a boxed "DAY N OF M" with a big general call, the date, crew
    call and shooting call in the middle; weather and the nearest hospital
    on the right.
  - **Strip:** location | parking / notes | point of contact.
  - **Schedule** table: time, description and notes, where, who. A long
    who-list shows "+N more".
  - **Then** talent, contacts (client contact first), crew by department
    two to a row, and notes.
  - **Footer** with the page numbers. A DRAFT mark on drafts.
- **Data** (`src/lib/call-sheet-pdf.ts`, pure `buildCallSheetPdfData`,
  tested):
  - Key contacts are the first Producer / Director / 1st AD in crew, plus
    the client contact.
  - Crew call is the earliest crew call; shooting call is the first "Sc"
    block.
  - US phones are shown as 516-508-6411.
  - The client appears only with their contact details, like `/cs`.
- **Route:** `GET /api/pdf/call-sheet/[token]`.
  - Public, keyed by the share-link token; expired links get 410.
  - Its own rate limit (`callSheetPdf`, 60/min: a crew on one Wi-Fi).
  - The editor's "Download PDF" saves unsaved edits first, then opens it.
    The crew page `/cs` gets a "Download PDF" link too.
- **Shared:** `src/lib/pdf-logo.ts` loads the logo (https, png/jpeg, no
  redirects, a 2 MB cap checked up front). It's used by the deal memo PDF
  too.
- **react-pdf lessons (4.5.1):**
  - Side-by-side columns don't split across pages cleanly, and
    `wrap={false}` blocks in them get squashed. So below the schedule it's
    one flowing column, with two-person rows.
  - A `render`-prop Text (page numbers) disappears under any inherited
    `lineHeight`, and an inherited unitless lineHeight spaces small text
    far too wide. So there is no page or body lineHeight.
  - A heading grouped (`wrap={false}`) with its first row is how to stop
    orphaned headings; `minPresenceAhead` alone didn't.
- **Verified:**
  - tsc, jest (429, including the PDF data tests), lint, and build up to
    the known Resend step.
  - Rendered the real Daadi call sheet (2 pages: 18-block schedule, 18
    crew, client contacts) and a bare draft, and checked each page as an
    image.
  - Through the dev server: the route returns a 200 PDF without a session;
    an unknown token gets 404.
  - pitfall-reviewer: 3 low findings (client name shown without contacts,
    logo fetch following redirects, the shared 10/min PDF limit). All
    fixed.
- **Checked:** the deal memo PDF's page numbers aren't affected. Its
  lineHeight is only on body text, never on the page.

### 2026-10-13 — Crew roles follow the deal memo's role
- **Asked:** a deal memo's "Role (shown to the vendor)" should be the
  person's role on the crew and call sheets, not the budget line's. E.g. a
  "Lighting Asst" line re-allocated to a Key Grip.
- **Before:** awarding used `roleLabel` (the budget line) for the
  `ProjectMember`, so the crew page and new call sheets showed the budget
  role.
- **Now:**
  - `applyDealMemoAwardEffects` writes `position` (falling back to
    `roleLabel`) as the crew role. Slot finding: the row the memo already
    links to, then this contact in the budget role, then the "Unassigned"
    placeholder for the budget role, then a new row.
  - Editing the memo's role on an awarded memo updates the linked crew row,
    but only while that row is still the same contact.
- **Kept consistent:** code that matches crew to budget lines counts a
  memo-renamed member as their budget line, via `budgetRoleFor`
  (`src/lib/deal-memo-roles.ts`, awarded memos only, while their role is
  still the memo's).
  - Proposal re-win reconciliation, now split into a pure, tested
    `planTeamReconcile` in `proposal-won.ts`.
  - Call sheet "Import from budget".
  - Without this, a re-win would flag the person and add a duplicate
    placeholder (the dry run on Daadi showed +2 mismatches and +2
    placeholders before the fix, 0 after).
- **Verified:**
  - tsc, jest (425, including the reconcile and memo-role tests), lint,
    and build up to the known Resend step.
  - Real DB with throwaway rows on Daadi: the award fills the "Lighting
    Asst" placeholder as "Key Grip"; a re-award reuses the row; 0 real crew
    rows changed.
  - A read-only re-win dry run on Daadi gives the same result before and
    after renaming.
  - pitfall-reviewer: 4 findings (non-awarded or reassigned memo renaming a
    crew row, budget import duplicating the slot, cancelled memos in the
    re-win map, one contact's two roles collapsing). All fixed.
- **Data (user approved, 2026-10-13):** 4 Daadi crew rows were moved to
  their deal memo roles: Dot Perryman → Key Grip, Lawrence Cortes →
  Driving Production Assistant, Priya Karki → Talent ("Rani"), Sunita S.
  Mukhi → Lead Talent "Daadi".
  - On the sent Daadi call sheet, Dot's and Lawrence's rows were updated
    too.
  - One guarded transaction (the old role and same person re-checked) with
    6 `AuditEvent`s.

### 2026-10-13 — Call sheets email the crew (personal emails + Sent / Opened / Confirmed)
- **Asked:** "Send to crew" emailed nobody. It only set SENT and turned on
  the share link.
- **Decisions (user):** the full first ship: review before sending, one
  personal email each, confirmations, update emails. Email only; SMS,
  calendar invite and scheduled send later.
- **Model:** `CallSheetRecipient` (migration
  `20261013000001_call_sheet_recipients`, in `SCOPED_MODELS`). One row per
  person per sheet, with:
  - their own `token`
  - `personKey`: `contact:<id>`, else `email:<lc>|<lc name>`, so people
    sharing an agent's address stay separate
  - `lastSent`: what their last email said
  - send count and last error
  - first/last viewed, confirmed
- **Sending:**
  - The logic lives in `src/lib/call-sheet-send.ts`
    (`buildSendList` / `runCallSheetSend`). It takes a scoped db and the
    sender, so it's testable. The actions in `call-sheets.ts` check access
    via `getOwnedSheet` and pass Resend's batch sender
    (`sendCallSheetBatch`, 100 per request).
  - Typed-in emails are saved to the sheet JSON, and to a linked contact
    that has none. The updated lists go back to the editor so its next Save
    doesn't undo them.
  - Rows are matched by key, then contact, email, then unique name
    (`matchRecipients`). Being linked to the Rolodex, or fixing an email,
    keeps a person's link, history and confirmation.
  - On success: record `lastSent` and increment the count. A change to
    their call, the date or the place resets their confirmation. A failure
    records only `lastError`.
  - `markCallSheetSent` (status, expiry, weather) runs on every send, as
    Resend did. FINAL sheets are refused.
- **Email** (`src/lib/call-sheet-email.ts`, pure):
  - "Your call" (or the general call), date and day, location with a map
    link, parking, weather, hospital, the first 6 schedule blocks, and an
    optional note.
  - Updates get a "What changed" box.
  - Buttons: Confirm (opens the page, never confirms by GET, since email
    scanners follow links) and View.
  - From "Name via Workspace", reply-to the sender. Plain-text version too.
  - No dietary info or other people's contact details.
- **Public `/cs/[token]?r=`:**
  - The recipient is looked up by token and sheet; views are recorded.
  - A banner shows their call and the Confirm button
    (`confirmCallSheetAttendance` in `call-sheet-public.ts`: rate limit
    `confirm`, no DRAFT, expiry checked, set once).
- **Editor:**
  - "Send to crew" / "Send update" saves, then opens
    `SendCallSheetDialog`.
    - People grouped Crew / Talent / Other, with status pills and inline
      emails for anyone missing one.
    - Filters: Everyone / Unconfirmed / Details changed.
    - Default ticks: everyone on the first send; new or changed people on a
      re-send.
    - A note field; per-person results; failed people stay ticked.
    - "Just get the share link" keeps the old behaviour.
  - The header shows "Sent to N · opened · confirmed".
- **Verified:**
  - tsc, jest (418, including 10 recipient tests), lint, `audit:scoping`,
    and build up to the known Resend step.
  - Real DB on throwaway sheets with a stubbed sender:
    - the first send and typed emails
    - a call-time change → "Your call: 6:30 AM → 6:00 AM" and only that
      confirmation reset
    - a failed email doesn't count
    - FINAL refused
    - agent-shared email kept apart
    - linking to the Rolodex keeps Confirmed on one row
    - 0 real rows changed
  - Browser:
    - the email at desktop and phone width
    - a real `/cs/…?r=…&confirm=1` page: banner → Confirm → "Confirmed",
      and the DB has opened + confirmed
  - pitfall-reviewer: 3 findings plus 2 low (stale editor lists wiping
    typed emails, unstable `personKey`, shared-email merge, typed duplicate,
    concurrent create). All fixed.
- **Needs:** `RESEND_FROM_EMAIL` on Railway, on a verified Resend domain.
- **Next:** add-to-calendar (.ics), scheduled send, SMS (Twilio).

### 2026-10-12 — Call sheets: schedule imports by date + "Import from stripboard"
- **Reported:** "the schedule isn't importing when I created a call sheet".
- **Root cause:**
  - The sheet ("TTS - Diwali Proposal - Daadi — Call Sheet", 13 Oct) was
    made from the Call Sheets page. NewCallSheetModal sends only title, date
    and call time.
  - `createCallSheet` imported only when given an explicit `shootDayId`, so
    13 Oct's 17 stripboard items were never linked.
  - Only the stripboard's own "Create Call Sheet" passed the day.
- **Fix:**
  - `createCallSheet` links the project's shoot day whose date matches,
    when no day is given, and imports it the same way.
  - The call sheet editor gets "Import from stripboard" (unlinked sheets)
    and "Change day…" (linked sheets, next to Sync).
    - One day: confirm the replace, then import.
    - Several days: `ImportScheduleDialog` lists each day with its item
      count, defaulting to the linked day, then the date match, then the
      first day with items.
  - `importScheduleIntoCallSheet` links the day, replaces the schedule,
    snapshot and syncedAt, and moves the sheet's date to the day's.
    - Refused on FINAL sheets.
    - Uses the primary schedule only, like Sync and the change check.
  - The day's call time and location are filled in the editor only where
    its fields are empty on screen, then saved with Save, so unsaved edits
    are never overwritten.
- **Existing sheet:** the Daadi call sheet is still unlinked; open it and
  click "Import from stripboard" (2 days, so it asks).
- **Verified:**
  - tsc, jest (408) and lint; build up to the known Resend step.
  - Read-only DB: the 13 Oct date matches the shoot day (20 Oct doesn't),
    and the import would bring 17 blocks.
  - Browser: the day picker.
  - pitfall-reviewer: 3 findings, all fixed (unsaved call time / location
    overwritten; errors hidden behind the dialog; non-primary fallback out
    of step with Sync).

### 2026-10-12 — Setup/Wrap banners, change item type, phone on new bids, "No restrictions"
- **Setup / Wrap banners:**
  - New `BannerType` values SETUP (teal, 60m preset) and WRAP (amber, 30m)
    (migration `20261012000004_banner_setup_wrap`).
  - Presets in Add Banner; colours in `BANNER_COLORS`; the zod enum in
    `schedule-apply`.
- **Change type** (stripboard ⋯ menu, op `changeEntryType`):
  - **Scene → banner:** keeps "Sc N — setting" and the length. The scene
    itself stays in the project.
  - **Banner → scene:** makes a scene from the label, length and note
    (client-made id).
  - **Banner → banner:** recolours only.
  - The batch diff now writes `kind`, `sceneId`, `bannerType` and
    `bannerNote`. The new scene id is checked as taken and loaded, so a
    replay doesn't create it twice.
- **Add a bid:** "Phone (optional)" next to Email, in both new-person forms.
  It's saved on the Rolodex contact.
- **Dietary "No restrictions":**
  - Tag `NONE` in `Contact.dietaryTags`, so no migration. It's kept alone,
    and dropped when a real restriction is added (merges included).
  - Never counts as a need (`hasDietary`); `hasNoRestrictions` checks it.
  - Picker button (clears the chips; a chip clears it) on the Rolodex form
    and the Crew card.
  - "No restrictions ✓" badge. Summaries add "N no restrictions".
  - The call sheet Dietary panel shows confirmed-none and "N haven't been
    checked yet".
- **Verified:**
  - tsc, jest (408) and lint; build up to the known Resend step.
  - Real DB on throwaway rows:
    - Setup 08:00–09:00, Lunch scene → Meal Break 09:00–09:45, Wrap →
      scene 09:45–10:15; the original scene kept.
    - Contact saved with phone and `["NONE"]`.
    - Replay of banner → scene → banner is clean.
    - 0 real rows changed.
  - Browser: colours, the Change type submenu (instant convert and
    re-time), the picker toggling, the badge and the summary.
  - pitfall-reviewer: 1 medium finding (replay re-creating a converted
    scene). Fixed.

### 2026-10-12 — Schedule: free-text location on scenes
- **Asked:** a scene's location should allow open text, so it can be a saved
  address or something like a room in a house.
- **Model:** `Scene.locationDetail` (nullable text; migration
  `20261012000003_scene_location_detail`).
- **Scene pop-up:** a "Room / area" field under the Location picker. Use
  either or both: Smith House + "Master bedroom", or just "Garage". Typed
  text is not added to Locations. Emptying it clears it.
- **Display:** `sceneLocationLabel` gives "Smith House · Master bedroom" or
  either part alone.
  - Used by the stripboard Location column (wider, full text on hover), sort
    by location, and the call sheet snapshot's `locationName`.
  - Scenes without free text give the identical snapshot, so there's no
    false "stripboard changed".
- **Call sheets:** synced scene blocks carry `location` and show "Where: …"
  in the editor, the read-only view and the public `/cs` page. Before, a
  scene's location never reached the call sheet at all.
- **Saving:** goes through the batched ops (`schedule-ops`/`schedule-apply`:
  the zod field and `SCENE_FIELDS`), plus the legacy `SceneInput`.
- **Verified:**
  - tsc, jest (406) and lint; build up to the known Resend step.
  - Real DB on a throwaway schedule: labels "Punjab Meet House · Master
    bedroom" and "Garage"; clearing works; 0 real scenes changed.
  - Call sheet drift unchanged on all 4 synced sheets.
  - Browser: the field, the placeholder switching with the picker, an
    instant save, and the column label.
  - pitfall-reviewer: 1 low finding (the label didn't reach call sheet
    blocks). Fixed.

### 2026-10-12 — Schedule drag: steadier, lands where it shows
- **Asked:** rearranging on the stripboard was touch-and-go about where an
  item lands. Make it slower.
- **Causes:**
  - The live preview reordered rows on every half-row crossing, so rows
    shifted under the pointer and changed the target again.
  - Hovering over the dragged row (already in its preview spot) counted as
    "insert at the top".
  - The drop recalculated the spot from the pointer and the original order,
    so it could land somewhere other than the preview showed.
  - The dead zone was narrow (40–60%).
- **Now** (`ScheduleEditorClient.tsx`):
  - Rows make room only after the pointer rests on a new spot for 180ms
    (`DRAG_SETTLE_MS`).
  - The dead zone is 25–75%, and hovering over the dragged row does nothing.
  - The drop commits the previewed order (`previewTarget`), and drops in
    the gaps between rows land there too.
  - The dragged row is outlined in purple where it will land, instead of a
    border on its neighbour.
- **Verified:**
  - tsc, jest and lint; build up to the known Resend step.
  - Browser with simulated drags: quick passes over rows don't move them;
    resting moves; hovering over the dragged row and a 35% wobble don't
    jump; the drop matches the preview; one batched save goes out.

### 2026-10-12 — Schedule: changes are instant, saved together after 2.5s
- **Asked:** like deal memos and budget lines, the Schedule should wait about
  2.5s of quiet before saving. Adding or removing something was slow to show.
- **Before:**
  - These awaited a server action, then `router.refresh()` of the whole
    page, before the screen changed:
    - remove, add banner, edit banner
    - move to day / Boneyard
    - archive or restore a scene
    - the scene pop-up
  - Drag, sort, alongside and start times were optimistic, but each made its
    own save and refresh.
- **Now:**
  - **Op log (`src/lib/schedule-ops.ts`):** every change is an op. The
    screen shows server copy + pending ops, through a pure reducer that
    re-times only the touched days.
    - New rows get browser-made cuid-shaped ids, so they can be dragged or
      edited before saving.
    - Ops are idempotent: a move carries the day's full resulting order, adds
      skip existing ids. Re-applying over any refresh, or retrying a batch
      that already landed, is harmless.
  - **Saving:** one `SaveQueue` sends everything ~2.5s after the last change,
    per schedule, in chunks of 250, to `applyScheduleChanges`.
    - **On the server (`src/lib/schedule-apply.ts`)**, inside one
      transaction:
      - zod-validate the ops
      - load the schedule's state, scoped by workspace and schedule/project
      - replay the same reducer and write only the difference
      - re-time the scene's days in other schedules when its length changed
    - **Ops pointing at things that are gone don't fail the batch:** a row
      for a deleted day goes to the Boneyard, a move there is dropped, and a
      deleted location becomes "no location".
  - **Status line** in the toolbar, with Retry/Discard. Discard clears the
    log (new `useSaveGeneration`).
  - **Saved first:** create call sheet, switch / delete schedule and set
    primary. Leaving the page also flushes, with a warning while unsaved.
  - **Scene pop-up** closes instantly. If its batch fails, it reopens on
    that scene with the typed values and the error: once, and not over an
    open pop-up.
- **Fixed along the way:** `recomputeShootDayEntries` mixed every schedule's
  entries on a shoot day into one timeline. An alternate schedule pushed the
  primary's times (seen on Sheeshyams Project Testing, 30 Jun). Each
  schedule is now timed separately.
- **Data note:**
  - The first verify script ran a batch on that test project's real primary
    schedule. That re-timed its 30 Jun day, rewriting 4 stored times to the
    correct per-schedule values (Lunch 09:20→08:30, Coffee 09:50→09:00,
    INT. SHEESH OFFICE 10:30→09:40, Company Move 11:30→10:40), without an
    OK first.
  - Saves now only re-time days the ops touch. Verify scripts use a
    throwaway schedule and assert 0 real rows changed.
- **Verified:**
  - tsc, jest (403, including 12 schedule-ops tests: batches, idempotent
    replay, flag rules, untouched days), lint and build.
  - Real-DB script on a throwaway schedule:
    - a mixed batch, then a replay with no changes
    - a vanished day is lenient; a taken id is refused
    - 0 real rows changed
  - Browser, with saves forced to fail:
    - add, remove and a new scene show instantly
    - one request carries all three ops
    - "Couldn't save · Retry · Discard" appears, and Discard restores
    - the pop-up closes instantly and reopens with the error
  - pitfall-reviewer, two rounds:
    - Round 1, 5 findings:
      - ops sent to the wrong schedule after Back/Forward
      - a rejected op blocking all saves
      - the pop-up reopening over one in use
      - moves not idempotent
      - StrictMode mount flag
    - Round 2, 3 more:
      - out-of-range numbers are now clamped, not rejected
      - ops are sent strictly in the order made across schedules
      - move dedupe made O(n) and the caps lowered
    - All fixed.

### 2026-10-12 — Exact start times on the Schedule (items during other items)
- **Asked:** "alongside" could only start an item at the *same* time as the
  one above. The user needs an item part-way through another (Setup 8–10,
  Talent call 9:00–9:30), with exact times editable while still
  defaulting to after the block above.
- **Model:** `ScheduleEntry.fixedStartTime` ("HH:mm", null = automatic;
  migration `20261012000002_schedule_entry_fixed_start`).
- **Math (`computeEntryTimes`):** each entry starts at its set time, else
  with the entry directly above if "alongside", else when everything above
  has ended.
  - A set time inside earlier items runs during them.
  - One that ends later pushes the next item.
  - One after everything above leaves a gap.
  - A time 12h or more before the call is after midnight; anything closer
    is pre-call that day.
- **Overlap markers:** `overlapRule` is shared by the stripboard ↳ rows,
  the snapshot's `concurrent`, and call sheet sub-rows. A row counts as
  "during" when it starts inside the current group (at or after the group's
  first start, before everything above has ended), or starts with the row
  above when flagged.
- **Stripboard:**
  - Click a Start time to type an exact time (shown with 📌).
  - Kebab: "Set start time…" (can pin the current time) and "Back to
    automatic time".
  - Setting a time clears "alongside" (the server does too); the toggle is
    hidden while a time is set.
  - Footer total runs from the earliest start; the count is "N
    overlapping".
- **Call sheets:**
  - The manual "Same time as above" toggle shipped in ea4c528 is removed.
    Sub-rows are worked out from the typed times (`blockOverlapFlags`,
    overnight-aware). A synced `concurrent` flag still counts when the block
    starts with the one above (a 0-minute banner).
- **Verified:**
  - tsc, jest (391), lint and build.
  - Real-DB script: Setup 08:00–10:00, Talent call 📌 09:00–09:30
    (during), Scene 10:00–11:00. Back to automatic gives the sequence again.
  - Recomputing every existing day changes 0 stored times; synced-sheet
    drift is unchanged.
  - Browser preview of the stripboard inline edit (12:00 pin → gap, wrap
    1:00 PM) and of call sheet sub-rows.
  - pitfall-reviewer: 5 findings, all fixed (stale alongside flag on pinned
    rows; 0-length rows above; pre-call pins shown as "during"; the
    next-day threshold moved from 6h to 12h; pinning the current time).
- **Note:** a set time is a fixed clock time. It doesn't move when the
  day's call time changes, and it stays when the item moves to another day.

### 2026-10-12 — Concurrent items on the Schedule (and call sheets)
- **Asked:** the stripboard couldn't run two things at once (Load In at the
  same time as Talent Call). Review the scheduling logic, support
  concurrency, and make it work with call sheets.
- **Before:** `computeEntryTimes` chained every entry end to end from the
  day's call time, so an overlap was impossible. Call sheet blocks already
  took free times, but syncing from the stripboard copied the chained times.
- **Decision (user):** a per-item toggle, "Run alongside the item above".
  Times stay automatic; there are no pinned start times.
- **Model:** `ScheduleEntry.concurrentWithPrevious` (bool, default false;
  migration `20261012000001_schedule_entry_concurrent`). Existing
  schedules are unchanged.
- **Time math (`schedule-compute.ts`):**
  - A flagged entry starts with the group above it, and the next normal
    entry starts when the longest entry in that group ends.
  - The first entry ignores the flag.
  - `dayWrapTime` gives the latest end.
  - Unit tests cover groups, longest-not-first, midnight (hours above 24)
    and the first-entry case.
- **Stripboard:**
  - A kebab toggle (hidden on a day's first row), applied optimistically
    with a local recompute.
  - A ↳ marker on rows that run alongside.
  - The footer shows wrap = latest end, total = elapsed from the first
    start to wrap, and "N running alongside".
- **When the flag is dropped:** the Boneyard has no timing, and in these
  cases what's above an entry changes:
  - it moves to another day
  - it goes to the Boneyard
  - the day is sorted
  - it becomes a day's first entry (cleared at recompute, so a hidden flag
    can't attach later)
  - Dragging within a day keeps it ("alongside whatever is above").
- **Call sheets:**
  - The snapshot adds `concurrent: true` only when set. The drift check
    confirmed all 4 synced sheets produce the same snapshot shape as before
    (no false "stripboard changed"). 2 of them were already out of sync
    beforehand.
  - Sync and create-from-shoot-day carry it into `ScheduleBlock.concurrent`.
  - The call sheet editor has a per-block "Same time as above" toggle.
  - The readonly view and the public `/cs/[token]` page show those blocks as
    ↳ sub-rows with their own times.
  - "Add block" starts after the latest end (`latestBlockEnd`), and handles
    overnight times typed by hand.
- **Verified:**
  - tsc, jest (376), lint and build.
  - Real-DB script: Load In / Talent call / HMU / Set Up came out 08:00–08:30,
    08:00, 08:00–09:00 and 09:00–11:00. The blocks carry the flag, and
    toggling off restores the sequence.
  - Browser preview of the call sheet editor (toggle, Add block at 11:00,
    readonly sub-rows).
  - pitfall-reviewer: 2 findings, both fixed (overnight "Add block"; flags
    kept on day moves, sorts and first rows).
- **Manual pass:**
  - Toggle on the stripboard and check the times and wrap.
  - Sync the linked call sheet and check its public link.
- **Follow-up (pre-existing):** sync from the stripboard replaces the call
  sheet's blocks, including hand-entered "Who's needed".

### 2026-10-08 — Dietary editable from the Crew page too (latest edit wins)
- **Asked:** dietary showed only in the Rolodex. It should be editable from
  either the Rolodex or the Crew page, with the most recent edit winning.
- **How:**
  - Both places write the same `Contact.dietaryTags` / `dietaryNotes`, so
    there is a single copy and the latest save wins everywhere.
  - The Crew page edit card has the same chips and note as the Rolodex form
    (shared `DietaryPicker`).
  - New action `setCrewMemberDietary`:
    - Needs crew Edit on the project, not Rolodex access.
    - Finds the row scoped by member id and project.
    - Writes only the two dietary fields of the linked contact.
  - The new values show at once on every crew row linked to that person.
  - Unlinked rows show "Link to a Rolodex contact to add dietary".
  - Right after a relink, the card waits for the new person's dietary to
    load before offering edits.
- **Review fixes:**
  - **Send only what changed.** Both the Rolodex form and the crew card now
    send dietary only when it changed (`sameDietary`). Saving a phone number
    in a Rolodex form that was already open can't undo an allergy added on
    the Crew page in the meantime.
  - **Workspace check on links.** Crew add/edit now drops a `contactId`
    that isn't in the caller's workspace (`fillFromContact`'s scoped
    lookup). Before, a leaked id from another workspace could be linked and
    its dietary displayed.
- **Known, by design:** a crew editor can link a row to any contact in the
  workspace (the names-only search), so they can set dietary for any
  contact. Only the dietary fields; nothing else on the contact.
- **Verified:**
  - tsc, jest (364), lint and the build.
  - DB round trip: a Crew-side save is normalised, a Rolodex-side save then
    wins, and the write is blocked from another workspace and for a wrong
    project id.
  - pitfall-reviewer.
- **Manual pass:**
  - Edit a linked crew member's dietary and check the Rolodex shows it.
  - Edit it in the Rolodex and check the Crew page.
  - Relink a row and reopen its card.

### 2026-10-08 — Dietary restrictions on Rolodex contacts (Crew page + call sheet editor)
- **Asked:** a dietary restriction field on Rolodex contacts and crew, shown
  on call sheets and the Crew page so planners can plan food.
- **Decisions (user):**
  - **Internal only:** never on the call sheet sent to crew.
  - Quick picks plus a note.
- **Model:** `Contact.dietaryTags` (text[], default empty) and
  `dietaryNotes` (migration `20261008000003_contact_dietary`).
- **`src/lib/dietary.ts`:**
  - The tags: Vegetarian, Vegan, Pescatarian, Gluten-free, Dairy-free, Nut
    allergy, Shellfish allergy, Halal, Kosher. Allergies show in red.
  - Normalise and summarise ("2 Vegetarian · 1 Nut allergy · 1 other
    note").
- **Rolodex contact form:**
  - A Dietary section with toggle chips and a note.
  - It only sends dietary when the contact it opened with included it, so a
    caller that didn't load it can't wipe it.
  - Merging contacts keeps both records' dietary info.
- **Crew page:**
  - Badges on each member linked to a contact.
  - A summary counted per person (someone in two positions counts once).
  - The list re-syncs after a refresh.
- **Call sheet editor:**
  - A "Dietary needs — internal" panel under Catering: everyone linked on
    the sheet with restrictions, plus the count line.
  - The page loads dietary for contacts linked on the sheet and on the
    project crew (for anyone with call sheet access), plus the full Rolodex
    list for users who have Rolodex access.
- **Never public:** the review confirmed nothing reaches `/cs/[token]`, call
  sheet emails or PDFs, or any client/vendor surface. Picking a contact on a
  call sheet copies only name, role, phone, email and contactId into the
  stored sheet.
- **Verified:**
  - tsc, jest (363, including dietary tests), lint, and the build.
  - Browser with sample data: the contact form chips, the call sheet panel
    (people with nothing on file are left out) and the crew badges.
  - pitfall-reviewer: no leak; 4 findings (merge dropped dietary, crew
    count by position, stale badges after re-linking, stale Rolodex list
    re-saving old values). All fixed.
- **Limit:** crew typed in by hand (not linked to a Rolodex contact) carry
  no dietary info.

### 2026-10-08 — Contract blocks: internal names + orange for IP & usage rights
- **Asked:**
  - A library-only name for blocks, so "SOW – Talent" and "SOW – Crew" can
    both show "PROJECT & SCOPE OF WORK" on the contract.
  - IP & usage rights blocks highlighted orange (like SOW in blue), since
    they need tailoring.
- **Model:** `ContractBlock.internalName` (optional; migration
  `20261008000002_contract_block_internal_name`). `title` stays the public
  heading.
- **`blockLabel()`** = internal name, else title. It's used in:
  - Settings block cards, which also show "On the contract: <title>"
  - the Contract Builder
  - the deal memo "Choose terms" picker
  - the proposal library picker and suggestions banner
  - memo and proposal section editors, which show "From <internal name>"
- **Never public:** a review traced every public path (proposal and sign
  pages, vendor page, all PDFs, emails, snapshots). Sections copy only the
  block's `title`, and section rows have no relation to the block, so the
  internal name can't be loaded there.
- **Colours:** `categoryTone()` / `REVIEW_TONE_CLASS` in
  `src/lib/contract-categories.ts`.
  - SOW, Custom and blank sections are blue; IP & Rights are orange.
  - Applied in the library, the builder, the pickers, deal memo sections and
    (new) proposal sections.
  - `tailwind.config.ts` content now includes `src/lib`. Class maps there
    weren't generated before; caught in the browser preview.
- **Verified:**
  - tsc, jest (360, including `contract-categories` tests), lint, and the
    build.
  - Browser with the real vendor library: sample internal names, blue SOW
    and orange IP borders confirmed through computed styles.
  - pitfall-reviewer: the leak trace passes; 2 low findings (suggestions
    banner label, ad-hoc proposal sections not blue), both fixed.

### 2026-10-08 — Contract Builder: contract templates made of blocks
- **Asked:** group blocks into contract templates, e.g. SOW – Social vs
  SOW – Brand, or a Talent memo that includes the Usage block. Build them
  in Settings → Contracts → **Contract Builder**.
- **Decisions (user):**
  - Templates on both sides (deal memos and proposals).
  - A template is the full ordered list, with one default per side.
  - Add bid has a template dropdown with the default pre-selected.
  - Applying a template adds only what's missing.
- **Model** (`20261008000001_contract_templates`, additive):
  - `ContractTemplate` (audience, name, description, isDefault, orderIndex),
    with a partial unique index allowing one default per workspace and
    audience.
  - `ContractTemplateBlock` (template ↔ block, ordered). Deleting a template
    or a block cascades.
  - Both are in `SCOPED_MODELS`.
- **`resolveTemplateBlocks`** (`src/lib/contract-templates.ts`) picks, in
  order:
  1. The chosen template's active blocks of the same audience.
  2. Otherwise the default template.
  3. Otherwise the blocks marked "attach by default" (unchanged until a
     template exists).

  It's used by `createDealMemo` (new optional `templateId`) and the
  proposal `attachDefaultBlocks`.
- **"Use template"** in the deal memo Terms header and the proposal
  Contract tab:
  - Adds missing blocks after the current sections, in template order
    (`mergeTemplateSections`, unit-tested).
  - Refused on signed or cancelled memos and won proposals.
  - The memo editor saves pending edits first.
- **Settings:**
  - The Contract Builder sits above the block library, with template cards
    and a builder dialog: library checkboxes grouped by category on the
    left, the ordered list with up/down/remove on the right.
  - A new template starts from the blocks marked default.
  - Template CRUD is gated by Settings Edit. Block ids are checked against
    the workspace and the audience; create and update run in a transaction
    that moves the default flag atomically.
- **Add bid:** a "Contract template" dropdown. When no template is the
  default, it offers "Blocks marked default".
- **Verified:**
  - tsc, jest (358, including the merge tests), lint, `audit:scoping`, and
    build up to the known Resend step.
  - **Real DB, temporary workspaces:**
    - The fallback with no templates.
    - One default per side, also enforced by the database.
    - Cross-audience and other-workspace block ids rejected.
    - A chosen template creates the memo in order and skips inactive
      blocks; with none chosen, the default template is used.
    - Apply adds only what's missing and keeps edits; it's refused on a
      cancelled memo and a won proposal; a vendor template can't go on a
      proposal.
    - Deleting a block removes it from templates.
  - Browser: the builder dialog rendered with the real vendor library.
  - pitfall-reviewer: 2 findings (Add bid forcing the first template when
    none is the default; block counts including inactive blocks). Both
    fixed.
- **Data:** creating "Standard" templates from today's default blocks waits
  for the user's OK.

### 2026-10-07 — Batched autosave, ship 2: budget lines save in the background
- **Before:** a budget line pop-up waited for `upsertLineItem` (5–6
  database round trips), then `router.refresh()` re-rendered the whole
  budget page. That happened for every line.
- **Now** (`LineItemModal` `onDeferredSave`, `BudgetEditor` `saveLine`,
  `src/lib/pending-line-ops.ts`):
  - **Save:** the pop-up closes at once and the row shows immediately. A new
    row gets a temporary id and pulses, and can't be edited or dragged
    until it's saved. The totals bar and phase total update instantly
    (phases report their on-screen accounts).
  - **Saving:** saves go through the page-wide lock in the order made, and
    are tracked by SaveScope for the status line, the leave-page warning and
    `flushAll`. The page re-syncs once after a pause.
  - **Pending saves survive refreshes:** every save is its own op (an edit
    patch, or a new row), and pending ops are re-applied on every refresh,
    so a refresh can't wipe a row still saving. Two quick edits of one row
    apply in order.
  - **Success:** a new row takes its real id at once.
  - **Failure:**
    - Only that row goes back to the server's copy (other changes stay) and
      the page re-syncs.
    - The pop-up reopens with what was typed, including contact and rate
      card, plus the error. Several failures queue up and reopen one by
      one.
    - If the budget was switched or left, an alert says the line wasn't
      saved.
  - **Phase tabs stay mounted** (hidden), so a failure in another phase
    still surfaces.
  - Temporary ids are excluded from bulk selection and reordering.
- **Verified:**
  - tsc, jest (354, including the pending-ops tests), lint, and build up to
    the known Resend step.
  - Browser, with the real Daadi budget and no session so the save is
    refused:
    1. The pop-up closed at once.
    2. The row appeared, pulsing.
    3. The refusal removed it.
    4. The pop-up reopened with the description, the rate ($123.00) and the
       error.
  - pitfall-reviewer, two rounds: 6 findings, then 2 more (multiple
    failures, double-edit rollback). All fixed.
- **Unchanged:** budget rates and discount, renames, add account, delete,
  duplicate, drag, bulk actions, packages and import. They don't freeze
  today: each is one explicit save, and drag is already optimistic.
- **Next:** ship 3 (actuals cells).

### 2026-10-07 — Batched autosave, ship 1: shared queue + deal memo editor
- **Asked:** wait 2–3s, combine a burst of edits and save once, everywhere,
  instead of freezing after each change. Confirm the architecture is safe
  first.
- **Audit:** each page had a different cause.
  - **Deal memo editor:** each blur did save → `router.refresh`, and
    *everything* was disabled while pending. Then fee rows and sections
    remounted (keyed by version / `termsKey`).
  - **Budget:** each line-item save waits for the action, then refreshes the
    whole budget page. That's ship 2.
  - **Actuals:** one request per cell. That's ship 3.
  - Call sheets and the save-on-close modals are fine as they are.
- **`SaveQueue`** (`src/lib/save-queue.ts`, unit-tested):
  - Patches merge, and one save goes out about 2.5s after the last edit.
  - One save is in flight at a time; edits made meanwhile go out after it,
    so the last edit wins.
  - A failed patch is kept, under any newer edits, for Retry.
  - `flush()` saves now.
  - An optional `exclusive` lock serialises saves across queues.
- **`SaveScope`** (`src/components/autosave/SaveScope.tsx`):
  - `flushAll()` before actions.
  - Flushes on hide, `pagehide` and unmount.
  - A `beforeunload` warning while anything is unsaved, saving or failed.
  - One coalesced `router.refresh` after a pause, held back while anything
    is unsaved.
  - A page-wide save lock.
  - `discardFailed()`, which drops failed edits and remounts the editor
    from the saved values (`SaveGeneration`).
  - `SaveStatusLine`: "Unsaved changes / Saving… / All changes saved /
    Couldn't save — Retry · Discard".
- **Deal memo editor:**
  - Memo fields batch into one `updateDealMemo` patch, saved on change.
  - Each fee row and section has its own queue and is keyed by id. It adopts
    server values only when they differ in meaning and nothing is unsaved.
  - Fields are never disabled while saving.
  - Fee terms stay a template until edited away from it.
  - Blanking a name or title saves the last saved value.
  - "Use the budget rate" starts from the row's on-screen values.
  - Remove asks first when a section has unsaved edits.
  - Send, Award, Not selected, Reopen, Cancel, Preview, Add or remove a fee,
    move, reset, terms and the budget rate all save everything first. If a
    save can't succeed, they offer "Discard and continue".
- **Verified:**
  - tsc, jest (348, including 8 queue tests), lint, and build up to the
    known Resend step.
  - **Real database, temporary workspace:**
    - Five rapid memo edits made one `updateDealMemo` call, the last values
      won, and auto OT recomputed ($90 → $120).
    - Four rapid fee edits made one upsert with the final values.
    - A rejected save was kept.
  - **Browser:**
    - Inside the window: "Unsaved changes" with 0 of 37 fields disabled.
    - A failed save showed "Couldn't save — Retry", with the edits kept.
  - pitfall-reviewer, two rounds: 6 findings (stale terms, normalised
    values rewritten under the cursor, budget-rate clobber, parallel memo
    and fee saves vs auto OT, a stuck save blocking actions, blank-field
    and remove-prompt edges), then 2 regressions (Discard leaving values on
    screen, terms freezing). All fixed.
- **Next:** ship 2 (budget: the line pop-up closes instantly and refreshes
  are coalesced), then ship 3 (actuals).

### 2026-10-07 — Deal memo terms: style toolbar + merge tags
- **Asked:** the deal memo's terms sections should have the same editor as
  the contract blocks in Settings: styles plus inserting tags.
- **Shipped:** each terms section body now uses `SmartTextEditor`:
  - bold, italic, underline, bullet and numbered lists, paragraph breaks,
    and links
  - the **Tags** menu with the vendor set: vendor name, role, dates, hours,
    OT and double-time, zone, company and project
- **Rendering:** no change was needed. The vendor page renders smart text,
  and the PDF draws its lists and drops the bold, italic and underline
  markers, the same as proposal PDFs.
- **`SmartTextEditor` gained four props:**
  - `readOnly` hides the toolbar (signed, cancelled or view-only memos).
  - `disabled` greys the toolbar while saving, without moving the layout.
  - `onBlur`, so a section still saves when you leave it.
  - `frameClassName` keeps the blue border on sections marked for review.

  Other callers are unchanged.
- **Fixed in review:**
  - Clicking Link mid-edit no longer saves and reloads the section before
    the link lands. The prompt's blur is ignored.
  - On phones the Tags menu spans the toolbar instead of running off the
    screen.
  - Links with underscores in the URL rendered with `<em>` inside the href.
    `renderSmartText` now parks links before applying bold, italic and
    underline, and the PDF strips links first. This affected proposals too.
- **Verified:**
  - tsc, jest (including new smart-text tests), lint, and build up to the
    known Resend step.
  - A throwaway preview of the real Daadi memo at 375px showed the toolbar
    and Tags menu.
  - pitfall-reviewer: 1 medium and 3 low findings, all fixed.
- **Follow-ups:**
  - The PDF doesn't show bold or italic (react-pdf plain text). This
    matches proposals.
  - If a section title has unsaved edits when Link is clicked, the title's
    blur can still save first.

### 2026-10-07 — Mobile: project overview fits a phone
- **Reported:** on a phone, the overview's five money figures ran into each
  other and the proposals table was squeezed.
- **Money figures:** below md, Project total spans the full width, then
  Billed / Spent and Profit / Margin sit two to a row. They're five across
  from md as before.
- **Header:** the action buttons wrap, and the title is smaller on phones.
- **Proposals:** below md the table keeps Title, Status and actions. Created,
  Valid through and Signed by are hidden.
- **Invoices:** below md the table keeps Invoice, Status, Total and actions.
  The due date moves under the title, and Paid is hidden. The invoice number
  no longer breaks across lines.
- **`BudgetReadOnly`** (overview breakdown and public proposal):
  - Long account names wrap instead of pushing totals past the card edge.
  - The expanded line-item table scrolls sideways inside its own box.
- **Verified:**
  - tsc, jest, lint, and build up to the known Resend step.
  - A throwaway copy of the overview page, with stubbed access and deleted
    afterwards, rendered Daadi's real data at 375×812. Nothing overflows
    the screen, apart from the closed off-screen notes drawer.
- **Follow-up:** the overview passes Prisma `Decimal` line quantities to
  `BudgetBreakdown` (a client component). Dev logs "Only plain objects…"
  for each line. This was already the case and works in production;
  serialize the quantities to numbers to silence it.

### 2026-10-07 — Mobile, phase 2: project tab bar, and fixes from the first phone test
- **Reported** (screenshots from a phone):
  - KPI numbers overflowed their cards on the dashboard and on Projects.
  - Inside a project, the side menu still took half the screen.
  - The deal memo editor was still unusable.
- **Stat cards:**
  - Dashboard KPIs are 2-up on phones, with smaller numbers.
  - The Recent projects table becomes cards: name with client and type,
    value and status.
  - The Projects metrics hide their icon below sm, and labels wrap instead
    of truncating.
- **Project tab bar (Option B)** (`ProjectMobileNav.tsx`):
  - Below md the project side column is hidden.
  - A dark header strip shows "‹ Projects" with the client and project
    name.
  - A bottom bar has Overview · Pre-prod · + · Money · Delivery.
    - Each group opens a sheet with its sections.
    - "+" creates a deal memo, call sheet or receipt on this project,
      offering only what this person can edit.
  - The app's own tab bar steps aside on `/projects/[id]/*`.
  - `projectNavSections` / `isProjectNavActive` are shared with the desktop
    `ProjectSubNav`, so permission filtering is identical.
- **Deal memos on phones:**
  - **Board:** one card per bid (rate · expected · vs budget, status,
    actions) instead of the table. The role headers stack.
  - **Editor:** the base grid is `grid-cols-1`. Before, a long "Actuals"
    option widened the page to 503px on a 375px phone.
  - **Editor layout:**
    - The memo comes before the internal panel on phones.
    - Dates sit two to a row.
    - Fee rows are two-column.
    - Section headers wrap.
    - Remove-fee is always visible on touch screens, unless read-only.
- **Desktop:** unchanged at md and wider.
- **Verified:**
  - tsc, jest, lint, and build up to the known Resend step.
  - A throwaway public preview route, deleted afterwards, rendered the real
    Daadi deal memo board and editor (read-only) at 375×812. Scroll width
    went from 503px to 375px.
  - The editor was also checked at 1280px.
  - pitfall-reviewer: 3 low findings, all fixed. Desktop row gap, the
    internal panel reordering only below md, and no remove-fee for
    read-only viewers.
- **Next (phase 3):**
  - The phone draft flow for deal memos.
  - Phone layouts for the remaining project pages: overview, schedule,
    call sheets, budget.

### 2026-10-07 — Mobile, phase 1: the shell (no sidebar on phones)
- **Before:** on a phone the 200px sidebar took about half the screen on
  every page.
- **Below md (768px)** (`src/components/layout/MobileNav.tsx`):
  - The sidebar and the desktop top bar are hidden.
  - **Top bar:** a slim dark bar with the workspace switcher.
  - **Bottom tab bar:** Home · Projects · **+** · Money · More.
    - Money opens Invoices, or Proposals for a role with only Proposals.
    - The Money tab is hidden for roles with neither.
  - **"+" sheet:** create a deal memo, call sheet or receipt on the project
    you last opened. It's remembered per workspace in localStorage by
    `RememberProject`, together with the Edit rights there, and only those
    rows are offered. Also:
    - Invoice → `/invoices?new=1`, which opens the invoice-first modal.
    - Project → `/projects?new=1`, which opens the new-project modal.
  - **More:** slides up from the bar with the rest of the sidebar links,
    filtered by the shared `visibleNavGroups`, plus the user and sign-out.
- **Layout details:**
  - The auth layout exports `viewport` (`viewport-fit=cover`) for
    safe-area padding.
  - Height is `100dvh`.
  - Padding is `p-4` on phones with room for the tab bar, and `p-6` from md.
  - The project layout and schedule editor margins were updated to match.
- **Fixed-position bars moved above the tab bar on phones:** the budget
  totals bar (it was offset 200px for the sidebar) and the call sheet's
  "Save changes" button.
- **Desktop is unchanged,** apart from the top bar's "New project", which
  now opens the modal instead of only going to /projects.
- **Decisions:**
  - Option B for project pages, a project-level tab bar, comes in phase 2.
  - The desktop deal memo editor stays as it is; phase 3 adds a phone draft
    flow.
  - The mockups are in `docs/mockups/mobile.html`.
- **Verified:**
  - tsc, jest, lint, and build up to the known Resend step.
  - A throwaway public preview route of the shell at 375×812, deleted
    afterwards: tab bar, "+" sheet with and without a remembered project,
    More sheet.
  - pitfall-reviewer: 4 findings, all fixed. Rows hidden without
    permission, sheets close on same-page links, Invoice shown only to
    those who can create one, fixed bars offset.
- **Follow-ups:**
  - If the remembered project is deleted or access is lost, the "+" rows
    404 until another project is opened.
  - The project sub-nav still shows as a side column on phones until
    phase 2.

### 2026-10-06 — Invoice-first billing: new project from an invoice, or bill added scope
- **Before:** an invoice needed a project, a budget and a proposal first. A
  last-minute job already done took five steps, and there was no way to bill
  extra scope on a won project.
- **New invoice** (on /invoices and on a project's Invoices page),
  `NewStandaloneInvoiceModal` → `createInvoiceFirst`
  (`src/server/actions/invoice-first.ts`):
  - **New project:** in one transaction, creates the client (if new), an
    ACTIVE project, a budget built from the invoice lines, an APPROVED
    proposal at the invoice total (dated the invoice date, one 100% "Full
    payment" milestone), and the invoice. Then the usual won effects.
    - The budget has a 0% fee and the invoice's tax and flat discount, so
      the project's value equals the invoice. The action refuses to commit
      if the two totals differ.
    - New-project tax allows at most 2 decimals (the budget stores tax to
      4 decimals as a fraction).
    - Needs Projects edit plus Budget costs, Proposals and Invoices edit on
      a new project (`canCreateProjectFromInvoice`). Owners always qualify.
  - **Existing project:** any project you can invoice, including ones
    without a proposal. On a won project the invoice is **added scope**
    (`Invoice.isScopeAddition`). There's an opt-out checkbox for re-issuing
    part of the agreed total.
  - **Create & send** opens the usual send dialog.
- **Added scope counts toward the project's value:**
  - `src/lib/project-value.ts`.
  - Where: project cards ("Total"), outstanding, Won this/last quarter, the
    dashboard value, the project's "Approved Amount" and the project
    invoices header.
  - It's tagged "Added scope" in the three invoice lists.
  - Milestone amounts and the actuals burn stay on the budget alone.
- **Exact tax rounding at half cents:**
  - `calcBudgetTotals` and `calcInvoiceTotals` now round tax in integer
    basis points.
  - Before, $30.00 at 7.25% came to 217¢ in the budget but 218¢ on the
    invoice, a float error (found in review).
  - No existing budget or invoice has tax, so no stored or displayed number
    changed.
- **Also:**
  - A single-milestone payment schedule now matches its invoice; before, a
    100% milestone never matched because its kind is FINAL.
  - Shared builders: `buildBudgetSnapshot` / `buildProposalContent`
    (`proposal-snapshot.ts`), `buildInvoiceCreateData`
    (`invoice-create.ts`), and the invoice line editor (`InvoiceLineRows`).
    `generateInvoiceNumber` takes a transaction client, so a rolled-back
    create doesn't burn a number.
- **Migration:** `20261006000001_invoice_scope_addition` (one boolean,
  default false).
- **Verified:**
  - jest: value math, budget equals invoice across rates and amounts, and
    the permission rule.
  - A real-DB run on temporary workspaces, all cleaned up, covering:
    - the new-project golden path
    - added scope and voiding it
    - a project that isn't won
    - another workspace's client or project returning Not found with
      nothing created
    - rollback mid-transaction
    - an assigned-only creator
    - the re-issue opt-out
  - pitfall-reviewer: 4 findings, all fixed.
- **Follow-ups:**
  - Editing an invoice-first invoice's amount doesn't update the budget or
    the approved total. That matches how other invoices relate to their
    budget, but here the value was meant to equal the invoice.
  - `createInvoice` (from a proposal) doesn't check that `clientId` belongs
    to the project. The client always passes the project's own client
    today.

### 2026-10-06 — Removing a member who's already gone from Clerk
- **Bug (user report):** removing "Ashish TEST" (darkustigrus@gmail.com)
  failed with "Failed to remove member from workspace."
  - The account had already been removed from the Clerk org in the
    dashboard, so `deleteOrganizationMembership` threw and the removal
    stopped before deleting the SlateSuite membership.
- **Fix:** when the Clerk removal fails, re-check real org membership
  (`stillInClerkOrg`). If they're already out, finish the removal.
- **Related, open:** Anjali is now in the Clerk org but has no DB user and
  her invite is unaccepted. Neither her `user.created` nor her
  `organizationMembership.created` webhook created her, so Clerk webhooks
  may not be reaching the app. Check the Clerk → Webhooks message attempts
  and Railway logs. Re-opening the invite link now completes the join (the
  accept upserts the user).

### 2026-10-06 — Invites: clear "member limit" errors; accepting works without the sign-up webhook
- **Bug (user report):** Anjali's invite to The Third Place said "Failed to
  accept invitation".
  - **Root cause:** the Clerk org has `maxAllowedMemberships = 5` and
    already had 5 members, so `createOrganizationMembership` was refused
    and the generic error was shown.
  - **A second gap:** she had no DB `User`. Her `user.created` webhook
    hadn't created one (no personal org exists in Clerk either), so the
    accept's `user.update` would have failed next.
- **Fix:**
  - Invite and accept check the org's member cap first (`clerkOrgIsFull`)
    and say "has reached its member limit" plainly.
  - Accept upserts the DB user (from Clerk) straight into the invited
    workspace when missing, then writes the membership. The membership
    write now throws instead of swallowing errors.
- **Open:** raising the org's member limit is a Clerk setting (the user's
  call). The reason her `user.created` webhook didn't run needs the Railway
  logs or Clerk webhook attempts.

### 2026-10-05 — Roles cleanup: the legacy fixed role is gone
- **Removed from the code and `schema.prisma`:** `User.role`,
  `WorkspaceInvitation.role`, `ProjectTeamMember.role` (the old team slot)
  and the `UserRole` / `ProjectTeamRole` enums.
  - Helpers deleted: `requireRole`, `getCurrentRole`,
    `requireProducerPageAccess`, `stripBudgetForRole`, `canSeeFinancials`,
    `legacyRoleFor`, `legacyRoleForInvite`, `legacySlotGrant`,
    `LEGACY_TEAM_SLOT_KEY`, `ENFORCED_*`, plus the Roles screen's "Not
    enforced yet" labels and legacy preview.
  - `SystemRoleKey` replaces `UserRole`.
  - Membership helpers take `fallback` (a built-in role key) plus an
    optional `roleId`.
- **One source of truth:** WorkspaceMember → WorkspaceRole, and
  ProjectTeamMember → ProjectRole.
  - With no membership, `getAccess` gives no access. The legacy-role
    fallback is gone.
  - The Clerk org role follows the role's `systemKey`: Owner is
    `org:admin`.
  - The Team page and project team screens show workspace role names.
- **Sign-up made atomic:** the Owner membership is written in the same
  transaction as the new workspace and user (Clerk webhook and the lazy
  path in `auth.ts`), because it's now the only thing that grants access.
  The invite-join webhook's membership write throws, so Clerk retries.
- **Join role is consistent:** an invite whose role was deleted joins as
  Collaborator in both the webhook and `acceptInvitation`, matching the
  invite page. Dashboard-added members with no invite still join as
  Producer, as before.
- **Tests:** a new jest **access matrix** (`access-matrix.test.ts`):
  - Owner/Producer/Collaborator × every workspace and project area
  - project roles on a Collaborator
  - the custom-role rules (view the budget plus edit deal memos and
    actuals; dependency caps; actuals needs costs)
  - Legacy tests were deleted, and budget-visibility tests moved to
    `stripBudgetForAccess`.
- **Verified:**
  - An access snapshot before vs after, 1,732 cells (every member ×
    workspace and project area): **0 differences**.
  - A read-only Clerk audit: all 7 org memberships across the 3 linked
    workspaces have a membership row.
  - DB checks (sign-up, invite, join, deleted-role join, re-role, team row,
    atomic sign-up rollback) against today's columns.
  - tsc, jest 321, lint, `next build` compile.
- **Obsolete one-off scripts deleted:** `backfill-roles`,
  `fix-invited-user`, `fix-sara-workspace`.
- **pitfall-reviewer:** deploy safety confirmed. Its 4 findings (Clerk-only
  members, non-atomic sign-up membership, inconsistent deleted-role join,
  stale scripts) are all addressed.
- **Migration** `20261005000003_drop_legacy_roles` (destructive) drops the
  three columns and two enums. Run it only after this deploy is live.

### 2026-10-05 — Roles Phase 2c: Team & roles on permissions (Phase 2 complete)
- **Team & roles now follows the `team` permission on the ACTIVE
  workspace.** Before, `requireTeamAdmin` also required the legacy
  home-workspace Owner role.
  - View (`requireTeamViewer`) lists members, invites and roles. Edit
    manages them.
  - `/team` and Settings → Roles are read-only for View. The sidebar Team
    link and the Roles tab follow the permission, and Settings opens on
    Roles for someone with Team but no Settings.
- **"Only Owners touch Owners"** (user decision, `src/lib/owner-rules.ts`).
  A non-Owner team admin can't do any of these:
  - invite as Owner, or revoke an Owner invite
  - assign into or out of Owner, or remove an Owner
  - copy the Owner role
  - edit or delete a role they hold
- **A non-Owner can only grant what they have** (pitfall-reviewer, high:
  the second-account self-promotion). Creating, editing, assigning or
  inviting with a role bigger than their own is refused (`roleWithin`,
  `projectPermsWithin`).
  - Accepting an invite never changes an existing member's role, so it
    can't promote anyone or demote an Owner.
- **Membership-based lookups:** members are listed, re-roled and removed by
  `WorkspaceMember` in the active workspace (not `User.workspaceId`), so
  people who joined from another home workspace are manageable.
  - Revoke and remove moved off `requireRole(['OWNER'])`.
- **UI flags off the legacy role:**
  - /projects "Edit team" follows Project team Edit for each project.
  - The project notes team controls follow Project team Edit, and "Edit
    client" follows Clients Edit.
  - Budget "insert package" needs Costs Edit and Rates & templates.
- `team` is added to `ENFORCED_WORKSPACE_AREAS`. No saved non-Owner role
  granted it, so nothing changed for anyone.
- **Access diff:** 12 members, 0 team-access changes.
- **Verified:**
  - jest 250, including owner rules, the grant cap and team page guards.
  - A DB script on a throwaway workspace (12 checks): Owner-touching
    changes refused, a bigger role refused, raising a role above your own
    refused, held-role edits refused, members from another home workspace
    re-roled, Owners uncapped.

### 2026-10-05 — Roles Phase 2b: workspace pages enforce permissions
- **Converted:** clients, rolodex management, rates/templates/library
  (including global library copy and import-to-template), settings
  (company, branding, defaults, production, contract blocks, deal memo
  defaults), and the new **Projects** area.
  - Replaced `requireRole`, `requireProducerPageAccess`, the Owner-only
    settings layout and the sidebar's `PRODUCER_HREFS`.
  - Pages use `requireWorkspaceArea`. Settings tabs follow the permission
    (Roles stays team-admin). The sidebar and the top-bar New project
    follow per-area flags.
- **User decisions:**
  - A new workspace area, **Projects** (create / archive / restore).
    Editing details and status is project Overview, and moving into or out
    of Archived by any path needs Projects (`archiveChangeAllowed`).
  - The **danger zone** stays Owner-only via `requireOwner()`
    (`getAccess().isOwner`, the ACTIVE workspace): delete workspace, reset
    demo data, Stripe connect/disconnect. Payments shows non-owners a note
    instead of the cards.
  - **Contract blocks and deal memo defaults → Settings.**
- **Data (user-approved):** added `projects` to all 34 saved
  WorkspaceRoles. Owner/Producer got EDIT (22) and Collaborator/custom got
  NONE (12), with a guarded update and an AuditEvent per row
  (`role.permissions_backfill`). Verified afterwards: no role missing the
  key, no unexpected values.
- **`legacyRoleFor` ignores `projects`,** so turning it off never demotes
  a role's members to Collaborator (pitfall-reviewer, high).
- **View-only:** `ViewOnly` (a disabled fieldset plus a note) on clients,
  rolodex, rates, templates, library, and the settings general/contracts
  pages.
- **Also fixed:**
  - `listContractBlocks` and the contract picker were ungated. The picker
    now takes `proposalId` and needs Contract Edit.
  - `completeOnboarding` let any member rename and rebrand their workspace.
    It's now Owner-only.
  - An ASSIGNED-scope creator is put on the project they create.
  - Contact deal-memo history is limited to projects the viewer can open.
- **Access diff (12 members × 5 areas, saved data):** 1 intended change.
  Skolastika Lupitawina (Producer in The Third Place, Owner of her own
  workspace) loses The Third Place's Settings. The old check used her
  home-workspace role, which was a bug.
- **Verified:**
  - jest 239, including the projects-area tests and section guard coverage
    for every workspace page.
  - tsc, lint, and `next build` compile.
- **pitfall-reviewer:** 3 issues plus 1 pre-existing and 1 low, all fixed.
- **Correction:** the "duplicate roles" seen in the preview are separate
  workspaces with the same name (roles are unique per workspace).

### 2026-10-05 — Roles Phase 2a: money areas enforce permissions
- **Goal (user):** someone can **view the budget without editing it** and
  still **work on deal memos and actuals**. Budget lines, costs and margin
  and deal memos were already enforced. Proposals, invoices and payments,
  actuals and receipts, and contract now are too, plus the /proposals and
  /invoices lists.
- **The rule (user decision):** Actuals needs Budget costs at View or above.
  - `PROJECT_VIEW_REQUIREMENTS` in `permissions.ts` sets actuals to NONE
    when budget.costs is NONE; otherwise it keeps its level, so View budget
    plus Edit actuals works.
  - It's applied to the person's combined access
    (`resolveProjectPermissions`), so a project role can rely on the
    workspace role for budget visibility.
  - The Roles screen shows an amber warning on the Actuals row.
- **Proposals, Invoices and Contract are independent areas** (user
  decision); they show client prices.
- **Guardrail:** on Actuals, billed, profit and margin %, the revenue
  override and the wrap report (page, action and PDF route) need Budget
  margin View.
  - Without it, budget lines reach the client net of markup.
  - The summary shows Budgeted (line costs) and Spent only.
- **Gates:** the new `src/lib/money-access.ts`:
  - `requireMoneyPermission` resolves a proposal, invoice, budget, actual
    sheet or entry, receipt or contract-section id to its project in the
    active workspace; other workspaces get "not found".
  - About 55 legacy checks were converted across proposals, invoices,
    payments, public-tokens, actuals, receipts and proposal-contracts.
  - Proposal creates check that the budget belongs to the projectId.
  - The /invoices and /proposals lists filter rows to projects with the
    area, using `projectsWithArea`. Row actions follow Edit for each
    project.
- **Controls:** view-only Actuals (via context), Receipts, all three invoice
  lists, proposals (overview list, kanban, table), and the contract tab (no
  auto-attach). The proposal modal's Contract tab follows the Contract
  permission. The sidebar's Proposals and Invoices links follow the
  workspace permission.
- **Security fixes found on the way:**
  - `linkReceiptToEntry` rewrote any entry's `actualCents` by id (cross
    workspace). The entry must now be on the same project.
  - `updateReceiptDetails` and `updateActualSheet` wrote client objects
    straight to the database (they could re-point the entry, project or
    budget). Both are now whitelisted.
  - Actuals sync trusted the client's line list. It's now validated against
    the sheet's phase.
  - Two contract reads (`listContractSections`,
    `evaluateProposalContractTriggers`) were ungated.
- **Access diff:** 12 memberships × every project × 4 areas, plus the 2
  workspace lists, run with the real resolver: **0 changes**.
- **Verified:**
  - jest 233, including the view-requirement rules and the updated page
    guard coverage test.
  - A DB script checked every money target type (its own project; another
    workspace refused; empty or undefined ids refused) and the sync filter.
- **pitfall-reviewer:** 5 findings, all fixed:
  - markup on the actuals payload
  - a stripped total feeding the invoice and proposal modals (they now get
    the client total)
  - the receipt patch
  - the sheet data
  - the sync trust
  - Also a low one: Send-button precedence.

### 2026-10-05 — Deal memo terms: checkbox picker, reorder, blue "review" blocks
- **Choose terms** replaces "Add from library…".
  - A popover checklist of the crew & vendor library: title, category, and
    "Default" where it applies.
  - Ticked means the memo already has a section from that block.
  - Ticking adds it (`addDealMemoSection`, which is now a no-op if the block
    is already there).
  - Unticking removes every copy of that block. It asks first if any copy
    was edited or if there's more than one.
- **Reorder:** ↑/↓ on each section run `moveDealMemoSection`, which:
  - reindexes the memo's sections to 0..n-1 (healing ties) in a scoped
    transaction
  - guards every write with `dealMemo: { signedAt: null }`, so a signed memo
    is refused and rolled back
  - uses the pure `moveInOrder` in `deal-memo-core` (jest-tested)
  - Reordering a sent memo marks it Outdated, because order is part of the
    terms key.
- **Blue for SOW, Custom and blank sections:** these are templates to
  tailor, so they get a blue border, blue inputs and a "Scope of work /
  Custom — review" chip. Other sections are lavender. Settings → Contracts
  cards for SOW and Custom are blue too.
  - The section category is looked up from `sourceBlockId`
    (`loadDealMemoEditor` → `sectionCategories`), inactive blocks included.
  - The shared labels and rule live in `src/lib/contract-categories.ts`.
- **Section ordering everywhere** (editor, vendor view, terms key) now
  breaks ties by `createdAt`, so order is deterministic.
- **Verified:**
  - Jest for `moveInOrder`.
  - A DB script checked tie healing and swap, end no-ops, signed refusal
    with the order unchanged, the inactive-block category lookup, and the
    library carrying categories.
- **pitfall-reviewer:** 2 low findings, both fixed: duplicate block copies
  in the picker, and a misleading "Signed" error when a section changed
  elsewhere.

### 2026-10-05 — Vendor merge tags in the contract block Tags menu
- **Before:** the Tags menu in `SmartTextEditor` offered one hard-coded
  client/proposal list everywhere. The crew & vendor terms dialog had no
  way to insert `{{vendor.name}}`, and it offered `{{client.name}}` and
  proposal tags, which don't resolve on a deal memo.
- **Now:** a `mergeTagSet` prop (`'client'` | `'vendor'`).
  `ContractBlockDialog` passes `'vendor'` for VENDOR blocks.
- **The vendor list:**
  - Vendor name
  - Role (`dealMemo.position`)
  - start and end dates
  - work-day hours, OT and double-time terms, production zone
  - company and legal name
  - project name

  It matches `dealMemoReplacements` in `src/lib/merge-tags.ts`. All 12 tags
  were checked against `resolveMergeTagsPlain`.

### 2026-10-05 — Deal memos: signed PDF emailed to the vendor and the sender
- **On signing,** `renderSignedDealMemoPdf` (`src/lib/deal-memo-pdf.ts`)
  renders `DealMemoPDF` (react-pdf) from the frozen `sentSnapshot` plus the
  signature:
  - name and email, date and time, signer IP
  - the workspace logo (png/jpeg via data URI) or name
  - Name/Role header, fees, terms
  - a "cancelled" banner if it applies
- The PDF is attached to both post-sign emails (Resend `attachments`). A
  render failure only drops the attachment; the signature and emails still
  go through.
- **The team email now goes to the person who sent it:**
  `loadDealMemoSender` takes the latest `dealMemo.sent` audit actor, then
  the creator. They must still have a `WorkspaceMember` row, so a removed
  producer gets nothing. The last fallback is the workspace contact email.
  Previously the email went to the creator.
- **Download any time:** `GET /api/pdf/deal-memo/[token]` (public,
  `publicPdf` rate limit) serves signed memos only. Links:
  - "Download PDF" on `/dm/[token]`
  - the editor's Signed banner
  - The header uses an ASCII `filename` plus a UTF-8 `filename*` (curly
    apostrophes would otherwise throw).
- **Fixed:** `sendDealMemoSignedEmails` ignored Resend's `{ error }`
  results; it now uses `checkSend`.
  - Found locally: the from domain isn't verified in local `.env`, so
    signed emails never actually sent from dev. Production is unaffected.
- `parsePdfLines` is now exported from `ProposalPDF` for reuse.
- **Verified:**
  - The PDF rendered and was inspected visually.
  - Sender resolution: audit actor beats creator; contact fallback;
    non-members rejected.
  - Sign E2E: PDF route 404 before signing, 200 `application/pdf` after.
  - Resend accepted a send with the PDF attached (test sender to
    `delivered@resend.dev`).
- **pitfall-reviewer:** the sender lookup was missing a membership check
  (ex-member leak), and non-Latin-1 filenames returned 500. Both fixed.
- **Follow-up:** `loadLogo` adds up to 4s to the sign request when the logo
  host is slow.

### 2026-10-05 — Deal memos: Role shown under the vendor's name
- The vendor document (`DealMemoDocument`, used by `/dm/[token]` and
  "Preview as vendor") now shows **Name** with **Role** beneath it, instead
  of a single "Crew member" field.
- Role is the existing `DealMemo.position`. It defaults from the budget
  line's `roleLabel` (e.g. "1AC"), and the editor field is relabelled
  "Role (shown to the vendor)", e.g. "1st Assistant Camera".
- Editing the role after sending already marks the memo Outdated (position
  is in the terms key), so the vendor gets the new role on re-send.
- No migration.

### 2026-10-05 — Invoices: archive + delete at any status
- **Before:** only DRAFT invoices could be deleted, and PAID ones couldn't
  even be voided. 13 test invoices (9 VOID, 4 PAID) were stuck in the lists
  and in the "Collected" totals.
- **Delete** (`deleteInvoice`) works at any status.
  - A never-sent, unpaid draft deletes on a plain confirm.
  - Anything else needs the invoice number typed. This is checked on the
    server (`matchesInvoiceNumber`, `src/lib/invoice-delete.ts`).
  - The dialog warns that the client link stops working and that collected
    money drops out of the totals.
  - Views cascade. `PaymentAttempt` rows are kept (no FK) for Helcim
    reconciliation.
  - Audit `invoice.deleted`, with number, status, totals and sentAt.
- **Payment guard:** delete is refused while an INITIATED attempt is under
  2h old.
  - Payments initiate reuses an attempt for 55 min after its `createdAt` and
    re-tokens it without moving that timestamp. `settlePayment`'s
    `invoice.update` would then throw on a deleted invoice: the card is
    charged with no record.
  - A millisecond race remains (a checkout opened between the check and the
    delete).
- **Archive** (`setInvoiceArchived`, `archivedAt`/`archivedById`) is
  list-only.
  - The three lists (`InvoicesTable`, `ProjectInvoices`,
    `ProjectInvoicesPage`) hide archived rows behind "Show archived (n)",
    and show them dimmed with an Archived tag.
  - The dashboard, the `/invoices` metrics and the project totals still
    count archived invoices.
  - Audit `invoice.archived` / `invoice.unarchived`.
  - Permission: `requireRole(['OWNER','PRODUCER'])`, the same as void.
- **Migration:** `20261005000002_invoice_archive`, two nullable columns.
  The user ran it.
- **Verified:**
  - Jest covers the matcher, the typed-confirm rule and the payment window.
  - A DB script on a throwaway workspace checked: archive round-trip;
    cross-workspace delete refused; draft deletes untyped; wrong or missing
    number refused; the right number deletes; views cascade; a fresh
    INITIATED attempt blocks while a stale one doesn't; attempts kept.
- **pitfall-reviewer:** the payment window was too short (30 min). Fixed to
  2h. The all-archived list showed an empty table; it now shows a message.

### 2026-10-05 — Deal memos: sent-but-unsigned memos go "Outdated" when terms change
- If the producer edits a sent, unsigned memo's terms, the vendor's link
  shows an amber "This deal memo is out of date" notice.
  - It names the studio and asks them to send the updated memo.
  - The sign form is replaced, and the sign route returns 409.
  - The editor shows an "Outdated — re-send" chip and banner. Re-sending
    clears it.
- **What counts as a change:** a `termsKey` fingerprint of the raw terms
  (merge tags unresolved) is stored in `sentSnapshot` at send:
  - position, dates, days
  - work-day/OT/DT/zone terms
  - visible fees (label, rate, unit, qty, terms)
  - sections
  Renaming the project, vendor or studio does not count.
  - Snapshots without a key fall back to comparing vendor views.
- **Verified:**
  - Jest: key stability (Decimal vs number), rate, section and OT changes,
    zero-rate fees ignored.
  - E2E on a throwaway workspace: fresh → signable; project and contact
    renamed → still signable; rate edited → outdated + 409; re-sent →
    signable and signed.
- **pitfall-reviewer:**
  - A medium false positive from merge-resolved comparison. Fixed with the
    raw-terms key.
  - The public page no longer 500s if the check throws.
  - Known: a millisecond race between the outdated check and the sign
    compare-and-set. The editor's "differs from what they signed" note
    covers it.

### 2026-10-05 — Deal memos Phase 2: vendor link, e-signature, email, guarded cancel
- **Before:** Award only flipped an internal status. Nothing reached the
  vendor.
- **Flow:**
  - Award (internal pick, unchanged), then **Send to vendor**. A dialog
    prefills the contact email, which can be edited.
  - Sending emails a `/dm/[token]` link (60 days, renewed on re-send, same
    token) and freezes the vendor DTO into `sentSnapshot`.
  - Status reads Awarded → Sent → Viewed → Signed in the editor, the board
    and the crew pill.
- **Vendor page `/dm/[token]`:**
  - Public and rate-limited (`publicDoc`). It renders only the frozen
    snapshot.
  - Records views only while sent and unsigned.
  - Signing needs a name, the email it was sent to, and an "I agree" box.
    `POST /api/deal-memos/[id]/sign` is rate-limited (`approve`), does a
    compare-and-set, writes an AuditEvent with `actorId: 'public'`, then
    sends non-fatal confirmation emails to the vendor and the sender (or the
    workspace contact).
  - Signing is pinned to the version on screen: the page posts `sentAt`, and
    a re-send since then gets a 409 "reload".
- **Signed memos are locked:**
  - Memo, fee and section writes are refused and re-check `signedAt: null`
    at write time.
  - The board's expected cost uses the signed snapshot's total.
  - The editor flags working terms that drifted from what was signed.
- **Cancel:**
  - Type CANCEL (checked on the server).
  - When the memo was sent, an "email the vendor" box starts ticked.
  - A cancelled link shows a notice and returns 410 on sign.
  - `setDealMemoStatus` no longer accepts CANCELLED. Reopen (CANCELLED → BID)
    clears the link, snapshot and signature.
- **Migration:** `20261005000001_deal_memo_signing`, all additive nullable
  columns plus a unique `publicToken`. The user ran it in Neon.
- **Data:** the Daadi Associate Producer memo was reset to BID for the
  user's test, with an AuditEvent `dealMemo.reset_to_bid`.
- **Verified:**
  - Browser on a throwaway workspace: view, wrong email → 403, sign, signed
    state.
  - Re-sign → 409; cancelled → notice and 410.
  - Stale version → 409; signed-memo writes refused.
- **pitfall-reviewer** found 1 high (sign against a re-sent version),
  1 medium (live vs signed terms) and 2 low (write race; no audit on email
  failure). All fixed.
- **Follow-ups:**
  - No PDF of the signed memo yet; the page prints.
  - New fees/sections created during the sign race aren't guarded (creates
    can't filter on the parent), but the drift banner shows them.

### 2026-10-05 — Roles Phase 2 (3/n): schedule, call sheets, delivery enforce permissions
- New `src/lib/production-access.ts` (`requireProductionPermission`). It
  resolves a shoot day, scene, schedule, entry, delivery page/section/asset/
  version or call sheet id to its project in the active workspace, then checks
  `schedule` / `callSheets` / `delivery` there.
- **Schedule:** 25 actions. Multi-id actions require one project; shoot-day
  reorder is project-scoped (it was raw by id, across workspaces). Locations
  are workspace-wide but managed through a project (schedule EDIT there). The
  page passes canEdit, and "Create Call Sheet" needs callSheets EDIT.
- **Call sheets:** every action needs `callSheets` EDIT (it was project
  access only). Crew import requires the call sheet's own project's budget.
  Link regeneration moved off the legacy role. View-only gets a read-only
  editor, and the list hides new/delete.
- **Delivery:** 22 actions (EDIT for writes, VIEW for reads). Pages use
  `requireProjectArea(delivery)` instead of the legacy gate; viewers don't
  auto-create a delivery page. Same-page checks were added for section/asset
  moves and reorders (previously ids from other pages were accepted). The
  Delivery tab follows the permission.
- Access diff: 0 member×project changes. All target kinds verified against
  real rows; empty/foreign ids refused.
- pitfall-reviewer found 3 medium cross-project gaps (scene on an entry,
  shoot-day reorder, crew import budget) and 4 low; all fixed except the
  read-only-UI and Shade/view-recorder follow-ups.

### 2026-10-02 — % milestone invoices prefill at the net amount; full invoices include the agency fee
- **Reported:** a 50% milestone still defaulted to a discount row ($37,440 −
  $1,872), even though the approved total ($71,136) already includes the
  discount. A % milestone (and any single-line invoice) is now prefilled at the
  net amount — 50% of $71,136 = $35,568 — with no discount row. Only a full
  invoice itemised from the budget carries the discount: its lines are the
  budget's pre-discount rates.
- **Found while checking:** an itemised "Full invoice" listed the budget's
  lines but not the budget-level agency fee. Daadi would have invoiced $58,656
  instead of $71,136. It now adds an "Agency fee (20%)" line ("Agency fee &
  tax" when the budget has tax) for the gap, so it totals the approved amount.
  Confirmed against the Daadi snapshot (lines $62,400 + fee $12,480 − discount
  $3,744).

### 2026-10-01 — Invoice date (backdating) + double-discount fix
- **Invoice date:** both the new and edit invoice modals have an "Invoice
  date" (Invoice.issueDate already existed, always "now"). The due date keeps
  the usual window from it unless set by hand, and can't be earlier. Payment
  terms are re-derived. Calendar dates are stored at midday UTC
  (`calendarDateToStored`), so the public page no longer shows the day before
  in US timezones (this already affected due dates). The edit modal only
  sends the invoice date when it was changed.
- **Double discount (reported):** a milestone invoice always subtracted its
  share of the budget discount, even when the amount typed was already the
  discounted figure (50% of the post-discount total). Now
  `autoInvoiceDiscount` skips it on an exact match and says so. The discount
  row is visible, editable and removable in both modals.
- **Also fixed:** editing an invoice dropped its discount from the total and
  taxed the pre-discount subtotal. Create, edit and both previews now share
  `calcInvoiceTotals` (tax on subtotal − discount). Create recomputes totals
  server-side instead of trusting the client. An edit can't take the total
  below what's been paid. A rejected create no longer burns an invoice number.
- Data: a read-only check found 0 of 20 invoices with a discount or a
  mismatched total, so nothing to repair.
- pitfall-reviewer found 2 medium (timezone display, total below paid) and
  4 low; fixed except the two logged follow-ups.
- **Needs a manual pass:**
  - The Daadi 50% milestone: type $37,440 and the total stays $37,440, with
    the "already includes the discount" note.
  - Backdate an invoice and check the PDF and the public page.

### 2026-10-01 — Roles Phase 3b: per-person project roles in the Team panel
- The project Team panel is one list. Everyone on a project holds a project
  role, any role can have several people, and a person may hold more than
  one. Each row has a role picker and remove. "+ Add person" picks a role and
  a person. Team member is the default; it adds nothing on top of another
  role and is superseded by one.
- Changes need `projectTeam` EDIT. You can only give, change or take away a
  role that grants nothing beyond your own access on that project (a Project
  Manager can't make someone, or themselves, Account Manager).
- The legacy `role` column is no longer written; its old one-per-slot unique
  index would block a second Account Manager. Chips and the Clients/Proposals
  Account Manager columns now read the project role (earliest holder when
  several), the same rows on today's data.
- Add, change and remove for one person on one project are serialised (a
  transaction advisory lock) and guarded on still-active rows, so "assignment
  iff an active row" holds under concurrent clicks.
- Removed: getProjectTeam, assignProjectTeamRole, unassignProjectTeamRole,
  getProjectOthers, and the team-side add/removeProjectMember. History shows
  role names.
- pitfall-reviewer found 1 high (the unique index), 1 medium (granting beyond
  your own access), then 1 medium + 2 low on re-check (concurrent removes,
  add vs remove, custom roles hidden from history); all fixed. The lock was
  verified against Neon.
- **Needs a manual pass:** open a project's Team panel → + Add person as
  "Vendor coordinator"; change a role; remove. Then sign in as that person.

### 2026-10-01 — Roles Phase 3a: Settings → Roles, role assignment, invites with a role
- **Settings → Roles** (Owner) has two lists, up to 7 each:
  - Workspace roles: project scope, workspace pages, and a baseline for
    inside projects.
  - Project roles.
  Create from any role, rename, edit, and delete if unused. The Owner role is
  locked; built-in roles can't be deleted. Areas not yet converted are
  labelled "Not enforced yet". Logic lives in `src/lib/role-admin.ts`, with
  thin `'use server'` wrappers in `roles.ts`.
- **Safety for unconverted checks:** a member's legacy `User.role` =
  `legacyRoleFor(role)`. That's Owner only for the Owner role, Producer only
  if at least Producer-open, else Collaborator, so a custom role never gets
  more than it grants anywhere. Editing a role re-syncs its members.
  Accepting an invite uses the role as it is then. The editor warns when an
  edit to a built-in role would lower that.
- **Team page:** per-member dropdowns of workspace roles, and invites pick
  one (the email shows its name). You can't change your own role. The last
  Owner can't be demoted, with Owner rows locked FOR UPDATE so concurrent
  demotions serialise. `changeMemberRole` is removed. Team listings are now
  gated (they were callable by anyone).
- **Project scope is enforced:** `requireProjectAccess` / `checkProjectAccess`
  use the workspace role's ALL/ASSIGNED scope. The overview's leftover legacy
  assignment check is gone.
- The webhook's same-workspace branch is create-only, so it can't clobber an
  accepted invite's custom role.
- Managing roles needs Team & roles EDIT and the legacy Owner role while
  Settings, Team and the nav are still Owner-gated.
- pitfall-reviewer found 1 medium (an invite keeping a stale legacy role) and
  2 low (the concurrent last-Owner race, Producer edits demoting); all fixed
  and DB-verified, including a real concurrent demotion.
- **Needs a manual pass:**
  - Settings → Roles: create "Vendor coordinator" from Collaborator; set
    Crew + Deal memos to Edit under project areas.
  - Team: switch a member's role. Invite with a custom role.
  - Project roles per person arrive in 3b.

### 2026-10-01 — Roles Phase 2 (2/n): crew + deal memos enforce permissions
- The vendor-coordinator case: a project role with crew and deal memos Edit
  manages vendors on that project without seeing the budget's money.
- **Deal memos:**
  - Every memo action resolves the memo to its project, then needs
    `dealMemos` EDIT; creating a bid needs it too.
  - Without `budget.costs` the bid's day rate prefills from the person's own
    rate, not the budget line.
  - The board and editor need `dealMemos` VIEW. Budget comparisons (line rate,
    budgeted, vs budget, "Use the budget rate") are stripped server-side
    without `budget.costs`, and edit controls hide without EDIT.
  - Workspace deal-memo defaults stay on the legacy role until the settings
    slice.
- **Crew:**
  - Reads need `crew` VIEW. Add and seed need `crew` EDIT. Update, remove and
    dismiss verify that the member belongs to the project the client named,
    which nothing checked before.
  - What crew are paid follows `dealMemos`: rates are stripped on read, kept on
    save when hidden, and their inputs hidden. Budget-seeded "Unassigned"
    placeholder rates also need `budget.costs`.
  - Viewers no longer trigger auto-seeding.
- **People search for project staffing** (user decision): without Rolodex,
  crew or deal memos Edit on a project allows searching names and roles only,
  with no email match. Email, phone and rate are filled in server-side when
  someone is added, and only for those names-only callers. Rolodex users are
  unchanged.
- pitfall-reviewer found 4 issues, then 4 more on re-check (an Owner
  email/phone refill regression, email probing, a placeholder rate wipe, the
  add-then-read route). All fixed except add-then-read, which is by design:
  people on your project show their details.

### 2026-10-01 — Roles Phase 2 (1/n): budget + overview enforce permissions
- Asked for: a Collaborator on a project saw the budget down to rates and
  line totals. Now the default Collaborator sees lines, quantities and units
  with no money. Project roles can grant costs or margin per project.
- **Writes:** every budget/section action (`budgets.ts`, `sections.ts`,
  `importToBudget`) now goes through `requireBudgetPermission`
  (`src/lib/budget-access.ts`). It resolves any line, account, phase, section
  or budget id to its project in the ACTIVE workspace and checks:
  - `budget.lines` for structure
  - `budget.costs` for rates, packages, imports and template starts
  - `budget.margin` for fee, tax and discount
  - `overview` for the proposal overview text
  - `proposals` for the primary version and option tabs

  `upsertLineItem` keeps stored rate and markup when the caller can't edit
  them. Cloning another project's budget needs Producer-level browse
  (`canBrowseAllBudgets`). Empty ids are refused.
- **Reads:** `stripBudgetForAccess` zeroes rates and rate cards, and drops
  tax, without costs; without margin it strips fee and discount. It's applied
  on the budget page and the overview. The overview's priced preview, money
  blocks, the editor's columns and inputs, the line modal and the bulk bar
  each follow their own area. Project tabs follow permissions; crew,
  schedule and call-sheet pages check their area. Grid and dashboard money
  follow `dashboardMoney`; ASSIGNED scope filters the lists.
- **Access diff before shipping:** only darkustigrus × Sheeshyams changed
  (costs View → None). The user kept Collaborator call sheets on Edit, and
  the 11 stored Collaborator roles were updated with AuditEvents.
- pitfall-reviewer found 2 medium + 4 low issues, then 3 low on re-check:
  - clone scope
  - actuals summary
  - empty-id gate
  - multi-project moves
  - dead buttons
  - clone margin

  All fixed except the template-start follow-up.
- **Needs a manual pass:** as the test Collaborator on Sheeshyams, the budget
  and overview should show lines without $. As an Owner, nothing changes.

### 2026-10-01 — Call sheets and comments check project access
- All 8 call-sheet actions (via `getOwnedSheet`, `importCrewFromBudget`,
  `createCallSheet`) and `addProjectComment` only checked the workspace. A
  Collaborator could edit, send, finalize or delete call sheets — or comment —
  on projects they aren't assigned to. Now `checkProjectAccess` is required,
  with the same "not found" message. Collaborators still work on their
  assigned projects' sheets; roles Phase 2 applies the `callSheets` level.

### 2026-10-01 — Roles Phase 1: workspace roles + project roles (data model, no behaviour change)
- Migration `20261001000001_workspace_and_project_roles`: `WorkspaceRole`,
  `WorkspaceMember`, `ProjectRole`; `ProjectTeamMember.projectRoleId` (legacy
  `role` slot now nullable); `WorkspaceInvitation.roleId`.
- **Model** (decided with the user): workspace role = workspace pages +
  project scope (all / assigned) + a baseline for inside projects; project
  role = per person per project. Effective = max(baseline, project roles),
  then caps (costs ≤ lines, margin ≤ costs). Owner always full.
- `src/lib/permissions.ts`: catalog, presets, rules (jest). The Collaborator
  preset is lines without money — the one intended change from today, applied
  when Phase 2 enforces.
- `src/lib/access.ts`: `getAccess` / `getProjectAccess` /
  `requirePermission` / `requireProjectPermission`. Nothing enforces through it
  yet. It falls back to `User.role` presets without a membership.
- `src/lib/roles.ts`: system role seeding, plus a membership mirror on every
  join, role change, removal, leave, create and lazy sign-up.
- Everyone on a project now has a project role. "Also on this project"
  people are "Team member" rows, and a replaced or unassigned holder who
  keeps access becomes one.
- Removing a workspace member now also drops their project access.
- The workspace purge cron clears team rows first: their User FK has no
  cascade, so purging any workspace with a team failed.
- Backfill `scripts/backfill-roles.ts` **applied 2026-10-01** (user-approved):
  - roles seeded in 11 workspaces
  - 12 memberships (including the Owner one in "A NEW SPACE" from Clerk admin)
  - 11 team slots mapped
  - 1 Team member row
  - 35 AuditEvents
  The parity script confirmed memberships match `User.role`, the resolver
  equals today's `requireRole` outcomes, and every assignment has an active
  team row.
- pitfall-reviewer found 5 issues (replaced-holder access, removed members'
  leftover assignments, backfill timeout, purge FK order, history noise); all
  fixed and DB-verified.

### 2026-10-01 — Invite fixes, rolodex hidden from Collaborators, more people per project
- **Invite flow:**
  - The invite page labelled every non-Owner as "Producer"; it now shows the real role.
  - A new account was asked to create its own org: Clerk's choose-organization step
    took over before the invite redirect. `ClerkProvider taskUrls` now routes that
    step to `/join`, which sends anyone with a pending invite to it. Accepting
    makes the joined workspace active (`setActive`).
  - Accepting now requires a verified email matching the invite. Before, anyone
    with the link could join with the invited role.
  - The mobile sign-in redirect keeps the return URL.
- **Rolodex is Owner/Producer only:** nav, both pages (jest-guarded with the
  other Owner/Producer sections), every rolodex read action, and the call-sheet
  editor's contact picker.
- **Project team:** an "Also on this project" list under the 3 named roles, with
  + Add person (any workspace member) and remove. It's backed by
  `ProjectAssignment`, which is what gives a Collaborator access. This replaces
  the overview's separate "Assign" button. Team reads now check project access.
- No migration. pitfall-reviewer found 2 issues (call-sheet contacts leak,
  mobile redirect query); both fixed.
- **Needs a manual pass:**
  - Invite a fresh email. Sign-up should land on the invite (not "create
    organization"), then on Accept go to the dashboard in that workspace.
  - Signing in with another email should show the mismatch message.
  - Collaborator: no Rolodex. Team modal: + Add person.

### 2026-10-01 — Roles Phase 0: close Collaborator read leaks
- First step of configurable roles (plan: Phase 1 data model + resolver,
  Phase 2 permission enforcement, Phase 3 Settings → Roles UI). No migration.
- Writes were already gated (179 Owner/Producer, 17 Owner). Reads weren't. A
  Collaborator could see:
  - the dashboard money, every invoice and proposal, clients, actuals,
    receipts, the wrap-report PDF and rate cards
  - any project's tabs by URL
- **Fix:**
  - `src/lib/project-access.ts` — `requireProjectAccess` (assignment-aware)
    on every `projects/[id]` page, with a jest coverage test so a new tab
    can't skip it.
  - `requireFinancialPageAccess` on the money pages and tabs.
  - Read actions gated: actuals, wrap, receipts, invoice send data, payment
    config (now `select`ed), merge-tag context, packages, rate-card search,
    project activity, crew list.
  - The dashboard and project grid stop *fetching* money for Collaborators.
  - The overview stops sending proposals, invoices and client contact info.
  - Crew rates and rolodex project history are filtered to assigned
    projects, with rates stripped. Contact default/kit rates are stripped
    from every rolodex read.
  - Nav hides dead links.
- **Also fixed:** the call-sheet page rendered another project's sheet if
  given its id, and its `generateMetadata` read titles by id across
  workspaces.
- pitfall-reviewer found 7 further leaks after the first pass, and 1 more
  (contact rates) on re-check; all closed.
- **Needs a manual pass:** log in as a Collaborator — the sidebar and project
  tabs should hide money pages, an unassigned project URL should 404, and the
  dashboard should show assigned projects with no Value column.

### 2026-09-30 — Deal memos, Phase 1 (bids → confirmed memos → crew + actuals)
- Migrations `20260930000001_deal_memos` and `20260930000002_actual_entry_ownership`.
- **Model:** a bid *is* a draft deal memo. Several BIDs per budget crew line
  are compared on `/projects/[id]/deal-memos`. Awarding flips one to CONFIRMED
  (compare-and-set, headcount-capped, other bids closed when the line fills)
  and fills the crew slot: same person + role → else the "Unassigned"
  placeholder → else a new member (`src/lib/deal-memo-effects.ts`).
- **Internal vs external:** vendors only ever see `toVendorDealMemo`
  (`src/lib/deal-memo-vendor-view.ts`), a whitelisted DTO. Role label, budget
  links, internal notes and client rates can't leak by construction.
  Owner/Producer only.
- **Terms:** Settings → Contracts has Client / Crew & vendor tabs
  (`ContractBlock.audience`). Every proposal-side read filters CLIENT. Memo
  defaults (10/12-hour day, OT rules, zone, per diem, mileage, the 5 standard
  fee rows) live in `Workspace.dealMemoDefaults`.
- **Actuals:** the pure planner `src/lib/deal-memo-actuals.ts` runs on sheet
  create and on every Actuals load. Day rate/OT land on the role line, kit on
  the person's kit line, and anything else — or any fee — on a budget line
  chosen per fee (e.g. stylist kit → Wardrobe). Unmapped fees become
  unbudgeted rows under the role's account. Amounts the user typed or
  receipts set (`amountUserOwned`) are never overwritten, including a $0.
- **Prefill rule:** a bid's day rate starts from the budget line rate — that's
  the planned cost; the agency fee/markup sits on top. Falls back to the
  person's rolodex rate when unbudgeted. Fee terms are stored as merge-tag
  templates but shown filled in (editing replaces the template).
- **Also fixed:** `updateActualEntry` / `deleteAdHocEntry` wrote by entry id with
  no workspace check; the Actuals editor silently hid unbudgeted rows with no
  account (now an "Unbudgeted" group).
- pitfall-reviewer found 7 issues pre-ship (user $0 overwritten, receipts
  overwritten, FLAT quantity inflation, stale-line writes, duplicate race,
  cross-role crew clobber, over-award) — all fixed and DB-verified.
- **Phase 2:** shipped 2026-10-05 (vendor link, e-signature, email, cancel) — see above.

### 2026-09-30 — Agent protocol + signing audit-trail hardening
- `CLAUDE.md`, `/feature`, `/health-check`, `pitfall-reviewer`, this log, and
  `scripts/health-data-checks.ts` (6fdd465).
- First pitfall-reviewer run (on fe6d9e2) found that a failure in the new
  post-approval side effects could skip the signature AuditEvent and owner
  email after the approval had committed. Those effects are now non-fatal.

### 2026-09-30 · fe6d9e2 — Signed proposals no longer revert on re-open
- Root cause: `recordProposalView` set `status: 'VIEWED'` on every public view,
  downgrading APPROVED/DECLINED/LOST/CHANGES_NEEDED. Now only SENT → VIEWED.
- E-signature now runs the same won effects as manual "Won" (Lead → Active, team
  reconcile) via `src/lib/proposal-won.ts`; public route uses `scopedDbFor()`.
- Backfill: 3 proposals restored to APPROVED with AuditEvents; Daadi project → Active.

### 2026-09-29 · 588d9cb — Money shows real cents
- `formatMoney` shows two decimals when cents are non-zero, none otherwise.
  Local whole-dollar formatters removed. Display only — stored cents were always right.

### 2026-09-18 · 23664ff — Dashboard QoL
- Recent projects Value column wired to primary-phase gross total (was a literal "—").
- Proposals-sent and Outstanding-invoices KPI cards link to their pages.

### 2026-09-18 · 14da093 — "Mark as sent" confirm said Delete
- `useConfirm` defaults `confirmLabel` to "Delete"; passed "Confirm". Only offender.

### 2026-09-18 · b80e24f — Active project cards show Budget / Paid
- Active-status branch never looked at payments. Now Budget (gross) + Paid
  (sum of PAID invoices) with a checkmark when paid in full.

### 2026-09-17 · df200fb — Edit/preview any budget version's overview
- Version dropdown, "Make primary", full-screen `ProposalPublicView isDraft`
  preview on the Proposal Overview card. No new actions or queries.

### 2026-09-17 · cdfb7bf, 2adc9e8 — Client-facing proposal option tabs
- `Phase.showAsProposalOption` (migration `20260917000002`). Options are phases
  of one budget, frozen at send in `content.proposalOptions`; top-level content
  stays the primary for backward compatibility. Approving a non-primary option
  records its total and promotes it to primary. PDF renders options in sequence.
- Switch state is derived from persisted flags (2adc9e8) so it survives refresh.

### 2026-09-17 · 2bbc9cf, f88f6e9 — Clone budget from an existing budget
- `Budget.clonedFromBudgetId` (migration `20260917000001`), rate-refresh preview,
  single-transaction clone. Picker lives on the budget page, not NewProjectModal.

### 2026-08-20 · 4266deb — Invoice terms label matches the chosen due date
- `deriveInvoicePaymentTerms()`; backfilled 6 invoices.

### 2026-08-11 · 0cc0d88 — Mark invoice as sent without emailing
- Split send button (icon + chevron menu) on all three invoice tables; inline
  success state instead of a toast.

### 2026-07-31 · aefa018 — Proposal breakdown double-counted the agency fee
- `productionCents` in the snapshot is now pre-fee. The invoice-side version
  (e9af7de) was reverted (78a9ed1): invoices must not strip the fee.
