-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "parentSession" TEXT,
    "project" TEXT NOT NULL,
    "cwd" TEXT NOT NULL,
    "title" TEXT,
    "name" TEXT,
    "model" TEXT,
    "provider" TEXT,
    "version" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "userMessages" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leafId" TEXT,
    "sourceFile" TEXT,
    "contentHash" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "parentId" TEXT,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_project_idx" ON "Session"("project");

-- CreateIndex
CREATE INDEX "Session_lastActivityAt_idx" ON "Session"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE INDEX "Entry_sessionId_seq_idx" ON "Entry"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "Entry_sessionId_timestamp_idx" ON "Entry"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "Entry_type_idx" ON "Entry"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_sessionId_entryId_key" ON "Entry"("sessionId", "entryId");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
