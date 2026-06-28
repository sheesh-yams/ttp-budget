-- Add isVertical flag to DeliverableVersion for portrait/vertical content detection
ALTER TABLE "DeliverableVersion" ADD COLUMN "isVertical" BOOLEAN NOT NULL DEFAULT false;
