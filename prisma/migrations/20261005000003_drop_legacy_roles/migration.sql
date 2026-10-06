-- Roles cleanup: drop the legacy fixed role. A person's role is their
-- WorkspaceMember → WorkspaceRole; a project role is ProjectTeamMember →
-- ProjectRole. Nothing reads or writes these columns since the cleanup deploy
-- (run this only AFTER that deploy is live). Indexes on the dropped columns
-- (incl. ProjectTeamMember_active_role_unique) are dropped with them.
-- Destructive: User.role / WorkspaceInvitation.role / ProjectTeamMember.role
-- values are discarded (all superseded; pre-checks on 2026-10-05 were clean).

ALTER TABLE "User"                DROP COLUMN IF EXISTS "role";
ALTER TABLE "WorkspaceInvitation" DROP COLUMN IF EXISTS "role";
ALTER TABLE "ProjectTeamMember"   DROP COLUMN IF EXISTS "role";

DROP TYPE IF EXISTS "UserRole";
DROP TYPE IF EXISTS "ProjectTeamRole";
