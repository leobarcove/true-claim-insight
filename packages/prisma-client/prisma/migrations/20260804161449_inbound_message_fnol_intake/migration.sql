-- CreateEnum
CREATE TYPE "InboundMessageStatus" AS ENUM ('PENDING', 'PROCESSED', 'NEEDS_REVIEW', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "InboundMessageStatus" NOT NULL DEFAULT 'PENDING',
    "caseId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "parsed" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_messageId_key" ON "inbound_messages"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_caseId_key" ON "inbound_messages"("caseId");

-- CreateIndex
CREATE INDEX "inbound_messages_status_receivedAt_idx" ON "inbound_messages"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_messages_tenantId_idx" ON "inbound_messages"("tenantId");

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

