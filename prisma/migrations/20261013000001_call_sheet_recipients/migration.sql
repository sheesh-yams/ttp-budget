-- Call sheet emails: one row per person a call sheet was emailed to, with
-- their own link token and Sent / Opened / Confirmed tracking.
-- Additive only: a new table; nothing existing changes.
CREATE TABLE "CallSheetRecipient" (
  "id"            TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "callSheetId"   TEXT NOT NULL,
  "token"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "personKey"     TEXT NOT NULL,          -- "contact:<id>" or "email:<lowercased>"
  "group"         TEXT NOT NULL,          -- CREW | TALENT | OTHER
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "role"          TEXT,
  "contactId"     TEXT,
  "lastSent"      JSONB,                  -- what their latest email said
  "lastSentAt"    TIMESTAMP(3),
  "sendCount"     INTEGER NOT NULL DEFAULT 0,
  "lastEmailId"   TEXT,
  "lastError"     TEXT,
  "firstViewedAt" TIMESTAMP(3),
  "lastViewedAt"  TIMESTAMP(3),
  "confirmedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallSheetRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallSheetRecipient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallSheetRecipient_callSheetId_fkey" FOREIGN KEY ("callSheetId") REFERENCES "CallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CallSheetRecipient_token_key" ON "CallSheetRecipient"("token");
CREATE UNIQUE INDEX "CallSheetRecipient_callSheetId_personKey_key" ON "CallSheetRecipient"("callSheetId", "personKey");
CREATE INDEX "CallSheetRecipient_workspaceId_idx" ON "CallSheetRecipient"("workspaceId");
