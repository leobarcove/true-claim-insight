-- A chat attachment was stored as a Telegram file_id, which points at their
-- servers and cannot be served to an operator. The file we actually keep is a
-- CaseDocument, and nothing recorded which turn produced which document — so
-- the transcript could show "📎 Attachment" and nothing more.
--
-- Stored rather than inferred from (case, step): a claimant may file more than
-- one claim from the same conversation, and matching on the binding's current
-- case would attach an old photo to a new claim.
ALTER TABLE "conversation_messages" ADD COLUMN "caseDocumentId" TEXT;
CREATE INDEX "conversation_messages_caseDocumentId_idx" ON "conversation_messages"("caseDocumentId");
