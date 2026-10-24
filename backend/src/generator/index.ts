
import { prisma } from "../db/client";
import {
  generateDeploymentPool,
  generateIncidents,
} from "./scenarios";
import type { GeneratedDeployment } from "../types";

const DEPLOYMENT_COUNT = 15;
const INCIDENT_COUNT = 20;

type PersistedDeployment = GeneratedDeployment & {
  id: string;
};

function toPersistedDeployment(row: {
  id: string;
  service: string;
  commitHash: string;
  commitMessage: string;
  deployedBy: string;
  deployedAt: Date;
}): PersistedDeployment {
  return {
    id: row.id,
    service: row.service as GeneratedDeployment["service"],
    commitHash: row.commitHash,
    commitMessage: row.commitMessage,
    deployedBy: row.deployedBy,
    deployedAt: row.deployedAt,
  };
}

async function seedDeployments(): Promise<PersistedDeployment[]> {
  const generated = generateDeploymentPool(DEPLOYMENT_COUNT);
  const created: PersistedDeployment[] = [];

  for (const deployment of generated) {
    const row = await prisma.deployment.create({
      data: deployment,
    });

    created.push(toPersistedDeployment(row));
  }

  console.log(`Seeded ${created.length} deployments.`);
  return created;
}

async function loadPersistedDeployments(): Promise<
  PersistedDeployment[]
> {
  const rows = await prisma.deployment.findMany({
    orderBy: { deployedAt: "asc" },
  });

  return rows.map(toPersistedDeployment);
}

async function seedIncidents(
  deployments: PersistedDeployment[],
): Promise<void> {
  if (deployments.length === 0) {
    throw new Error(
      "No deployments in DB yet. Run seed:deployments or seed:all first.",
    );
  }

  // Generate incidents against the exact persisted deployment objects
  // whose IDs will be used for the incident relationship.
  const incidents = generateIncidents(
    INCIDENT_COUNT,
    deployments,
  );

  let created = 0;

  for (const incident of incidents) {
    const index = incident.suspectedDeploymentIndex;

    const suspectedDeployment =
      index === null ? null : deployments[index];

    if (index !== null && !suspectedDeployment) {
      throw new Error(
        `Missing deployment at index ${index} for incident "${incident.title}".`,
      );
    }

    const suspectedDeploymentId =
      suspectedDeployment?.id ?? null;

    await prisma.incident.create({
      data: {
        title: incident.title,
        rawLog: incident.rawLog,
        service: incident.service,
        severity: incident.severity,
        status: incident.status,
        suspectedDeploymentId,
        createdAt: incident.createdAt,
        expectedDiagnosis: incident.expectedDiagnosis,
        expectedAction: incident.expectedAction,
        expectedRequiresHuman:
          incident.expectedRequiresHuman,
        scenarioType: incident.scenarioType,
      },
    });

    created++;
  }

  console.log(`Seeded ${created} incidents.`);

  const distribution = await prisma.incident.groupBy({
    by: ["scenarioType"],
    _count: true,
  });

  console.log("Distribution by scenario type:", distribution);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "all";

  if (mode === "deployments") {
    await seedDeployments();
  } else if (mode === "all") {
    const deployments = await seedDeployments();
    await seedIncidents(deployments);
  } else if (mode === "incidents") {
    const deployments = await loadPersistedDeployments();
    await seedIncidents(deployments);
  } else {
    console.error(
      `Unknown mode "${mode}". Use: deployments | incidents | all`,
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
