-- A trip cancelled by a bereavement was routed to the illness branch, so the
-- only evidence ever asked for was a medical report — the wrong document, and
-- addressed to the wrong person. The death branch needs its own two values.
--
-- Own migration because Postgres will not let a newly-added enum value be used
-- until the transaction that added it has committed.
ALTER TYPE "DocumentType" ADD VALUE 'DEATH_CERTIFICATE';
ALTER TYPE "DocumentType" ADD VALUE 'PROOF_OF_RELATIONSHIP';
