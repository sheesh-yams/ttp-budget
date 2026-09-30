-- Deal memos, Phase 1: crew/talent bids and confirmed terms, linked to budget
-- lines, the crew roster and actuals. Purely additive; every new column has a
-- default, so no existing row changes. Existing contract blocks stay CLIENT
-- (proposal-facing) via the audience default.

-- CreateEnum
CREATE TYPE "ContractAudience" AS ENUM ('CLIENT', 'VENDOR');

-- CreateEnum
CREATE TYPE "DealMemoStatus" AS ENUM ('BID', 'NOT_SELECTED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DealMemoFeeKind" AS ENUM ('DAY_RATE', 'OVERTIME', 'KIT', 'PER_DIEM', 'MILEAGE', 'CUSTOM');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "dealMemoDefaults" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ActualEntry" ADD COLUMN     "dealMemoFeeId" TEXT,
ADD COLUMN     "dealMemoSourced" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ContractBlock" ADD COLUMN     "audience" "ContractAudience" NOT NULL DEFAULT 'CLIENT';

-- AlterTable
ALTER TABLE "GlobalContractBlock" ADD COLUMN     "audience" "ContractAudience" NOT NULL DEFAULT 'CLIENT';

-- CreateTable
CREATE TABLE "DealMemo" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lineItemId" TEXT,
    "roleLabel" TEXT NOT NULL,
    "contactId" TEXT,
    "projectMemberId" TEXT,
    "status" "DealMemoStatus" NOT NULL DEFAULT 'BID',
    "awardedAt" TIMESTAMP(3),
    "position" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "days" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "workDayHours" INTEGER NOT NULL DEFAULT 10,
    "otMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
    "doubleTimeAfterHours" INTEGER NOT NULL DEFAULT 14,
    "doubleTimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    "productionZoneMiles" INTEGER NOT NULL DEFAULT 30,
    "internalNotes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealMemoFee" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealMemoId" TEXT NOT NULL,
    "kind" "DealMemoFeeKind" NOT NULL DEFAULT 'CUSTOM',
    "label" TEXT NOT NULL,
    "rateCents" INTEGER NOT NULL DEFAULT 0,
    "unit" "RateUnit" NOT NULL DEFAULT 'DAY',
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "termsText" TEXT,
    "budgetLineItemId" TEXT,
    "isAutoRate" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealMemoFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealMemoSection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealMemoId" TEXT NOT NULL,
    "sourceBlockId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "editedFromSource" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealMemoSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealMemo_projectId_idx" ON "DealMemo"("projectId");

-- CreateIndex
CREATE INDEX "DealMemo_workspaceId_idx" ON "DealMemo"("workspaceId");

-- CreateIndex
CREATE INDEX "DealMemo_contactId_idx" ON "DealMemo"("contactId");

-- CreateIndex
CREATE INDEX "DealMemo_lineItemId_idx" ON "DealMemo"("lineItemId");

-- CreateIndex
CREATE INDEX "DealMemoFee_dealMemoId_order_idx" ON "DealMemoFee"("dealMemoId", "order");

-- CreateIndex
CREATE INDEX "DealMemoFee_workspaceId_idx" ON "DealMemoFee"("workspaceId");

-- CreateIndex
CREATE INDEX "DealMemoSection_dealMemoId_orderIndex_idx" ON "DealMemoSection"("dealMemoId", "orderIndex");

-- CreateIndex
CREATE INDEX "DealMemoSection_workspaceId_idx" ON "DealMemoSection"("workspaceId");

-- AddForeignKey
ALTER TABLE "DealMemo" ADD CONSTRAINT "DealMemo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMemo" ADD CONSTRAINT "DealMemo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMemo" ADD CONSTRAINT "DealMemo_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMemo" ADD CONSTRAINT "DealMemo_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMemoFee" ADD CONSTRAINT "DealMemoFee_dealMemoId_fkey" FOREIGN KEY ("dealMemoId") REFERENCES "DealMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMemoSection" ADD CONSTRAINT "DealMemoSection_dealMemoId_fkey" FOREIGN KEY ("dealMemoId") REFERENCES "DealMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

