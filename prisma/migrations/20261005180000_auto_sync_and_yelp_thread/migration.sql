-- Yelp Biz thread id: shared by every mailbox's copy of a lead and by its follow-ups.
ALTER TABLE "Job" ADD COLUMN "yelpThreadId" TEXT;
CREATE UNIQUE INDEX "Job_yelpThreadId_key" ON "Job"("yelpThreadId");

-- Automatic QuickBooks + Yelp sync bookkeeping (single row).
CREATE TABLE "AutoSyncState" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "qboChangedSince" TIMESTAMP(3),
    "invoicesRefreshedAt" TIMESTAMP(3),
    "yelpScannedAt" TIMESTAMP(3),
    "lastResult" JSONB,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoSyncState_pkey" PRIMARY KEY ("id")
);
