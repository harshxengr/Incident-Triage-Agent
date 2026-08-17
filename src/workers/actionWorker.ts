import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import { GeminiClient } from "../llm/client";
import { decideAction } from "../agents/action";
import type { Diagnosis } from "../agents/types";
import { xadd } from "../streams/client";
import { runWorker } from "../streams/runWorker";
import { STREAMS, GROUPS } from "../streams/topics";

const llm = new GeminiClient(process.env.GEMINI_API_KEY!);

runWorker(STREAMS.DIAGNOSED, GROUPS.ACTION, "action-1", async (fields, client) => {
  const incidentId = fields.incidentId;
  if (!incidentId) {
    throw new Error("Missing incidentId in stream message");
  }

  const priorAction = await prisma.agentAction.findFirstOrThrow({
    where: { incidentId, agentType: "DIAGNOSIS" },
    orderBy: { createdAt: "desc" },
  });
  const diagnosis = priorAction.output as unknown as Diagnosis;

  const actionDecision = await decideAction(llm, diagnosis);
  await logAction({
    incidentId,
    agentType: "ACTION",
    input: { diagnosis },
    output: actionDecision,
    reasoning: actionDecision.reasoning,
    confidence: actionDecision.confidence,
  });

  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status: actionDecision.requiresHuman ? "PENDING_APPROVAL" : "RESOLVED",
      resolvedAt: actionDecision.requiresHuman ? null : new Date(),
      suspectedDeploymentId: diagnosis.suspectedDeploymentId,
    },
  });

  await xadd(client, STREAMS.ACTION_DECIDED, { incidentId });
}).catch((err) => {
  console.error("action worker crashed:", err);
  process.exit(1);
});