-- Client: legal entity name for invoice "Bill To" header
ALTER TABLE "Client" ADD COLUMN "legalName" TEXT;

-- Invoice: short payment terms label (e.g. "Net 30") distinct from the full terms text
ALTER TABLE "Invoice" ADD COLUMN "paymentTerms" TEXT;
