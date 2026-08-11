-- A tapped button carried no text, so the transcript stored NULL and the
-- operator inbox rendered "—" for every choice the claimant made: claim type,
-- consent agreement, cancellation reason, the review confirmation.
--
-- The value is kept alongside the readable text rather than instead of it.
-- `text` is what the claimant saw themselves choose; this is what the flow
-- received. Wording can be revised later — the value is what drove the
-- decision, and a dispute is about the decision.
ALTER TABLE "conversation_messages" ADD COLUMN "callbackValue" TEXT;
