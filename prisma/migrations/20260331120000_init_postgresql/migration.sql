-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "BoardStatus" AS ENUM ('REQUESTED', 'QUOTED', 'APPROVED', 'PRODUCTION', 'READY', 'INVOICED', 'DELIVERED', 'PAID');

-- CreateEnum
CREATE TYPE "ArchiveReason" AS ENUM ('DONE', 'LOST');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('UNKNOWN', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('NONE', 'DRAFT', 'OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('QUICKBOOKS', 'APP', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventProcessStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "quickbooksCompanyId" TEXT,
    "quickbooksCustomerId" TEXT,
    "quickbooksEstimateId" TEXT,
    "quickbooksInvoiceId" TEXT,
    "customerName" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "estimateStatus" "EstimateStatus" NOT NULL DEFAULT 'UNKNOWN',
    "invoiceStatus" "InvoiceStatus" NOT NULL DEFAULT 'NONE',
    "estimateAmountCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceAmountCents" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "estimateSentAt" TIMESTAMP(3),
    "estimateAcceptedAt" TIMESTAMP(3),
    "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "boardStatus" "BoardStatus" NOT NULL DEFAULT 'REQUESTED',
    "archivedAt" TIMESTAMP(3),
    "archiveReason" "ArchiveReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gmailThreadId" TEXT,
    "gmailConnectionId" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSyncedMessage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddr" TEXT,
    "toAddr" TEXT,
    "date" TIMESTAMP(3),
    "snippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSyncedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSyncedAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "gmailAttachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmailSyncedAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedEmail" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddr" TEXT,
    "toAddr" TEXT,
    "sentAt" TIMESTAMP(3),
    "linkUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "source" "EventSource" NOT NULL,
    "eventName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerEventKey" TEXT NOT NULL,
    "realmId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EventProcessStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorText" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "QuickBooksWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksToken" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_quickbooksEstimateId_key" ON "Job"("quickbooksEstimateId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_quickbooksInvoiceId_key" ON "Job"("quickbooksInvoiceId");

-- CreateIndex
CREATE INDEX "Job_boardStatus_idx" ON "Job"("boardStatus");

-- CreateIndex
CREATE INDEX "Job_archivedAt_idx" ON "Job"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_googleEmail_key" ON "GmailConnection"("googleEmail");

-- CreateIndex
CREATE INDEX "GmailSyncedMessage_jobId_date_idx" ON "GmailSyncedMessage"("jobId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GmailSyncedMessage_jobId_gmailMessageId_key" ON "GmailSyncedMessage"("jobId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "GmailSyncedAttachment_messageId_idx" ON "GmailSyncedAttachment"("messageId");

-- CreateIndex
CREATE INDEX "LinkedEmail_jobId_createdAt_idx" ON "LinkedEmail"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_jobId_createdAt_idx" ON "ActivityLog"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksWebhookEvent_providerEventKey_key" ON "QuickBooksWebhookEvent"("providerEventKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksToken_realmId_key" ON "QuickBooksToken"("realmId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_gmailConnectionId_fkey" FOREIGN KEY ("gmailConnectionId") REFERENCES "GmailConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailSyncedMessage" ADD CONSTRAINT "GmailSyncedMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailSyncedAttachment" ADD CONSTRAINT "GmailSyncedAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GmailSyncedMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedEmail" ADD CONSTRAINT "LinkedEmail_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

