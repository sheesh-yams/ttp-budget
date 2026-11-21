-- Per-person appearance for the signed-in app: LIGHT (default) | DARK | SYSTEM.
-- Additive with a default: every existing user stays on Light. Client-facing
-- pages, PDFs and emails are never affected.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "themePreference" TEXT NOT NULL DEFAULT 'LIGHT';
