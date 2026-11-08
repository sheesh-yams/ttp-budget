-- Client defaults that pre-fill new invoices/proposals. Additive with defaults:
-- NULL terms = workspace default, empty CC lists = nothing extra. No existing
-- proposal or invoice is changed.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "invoiceCcEmails"  TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "proposalCcEmails" TEXT[] NOT NULL DEFAULT '{}';

-- Extra people at a client (the main contact stays on "Client").
-- isBilling: invoices default To this person (at most one per client, enforced in app).
CREATE TABLE IF NOT EXISTS "ClientContact" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "clientId"    TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "title"       TEXT,
  "email"       TEXT,
  "phone"       TEXT,
  "isBilling"   BOOLEAN NOT NULL DEFAULT false,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ClientContact_clientId_idx"    ON "ClientContact"("clientId");
CREATE INDEX IF NOT EXISTS "ClientContact_workspaceId_idx" ON "ClientContact"("workspaceId");
