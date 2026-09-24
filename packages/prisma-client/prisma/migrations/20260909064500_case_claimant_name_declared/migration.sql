-- The claimant's name as declared for this claim.
--
-- `Claimant` is one shared identity row per phone number and its `fullName` is
-- only filled when blank, so a name confirmed at a later intake was dropped and
-- the case showed the older one. This records what was declared for this claim
-- without touching the shared identity row.
ALTER TABLE "cases"
ADD COLUMN "claimantNameDeclared" TEXT;
