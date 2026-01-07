-- CreateEnum
CREATE TYPE "VideoUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "video_uploads" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    "processedUntil" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "VideoUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_uploads_claimId_idx" ON "video_uploads"("claimId");

-- CreateIndex
CREATE INDEX "video_uploads_status_idx" ON "video_uploads"("status");

-- AddForeignKey
ALTER TABLE "video_uploads" ADD CONSTRAINT "video_uploads_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
