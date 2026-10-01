-- Roles Phase 1: configurable workspace roles + project roles.
-- Additive only. No existing behaviour reads these yet; a separate, approved
-- backfill seeds the default roles and memberships.

-- Which projects a workspace role can see.
CREATE TYPE "ProjectScope" AS ENUM ('ALL', 'ASSIGNED');

-- Project team rows get a configurable role. The old fixed-slot enum column
-- becomes nullable (still written alongside until every reader has moved).
ALTER TABLE "ProjectTeamMember" ADD COLUMN "projectRoleId" TEXT,
ALTER COLUMN "role" DROP NOT NULL;

-- Invitations can carry the workspace role to join with.
ALTER TABLE "WorkspaceInvitation" ADD COLUMN "roleId" TEXT;

-- Workspace roles (up to 7 per workspace; enforced in the app).
CREATE TABLE "WorkspaceRole" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemKey" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "projectScope" "ProjectScope" NOT NULL DEFAULT 'ASSIGNED',
    "workspacePermissions" JSONB NOT NULL DEFAULT '{}',
    "projectBaseline" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id")
);

-- One membership per user per workspace, with their role there.
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- Project roles (up to 7 per workspace; enforced in the app).
CREATE TABLE "ProjectRole" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemKey" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRole_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTeamMember_projectRoleId_idx" ON "ProjectTeamMember"("projectRoleId");

CREATE INDEX "WorkspaceRole_workspaceId_idx" ON "WorkspaceRole"("workspaceId");
CREATE UNIQUE INDEX "WorkspaceRole_workspaceId_name_key" ON "WorkspaceRole"("workspaceId", "name");
-- One role per system key per workspace (NULLs — custom roles — don't collide).
CREATE UNIQUE INDEX "WorkspaceRole_workspaceId_systemKey_key" ON "WorkspaceRole"("workspaceId", "systemKey");

CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX "WorkspaceMember_roleId_idx" ON "WorkspaceMember"("roleId");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

CREATE INDEX "ProjectRole_workspaceId_idx" ON "ProjectRole"("workspaceId");
CREATE UNIQUE INDEX "ProjectRole_workspaceId_name_key" ON "ProjectRole"("workspaceId", "name");
CREATE UNIQUE INDEX "ProjectRole_workspaceId_systemKey_key" ON "ProjectRole"("workspaceId", "systemKey");

-- A role still in use can't be deleted (RESTRICT); a deleted role clears
-- pending invitations' choice (SET NULL).
ALTER TABLE "ProjectTeamMember" ADD CONSTRAINT "ProjectTeamMember_projectRoleId_fkey" FOREIGN KEY ("projectRoleId") REFERENCES "ProjectRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceRole" ADD CONSTRAINT "WorkspaceRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
