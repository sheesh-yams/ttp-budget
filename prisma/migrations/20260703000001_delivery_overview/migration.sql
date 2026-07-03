-- Add overview field to DeliveryPage
-- Smart-text block (supports **bold** and [text](url)) shown between the hero and sections on the public page.
ALTER TABLE "DeliveryPage" ADD COLUMN "overview" TEXT;
