-- Prorated agency fee, shown as its own row below Subtotal on the invoice
-- (mirrors discountCents, added earlier). Existing invoices default to 0
-- and render with no Agency Fee row — no backfill needed.
ALTER TABLE "Invoice" ADD COLUMN "agencyFeeCents" INTEGER NOT NULL DEFAULT 0;
