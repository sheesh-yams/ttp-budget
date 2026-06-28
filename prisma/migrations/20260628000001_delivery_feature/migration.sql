-- Migration: delivery_feature
-- Creates the Delivery subsystem: DeliveryPage, DeliverableSection,
-- DeliverableAsset, DeliverableVersion, DeliverableView, and their enums.
--
-- NOTE: DeliverableAsset ↔ DeliverableVersion has a circular FK
-- (asset.currentVersionId → version.id AND version.deliverableId → asset.id).
-- Handled by adding the currentVersionId FK after both tables exist.

-- ── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "DeliveryPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "DeliverableType"    AS ENUM ('DELIVERABLE', 'SERVICE', 'RAW_FOOTAGE', 'OTHER');
CREATE TYPE "AssetStatus"        AS ENUM ('DRAFT', 'SHARED');
CREATE TYPE "EmbedProvider"      AS ENUM (
  'FRAME_IO', 'SHADE',
  'GDRIVE_FILE', 'GDRIVE_FOLDER',
  'DROPBOX_FILE', 'DROPBOX_FOLDER',
  'DIRECT_IMAGE', 'DIRECT_VIDEO',
  'YOUTUBE', 'VIMEO',
  'GENERIC_LINK'
);
CREATE TYPE "RenderMode" AS ENUM ('IFRAME', 'NATIVE_MEDIA', 'EXTERNAL_ONLY');

-- ── DeliveryPage ──────────────────────────────────────────────────────────

CREATE TABLE "DeliveryPage" (
  "id"              TEXT        NOT NULL,
  "workspaceId"     TEXT        NOT NULL,
  "projectId"       TEXT        NOT NULL,
  "publicToken"     TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "title"           TEXT,
  "subtitle"        TEXT,
  "customMessage"   TEXT,
  "coverImageUrl"   TEXT,
  "status"          "DeliveryPageStatus" NOT NULL DEFAULT 'DRAFT',
  "lastPublishedAt" TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryPage_projectId_key"    ON "DeliveryPage"("projectId");
CREATE UNIQUE INDEX "DeliveryPage_publicToken_key"  ON "DeliveryPage"("publicToken");
CREATE        INDEX "DeliveryPage_workspaceId_idx"  ON "DeliveryPage"("workspaceId");

ALTER TABLE "DeliveryPage"
  ADD CONSTRAINT "DeliveryPage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DeliverableSection ────────────────────────────────────────────────────

CREATE TABLE "DeliverableSection" (
  "id"                  TEXT        NOT NULL,
  "workspaceId"         TEXT        NOT NULL,
  "deliveryPageId"      TEXT        NOT NULL,
  "title"               TEXT        NOT NULL,
  "description"         TEXT,
  "orderIndex"          INTEGER     NOT NULL DEFAULT 0,
  "sourceDeliverableId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliverableSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliverableSection_deliveryPageId_orderIndex_idx"
  ON "DeliverableSection"("deliveryPageId", "orderIndex");
CREATE INDEX "DeliverableSection_workspaceId_idx"
  ON "DeliverableSection"("workspaceId");

ALTER TABLE "DeliverableSection"
  ADD CONSTRAINT "DeliverableSection_deliveryPageId_fkey"
    FOREIGN KEY ("deliveryPageId") REFERENCES "DeliveryPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DeliverableAsset (currentVersionId FK added after DeliverableVersion) ─

CREATE TABLE "DeliverableAsset" (
  "id"                  TEXT             NOT NULL,
  "workspaceId"         TEXT             NOT NULL,
  "deliveryPageId"      TEXT             NOT NULL,
  "sectionId"           TEXT,
  "title"               TEXT             NOT NULL,
  "description"         TEXT,
  "orderIndex"          INTEGER          NOT NULL DEFAULT 0,
  "type"                "DeliverableType" NOT NULL,
  "status"              "AssetStatus"    NOT NULL DEFAULT 'DRAFT',
  "publicToken"         TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
  "currentVersionId"    TEXT,
  "sourceDeliverableId" TEXT,
  "sourceCardIndex"     INTEGER,
  "createdAt"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliverableAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliverableAsset_publicToken_key"
  ON "DeliverableAsset"("publicToken");
CREATE UNIQUE INDEX "DeliverableAsset_currentVersionId_key"
  ON "DeliverableAsset"("currentVersionId");
CREATE INDEX "DeliverableAsset_deliveryPageId_orderIndex_idx"
  ON "DeliverableAsset"("deliveryPageId", "orderIndex");
CREATE INDEX "DeliverableAsset_sectionId_orderIndex_idx"
  ON "DeliverableAsset"("sectionId", "orderIndex");
CREATE INDEX "DeliverableAsset_workspaceId_idx"
  ON "DeliverableAsset"("workspaceId");

ALTER TABLE "DeliverableAsset"
  ADD CONSTRAINT "DeliverableAsset_deliveryPageId_fkey"
    FOREIGN KEY ("deliveryPageId") REFERENCES "DeliveryPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliverableAsset"
  ADD CONSTRAINT "DeliverableAsset_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "DeliverableSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DeliverableVersion ────────────────────────────────────────────────────

CREATE TABLE "DeliverableVersion" (
  "id"                TEXT          NOT NULL,
  "workspaceId"       TEXT          NOT NULL,
  "deliverableId"     TEXT          NOT NULL,
  "versionNumber"     INTEGER       NOT NULL,
  "url"               TEXT          NOT NULL,
  "provider"          "EmbedProvider" NOT NULL,
  "renderMode"        "RenderMode"  NOT NULL,
  "embedHtml"         TEXT,
  "thumbnailUrl"      TEXT,
  "note"              TEXT,
  "firstClientViewAt" TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliverableVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliverableVersion_deliverableId_versionNumber_key"
  ON "DeliverableVersion"("deliverableId", "versionNumber");
CREATE INDEX "DeliverableVersion_workspaceId_idx"
  ON "DeliverableVersion"("workspaceId");

ALTER TABLE "DeliverableVersion"
  ADD CONSTRAINT "DeliverableVersion_deliverableId_fkey"
    FOREIGN KEY ("deliverableId") REFERENCES "DeliverableAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Close the circular FK: asset.currentVersionId → version.id ────────────

ALTER TABLE "DeliverableAsset"
  ADD CONSTRAINT "DeliverableAsset_currentVersionId_fkey"
    FOREIGN KEY ("currentVersionId") REFERENCES "DeliverableVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DeliverableView ───────────────────────────────────────────────────────

CREATE TABLE "DeliverableView" (
  "id"            TEXT        NOT NULL,
  "workspaceId"   TEXT        NOT NULL,
  "deliverableId" TEXT        NOT NULL,
  "versionId"     TEXT        NOT NULL,
  "ipHash"        TEXT        NOT NULL,
  "userAgent"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliverableView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliverableView_deliverableId_versionId_idx"
  ON "DeliverableView"("deliverableId", "versionId");
CREATE INDEX "DeliverableView_workspaceId_idx"
  ON "DeliverableView"("workspaceId");
