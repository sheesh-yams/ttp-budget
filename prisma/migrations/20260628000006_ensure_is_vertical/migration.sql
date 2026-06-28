-- Idempotent: adds isVertical if it wasn't applied via migration 000002.
-- Migration 000002 was marked resolved in Prisma history but the ALTER TABLE
-- may not have executed against the production database.
ALTER TABLE "DeliverableVersion" ADD COLUMN IF NOT EXISTS "isVertical" BOOLEAN NOT NULL DEFAULT false;
