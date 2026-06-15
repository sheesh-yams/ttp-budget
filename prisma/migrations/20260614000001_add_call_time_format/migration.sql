-- AddColumn: callTimeFormat to Workspace
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "callTimeFormat" TEXT NOT NULL DEFAULT '12H';
