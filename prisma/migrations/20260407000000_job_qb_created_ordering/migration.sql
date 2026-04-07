-- AlterTable
ALTER TABLE "Job" ADD COLUMN "estimateCreatedAtQbo" TIMESTAMP(3),
ADD COLUMN "invoiceCreatedAtQbo" TIMESTAMP(3),
ADD COLUMN "qbOrderingAt" TIMESTAMP(3);

-- Approximate estimate QBO time from stored txn date until next sync provides MetaData.CreateTime.
UPDATE "Job" SET "estimateCreatedAtQbo" = "estimateSentAt" WHERE "estimateSentAt" IS NOT NULL;

-- Sort key: estimate-oriented date, else row creation (invoice-only pre-sync).
UPDATE "Job"
SET "qbOrderingAt" = COALESCE("estimateCreatedAtQbo", "invoiceCreatedAtQbo", "estimateSentAt", "createdAt")
WHERE "qbOrderingAt" IS NULL;

CREATE INDEX "Job_qbOrderingAt_idx" ON "Job"("qbOrderingAt");
