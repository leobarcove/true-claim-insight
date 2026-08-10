-- AlterTable
ALTER TABLE "case_documents" ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "case_documents_caseId_stepId_supersededAt_idx" ON "case_documents"("caseId", "stepId", "supersededAt");
