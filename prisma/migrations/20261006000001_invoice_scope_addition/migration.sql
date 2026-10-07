-- Invoice-first billing: an invoice billed on top of a won project's agreed
-- total (scope increase). Counted in the project's value; the budget itself
-- is left as approved. Additive, defaults to false for every existing invoice.
ALTER TABLE "Invoice" ADD COLUMN "isScopeAddition" BOOLEAN NOT NULL DEFAULT false;
