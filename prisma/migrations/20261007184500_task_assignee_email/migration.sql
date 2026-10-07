-- Ticket tasks can be assigned like shop to-dos; null = unassigned.
ALTER TABLE "Task" ADD COLUMN "assigneeEmail" TEXT;

-- CreateIndex
CREATE INDEX "Task_assigneeEmail_status_idx" ON "Task"("assigneeEmail", "status");
