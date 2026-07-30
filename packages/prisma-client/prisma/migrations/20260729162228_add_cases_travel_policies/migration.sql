-- DropIndex
DROP INDEX "evidence_requirements_tenantId_category_documentType_key";

-- AlterTable
ALTER TABLE "evidence_requirements" ADD COLUMN     "travelClaimType" "TravelClaimType";

-- CreateTable
CREATE TABLE "travel_claims" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "tenantId" TEXT,
    "travelClaimType" "TravelClaimType" NOT NULL,
    "policyId" TEXT,
    "tripStartDate" TIMESTAMP(3),
    "tripEndDate" TIMESTAMP(3),
    "destinationCountry" TEXT,
    "airline" TEXT,
    "flightNumber" TEXT,
    "scheduledDeparture" TIMESTAMP(3),
    "actualDeparture" TIMESTAMP(3),
    "delayHours" DOUBLE PRECISION,
    "baggageTagNumber" TEXT,
    "treatmentCountry" TEXT,
    "hospitalName" TEXT,
    "referredToExpert" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" TEXT,
    "estimatedAmountRm" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insuredName" TEXT NOT NULL,
    "insuredNric" TEXT,
    "insuredPhone" TEXT,
    "planTier" TEXT,
    "tripStartDate" TIMESTAMP(3),
    "tripEndDate" TIMESTAMP(3),
    "destination" TEXT,
    "coverageSnapshot" JSONB,
    "source" "PolicySource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "CaseChannel" NOT NULL DEFAULT 'WEB_CHAT',
    "initiatedBy" "CaseInitiator" NOT NULL DEFAULT 'CLAIMANT',
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "ClaimCategory" NOT NULL DEFAULT 'TRAVEL',
    "travelClaimType" "TravelClaimType",
    "claimantId" TEXT,
    "createdByUserId" TEXT,
    "policyId" TEXT,
    "policyNumberRaw" TEXT,
    "needsPolicyReview" BOOLEAN NOT NULL DEFAULT false,
    "currentStepId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "incidentDate" TIMESTAMP(3),
    "destination" TEXT,
    "sourceMeta" JSONB,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountHolderName" TEXT,
    "notifiedLate" BOOLEAN NOT NULL DEFAULT false,
    "outOfWindow" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "convertedClaimId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "stepId" TEXT,
    "validationStatus" "DocumentValidationStatus" NOT NULL DEFAULT 'SKIPPED',
    "validationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travel_claims_claimId_key" ON "travel_claims"("claimId");

-- CreateIndex
CREATE INDEX "travel_claims_tenantId_idx" ON "travel_claims"("tenantId");

-- CreateIndex
CREATE INDEX "policies_tenantId_insuredPhone_idx" ON "policies"("tenantId", "insuredPhone");

-- CreateIndex
CREATE UNIQUE INDEX "policies_tenantId_policyNumber_key" ON "policies"("tenantId", "policyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cases_convertedClaimId_key" ON "cases"("convertedClaimId");

-- CreateIndex
CREATE INDEX "cases_tenantId_status_idx" ON "cases"("tenantId", "status");

-- CreateIndex
CREATE INDEX "cases_claimantId_idx" ON "cases"("claimantId");

-- CreateIndex
CREATE INDEX "cases_createdAt_idx" ON "cases"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "case_documents_caseId_idx" ON "case_documents"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_requirements_tenantId_category_travelClaimType_doc_key" ON "evidence_requirements"("tenantId", "category", "travelClaimType", "documentType");

-- AddForeignKey
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_claims" ADD CONSTRAINT "travel_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "claimants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_convertedClaimId_fkey" FOREIGN KEY ("convertedClaimId") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Case number generation sequence (avoids race-prone count()+1 numbering)
CREATE SEQUENCE IF NOT EXISTS case_number_seq;
