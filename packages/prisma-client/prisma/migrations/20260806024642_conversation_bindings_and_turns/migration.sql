-- CreateEnum
CREATE TYPE "InboundTurnStatus" AS ENUM ('PENDING', 'PROCESSED', 'ONBOARDING', 'UNPARSEABLE', 'FAILED');

-- CreateTable
CREATE TABLE "conversation_bindings" (
    "id" TEXT NOT NULL,
    "channel" "CaseChannel" NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "claimantId" TEXT,
    "activeCaseId" TEXT,
    "tenantId" TEXT,
    "pendingPhone" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_turns" (
    "id" TEXT NOT NULL,
    "channel" "CaseChannel" NOT NULL,
    "platformMessageId" TEXT NOT NULL,
    "bindingId" TEXT,
    "text" TEXT,
    "mediaRef" TEXT,
    "stepId" TEXT,
    "status" "InboundTurnStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "inbound_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_bindings_claimantId_idx" ON "conversation_bindings"("claimantId");

-- CreateIndex
CREATE INDEX "conversation_bindings_activeCaseId_idx" ON "conversation_bindings"("activeCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_bindings_channel_platformUserId_key" ON "conversation_bindings"("channel", "platformUserId");

-- CreateIndex
CREATE INDEX "inbound_turns_status_receivedAt_idx" ON "inbound_turns"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_turns_bindingId_idx" ON "inbound_turns"("bindingId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_turns_channel_platformMessageId_key" ON "inbound_turns"("channel", "platformMessageId");

-- AddForeignKey
ALTER TABLE "conversation_bindings" ADD CONSTRAINT "conversation_bindings_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "claimants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_bindings" ADD CONSTRAINT "conversation_bindings_activeCaseId_fkey" FOREIGN KEY ("activeCaseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_turns" ADD CONSTRAINT "inbound_turns_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "conversation_bindings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
