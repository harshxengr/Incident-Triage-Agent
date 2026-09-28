-- AlterEnum
ALTER TYPE "IncidentStatus" ADD VALUE 'DIAGNOSED';
ALTER TYPE "IncidentStatus" ADD VALUE 'ACTION_PROPOSED';
ALTER TYPE "IncidentStatus" ADD VALUE 'APPROVED';
ALTER TYPE "IncidentStatus" ADD VALUE 'EXECUTING';

-- AlterTable
ALTER TABLE "Incident"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedBy" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "executionStartedAt" TIMESTAMP(3),
  ADD COLUMN "executionCompletedAt" TIMESTAMP(3),
  ADD COLUMN "failureReason" TEXT;