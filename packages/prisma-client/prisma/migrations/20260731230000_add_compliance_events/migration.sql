-- CreateEnum
CREATE TYPE "ComplianceEventType" AS ENUM ('SLA_BREACH_ESCALATED', 'COI_CONFLICT_ATTESTED', 'POLICY_BREACH', 'AUDIT_GAP', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplianceEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplianceEventStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "compliance_events" (
    "id" TEXT NOT NULL,
    "type" "ComplianceEventType" NOT NULL,
    "severity" "ComplianceEventSeverity" NOT NULL,
    "status" "ComplianceEventStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "details" TEXT,
    "claimId" TEXT,
    "adjusterId" TEXT,
    "raisedByUserId" TEXT,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "boardReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_events_dedupeKey_key" ON "compliance_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "compliance_events_status_severity_idx" ON "compliance_events"("status", "severity");

-- CreateIndex
CREATE INDEX "compliance_events_boardReportedAt_idx" ON "compliance_events"("boardReportedAt");

