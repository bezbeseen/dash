-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quickbooksCompanyId" TEXT,
    "quickbooksCustomerId" TEXT,
    "quickbooksEstimateId" TEXT,
    "quickbooksInvoiceId" TEXT,
    "customerName" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "estimateStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "invoiceStatus" TEXT NOT NULL DEFAULT 'NONE',
    "estimateAmountCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceAmountCents" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "estimateSentAt" DATETIME,
    "estimateAcceptedAt" DATETIME,
    "productionStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" DATETIME,
    "readyAt" DATETIME,
    "deliveredAt" DATETIME,
    "paidAt" DATETIME,
    "boardStatus" TEXT NOT NULL DEFAULT 'REQUESTED',
    "archivedAt" DATETIME,
    "archiveReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gmailThreadId" TEXT,
    "gmailConnectionId" TEXT,
    CONSTRAINT "Job_gmailConnectionId_fkey" FOREIGN KEY ("gmailConnectionId") REFERENCES "GmailConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("amountPaidCents", "archiveReason", "archivedAt", "boardStatus", "createdAt", "customerName", "deliveredAt", "estimateAcceptedAt", "estimateAmountCents", "estimateSentAt", "estimateStatus", "gmailThreadId", "id", "invoiceAmountCents", "invoiceStatus", "paidAt", "productionStatus", "projectName", "quickbooksCompanyId", "quickbooksCustomerId", "quickbooksEstimateId", "quickbooksInvoiceId", "readyAt", "startedAt", "updatedAt") SELECT "amountPaidCents", "archiveReason", "archivedAt", "boardStatus", "createdAt", "customerName", "deliveredAt", "estimateAcceptedAt", "estimateAmountCents", "estimateSentAt", "estimateStatus", "gmailThreadId", "id", "invoiceAmountCents", "invoiceStatus", "paidAt", "productionStatus", "projectName", "quickbooksCompanyId", "quickbooksCustomerId", "quickbooksEstimateId", "quickbooksInvoiceId", "readyAt", "startedAt", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_quickbooksEstimateId_key" ON "Job"("quickbooksEstimateId");
CREATE UNIQUE INDEX "Job_quickbooksInvoiceId_key" ON "Job"("quickbooksInvoiceId");
CREATE INDEX "Job_boardStatus_idx" ON "Job"("boardStatus");
CREATE INDEX "Job_archivedAt_idx" ON "Job"("archivedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
