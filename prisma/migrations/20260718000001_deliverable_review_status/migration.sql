-- Deliverable review workflow status (separate from the DRAFT/SHARED publish flag).
CREATE TYPE "DeliverableReviewStatus" AS ENUM ('NEEDS_REVIEW', 'DELIVERED', 'APPROVED', 'POSTED');
ALTER TABLE "DeliverableAsset" ADD COLUMN "reviewStatus" "DeliverableReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW';
