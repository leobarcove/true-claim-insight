-- History repair, not a schema change on any live database.
--
-- 20260811082911 creates "conversation_messages_caseDocumentId_idx" in
-- recorded order, but in real execution the index was dropped by
-- 20260811061655 and never re-created — the schema's final state has no such
-- index, and neither does any applied database. A clean replay of history
-- therefore ended with an index the schema does not declare. Dropping it
-- here, idempotently, makes recorded history converge with reality; on every
-- existing database this is a no-op.
DROP INDEX IF EXISTS "conversation_messages_caseDocumentId_idx";

-- CreateTable
CREATE TABLE "site_visits" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attendedAt" TIMESTAMP(3) NOT NULL,
    "attendedByUserId" TEXT NOT NULL,
    "locationNote" TEXT,
    "findings" TEXT NOT NULL,
    "limitations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_visits_claimId_idx" ON "site_visits"("claimId");

-- CreateIndex
CREATE INDEX "site_visits_tenantId_idx" ON "site_visits"("tenantId");

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_attendedByUserId_fkey" FOREIGN KEY ("attendedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
