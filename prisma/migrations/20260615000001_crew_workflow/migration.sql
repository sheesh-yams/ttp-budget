-- Magical Crew Workflow: link line items to Rolodex contacts + add kit fields to Contact
-- Run after: npx prisma generate

-- 1. Contact: kit opt-in fields
ALTER TABLE "Contact" ADD COLUMN "hasKit"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN "kitRateCents" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "kitName"      TEXT;

-- 2. LineItem: soft-link to the Rolodex contact who fulfills this line item (CREW use)
--    ON DELETE SET NULL: deleting/archiving a Contact clears the link but preserves the line item
ALTER TABLE "LineItem" ADD COLUMN "contactId" TEXT;
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LineItem_contactId_idx" ON "LineItem"("contactId");
