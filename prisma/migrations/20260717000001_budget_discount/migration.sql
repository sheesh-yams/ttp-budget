-- Budget-level discount — replaces the old per-proposal Proposal.content.discount.
-- Purely additive/nullable; existing budgets behave identically until a discount is set.
-- discountValuePct is a 0-1 fraction, matching markupPct/taxPct on the same row.
ALTER TABLE "Budget" ADD COLUMN "discountType" TEXT;
ALTER TABLE "Budget" ADD COLUMN "discountLabel" TEXT;
ALTER TABLE "Budget" ADD COLUMN "discountValueCents" INTEGER;
ALTER TABLE "Budget" ADD COLUMN "discountValuePct" DECIMAL(6,4);
