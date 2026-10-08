-- Index every foreign key, and record query statistics.
--
-- 1. 27 foreign keys had no index (audit of 8 Oct 2026). Postgres does not
--    index the referencing side of a foreign key, and neither does Prisma, so
--    joins and filters on them — and every delete of a parent row — scan the
--    child table. Several sit on hot paths: Claim.insurerTenantId (the
--    insurer's claim-access rule), Document.tenantId, Case.policyId.
--    `fk-indexes.spec.ts` now fails the build on a new unindexed foreign key.
--
--    Plain CREATE INDEX, not CONCURRENTLY: Prisma runs each migration in a
--    transaction, where CONCURRENTLY is not allowed, and at today's sizes (the
--    largest table is ~6k rows) the build holds the write lock for
--    milliseconds. Once tables are large, build the index out of band with
--    CREATE INDEX CONCURRENTLY first and keep CREATE INDEX IF NOT EXISTS here.
--
-- 2. pg_stat_statements: per-statement timing, so the next review starts from
--    measured query cost instead of inference. Collecting needs the library in
--    shared_preload_libraries (the staging compose file sets it); creating the
--    extension without it is harmless, the view simply errors until it is.
--
-- Deliberately NOT here: dropping piam_registered_agents_tenantId_fkey, which
-- `prisma migrate diff` proposes because the schema declares tenantId without
-- its @relation. The constraint is intended (migration 20260903170000); the
-- schema is what is missing a line.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "adjuster_reports_reviewerAdjusterId_idx" ON "adjuster_reports"("reviewerAdjusterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "adjuster_reports_signedByAdjusterId_idx" ON "adjuster_reports"("signedByAdjusterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cases_policyId_idx" ON "cases"("policyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cases_flowDefinitionId_idx" ON "cases"("flowDefinitionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "claims_insurerTenantId_idx" ON "claims"("insurerTenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "claims_siuInvestigatorId_idx" ON "claims"("siuInvestigatorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conflict_attestations_adjusterId_idx" ON "conflict_attestations"("adjusterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "consents_noticeId_idx" ON "consents"("noticeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deception_scores_tenantId_idx" ON "deception_scores"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deception_scores_userId_idx" ON "deception_scores"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "document_analyses_tenantId_idx" ON "document_analyses"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "document_analyses_userId_idx" ON "document_analyses"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documents_tenantId_idx" ON "documents"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documents_userId_idx" ON "documents"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fee_notes_claimId_idx" ON "fee_notes"("claimId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "risk_assessments_tenantId_idx" ON "risk_assessments"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "risk_assessments_userId_idx" ON "risk_assessments"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "site_visits_attendedByUserId_idx" ON "site_visits"("attendedByUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sla_clocks_policyId_idx" ON "sla_clocks"("policyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tenant_access_logs_fromTenantId_idx" ON "tenant_access_logs"("fromTenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tenant_access_logs_toTenantId_idx" ON "tenant_access_logs"("toTenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "time_entries_adjusterId_idx" ON "time_entries"("adjusterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trinity_checks_tenantId_idx" ON "trinity_checks"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trinity_checks_userId_idx" ON "trinity_checks"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_uploads_tenantId_idx" ON "video_uploads"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_uploads_userId_idx" ON "video_uploads"("userId");

