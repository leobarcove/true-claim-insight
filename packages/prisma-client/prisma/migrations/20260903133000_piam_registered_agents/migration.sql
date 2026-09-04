CREATE TABLE "piam_registered_agents" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "principals" JSONB NOT NULL,
    "corporateNominees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "permanentUrl" TEXT,
    "sourceUrl" TEXT NOT NULL DEFAULT 'https://oars.piam.org.my/eid/',
    "sourceCheckedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "piam_registered_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "piam_registered_agents_registrationNumber_key"
ON "piam_registered_agents"("registrationNumber");

CREATE INDEX "piam_registered_agents_agencyName_idx"
ON "piam_registered_agents"("agencyName");

CREATE INDEX "piam_registered_agents_sourceCheckedAt_idx"
ON "piam_registered_agents"("sourceCheckedAt");
