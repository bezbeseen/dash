-- AlterTable
ALTER TABLE "Job" ADD COLUMN "yelpApiLeadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_yelpApiLeadId_key" ON "Job"("yelpApiLeadId");
