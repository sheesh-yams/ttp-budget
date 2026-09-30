---
name: feature
description: Build or change a SlateSuite feature end-to-end using this project's protocol — audit the code against the request, ask only the questions that matter, get the plan approved, gate on migrations, build in phases, verify, get an independent review, ship to main, and log it. Use for any new feature or multi-file change (e.g. deal memos, vendor tracking, contracts, dashboard changes).
---

# /feature — SlateSuite feature protocol

Follow the phases in order. **STOP** means end your turn and wait for the user.
Read `CLAUDE.md` first if it isn't already in context.

## 0. Intake
- Restate the goal in 2–3 sentences, in the user's terms.
- Read `docs/FEATURE_LOG.md` for related shipped work, decisions and follow-ups.

## 1. Audit (read-only)
- Find the code this touches. Prefer `grep`/Read for known targets; use one
  Explore agent only when the scope is genuinely unclear.
- **Check every assumption in the request against the code.** Specs here have
  often named fields, functions or flows that don't exist or differ
  (`parentAccountId` vs `parentId`, `orderIndex` vs `order`, a
  `markProposalAsSent` that was never written). List each discrepancy.
- Reuse before building. Existing platform pieces:
  - public token pages with expiry, rate limiting and guarded view recording
  - e-signature with email verification, IP and a frozen snapshot
    (`api/proposals/[id]/approve`)
  - react-pdf documents (`ProposalPDF`, `InvoicePDF`, `WrapReportPDF`)
  - email (`src/lib/email.ts`), merge tags (`src/lib/merge-tags.ts`)
  - audit events (`logAuditEvent`), contract sections + library (`ContractTab`)
  - rolodex contacts, project members/crew with rates, call sheets, actuals
- For a **new domain** (deal memos, vendors, contracts…), answer the checklist
  below in the audit report.
- Report: what exists, what's reusable, discrepancies, and the **exact questions**
  that need an answer (each with a recommended default). If the user asked to
  review first, or there are real decisions, **STOP**.

### New-domain checklist
1. Does it overlap something that exists? (Vendors vs rolodex contacts; deal
   memos vs project members/crew rates; contracts vs proposal contract sections.)
   Extend before creating a parallel model.
2. Owner: Workspace, Client, Project, or Budget? Cascade behaviour on delete?
3. Who can see and edit it (OWNER / PRODUCER / COLLABORATOR)? Any margin-
   sensitive fields that need server-side stripping?
4. Does an outside party see it via a link? → token + expiry + rate limit +
   guarded view recording. Do they sign it? → reuse the approve-route pattern.
5. Status lifecycle: list the statuses, which are terminal, what moves each one,
   and where side effects live (a `src/lib/*-effects.ts` module, not inline).
6. PDF? Email? Audit events for which transitions?
7. Where does it surface: project page section, list page, dashboard metric,
   project card, nav?
8. Money in cents via `formatMoney`; totals via existing helpers.

## 2. Plan
- For multi-file work use plan mode (EnterPlanMode → plan file → ExitPlanMode).
- The plan covers: context, data model (fields, relations, `workspaceId` +
  `SCOPED_MODELS`, indexes, defaults), server actions and role gates, UI
  surfaces, public flows, backward compatibility of any stored JSON, and a
  verification section.
- Use AskUserQuestion only for real forks: 2–4 distinct options, recommended
  first. State one-option "questions" as decisions instead.

## 3. Migration gate (if the schema changes)
Write the SQL per `CLAUDE.md`, show it, and **STOP** until the user confirms it
ran in Neon. Then `npx prisma generate`.

## 4. Build
- Work in the phases the plan names. Run `npx tsc --noEmit` after each one.
- Stay in scope. Note out-of-scope bugs you spot in `docs/FEATURE_LOG.md`
  follow-ups (or offer a spawn_task chip) instead of fixing them silently.

## 5. Verify
Run everything in `CLAUDE.md` → "Verify before every push". For stateful logic,
the throwaway script should assert the golden path **and** the edge cases the
plan named (terminal statuses, wrong workspace, empty/single-item cases).

## 6. Independent review
Spawn the `pitfall-reviewer` agent with the commit range or `git diff` scope and
one sentence on what the feature does. Fix confirmed findings, re-verify.

## 7. Data (only if existing rows need changing)
Read-only discovery script → show definite vs ambiguous rows → ask →
guarded transaction + `AuditEvent` per row → print the verified end state.

## 8. Ship
Stage files by name, commit with a why-focused message ending in the attribution
line, push to `main`. Tell the user in a few lines: what changed, what was
verified, and what needs their manual click-through.

## 9. Log
Append an entry to `docs/FEATURE_LOG.md`: date, commit(s), what shipped, key
decisions and why, migrations, follow-ups. Commit it with the feature or right
after.
