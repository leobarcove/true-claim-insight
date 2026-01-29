-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "trinity_checks" ADD COLUMN     "reasoning" TEXT,
ADD COLUMN     "reasoningInsights" JSONB;
