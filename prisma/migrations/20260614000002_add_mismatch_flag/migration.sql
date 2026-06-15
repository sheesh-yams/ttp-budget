-- AddColumn: mismatchFlag on ProjectMember
-- Run this in Neon's SQL Editor (console.neon.tech → project → SQL Editor).
ALTER TABLE "ProjectMember" ADD COLUMN IF NOT EXISTS "mismatchFlag" BOOLEAN NOT NULL DEFAULT false;
