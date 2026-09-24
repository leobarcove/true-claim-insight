-- Agent-assisted intake: staff sign in by mobile, and verbal consent is its own
-- kind of record.
--
-- 1. A staff phone number becomes a credential.
--
-- Staff reach the assisted form by proving their own number with a WhatsApp
-- code — there is no password on that site. A number shared by two accounts
-- would make "who is signing in?" unanswerable: the lookup would have to pick
-- one, and the wrong pick files a claimant's data under the wrong person. The
-- constraint is what makes the lookup safe, not a tidiness rule.
ALTER TABLE "users" ADD CONSTRAINT "users_phoneNumber_key" UNIQUE ("phoneNumber");

-- 2. Verbal consent, attested by an agent, is not the same as staff capture.
--
-- STAFF_CAPTURED reads equally as "staff typed it while the claimant watched
-- the screen". Only this one rests entirely on an agent's word about a
-- conversation the platform cannot see, and the record has to say so.
ALTER TYPE "ConsentChannel" ADD VALUE 'VERBAL_AGENT_ATTESTED';
