-- CSP para 10.13 lets the standard turnaround give way in exceptional
-- circumstances. Recording the ground is what turns a missed window into an
-- explicable one; without it a catastrophe surge reads as mass firm failure.

-- CreateEnum
CREATE TYPE "SlaExceptionalGround" AS ENUM ('COMPLEX_CLAIM', 'CATASTROPHE_EVENT', 'SUSPECTED_FRAUD');

-- AlterTable
ALTER TABLE "sla_clocks" ADD COLUMN     "exceptionalAt" TIMESTAMP(3),
ADD COLUMN     "exceptionalByUserId" TEXT,
ADD COLUMN     "exceptionalGround" "SlaExceptionalGround",
ADD COLUMN     "exceptionalReason" TEXT,
ADD COLUMN     "exceptionalWorkingDays" INTEGER;
