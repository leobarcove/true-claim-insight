-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('ADJUSTING_FIRM', 'INSURER');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('BASIC', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "AdjusterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('OWN_DAMAGE', 'THIRD_PARTY_PROPERTY', 'THIRD_PARTY_INJURY', 'THEFT', 'WINDSCREEN');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'DOCUMENTS_PENDING', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED_SIU', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('VOICE_ANALYSIS', 'VISUAL_MODERATION', 'ATTENTION_TRACKING', 'DEEPFAKE_CHECK');

-- CreateEnum
CREATE TYPE "RiskScore" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DAMAGE_PHOTO', 'POLICE_REPORT', 'DRIVING_LICENCE', 'ASSESSMENT_REPORT', 'SIGNED_STATEMENT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CLAIMANT', 'ADJUSTER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TenantType" NOT NULL,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'BASIC',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjusters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "bcillaCertified" BOOLEAN NOT NULL DEFAULT false,
    "amlaMember" BOOLEAN NOT NULL DEFAULT false,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "passwordHash" TEXT,
    "status" "AdjusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "licenseVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adjusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claimants" (
    "id" TEXT NOT NULL,
    "nricHash" TEXT NOT NULL,
    "nricEncrypted" BYTEA NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "kycVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claimants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "adjusterId" TEXT,
    "insurerTenantId" TEXT,
    "policyNumber" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentTime" TIMESTAMP(3),
    "incidentLocation" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "otherParty" JSONB,
    "policeReportNumber" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "scheduledAssessmentTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_notes" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorType" "ActorType" NOT NULL,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "roomId" BIGINT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledTime" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "screenshots" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assessmentType" "AssessmentType" NOT NULL,
    "provider" TEXT NOT NULL,
    "questionId" TEXT,
    "questionText" TEXT,
    "riskScore" "RiskScore",
    "confidence" DECIMAL(5,4),
    "rawResponse" JSONB,
    "contextData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "signedAt" TIMESTAMP(3),
    "documentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_trail" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "ActorType",
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adjusters_licenseNumber_key" ON "adjusters"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "adjusters_email_key" ON "adjusters"("email");

-- CreateIndex
CREATE INDEX "adjusters_tenantId_idx" ON "adjusters"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "claimants_nricHash_key" ON "claimants"("nricHash");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claimNumber_key" ON "claims"("claimNumber");

-- CreateIndex
CREATE INDEX "claims_claimantId_idx" ON "claims"("claimantId");

-- CreateIndex
CREATE INDEX "claims_adjusterId_idx" ON "claims"("adjusterId");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "claims_createdAt_idx" ON "claims"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "claim_notes_claimId_idx" ON "claim_notes"("claimId");

-- CreateIndex
CREATE INDEX "sessions_claimId_idx" ON "sessions"("claimId");

-- CreateIndex
CREATE INDEX "risk_assessments_sessionId_idx" ON "risk_assessments"("sessionId");

-- CreateIndex
CREATE INDEX "documents_claimId_idx" ON "documents"("claimId");

-- CreateIndex
CREATE INDEX "audit_trail_entityType_entityId_idx" ON "audit_trail"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_trail_createdAt_idx" ON "audit_trail"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "adjusters" ADD CONSTRAINT "adjusters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "claimants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_insurerTenantId_fkey" FOREIGN KEY ("insurerTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_notes" ADD CONSTRAINT "claim_notes_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
