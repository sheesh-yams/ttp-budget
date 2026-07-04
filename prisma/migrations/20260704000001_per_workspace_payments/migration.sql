-- Migration: per_workspace_payments
-- Extends the payment layer from single-tenant (one global env-var token) to
-- per-workspace providers. Adds Stripe Connect support, an entitlement gate
-- for Helcim, and encrypted per-workspace credential storage.
--
-- Safe to re-run (all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── 1. Extend PaymentProvider enum ──────────────────────────────────────────
-- STRIPE is the new default; HELCIM remains for entitled workspaces only.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'STRIPE';

-- ── 2. Extend WorkspacePaymentConfig ────────────────────────────────────────

-- Entitlement flag: Helcim is invite-only; no UI exists to flip this.
ALTER TABLE "WorkspacePaymentConfig"
  ADD COLUMN IF NOT EXISTS "helcimEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Stripe Connect (Standard): only identifiers stored, never secrets.
ALTER TABLE "WorkspacePaymentConfig"
  ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeOnboardedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Helcim: references to encrypted credential rows, never raw tokens.
ALTER TABLE "WorkspacePaymentConfig"
  ADD COLUMN IF NOT EXISTS "helcimCredentialId" TEXT,
  ADD COLUMN IF NOT EXISTS "helcimWebhookVerifierId" TEXT;

-- Unique indexes for the nullable FK-like reference columns.
-- PostgreSQL UNIQUE treats NULLs as distinct, so multiple NULLs are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspacePaymentConfig_stripeAccountId_key"
  ON "WorkspacePaymentConfig"("stripeAccountId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspacePaymentConfig_helcimCredentialId_key"
  ON "WorkspacePaymentConfig"("helcimCredentialId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspacePaymentConfig_helcimWebhookVerifierId_key"
  ON "WorkspacePaymentConfig"("helcimWebhookVerifierId");

-- workspaceId index (Prisma generates this for @@index([workspaceId]))
CREATE INDEX IF NOT EXISTS "WorkspacePaymentConfig_workspaceId_idx"
  ON "WorkspacePaymentConfig"("workspaceId");

-- ── 3. EncryptedCredential table ─────────────────────────────────────────────
-- AES-256-GCM envelope encryption for third-party payment credentials.
-- KEK source: CREDENTIAL_KEK_V<n> env vars. See src/lib/crypto/credentials.ts.

CREATE TABLE IF NOT EXISTS "EncryptedCredential" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT        NOT NULL,
  "kind"        TEXT        NOT NULL,   -- 'HELCIM_API_TOKEN' | 'HELCIM_WEBHOOK_VERIFIER'
  "ciphertext"  BYTEA       NOT NULL,
  "iv"          BYTEA       NOT NULL,
  "authTag"     BYTEA       NOT NULL,
  "keyVersion"  INTEGER     NOT NULL,
  "last4"       TEXT        NOT NULL,   -- display-only; never derive anything from this
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt"   TIMESTAMP(3),
  CONSTRAINT "EncryptedCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EncryptedCredential_workspaceId_idx"
  ON "EncryptedCredential"("workspaceId");

-- ── Post-migration: grant Helcim entitlement to TTP workspace ────────────────
-- Run this manually AFTER verifying the migration applied cleanly.
-- Replace the workspace name if needed; verify exactly 1 row updated.
--
-- UPDATE "WorkspacePaymentConfig" SET "helcimEnabled" = true
--   WHERE "workspaceId" = (
--     SELECT id FROM "Workspace" WHERE name ILIKE '%third place%' LIMIT 1
--   );
-- Verify: SELECT "workspaceId", "helcimEnabled" FROM "WorkspacePaymentConfig"
--   WHERE "workspaceId" = (SELECT id FROM "Workspace" WHERE name ILIKE '%third place%' LIMIT 1);
