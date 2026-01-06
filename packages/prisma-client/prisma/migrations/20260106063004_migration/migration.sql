-- CreateTable
CREATE TABLE "deception_scores" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deceptionScore" DECIMAL(5,4) NOT NULL,
    "voiceStress" DECIMAL(5,4) NOT NULL,
    "visualBehavior" DECIMAL(5,4) NOT NULL,
    "expressionMeasurement" DECIMAL(5,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deception_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deception_scores_sessionId_idx" ON "deception_scores"("sessionId");

-- AddForeignKey
ALTER TABLE "deception_scores" ADD CONSTRAINT "deception_scores_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
