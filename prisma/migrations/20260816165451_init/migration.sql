-- CreateEnum
CREATE TYPE "ServiceName" AS ENUM ('PAYMENTS_SERVICE', 'AUTH_SERVICE', 'ORDER_SERVICE', 'NOTIFICATION_SERVICE', 'DATABASE', 'REDIS_CACHE');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'DIAGNOSING', 'PENDING_APPROVAL', 'RESOLVED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('ORCHESTRATOR', 'LOG_ANALYZER', 'DIAGNOSIS', 'ACTION', 'COMMUNICATOR');

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "service" "ServiceName" NOT NULL,
    "commitHash" TEXT NOT NULL,
    "commitMessage" TEXT NOT NULL,
    "deployedBy" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawLog" TEXT NOT NULL,
    "service" "ServiceName" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'LOW',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "suspectedDeploymentId" TEXT,
    "expectedDiagnosis" TEXT NOT NULL,
    "expectedAction" TEXT NOT NULL,
    "expectedRequiresHuman" BOOLEAN NOT NULL DEFAULT false,
    "scenarioType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "reasoning" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "service" "ServiceName" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_service_deployedAt_idx" ON "Deployment"("service", "deployedAt");

-- CreateIndex
CREATE INDEX "Incident_status_severity_idx" ON "Incident"("status", "severity");

-- CreateIndex
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");

-- CreateIndex
CREATE INDEX "AgentAction_incidentId_createdAt_idx" ON "AgentAction"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_suspectedDeploymentId_fkey" FOREIGN KEY ("suspectedDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
