-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "prodPlanLaborHours" DOUBLE PRECISION,
ADD COLUMN     "prodPlanMaterials" TEXT,
ADD COLUMN     "prodPlanClientCommHours" DOUBLE PRECISION,
ADD COLUMN     "prodPlanDesignHours" DOUBLE PRECISION,
ADD COLUMN     "prodWrapUpNotes" TEXT,
ADD COLUMN     "prodWrapUpAt" TIMESTAMP(3);
