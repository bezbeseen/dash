-- CreateTable
CREATE TABLE "LinkedEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddr" TEXT,
    "toAddr" TEXT,
    "sentAt" DATETIME,
    "linkUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkedEmail_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LinkedEmail_jobId_createdAt_idx" ON "LinkedEmail"("jobId", "createdAt");
