import type { Deployment } from "../../generated/prisma/client";
import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import { GeminiClient, type LLMClient } from "../llm/client";
import { ConsoleNotifier, type Notifier } from "../notifier/client";
import { SimulatedActionExecutor } from "../execution/actionExecutor";
import { transitionIncident } from "../incidents/lifecycle";
import { analyzeLog } from "./logAnalyzer";
import { diagnose, type CandidateDeployment } from "./diagnosis";
import { decideAction } from "./action";
import { communicate } from "./communicator";
import { classifyActionHandling } from "./actionOutcome";

const executor = new SimulatedActionExecutor();

export async function runPipeline(incidentId: string, llm: LLMClient, notifier: Notifier) {
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });

  await transitionIncident(incidentId, "DIAGNOSING", {
    from: ["OPEN", "DIAGNOSING"],
  });

  const logAnalysis = await analyzeLog(llm, incident.rawLog);
  await logAction({
    incidentId,
    agentType: "LOG_ANALYZER",
    input: { rawLog: incident.rawLog },
    output: logAnalysis,
  });

  const recentDeployments = await prisma.deployment.findMany({
    where: { service: incident.service, deployedAt: { lte: incident.createdAt } },
    orderBy: { deployedAt: "desc" },
    take: 5,
  });

  const candidates: CandidateDeployment[] = recentDeployments.map((d: Deployment) => ({
    id: d.id,
    commitHash: d.commitHash,
    commitMessage: d.commitMessage,
    minutesBeforeIncident: Math.round(
      (incident.createdAt.getTime() - d.deployedAt.getTime()) / 60_000,
    ),
  }));

  const diagnosis = await diagnose(llm, logAnalysis, candidates);

  await transitionIncident(incidentId, "DIAGNOSED", {
    from: "DIAGNOSING",
    data: {
      suspectedDeploymentId: diagnosis.suspectedDeploymentId,
    },
  });

  await logAction({
    incidentId,
    agentType: "DIAGNOSIS",
    input: { logAnalysis, candidates },
    output: diagnosis,
    confidence: diagnosis.confidence,
  });

  const actionDecision = await decideAction(llm, diagnosis);

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


  const communicatorOutput = await communicate(
    llm,
    notifier,
    incidentId,
    incident.title,
    diagnosis,
    actionDecision,
  );

  await logAction({
    incidentId,
    agentType: "COMMUNICATOR",
    input: { diagnosis, actionDecision },
    output: communicatorOutput,
  });

  return { logAnalysis, diagnosis, actionDecision, communicatorOutput };
}

// manual run: bun run src/agents/runPipeline.ts <incidentId>
if (import.meta.main) {
  const incidentId = process.argv[2];
  if (!incidentId) {
    console.error("Usage: bun run src/agents/runPipeline.ts <incidentId>");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Set GEMINI_API_KEY in .env first.");
    process.exit(1);
  }

  runPipeline(incidentId, new GeminiClient(apiKey), new ConsoleNotifier())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error("Pipeline failed:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
