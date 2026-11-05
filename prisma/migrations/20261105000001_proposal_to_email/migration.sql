-- Proposal "To" address, editable per proposal in the send window.
-- Additive and nullable: NULL means "the client's contact email" (every
-- existing proposal keeps sending exactly where it does today). The CC list
-- stays in "recipientEmails". The To address may also e-sign.
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "toEmail" TEXT;
