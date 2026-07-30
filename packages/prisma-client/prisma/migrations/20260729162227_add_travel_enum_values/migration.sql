-- CreateEnum
CREATE TYPE "TravelClaimType" AS ENUM ('FLIGHT_DELAY', 'LUGGAGE_DAMAGE', 'LUGGAGE_LOSS', 'TRIP_CANCELLATION', 'MEDICAL');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'REFERRED_TO_EXPERT', 'CONVERTED', 'REJECTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CaseChannel" AS ENUM ('WEB_CHAT', 'STAFF', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CaseInitiator" AS ENUM ('CLAIMANT', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PolicySource" AS ENUM ('MANUAL', 'API', 'SCRAPED');

-- CreateEnum
CREATE TYPE "DocumentValidationStatus" AS ENUM ('PENDING', 'PASSED', 'FLAGGED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "ClaimCategory" ADD VALUE 'TRAVEL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'BOARDING_PASS';
ALTER TYPE "DocumentType" ADD VALUE 'FLIGHT_ITINERARY';
ALTER TYPE "DocumentType" ADD VALUE 'AIRLINE_DELAY_CONFIRMATION';
ALTER TYPE "DocumentType" ADD VALUE 'PROPERTY_IRREGULARITY_REPORT';
ALTER TYPE "DocumentType" ADD VALUE 'BAGGAGE_TAG';
ALTER TYPE "DocumentType" ADD VALUE 'PASSPORT';
ALTER TYPE "DocumentType" ADD VALUE 'OVERSEAS_MEDICAL_BILL';
ALTER TYPE "DocumentType" ADD VALUE 'TRAVEL_BOOKING_INVOICE';
