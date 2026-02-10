-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADJUSTER', 'FIRM_ADMIN', 'CLAIMANT', 'INSURER_STAFF', 'INSURER_ADMIN', 'SUPER_ADMIN', 'SIU_INVESTIGATOR', 'COMPLIANCE_OFFICER', 'SUPPORT_DESK', 'SHARIAH_REVIEWER');

-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('ADJUSTING_FIRM', 'INSURER');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('BASIC', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "AdjusterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserTenantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('OWN_DAMAGE', 'THIRD_PARTY_PROPERTY', 'THIRD_PARTY_INJURY', 'THEFT', 'WINDSCREEN');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'DOCUMENTS_PENDING', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ESCALATED_SIU', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('VOICE_ANALYSIS', 'VISUAL_MODERATION', 'ATTENTION_TRACKING', 'DEEPFAKE_CHECK');

-- CreateEnum
CREATE TYPE "RiskScore" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DAMAGE_PHOTO', 'POLICE_REPORT', 'DRIVING_LICENCE', 'ASSESSMENT_REPORT', 'SIGNED_STATEMENT', 'MYKAD_FRONT', 'VEHICLE_REG_CARD', 'REPAIR_QUOTATION', 'POLICY_DOCUMENT', 'NRIC', 'OTHER_DOCUMENT', 'CLAIMANT_SCREENSHOT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CLAIMANT', 'ADJUSTER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "licenseNumber" TEXT,
    "tenantId" TEXT,
    "currentTenantId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tenants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserTenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_access_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromTenantId" TEXT,
    "toTenantId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_access_logs_pkey" PRIMARY KEY ("id")
);

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
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "bcillaCertified" BOOLEAN NOT NULL DEFAULT false,
    "amlaMember" BOOLEAN NOT NULL DEFAULT false,
    "status" "AdjusterStatus" NOT NULL DEFAULT 'ACTIVE',
    "licenseVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adjusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claimants" (
    "id" TEXT NOT NULL,
    "nric" TEXT,
    "nricHash" TEXT,
    "nricEncrypted" BYTEA,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
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
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "nric" TEXT,
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
    "policeStation" TEXT,
    "policeReportDate" TIMESTAMP(3),
    "vehiclePlateNumber" TEXT,
    "vehicleChassisNumber" TEXT,
    "vehicleMake" TEXT,
    "vehicleModel" TEXT,
    "ncdRate" DOUBLE PRECISION,
    "sumInsured" DECIMAL(65,30),
    "workshopName" TEXT,
    "estimatedLossAmount" DECIMAL(65,30),
    "estimatedRepairCost" DECIMAL(12,2),
    "sstAmount" DECIMAL(65,30),
    "isPdpaCompliant" BOOLEAN NOT NULL DEFAULT false,
    "slaDeadline" TIMESTAMP(3),
    "complianceNotes" JSONB DEFAULT '{}',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "scheduledAssessmentTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siuInvestigatorId" TEXT,
    "approvedAmount" DECIMAL(65,30),
    "excessAmount" DECIMAL(65,30),
    "vehicleEngineNumber" TEXT,
    "vehicleYear" INTEGER,

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
    "tenantId" TEXT,
    "roomId" BIGINT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledTime" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "screenshots" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomUrl" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deception_scores" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deceptionScore" DECIMAL(5,4) NOT NULL,
    "voiceStress" DECIMAL(5,4) NOT NULL,
    "visualBehavior" DECIMAL(5,4) NOT NULL,
    "expressionMeasurement" DECIMAL(5,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deception_scores_pkey" PRIMARY KEY ("id")
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
    "status" "DocumentStatus" NOT NULL DEFAULT 'QUEUED',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "signedAt" TIMESTAMP(3),
    "documentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_analyses" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rawText" TEXT,
    "extractedData" JSONB,
    "visionData" JSONB,
    "modelUsed" TEXT,
    "confidence" DOUBLE PRECISION,
    "processingTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trinity_checks" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "checkResults" JSONB NOT NULL,
    "riskFactors" JSONB NOT NULL,
    "reasoning" TEXT,
    "reasoningInsights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trinity_checks_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "video_uploads" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    "processedUntil" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "VideoUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_makes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_client_info" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ipv4" TEXT,
    "ipv6" TEXT,
    "userAgent" TEXT,
    "language" TEXT,
    "browser" TEXT,
    "platform" TEXT,
    "screenResolution" TEXT,
    "timezone" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "isp" TEXT,
    "organisation" TEXT,
    "asn" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_client_info_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_currentTenantId_idx" ON "users"("currentTenantId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_tenants_userId_idx" ON "user_tenants"("userId");

-- CreateIndex
CREATE INDEX "user_tenants_tenantId_idx" ON "user_tenants"("tenantId");

-- CreateIndex
CREATE INDEX "user_tenants_userId_tenantId_idx" ON "user_tenants"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenants_userId_tenantId_key" ON "user_tenants"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "tenant_access_logs_userId_idx" ON "tenant_access_logs"("userId");

-- CreateIndex
CREATE INDEX "tenant_access_logs_createdAt_idx" ON "tenant_access_logs"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "adjusters_userId_key" ON "adjusters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "adjusters_licenseNumber_key" ON "adjusters"("licenseNumber");

-- CreateIndex
CREATE INDEX "adjusters_tenantId_idx" ON "adjusters"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "claimants_nric_key" ON "claimants"("nric");

-- CreateIndex
CREATE UNIQUE INDEX "claimants_nricHash_key" ON "claimants"("nricHash");

-- CreateIndex
CREATE UNIQUE INDEX "claimants_phoneNumber_key" ON "claimants"("phoneNumber");

-- CreateIndex
CREATE INDEX "claimants_phoneNumber_idx" ON "claimants"("phoneNumber");

-- CreateIndex
CREATE INDEX "claimants_nric_idx" ON "claimants"("nric");

-- CreateIndex
CREATE INDEX "otp_codes_phoneNumber_code_idx" ON "otp_codes"("phoneNumber", "code");

-- CreateIndex
CREATE INDEX "otp_codes_expiresAt_idx" ON "otp_codes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claimNumber_key" ON "claims"("claimNumber");

-- CreateIndex
CREATE INDEX "claims_claimantId_idx" ON "claims"("claimantId");

-- CreateIndex
CREATE INDEX "claims_nric_idx" ON "claims"("nric");

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
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");

-- CreateIndex
CREATE INDEX "deception_scores_sessionId_idx" ON "deception_scores"("sessionId");

-- CreateIndex
CREATE INDEX "risk_assessments_sessionId_assessmentType_idx" ON "risk_assessments"("sessionId", "assessmentType");

-- CreateIndex
CREATE INDEX "risk_assessments_sessionId_idx" ON "risk_assessments"("sessionId");

-- CreateIndex
CREATE INDEX "documents_claimId_idx" ON "documents"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "document_analyses_documentId_key" ON "document_analyses"("documentId");

-- CreateIndex
CREATE INDEX "trinity_checks_claimId_idx" ON "trinity_checks"("claimId");

-- CreateIndex
CREATE INDEX "audit_trail_entityType_entityId_idx" ON "audit_trail"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_trail_createdAt_idx" ON "audit_trail"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_uploads_claimId_idx" ON "video_uploads"("claimId");

-- CreateIndex
CREATE INDEX "video_uploads_status_idx" ON "video_uploads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_makes_name_key" ON "vehicle_makes"("name");

-- CreateIndex
CREATE INDEX "vehicle_models_makeId_idx" ON "vehicle_models"("makeId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_makeId_name_key" ON "vehicle_models"("makeId", "name");

-- CreateIndex
CREATE INDEX "session_client_info_sessionId_idx" ON "session_client_info"("sessionId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_currentTenantId_fkey" FOREIGN KEY ("currentTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_access_logs" ADD CONSTRAINT "tenant_access_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_access_logs" ADD CONSTRAINT "tenant_access_logs_fromTenantId_fkey" FOREIGN KEY ("fromTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_access_logs" ADD CONSTRAINT "tenant_access_logs_toTenantId_fkey" FOREIGN KEY ("toTenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjusters" ADD CONSTRAINT "adjusters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjusters" ADD CONSTRAINT "adjusters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "adjusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "claimants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_insurerTenantId_fkey" FOREIGN KEY ("insurerTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_siuInvestigatorId_fkey" FOREIGN KEY ("siuInvestigatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_notes" ADD CONSTRAINT "claim_notes_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deception_scores" ADD CONSTRAINT "deception_scores_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trinity_checks" ADD CONSTRAINT "trinity_checks_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_uploads" ADD CONSTRAINT "video_uploads_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "vehicle_makes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_client_info" ADD CONSTRAINT "session_client_info_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

