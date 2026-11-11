-- People per client: one Main contact and role tags that pick defaults on documents.
ALTER TABLE "ClientContact" ADD COLUMN IF NOT EXISTS "isMain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientContact" ADD COLUMN IF NOT EXISTS "roles"  TEXT[]  NOT NULL DEFAULT '{}';
-- Existing billing flags become the BILLING role (isBilling is no longer read).
UPDATE "ClientContact" SET "roles" = array_append("roles", 'BILLING')
  WHERE "isBilling" AND NOT ('BILLING' = ANY("roles"));
-- At most one Main person per client.
CREATE UNIQUE INDEX IF NOT EXISTS "ClientContact_one_main_per_client"
  ON "ClientContact"("clientId") WHERE "isMain";

-- Who each document is for: a snapshot { contactId, name, title, email, phone }.
-- NULL = not chosen yet → today's behaviour (the client's main contact).
ALTER TABLE "Invoice"   ADD COLUMN IF NOT EXISTS "billTo"         JSONB;
ALTER TABLE "Proposal"  ADD COLUMN IF NOT EXISTS "clientContacts" JSONB;
ALTER TABLE "CallSheet" ADD COLUMN IF NOT EXISTS "clientContacts" JSONB;
