-- The studio's time zone (IANA name). Decides when a proposal's "valid
-- through" day ends and which day "Accepted" shows. Additive with a default:
-- every workspace starts on Eastern; editable in Settings → Workspace.
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT 'America/New_York';
