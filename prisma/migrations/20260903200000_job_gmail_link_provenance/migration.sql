-- CreateEnum
CREATE TYPE "GmailLinkSource" AS ENUM ('MANUAL', 'CONFIRMED', 'AUTO');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "gmailLinkSource" "GmailLinkSource";
ALTER TABLE "Job" ADD COLUMN "gmailLinkedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "gmailLinkConfidence" INTEGER;

-- Existing links were all pasted by a human, so they must never be overwritten automatically.
UPDATE "Job" SET "gmailLinkSource" = 'MANUAL' WHERE "gmailThreadId" IS NOT NULL;
