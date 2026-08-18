-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('BOT', 'OPEN', 'PENDING', 'SNOOZED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "MessageDirection" ADD VALUE 'INTERNAL';

-- DropIndex
-- IF EXISTS added 17 Aug 2026: this migration was generated on a database
-- where the index already existed, but in recorded history the index is not
-- created until 20260811082911 — so a clean replay (the shadow database
-- every `migrate dev` builds) failed here. Idempotent form is identical in
-- effect on every database that already ran this migration.
DROP INDEX IF EXISTS "conversation_messages_caseDocumentId_idx";

-- AlterTable
ALTER TABLE "conversation_bindings" ADD COLUMN     "firstRespondedAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "status" "ConversationStatus" NOT NULL DEFAULT 'BOT';

-- CreateIndex
CREATE INDEX "conversation_bindings_status_assignedUserId_idx" ON "conversation_bindings"("status", "assignedUserId");

-- CreateIndex
CREATE INDEX "conversation_bindings_status_snoozedUntil_idx" ON "conversation_bindings"("status", "snoozedUntil");
