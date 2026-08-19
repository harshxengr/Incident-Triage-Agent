import type { Deployment } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import { GeminiClient } from "../llm/client";
import { diagnose, type CandidateDeployment } from "../agents/diagnosis";
import type { LogAnalysis } from "../agents/types";
import { xadd } from "../streams/client";
import { runWorker } from "../streams/runWorker";
import { STREAMS, GROUPS } from "../streams/topics";

const llm = new GeminiClient(process.env.GEMINI_API_KEY!);

runWorker(STREAMS.LOG_ANALYZED, GROUPS.DIAGNOSIS, "diagnosis-1", async (fields, client) => {
  const incidentId = fields.incidentId;
  if (!incidentId) {
    throw new Error("Missing incidentId in stream message");
  }
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });

  const priorAction = await prisma.agentAction.findFirstOrThrow({
    where: { incidentId, agentType: "LOG_ANALYZER" },
    orderBy: { createdAt: "desc" },
  });
  const logAnalysis = priorAction.output as unknown as LogAnalysis;

  const recentDeployments = await prisma.deployment.findMany({
    where: { service: incident.service, deployedAt: { lte: incident.createdAt } },
    orderBy: { deployedAt: "desc" },
    take: 5,
  });

  const candidates: CandidateDeployment[] = recentDeployments.map((d: Deployment) => ({
    id: d.id,
    commitHash: d.commitHash,
    commitMessage: d.commitMessage,
    minutesBeforeIncident: Math.round((incident.createdAt.getTime() - d.deployedAt.getTime()) / 60_000),
  }));

  const diagnosis = await diagnose(llm, logAnalysis, candidates);
  await logAction({
    incidentId,
    agentType: "DIAGNOSIS",
    input: { logAnalysis, candidates },
    output: diagnosis,
    confidence: diagnosis.confidence,
    broadcast: client,
  });

  await xadd(client, STREAMS.DIAGNOSED, { incidentId });
}).catch((err) => {
  console.error("diagnosis worker crashed:", err);
  process.exit(1);
});