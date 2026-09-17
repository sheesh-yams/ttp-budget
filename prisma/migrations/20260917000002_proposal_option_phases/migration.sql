-- Whether this phase should appear as a client-facing tab option on proposals
-- built from this budget (alongside the always-included primary phase).
-- Off by default — no existing phase starts visible.
ALTER TABLE "Phase" ADD COLUMN "showAsProposalOption" BOOLEAN NOT NULL DEFAULT false;
