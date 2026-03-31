-- AlterTable
ALTER TABLE "Job" ADD COLUMN "gmailThreadId" TEXT;

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GmailSyncedMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddr" TEXT,
    "toAddr" TEXT,
    "date" DATETIME,
    "snippet" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GmailSyncedMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GmailSyncedAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "gmailAttachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailSyncedAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GmailSyncedMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_googleEmail_key" ON "GmailConnection"("googleEmail");

-- CreateIndex
CREATE INDEX "GmailSyncedMessage_jobId_date_idx" ON "GmailSyncedMessage"("jobId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GmailSyncedMessage_jobId_gmailMessageId_key" ON "GmailSyncedMessage"("jobId", "gmailMessageId");

-- CreateIndex
CREATE INDEX "GmailSyncedAttachment_messageId_idx" ON "GmailSyncedAttachment"("messageId");
