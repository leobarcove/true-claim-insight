-- CreateTable
CREATE TABLE "session_client_info" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ipAddress" TEXT,
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
CREATE INDEX "session_client_info_sessionId_idx" ON "session_client_info"("sessionId");

-- AddForeignKey
ALTER TABLE "session_client_info" ADD CONSTRAINT "session_client_info_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
