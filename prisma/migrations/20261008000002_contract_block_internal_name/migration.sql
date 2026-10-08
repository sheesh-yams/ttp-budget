-- Contract blocks: an internal name for the library (e.g. "SOW – Talent").
-- Only shown inside SlateSuite; the public heading on contracts stays "title".
-- Optional — existing blocks keep showing their title until one is set.
ALTER TABLE "ContractBlock" ADD COLUMN "internalName" TEXT;
