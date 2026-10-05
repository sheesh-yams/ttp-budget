-- Deal memos Phase 2: vendor link, e-signature, guarded cancel.
-- Additive only — all new columns are nullable; existing memos are unaffected.
-- CONFIRMED still means "awarded"; sent / viewed / signed are timestamps.

ALTER TABLE "DealMemo"
  ADD COLUMN "publicToken"          TEXT,          -- the vendor link /dm/[token]
  ADD COLUMN "publicTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "sentAt"               TIMESTAMP(3),
  ADD COLUMN "sentToEmail"          TEXT,          -- the signer must use this address
  ADD COLUMN "sentSnapshot"         JSONB,         -- frozen vendor view at send
  ADD COLUMN "firstViewedAt"        TIMESTAMP(3),
  ADD COLUMN "lastViewedAt"         TIMESTAMP(3),
  ADD COLUMN "signedAt"             TIMESTAMP(3),
  ADD COLUMN "signatureName"        TEXT,
  ADD COLUMN "signatureEmail"       TEXT,
  ADD COLUMN "signatureIp"          TEXT,
  ADD COLUMN "cancelledAt"          TIMESTAMP(3),
  ADD COLUMN "cancelledById"        TEXT;

CREATE UNIQUE INDEX "DealMemo_publicToken_key" ON "DealMemo"("publicToken");
