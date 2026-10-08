-- Contract Builder: named, ordered groups of contract blocks ("templates").
-- Additive only — new tables; nothing existing changes. Until a template
-- exists, memos and proposals keep using blocks marked "attach by default".

CREATE TABLE "ContractTemplate" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "audience"    "ContractAudience" NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isDefault"   BOOLEAN NOT NULL DEFAULT false,
    "orderIndex"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContractTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContractTemplate_workspaceId_audience_idx" ON "ContractTemplate"("workspaceId", "audience");
-- At most one default template per workspace and audience.
CREATE UNIQUE INDEX "ContractTemplate_one_default_per_audience" ON "ContractTemplate"("workspaceId", "audience") WHERE "isDefault";

CREATE TABLE "ContractTemplateBlock" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId"  TEXT NOT NULL,
    "blockId"     TEXT NOT NULL,
    "orderIndex"  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ContractTemplateBlock_pkey" PRIMARY KEY ("id"),
    -- Deleting a template removes its block list; deleting a block removes it from templates.
    CONSTRAINT "ContractTemplateBlock_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractTemplateBlock_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ContractBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContractTemplateBlock_templateId_blockId_key" ON "ContractTemplateBlock"("templateId", "blockId");
CREATE INDEX "ContractTemplateBlock_blockId_idx" ON "ContractTemplateBlock"("blockId");
CREATE INDEX "ContractTemplateBlock_workspaceId_idx" ON "ContractTemplateBlock"("workspaceId");
