-- BudgetSection: optional grouping layer between Phase and Account
-- Hierarchy: Phase → BudgetSection (always ≥1, default "Main") → Account → LineItem
-- Run in Neon SQL Editor, then: npx prisma generate && npx tsc --noEmit

-- ─── 1. Create BudgetSection table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "BudgetSection" (
    "id"          TEXT         NOT NULL,
    "workspaceId" TEXT         NOT NULL,
    "phaseId"     TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "description" TEXT,
    "orderIndex"  INTEGER      NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetSection_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BudgetSection_phaseId_fkey'
    ) THEN
        ALTER TABLE "BudgetSection"
            ADD CONSTRAINT "BudgetSection_phaseId_fkey"
            FOREIGN KEY ("phaseId") REFERENCES "Phase"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "BudgetSection_phaseId_orderIndex_idx"
    ON "BudgetSection"("phaseId", "orderIndex");

CREATE INDEX IF NOT EXISTS "BudgetSection_workspaceId_idx"
    ON "BudgetSection"("workspaceId");

-- ─── 2. Add sectionId to Account (nullable initially for backfill) ────────────

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "sectionId" TEXT;

-- ─── 3. Add new columns to Phase ─────────────────────────────────────────────

ALTER TABLE "Phase"
    ADD COLUMN IF NOT EXISTS "pageBreakBetweenAccounts" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Phase"
    ADD COLUMN IF NOT EXISTS "sectionsNudgeDismissedAt" TIMESTAMP(3);

-- ─── 4. Backfill: one "Main" BudgetSection per existing Phase ────────────────
-- Uses deterministic ID "sec_<phaseId>" for idempotency — safe to re-run.
-- Falls back to Budget.workspaceId when Phase.workspaceId is NULL (legacy rows).

INSERT INTO "BudgetSection" ("id", "workspaceId", "phaseId", "title", "orderIndex", "createdAt", "updatedAt")
SELECT
    'sec_' || p."id",
    COALESCE(p."workspaceId", b."workspaceId"),
    p."id",
    'Main',
    0,
    NOW(),
    NOW()
FROM "Phase" p
JOIN "Budget" b ON b."id" = p."budgetId"
WHERE NOT EXISTS (
    SELECT 1 FROM "BudgetSection" s WHERE s."id" = 'sec_' || p."id"
);

-- ─── 5. Point all existing accounts to their phase's "Main" section ──────────

UPDATE "Account" a
SET "sectionId" = s."id"
FROM "BudgetSection" s
WHERE s."phaseId" = a."phaseId"
  AND a."sectionId" IS NULL;

-- ─── 6. Make sectionId NOT NULL ──────────────────────────────────────────────
-- This will error if any accounts remain unlinked — intentional, so we detect gaps.

ALTER TABLE "Account" ALTER COLUMN "sectionId" SET NOT NULL;

-- ─── 7. Add FK + index for Account.sectionId ─────────────────────────────────

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Account_sectionId_fkey'
    ) THEN
        ALTER TABLE "Account"
            ADD CONSTRAINT "Account_sectionId_fkey"
            FOREIGN KEY ("sectionId") REFERENCES "BudgetSection"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Account_sectionId_idx" ON "Account"("sectionId");
