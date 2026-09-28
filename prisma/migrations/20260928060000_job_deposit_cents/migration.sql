-- Unapplied QuickBooks customer payments (deposits not on an invoice yet).
ALTER TABLE "Job" ADD COLUMN "depositCents" INTEGER NOT NULL DEFAULT 0;
