-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "details" JSONB;

-- CreateIndex
CREATE INDEX "ActivityLog_entity_entityId_createdAt_idx" ON "ActivityLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
