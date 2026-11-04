-- Shot list: one per project, with sections (a linked Schedule scene or a free
-- section), shots with an on-set status, and reference images per shot.
-- Additive: four new tables and two enums. Nothing existing is altered except
-- the role permission JSON backfill at the end (adds one key, changes none).

CREATE TYPE "ShotStatus" AS ENUM ('TO_SHOOT', 'DONE', 'SKIPPED');
CREATE TYPE "ShotReferenceKind" AS ENUM ('UPLOAD', 'LINK');

-- One per project, created on the first edit. publicToken backs /sl/[token],
-- which only works while shareEnabled is true.
CREATE TABLE "ShotList" (
  "id"             TEXT NOT NULL,
  "workspaceId"    TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "publicToken"    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "shareEnabled"   BOOLEAN NOT NULL DEFAULT false,
  "shareEnabledAt" TIMESTAMP(3),
  "columnPrefs"    JSONB NOT NULL DEFAULT '{}',   -- which optional columns show
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShotList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShotList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShotList_projectId_fkey"   FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ShotList_projectId_key"   ON "ShotList"("projectId");
CREATE UNIQUE INDEX "ShotList_publicToken_key" ON "ShotList"("publicToken");
CREATE INDEX "ShotList_workspaceId_idx"        ON "ShotList"("workspaceId");

-- A section is a linked scene (sceneId) or a free section. Deleting the scene
-- keeps the section (SET NULL) under its stored title.
CREATE TABLE "ShotSection" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "shotListId"  TEXT NOT NULL,
  "sceneId"     TEXT,
  "title"       TEXT NOT NULL,
  "code"        TEXT,                              -- shot-number prefix for free sections ("B")
  "orderIndex"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShotSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShotSection_shotListId_fkey" FOREIGN KEY ("shotListId") REFERENCES "ShotList"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShotSection_sceneId_fkey"    FOREIGN KEY ("sceneId")    REFERENCES "Scene"("id")    ON DELETE SET NULL ON UPDATE CASCADE
);
-- A scene is linked at most once per list (NULLs — free sections — don't collide).
CREATE UNIQUE INDEX "ShotSection_shotListId_sceneId_key"   ON "ShotSection"("shotListId", "sceneId");
CREATE INDEX "ShotSection_shotListId_orderIndex_idx"       ON "ShotSection"("shotListId", "orderIndex");
CREATE INDEX "ShotSection_workspaceId_idx"                 ON "ShotSection"("workspaceId");

CREATE TABLE "Shot" (
  "id"              TEXT NOT NULL,
  "workspaceId"     TEXT NOT NULL,
  "shotListId"      TEXT NOT NULL,
  "sectionId"       TEXT NOT NULL,
  "orderIndex"      INTEGER NOT NULL DEFAULT 0,
  "status"          "ShotStatus" NOT NULL DEFAULT 'TO_SHOOT',
  "statusChangedAt" TIMESTAMP(3),
  "description"     TEXT NOT NULL DEFAULT '',
  "subject"         TEXT,
  "size"            TEXT,       -- camera fields are free text; presets are suggestions
  "angle"           TEXT,
  "movement"        TEXT,
  "lens"            TEXT,
  "equipment"       TEXT,
  "camera"          TEXT,       -- optional columns from here down
  "frameRate"       TEXT,
  "aspect"          TEXT,
  "sound"           TEXT,
  "setup"           TEXT,
  "estMinutes"      INTEGER,
  "cast"            TEXT,
  "location"        TEXT,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Shot_shotListId_fkey" FOREIGN KEY ("shotListId") REFERENCES "ShotList"("id")    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Shot_sectionId_fkey"  FOREIGN KEY ("sectionId")  REFERENCES "ShotSection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Shot_sectionId_orderIndex_idx" ON "Shot"("sectionId", "orderIndex");
CREATE INDEX "Shot_shotListId_idx"           ON "Shot"("shotListId");
CREATE INDEX "Shot_workspaceId_idx"          ON "Shot"("workspaceId");

-- Reference images. The lowest orderIndex is the ★ thumbnail. imageUrl is our
-- R2 copy (JPEG); a LINK with no imageUrl shows as a link card.
CREATE TABLE "ShotReference" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "shotId"      TEXT NOT NULL,
  "orderIndex"  INTEGER NOT NULL DEFAULT 0,
  "kind"        "ShotReferenceKind" NOT NULL,
  "imageUrl"    TEXT,
  "sourceUrl"   TEXT,
  "sourceHost"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShotReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShotReference_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ShotReference_shotId_orderIndex_idx" ON "ShotReference"("shotId", "orderIndex");
CREATE INDEX "ShotReference_workspaceId_idx"       ON "ShotReference"("workspaceId");

-- Permissions backfill: the new "Shot list" project area starts at each role's
-- Schedule level (a missing key would read as NONE and hide it from Producers).
-- Only rows without the key are touched, so re-running changes nothing.
UPDATE "WorkspaceRole"
SET "projectBaseline" = jsonb_set("projectBaseline", '{shotList}', COALESCE("projectBaseline"->'schedule', '"NONE"'::jsonb))
WHERE NOT ("projectBaseline" ? 'shotList');

UPDATE "ProjectRole"
SET "permissions" = jsonb_set("permissions", '{shotList}', COALESCE("permissions"->'schedule', '"NONE"'::jsonb))
WHERE NOT ("permissions" ? 'shotList');
