-- CreateEnum
CREATE TYPE "InboundLeadKind" AS ENUM ('FORM', 'CONVERSATION');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "inboundLeadKind" "InboundLeadKind";
