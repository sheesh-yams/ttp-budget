-- Schedule Feature Migration
-- Run manually in Neon SQL Editor. All operations are idempotent.

-- ─── 1. Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "IntExt"    AS ENUM ('INT', 'EXT', 'INT_EXT', 'CONTINUOUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TimeOfDay" AS ENUM ('DAY', 'NIGHT', 'DUSK', 'DAWN', 'MORNING', 'EVENING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EntryKind" AS ENUM ('SCENE', 'BANNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BannerType" AS ENUM ('MEAL_BREAK', 'COMPANY_MOVE', 'COFFEE_BREAK', 'NOTE', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Location ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Location" (
  "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"      TEXT        NOT NULL,
  "name"             TEXT        NOT NULL,
  "address"          TEXT,
  "city"             TEXT,
  "region"           TEXT,
  "postalCode"       TEXT,
  "country"          TEXT,
  "latitude"         DOUBLE PRECISION,
  "longitude"        DOUBLE PRECISION,
  "parkingNotes"     TEXT,
  "accessNotes"      TEXT,
  "nearestHospital"  TEXT,
  "hospitalAddress"  TEXT,
  "hospitalPhone"    TEXT,
  "hospitalDistance" TEXT,
  "contactName"      TEXT,
  "contactPhone"     TEXT,
  "contactEmail"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Location_workspaceId_idx"      ON "Location"("workspaceId");
CREATE INDEX IF NOT EXISTS "Location_workspaceId_name_idx" ON "Location"("workspaceId", "name");

-- ─── 3. ShootDay ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ShootDay" (
  "id"                TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"       TEXT        NOT NULL,
  "projectId"         TEXT        NOT NULL,
  "date"              DATE        NOT NULL,
  "orderIndex"        INTEGER     NOT NULL DEFAULT 0,
  "label"             TEXT,
  "startTime"         TEXT,
  "primaryLocationId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShootDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShootDay_projectId_date_key" UNIQUE ("projectId", "date"),
  CONSTRAINT "ShootDay_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "ShootDay_primaryLocationId_fkey"
    FOREIGN KEY ("primaryLocationId") REFERENCES "Location"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "ShootDay_projectId_orderIndex_idx" ON "ShootDay"("projectId", "orderIndex");
CREATE INDEX IF NOT EXISTS "ShootDay_workspaceId_idx"          ON "ShootDay"("workspaceId");

-- ─── 4. Scene ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Scene" (
  "id"                TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"       TEXT          NOT NULL,
  "projectId"         TEXT          NOT NULL,
  "sceneNumber"       TEXT,
  "setting"           TEXT          NOT NULL,
  "description"       TEXT,
  "synopsis"          TEXT,
  "intExt"            "IntExt"      NOT NULL DEFAULT 'INT',
  "timeOfDay"         "TimeOfDay"   NOT NULL DEFAULT 'DAY',
  "pageCount"         TEXT,
  "pageEighths"       INTEGER,
  "estimatedDuration" INTEGER,
  "locationId"        TEXT,
  "notes"             TEXT,
  "castContactIds"    TEXT[]        NOT NULL DEFAULT '{}',
  "colorOverride"     TEXT,
  "archived"          BOOLEAN       NOT NULL DEFAULT FALSE,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Scene_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Scene_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
  CONSTRAINT "Scene_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Scene_projectId_idx"   ON "Scene"("projectId");
CREATE INDEX IF NOT EXISTS "Scene_workspaceId_idx" ON "Scene"("workspaceId");

-- ─── 5. Schedule ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Schedule" (
  "id"          TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT          NOT NULL,
  "projectId"   TEXT          NOT NULL,
  "name"        TEXT          NOT NULL,
  "isPrimary"   BOOLEAN       NOT NULL DEFAULT FALSE,
  "columnPrefs" JSONB         NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Schedule_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Schedule_projectId_idx"   ON "Schedule"("projectId");
CREATE INDEX IF NOT EXISTS "Schedule_workspaceId_idx" ON "Schedule"("workspaceId");

-- ─── 6. ScheduleEntry ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ScheduleEntry" (
  "id"                TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"       TEXT          NOT NULL,
  "scheduleId"        TEXT          NOT NULL,
  "shootDayId"        TEXT,
  "orderIndex"        INTEGER       NOT NULL DEFAULT 0,
  "kind"              "EntryKind"   NOT NULL,
  "sceneId"           TEXT,
  "bannerType"        "BannerType",
  "bannerLabel"       TEXT,
  "bannerDurationMin" INTEGER,
  "bannerNote"        TEXT,
  "computedStartTime" TEXT,
  "computedEndTime"   TEXT,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleEntry_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE,
  CONSTRAINT "ScheduleEntry_shootDayId_fkey"
    FOREIGN KEY ("shootDayId") REFERENCES "ShootDay"("id") ON DELETE SET NULL,
  CONSTRAINT "ScheduleEntry_sceneId_fkey"
    FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ScheduleEntry_scheduleId_shootDayId_orderIndex_idx"
  ON "ScheduleEntry"("scheduleId", "shootDayId", "orderIndex");
CREATE INDEX IF NOT EXISTS "ScheduleEntry_workspaceId_idx" ON "ScheduleEntry"("workspaceId");

-- ─── 7. CallSheet — new columns ────────────────────────────────────────────────

ALTER TABLE "CallSheet"
  ADD COLUMN IF NOT EXISTS "locationId"       TEXT,
  ADD COLUMN IF NOT EXISTS "shootDayId"       TEXT,
  ADD COLUMN IF NOT EXISTS "scheduleSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "scheduleSyncedAt" TIMESTAMP(3);

-- FK for CallSheet.locationId
DO $$ BEGIN
  ALTER TABLE "CallSheet"
    ADD CONSTRAINT "CallSheet_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK for CallSheet.shootDayId
DO $$ BEGIN
  ALTER TABLE "CallSheet"
    ADD CONSTRAINT "CallSheet_shootDayId_fkey"
      FOREIGN KEY ("shootDayId") REFERENCES "ShootDay"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "CallSheet_shootDayId_idx" ON "CallSheet"("shootDayId");

-- ─── 8. Backfill: Location from existing CallSheet inline fields ────────────────
-- For each distinct (workspaceId, locationName, locationAddress) on CallSheet
-- where locationName is not null, create one Location row and link the call sheets.

INSERT INTO "Location" ("workspaceId", "name", "address", "latitude", "longitude")
SELECT DISTINCT ON ("workspaceId", "locationName", "locationAddress")
  "workspaceId",
  "locationName",
  "locationAddress",
  "locationLat",
  "locationLng"
FROM "CallSheet"
WHERE "locationName" IS NOT NULL
  AND "locationId"   IS NULL  -- only unlinked rows
ON CONFLICT DO NOTHING;

-- Link call sheets to the locations we just created
UPDATE "CallSheet" cs
SET "locationId" = loc."id"
FROM "Location" loc
WHERE cs."workspaceId"    = loc."workspaceId"
  AND cs."locationName"   = loc."name"
  AND (cs."locationAddress" = loc."address" OR (cs."locationAddress" IS NULL AND loc."address" IS NULL))
  AND cs."locationId" IS NULL;

-- ─── 9. Backfill: ShootDay from Project.shootStartDate / shootEndDate ───────────
-- For each project with a shootStartDate, generate one ShootDay per calendar day
-- in [shootStartDate, shootEndDate] (inclusive). If shootEndDate is null, one day.

INSERT INTO "ShootDay" ("workspaceId", "projectId", "date", "orderIndex")
SELECT
  p."workspaceId",
  p."id",
  gs.day::DATE,
  ROW_NUMBER() OVER (PARTITION BY p."id" ORDER BY gs.day) - 1
FROM "Project" p
CROSS JOIN LATERAL generate_series(
  p."shootStartDate"::DATE,
  COALESCE(p."shootEndDate"::DATE, p."shootStartDate"::DATE),
  INTERVAL '1 day'
) AS gs(day)
WHERE p."shootStartDate" IS NOT NULL
ON CONFLICT ("projectId", "date") DO NOTHING;

-- ─── 10. Link existing CallSheets to ShootDays ─────────────────────────────────

UPDATE "CallSheet" cs
SET "shootDayId" = sd."id"
FROM "ShootDay" sd
WHERE cs."projectId"  = sd."projectId"
  AND cs."shootDate"::DATE = sd."date"
  AND cs."shootDayId" IS NULL;
