-- The web form is its own channel, not a surface on WEB_CHAT.
--
-- A ConversationBinding is keyed on (channel, platformUserId), so this value is
-- the whole of the separation decided in WEB_FORM_MICROSITE_PLAN D1: the same
-- visitor on /form and on /chat holds two bindings that never meet, and moving
-- between them starts a fresh claim request rather than resurrecting a draft.
--
-- Nothing is backfilled. Rows written before this migration were genuinely web
-- chat, and relabelling them would falsify which surface those claimants used.

-- AlterEnum
ALTER TYPE "CaseChannel" ADD VALUE 'WEB_FORM';
