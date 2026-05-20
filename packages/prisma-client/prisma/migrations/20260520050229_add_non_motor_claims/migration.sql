-- Non-motor claims schema: ClaimCategory, FloodClaim, FraudSignal,
-- EvidenceRequirement, and supporting enums. Builds on the DocumentType
-- enum values added in 20260520050228_extend_document_type_enum.

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('MOTOR', 'FLOOD', 'FIRE', 'LIGHTNING', 'BURGLARY', 'PERSONAL_ACCIDENT', 'HOH', 'OTHER');

-- CreateEnum
CREATE TYPE "FloodSource" AS ENUM ('RIVER_OVERFLOW', 'FLASH_FLOOD', 'COASTAL_SURGE', 'DRAINAGE_FAILURE', 'RAINWATER_INGRESS', 'DAM_RELEASE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'MIXED_USE', 'AGRICULTURAL', 'OTHER');

-- CreateEnum
CREATE TYPE "FraudCategory" AS ENUM ('PARAMETRIC', 'IDENTITY', 'BEHAVIOURAL', 'DOCUMENT', 'NETWORK', 'ENVIRONMENTAL', 'INVENTORY', 'POLICY');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable: add category column (defaulted), make claimType nullable.
-- Existing motor rows are auto-backfilled to category='MOTOR' via the default.
ALTER TABLE "claims" ADD COLUMN     "category" "ClaimCategory" NOT NULL DEFAULT 'MOTOR',
ALTER COLUMN "claimType" DROP NOT NULL;

-- CreateTable: FloodClaim (1:1 with Claim where category='FLOOD')
CREATE TABLE "flood_claims" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "tenantId" TEXT,
    "incidentStart" TIMESTAMP(3) NOT NULL,
    "incidentEnd" TIMESTAMP(3),
    "waterDepthCm" INTEGER,
    "durationHours" INTEGER,
    "source" "FloodSource",
    "propertyType" "PropertyType",
    "propertyFloorLevel" INTEGER,
    "propertyElevationMeters" DOUBLE PRECISION,
    "postcode" TEXT,
    "state" TEXT,
    "parametricTriggerMet" BOOLEAN,
    "metMalaysiaEventRef" TEXT,
    "jpsGaugeId" TEXT,
    "buildingDamageRm" DECIMAL(12,2),
    "contentsDamageRm" DECIMAL(12,2),
    "vehicleDamageRm" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flood_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FraudSignal (Shift Technology-style independent signal log)
CREATE TABLE "fraud_signals" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" "FraudCategory" NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" "SignalSeverity" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "rawData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EvidenceRequirement (data-driven document checklists)
CREATE TABLE "evidence_requirements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "category" "ClaimCategory" NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flood_claims_claimId_key" ON "flood_claims"("claimId");
CREATE INDEX "flood_claims_tenantId_idx" ON "flood_claims"("tenantId");
CREATE INDEX "flood_claims_incidentStart_idx" ON "flood_claims"("incidentStart");
CREATE INDEX "flood_claims_postcode_idx" ON "flood_claims"("postcode");
CREATE INDEX "fraud_signals_claimId_idx" ON "fraud_signals"("claimId");
CREATE INDEX "fraud_signals_provider_idx" ON "fraud_signals"("provider");
CREATE INDEX "fraud_signals_category_idx" ON "fraud_signals"("category");
CREATE INDEX "fraud_signals_severity_idx" ON "fraud_signals"("severity");
CREATE INDEX "evidence_requirements_category_idx" ON "evidence_requirements"("category");
CREATE UNIQUE INDEX "evidence_requirements_tenantId_category_documentType_key" ON "evidence_requirements"("tenantId", "category", "documentType");
CREATE INDEX "claims_category_idx" ON "claims"("category");

-- AddForeignKey
ALTER TABLE "flood_claims" ADD CONSTRAINT "flood_claims_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flood_claims" ADD CONSTRAINT "flood_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fraud_signals" ADD CONSTRAINT "fraud_signals_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence_requirements" ADD CONSTRAINT "evidence_requirements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
