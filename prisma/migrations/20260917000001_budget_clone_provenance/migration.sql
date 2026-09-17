-- Provenance only — nullable, no FK, no cascade. Records which budget a
-- cloned budget started from (NEW_BUDGET clone mode). Idempotent so it's
-- safe to re-run.
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "clonedFromBudgetId" TEXT;
