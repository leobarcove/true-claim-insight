-- CreateEnum
CREATE TYPE "FlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CaseChannel" ADD VALUE 'TELEGRAM';
ALTER TYPE "CaseChannel" ADD VALUE 'MESSENGER';

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "flowDefinitionId" TEXT,
ADD COLUMN     "flowVersion" INTEGER;

-- CreateTable
CREATE TABLE "flow_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "FlowStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "ClaimCategory" NOT NULL DEFAULT 'TRAVEL',
    "travelClaimType" "TravelClaimType",
    "name" TEXT NOT NULL,
    "entryStepId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_overlays" (
    "id" TEXT NOT NULL,
    "flowDefinitionId" TEXT NOT NULL,
    "channel" "CaseChannel",
    "locale" TEXT,
    "overrides" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_overlays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flow_definitions_key_status_idx" ON "flow_definitions"("key", "status");

-- CreateIndex
CREATE INDEX "flow_definitions_tenantId_status_idx" ON "flow_definitions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "flow_definitions_tenantId_key_version_key" ON "flow_definitions"("tenantId", "key", "version");

-- CreateIndex
CREATE INDEX "flow_overlays_flowDefinitionId_idx" ON "flow_overlays"("flowDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_overlays_flowDefinitionId_channel_locale_key" ON "flow_overlays"("flowDefinitionId", "channel", "locale");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_flowDefinitionId_fkey" FOREIGN KEY ("flowDefinitionId") REFERENCES "flow_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_definitions" ADD CONSTRAINT "flow_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_overlays" ADD CONSTRAINT "flow_overlays_flowDefinitionId_fkey" FOREIGN KEY ("flowDefinitionId") REFERENCES "flow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- NULL-aware uniqueness. Postgres treats NULLs as distinct, so the @@unique
-- constraints Prisma generated above do not constrain the rows that matter
-- most: platform-default flows (tenantId IS NULL) and the base overlay
-- (channel IS NULL AND locale IS NULL). Without these, ten identical base
-- overlays can coexist and the resolver picks one arbitrarily.
--
-- Same approach as sla_clocks_one_live_per_claim_stage: hand-written partial
-- unique indexes alongside Prisma's, rather than replacing them.
-- ---------------------------------------------------------------------------

-- One version per key among platform defaults.
CREATE UNIQUE INDEX "flow_definitions_one_platform_default_per_key_version"
  ON "flow_definitions"("key", "version")
  WHERE "tenantId" IS NULL;

-- One base overlay (all channels, all locales) per definition.
CREATE UNIQUE INDEX "flow_overlays_one_base_per_definition"
  ON "flow_overlays"("flowDefinitionId")
  WHERE "channel" IS NULL AND "locale" IS NULL;

-- One overlay per channel that applies to all locales.
CREATE UNIQUE INDEX "flow_overlays_one_per_channel_all_locales"
  ON "flow_overlays"("flowDefinitionId", "channel")
  WHERE "locale" IS NULL;

-- One overlay per locale that applies to all channels.
CREATE UNIQUE INDEX "flow_overlays_one_per_locale_all_channels"
  ON "flow_overlays"("flowDefinitionId", "locale")
  WHERE "channel" IS NULL;
