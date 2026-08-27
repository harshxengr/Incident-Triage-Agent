import { prisma } from "../db/client";
import { generateDeploymentPool, generateIncidents } from "../generator/scenarios";
import { createStreamClient, xadd } from "./client";
import { STREAMS } from "./topics";

// Public-facing, no auth needed - safe by construction because it only
// ever creates data from our own synthetic generator (Phase 1), never
// from arbitrary caller input. This is what makes it safe to expose on a
// public portfolio dashboard without an API key, unlike /webhook/incident.
export async function triggerDemoIncident(): Promise<{ incidentId: string; title: string }> {
  // reuse a few recent real deployments if any exist, so the correlation
  // story stays plausible - falls back to generating a small fresh pool
  // if the DB has none yet.
  let deploymentPool = await prisma.deployment.findMany({
    orderBy: { deployedAt: "desc" },
    take: 15,
  });

  if (deploymentPool.length === 0) {
    const generated = generateDeploymentPool(15);
    deploymentPool = await Promise.all(generated.map((d) => prisma.deployment.create({ data: d })));
  }

  const syntheticDeployments = deploymentPool.map((d) => ({
    service: d.service,
    commitHash: d.commitHash,
    commitMessage: d.commitMessage,
    deployedBy: d.deployedBy,
    deployedAt: d.deployedAt,
  }));

  const [incident] = generateIncidents(1, syntheticDeployments as any);
  if (!incident) {
    throw new Error("The incident generator did not return an incident");
  }

  const suspectedDeploymentId =
    incident.suspectedDeploymentIndex !== null ? deploymentPool[incident.suspectedDeploymentIndex]?.id ?? null : null;

  const created = await prisma.incident.create({
    data: {
      title: incident.title,
      rawLog: incident.rawLog,
      service: incident.service,
      severity: incident.severity,
      status: "OPEN",
      suspectedDeploymentId,
      createdAt: new Date(), // override the generator's backdated timestamp - this should look "live"
      expectedDiagnosis: incident.expectedDiagnosis,
      expectedAction: incident.expectedAction,
      expectedRequiresHuman: incident.expectedRequiresHuman,
      scenarioType: incident.scenarioType,
    },
  });

  const streamClient = createStreamClient();
  await xadd(streamClient, STREAMS.NEW, { incidentId: created.id });
  streamClient.close();

  return { incidentId: created.id, title: created.title };
}