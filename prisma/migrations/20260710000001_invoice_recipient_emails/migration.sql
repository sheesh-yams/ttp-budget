-- Invoice: additional recipient emails (CC) the invoice was sent to, beyond the
-- client contact email. The sender is bcc'd at send time (not stored here).
ALTER TABLE "Invoice" ADD COLUMN "recipientEmails" TEXT[] NOT NULL DEFAULT '{}';
