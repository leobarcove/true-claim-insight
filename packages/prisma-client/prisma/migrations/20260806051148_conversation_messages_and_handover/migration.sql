/*
  Warnings:

  - You are about to drop the `inbound_turns` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ConversationMessageStatus" AS ENUM ('PENDING', 'PROCESSED', 'ONBOARDING', 'UNPARSEABLE', 'AWAITING_AGENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('BOT', 'HANDOVER');

-- DropForeignKey
ALTER TABLE "inbound_turns" DROP CONSTRAINT "inbound_turns_bindingId_fkey";

-- AlterTable
ALTER TABLE "conversation_bindings" ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "handoverAt" TIMESTAMP(3),
ADD COLUMN     "handoverReason" TEXT,
ADD COLUMN     "mode" "ConversationMode" NOT NULL DEFAULT 'BOT',
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "inbound_turns";

-- DropEnum
DROP TYPE "InboundTurnStatus";

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "channel" "CaseChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "platformMessageId" TEXT,
    "bindingId" TEXT,
    "text" TEXT,
    "mediaRef" TEXT,
    "stepId" TEXT,
    "sentByUserId" TEXT,
    "status" "ConversationMessageStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_messages_bindingId_createdAt_idx" ON "conversation_messages"("bindingId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_messages_status_createdAt_idx" ON "conversation_messages"("status", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_bindings_mode_handoverAt_idx" ON "conversation_bindings"("mode", "handoverAt");

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "conversation_bindings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Inbound idempotency. Prisma cannot express a partial unique index, and a
-- plain one would not do here: outbound rows legitimately carry no platform id
-- until the platform returns one, and Postgres treats every NULL as distinct.
--
-- This is the constraint the whole dedupe strategy rests on — a unique
-- violation is how the gateway recognises a redelivered update. Without it,
-- every platform retry answers the same question twice.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "conversation_messages_inbound_platform_id"
  ON "conversation_messages"("channel", "platformMessageId")
  WHERE "platformMessageId" IS NOT NULL;
