-- CreateTable
CREATE TABLE "ClientManager" (
    "clientId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" INTEGER,

    CONSTRAINT "ClientManager_pkey" PRIMARY KEY ("clientId","userId")
);

-- CreateIndex
CREATE INDEX "ClientManager_userId_idx" ON "ClientManager"("userId");

-- AddForeignKey
ALTER TABLE "ClientManager" ADD CONSTRAINT "ClientManager_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientManager" ADD CONSTRAINT "ClientManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientManager" ADD CONSTRAINT "ClientManager_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing client keeps its creator as the first assigned manager.
INSERT INTO "ClientManager" ("clientId", "userId")
SELECT "id", "userId" FROM "Client";
