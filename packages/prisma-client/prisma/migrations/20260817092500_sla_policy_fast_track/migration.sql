-- The fast-track SLA profile (§2.4): a tenant's own shorter FINAL_REPORT
-- promise for fast-tracked claims, absent by default. The flag joins the
-- unique key so a tenant may hold both its standard row and its fast-track
-- row for one stage.

-- AlterTable
ALTER TABLE "sla_policies" ADD COLUMN "fastTrack" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
DROP INDEX "sla_policies_tenantId_stage_key";

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_tenantId_stage_fastTrack_key" ON "sla_policies"("tenantId", "stage", "fastTrack");
