-- Receipt details: amount, merchant, date for actuals reconciliation
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "amountCents"  INTEGER;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "merchantName" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "receiptDate"  TIMESTAMP(3);
