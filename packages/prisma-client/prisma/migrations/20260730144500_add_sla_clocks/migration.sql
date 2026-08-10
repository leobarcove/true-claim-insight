-- CreateEnum
CREATE TYPE "SlaStage" AS ENUM ('ACK_TO_INSURER', 'PRELIMINARY_REPORT', 'FINAL_REPORT', 'SUPPLEMENTARY_CLAIM', 'INSURER_DECISION', 'INSURER_PAYMENT');

-- CreateEnum
CREATE TYPE "SlaClockState" AS ENUM ('RUNNING', 'PAUSED', 'MET', 'BREACHED');

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "stage" "SlaStage" NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "warnWorkingDaysBefore" INTEGER NOT NULL DEFAULT 1,
    "calendarState" TEXT,
    "monitorOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_clocks" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "stage" "SlaStage" NOT NULL,
    "state" "SlaClockState" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "remainingWorkingDaysAtPause" INTEGER,
    "pauseReason" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "warnedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_clocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sla_policies_stage_idx" ON "sla_policies"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_tenantId_stage_key" ON "sla_policies"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "sla_clocks_claimId_idx" ON "sla_clocks"("claimId");

-- CreateIndex
CREATE INDEX "sla_clocks_state_dueAt_idx" ON "sla_clocks"("state", "dueAt");

-- CreateIndex
CREATE INDEX "sla_clocks_stage_idx" ON "sla_clocks"("stage");

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "sla_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one live clock per claim and stage.
--
-- Completed clocks are kept as history (a stage can legitimately recur, e.g. a
-- second supplementary claim), so a plain unique constraint would be wrong.
-- This partial index lets history accumulate while making two simultaneous
-- RUNNING/PAUSED clocks for the same stage impossible at the database level —
-- an ambiguous clock state is a compliance question with no good answer.
CREATE UNIQUE INDEX "sla_clocks_one_live_per_claim_stage"
  ON "sla_clocks" ("claimId", "stage")
  WHERE "state" IN ('RUNNING', 'PAUSED');
