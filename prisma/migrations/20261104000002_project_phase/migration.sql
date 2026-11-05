-- Project phase: the detailed lifecycle stage shown on /projects
-- (Lead → Pre-prod → Production → Post → Invoicing → Offboarding).
-- Additive only. Project.status is unchanged and stays the coarse bucket the
-- rest of the app reads; the app keeps the two in step.
-- Existing projects all start at LEAD; non-Lead projects are filled in by a
-- separate, user-approved data script before the code ships.

CREATE TYPE "ProjectPhase" AS ENUM ('LEAD', 'PRE_PROD', 'PRODUCTION', 'POST', 'INVOICING', 'OFFBOARDING');

ALTER TABLE "Project" ADD COLUMN "phase" "ProjectPhase" NOT NULL DEFAULT 'LEAD';
ALTER TABLE "Project" ADD COLUMN "phaseChangedAt" TIMESTAMP(3);

CREATE INDEX "Project_workspaceId_phase_idx" ON "Project"("workspaceId", "phase");
