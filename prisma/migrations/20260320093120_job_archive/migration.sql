-- AlterTable
ALTER TABLE "Job" ADD COLUMN "archiveReason" TEXT;
ALTER TABLE "Job" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Job_archivedAt_idx" ON "Job"("archivedAt");
