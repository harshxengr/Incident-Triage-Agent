import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import { GeminiClient } from "../llm/client";
import { decideAction } from "../agents/action";
import type { Diagnosis } from "../agents/types";
import { xadd } from "../streams/client";
import { runWorker } from "../streams/runWorker";
import { STREAMS, GROUPS } from "../streams/topics";
import { markIncidentDeadLettered } from "./deadLetterIncident";
import { SimulatedActionExecutor } from "../execution/actionExecutor";

const executor = new SimulatedActionExecutor();
const llm = new GeminiClient(process.env.GEMINI_API_KEY!);

runWorker(
  STREAMS.DIAGNOSED,
  GROUPS.ACTION,
  "action-1",
  async (fields, client) => {
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

    // Persist the decision before execution so the lifecycle always records
    // the moment the agent proposed an action.
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: "ACTION_PROPOSED",
        resolvedAt: null,
        failureReason: null,
        suspectedDeploymentId: diagnosis.suspectedDeploymentId,
      },
    });

    if (!actionDecision.requiresHuman) {
      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          status: "EXECUTING",
          executionStartedAt: new Date(),
        },
      });

      const execution = await executor.execute(actionDecision.action, actionDecision.target);
      actionDecision.execution = execution;

      const resolved = executionSucceeded(execution);
      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          status: resolved ? "RESOLVED" : "FAILED",
          resolvedAt: resolved ? new Date() : null,
          executionCompletedAt: new Date(),
          failureReason: resolved ? null : execution.detail,
        },
      });
    } else {
      await prisma.incident.update({
        where: { id: incidentId },
        data: { status: "PENDING_APPROVAL" },
      });
    }

    await logAction({
      incidentId,
      agentType: "ACTION",
      input: { diagnosis },
      output: actionDecision,
      reasoning: actionDecision.reasoning,
      confidence: actionDecision.confidence,
      broadcast: client,
    });

    await xadd(client, STREAMS.ACTION_DECIDED, { incidentId });
  },
  { onDeadLetter: markIncidentDeadLettered }
).catch((err) => {
  console.error("action worker crashed:", err);
});

function executionSucceeded(execution: { executed: boolean } | undefined): boolean {
  return execution?.executed === true;
}
