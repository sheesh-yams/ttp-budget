-- Proposal: additional recipient emails the proposal was sent to.
-- Combined with Client.contactEmail, this is the set of addresses allowed to e-sign.
ALTER TABLE "Proposal" ADD COLUMN "recipientEmails" TEXT[] NOT NULL DEFAULT '{}';

-- Proposal: the email the signer verified with at approval time (must have matched
-- contactEmail or one of recipientEmails). Null for proposals signed before this feature.
ALTER TABLE "Proposal" ADD COLUMN "signatureEmail" TEXT;
