-- Invoice archive: an archived invoice is hidden from invoice lists but still
-- counts in dashboard and project totals. Additive only — both columns are
-- nullable with no backfill; every existing invoice stays active.

ALTER TABLE "Invoice"
  ADD COLUMN "archivedAt"   TIMESTAMP(3),  -- when it was archived (null = active)
  ADD COLUMN "archivedById" TEXT;          -- User.id who archived it (soft ref)
