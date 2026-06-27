-- Workspace-level expiry defaults for proposals and invoices
-- Run in Neon SQL Editor, then: npx prisma generate && npx tsc --noEmit

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "proposalExpiryDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "invoiceExpiryDays" INTEGER NOT NULL DEFAULT 30;
