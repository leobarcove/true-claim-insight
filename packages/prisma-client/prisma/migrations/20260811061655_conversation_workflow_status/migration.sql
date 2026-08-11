-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('BOT', 'OPEN', 'PENDING', 'SNOOZED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "MessageDirection" ADD VALUE 'INTERNAL';

-- DropIndex
DROP INDEX "conversation_messages_caseDocumentId_idx";

-- AlterTable
ALTER TABLE "conversation_bindings" ADD COLUMN     "firstRespondedAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "status" "ConversationStatus" NOT NULL DEFAULT 'BOT';

-- CreateIndex
CREATE INDEX "conversation_bindings_status_assignedUserId_idx" ON "conversation_bindings"("status", "assignedUserId");

-- CreateIndex
CREATE INDEX "conversation_bindings_status_snoozedUntil_idx" ON "conversation_bindings"("status", "snoozedUntil");
