-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "entryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastEntryId" TEXT;
