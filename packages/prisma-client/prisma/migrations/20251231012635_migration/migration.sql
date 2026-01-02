-- DropIndex
DROP INDEX "risk_assessments_sessionId_assessmentType_key";

-- CreateIndex
CREATE INDEX "risk_assessments_sessionId_assessmentType_idx" ON "risk_assessments"("sessionId", "assessmentType");
