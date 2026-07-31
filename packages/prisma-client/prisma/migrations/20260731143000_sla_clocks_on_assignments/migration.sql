-- AlterTable
ALTER TABLE "sla_clocks" ADD COLUMN     "assignmentId" TEXT,
ALTER COLUMN "claimId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "sla_clocks_assignmentId_idx" ON "sla_clocks"("assignmentId");

-- AddForeignKey
ALTER TABLE "sla_clocks" ADD CONSTRAINT "sla_clocks_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A clock must hang on exactly one thing.
--
-- Without this, a row with neither set is orphaned (it measures nothing and can
-- never be stopped) and a row with both is ambiguous about what it is timing.
-- Both states are invisible until the sweep reports a breach nobody can explain.
ALTER TABLE "sla_clocks"
  ADD CONSTRAINT "sla_clocks_exactly_one_subject"
  CHECK (num_nonnulls("claimId", "assignmentId") = 1);

-- The live-clock guarantee, extended to assignments. The claim index already
-- exists from the original migration; this is its counterpart.
CREATE UNIQUE INDEX "sla_clocks_one_live_per_assignment_stage"
  ON "sla_clocks" ("assignmentId", "stage")
  WHERE "state" IN ('RUNNING', 'PAUSED');
