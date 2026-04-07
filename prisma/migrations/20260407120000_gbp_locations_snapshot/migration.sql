-- AlterTable
ALTER TABLE "GoogleBusinessConnection" ADD COLUMN "gbpLocationsSnapshot" JSONB,
ADD COLUMN "gbpLocationsSnapshotAt" TIMESTAMP(3);
