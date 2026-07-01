-- Migration: 20260701000001_project_team
-- Adds ProjectTeamRole enum, ProjectTeamMember table, and partial unique index
-- for enforcing one active holder per role per project.

-- 1. Enum
CREATE TYPE "ProjectTeamRole" AS ENUM ('PROJECT_LEAD', 'ACCOUNT_MANAGER', 'PROJECT_MANAGER');

-- 2. Table
CREATE TABLE IF NOT EXISTS "ProjectTeamMember" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "workspaceId"         TEXT NOT NULL,
  "projectId"           TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "userId"              TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "role"                "ProjectTeamRole" NOT NULL,
  "assignedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedByUserId"    TEXT,
  "unassignedAt"        TIMESTAMP(3),
  "unassignedByUserId"  TEXT,
  "unassignReason"      TEXT
);

-- 3. Standard indexes
CREATE INDEX IF NOT EXISTS "ProjectTeamMember_projectId_role_idx"
  ON "ProjectTeamMember" ("projectId", "role");

CREATE INDEX IF NOT EXISTS "ProjectTeamMember_userId_idx"
  ON "ProjectTeamMember" ("userId");

CREATE INDEX IF NOT EXISTS "ProjectTeamMember_workspaceId_idx"
  ON "ProjectTeamMember" ("workspaceId");

CREATE INDEX IF NOT EXISTS "ProjectTeamMember_projectId_unassignedAt_idx"
  ON "ProjectTeamMember" ("projectId", "unassignedAt");

-- 4. Partial unique index: only one active (unassignedAt IS NULL) holder per role per project
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTeamMember_active_role_unique"
  ON "ProjectTeamMember" ("projectId", "role")
  WHERE "unassignedAt" IS NULL;
