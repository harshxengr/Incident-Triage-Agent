import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import { GeminiClient } from "../llm/client";
import { ConsoleNotifier } from "../notifier/client";
import { communicate } from "../agents/communicator";
import type { ActionDecision } from "../agents/action";
import type { Diagnosis } from "../agents/types";
import { runWorker } from "../streams/runWorker";
import { STREAMS, GROUPS } from "../streams/topics";

const llm = new GeminiClient(process.env.GEMINI_API_KEY!);
const notifier = new ConsoleNotifier();

runWorker(STREAMS.ACTION_DECIDED, GROUPS.COMMUNICATOR, "communicator-1", async (fields) => {
  const incidentId = fields.incidentId;
  if (!incidentId) {
    throw new Error("Missing incidentId in stream message");
  }
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });

  const diagnosisAction = await prisma.agentAction.findFirstOrThrow({
    where: { incidentId, agentType: "DIAGNOSIS" },
    orderBy: { createdAt: "desc" },
  });
  const actionAction = await prisma.agentAction.findFirstOrThrow({
    where: { incidentId, agentType: "ACTION" },
    orderBy: { createdAt: "desc" },
  });

  const diagnosis = diagnosisAction.output as unknown as Diagnosis;
  const actionDecision = actionAction.output as unknown as ActionDecision;

  const communicatorOutput = await communicate(llm, notifier, incidentId, incident.title, diagnosis, actionDecision);
  await logAction({
    incidentId,
    agentType: "COMMUNICATOR",
    input: { diagnosis, actionDecision },
    output: communicatorOutput,
  });
}).catch((err) => {
  console.error("communicator worker crashed:", err);
  process.exit(1);
});