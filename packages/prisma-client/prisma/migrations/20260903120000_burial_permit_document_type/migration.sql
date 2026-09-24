-- The burial permit is not a death certificate, and filing it as one puts an
-- interim document in the evidence record under the name of the final one.
-- JPN issues the permit at once and the Sijil Kematian up to seven days later,
-- so on a bereavement cancellation the permit is usually what exists first.
--
-- Own migration: a newly-added enum value cannot be used until the transaction
-- that added it has committed.
ALTER TYPE "DocumentType" ADD VALUE 'BURIAL_PERMIT';
