-- AlterEnum
ALTER TYPE "InboundLeadKind" ADD VALUE 'YELP_LEAD';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "yelpLeadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Job_yelpLeadId_key" ON "Job"("yelpLeadId");
