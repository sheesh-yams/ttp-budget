-- Deal memo prefill safety (found in pre-ship review):
-- 1. amountUserOwned marks an actuals amount the user typed (or that receipts
--    set) so prefill never overwrites it — including a deliberate $0.
-- 2. One prefill entry per deal memo fee per sheet, so two concurrent Actuals
--    page loads can't both create it and double-count the fee. NULL
--    dealMemoFeeId (every existing entry) never collides.
-- Additive; no existing row changes.

-- AlterTable
ALTER TABLE "ActualEntry" ADD COLUMN     "amountUserOwned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "ActualEntry_actualSheetId_dealMemoFeeId_key" ON "ActualEntry"("actualSheetId", "dealMemoFeeId");

