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
import { transitionIncident } from "../incidents/lifecycle";
import { classifyActionHandling } from "../agents/actionOutcome";

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
    await transitionIncident(incidentId, "ACTION_PROPOSED", {
      from: "DIAGNOSED",
      data: {
        resolvedAt: null,
        failureReason: null,
        suspectedDeploymentId: diagnosis.suspectedDeploymentId,
      },
    });


    const handling = classifyActionHandling(
      actionDecision.action,
      actionDecision.requiresHuman,
    );

    if (handling === "NO_ACTION_REQUIRED") {
      await transitionIncident(incidentId, "NO_ACTION_REQUIRED", {
        from: "ACTION_PROPOSED",
        data: { failureReason: null },
      });
    } else if (handling === "ESCALATED") {
      await transitionIncident(incidentId, "ESCALATED", {
        from: "ACTION_PROPOSED",
        data: {
          resolvedAt: null,
          failureReason: null,
        },
      });
    } else if (handling === "PENDING_APPROVAL") {
      await transitionIncident(incidentId, "PENDING_APPROVAL", {
        from: "ACTION_PROPOSED",
      });
    } else {
      await transitionIncident(incidentId, "EXECUTING", {
        from: "ACTION_PROPOSED",
        data: { executionStartedAt: new Date() },
      });

      const execution = await executor.execute(
        actionDecision.action,
        actionDecision.target,
      );

      actionDecision.execution = execution;

      const finalStatus = execution.simulated
        ? "SIMULATED"
        : execution.executed
          ? "RESOLVED"
          : "FAILED";

      await transitionIncident(incidentId, finalStatus, {
        from: "EXECUTING",
        data: {
          resolvedAt:
            finalStatus === "RESOLVED" ? new Date() : null,
          executionCompletedAt: new Date(),
          failureReason:
            finalStatus === "FAILED" ? execution.detail : null,
        },
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
