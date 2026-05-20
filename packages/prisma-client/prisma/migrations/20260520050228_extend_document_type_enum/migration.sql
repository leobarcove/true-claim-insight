-- Extend DocumentType with non-motor evidence values.
-- Kept in its own migration so the ALTER TYPE statements are isolated from
-- the rest of the non-motor schema work — Postgres only allows newly-added
-- enum values to be used after the transaction that added them commits.
ALTER TYPE "DocumentType" ADD VALUE 'BOMBA_REPORT';
ALTER TYPE "DocumentType" ADD VALUE 'FLOOD_AUTHORITY_REPORT';
ALTER TYPE "DocumentType" ADD VALUE 'WEATHER_REPORT';
ALTER TYPE "DocumentType" ADD VALUE 'UTILITY_SURGE_REPORT';
ALTER TYPE "DocumentType" ADD VALUE 'INVENTORY_LIST';
ALTER TYPE "DocumentType" ADD VALUE 'PROOF_OF_OWNERSHIP';
ALTER TYPE "DocumentType" ADD VALUE 'MEDICAL_REPORT';
ALTER TYPE "DocumentType" ADD VALUE 'PROPERTY_TITLE';
ALTER TYPE "DocumentType" ADD VALUE 'UTILITY_BILL';
