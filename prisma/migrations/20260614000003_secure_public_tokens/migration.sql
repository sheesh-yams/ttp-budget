-- Migration: secure_public_tokens
-- Replaces the CUID default on publicToken columns with gen_random_uuid()
-- which generates cryptographically random UUID v4 at the database level.
--
-- This is a lightweight DDL-only operation: no rows are rewritten, no locks
-- are held for more than a moment.  Run in Neon SQL Editor.
--
-- To rotate EXISTING tokens (recommended) run scripts/rotate-public-tokens.ts
-- AFTER applying this migration.

-- ── Proposal ────────────────────────────────────────────────────────────────
ALTER TABLE "Proposal"
  ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- ── Invoice ──────────────────────────────────────────────────────────────────
ALTER TABLE "Invoice"
  ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;

-- ── CallSheet ────────────────────────────────────────────────────────────────
ALTER TABLE "CallSheet"
  ALTER COLUMN "publicToken" SET DEFAULT gen_random_uuid()::text;
