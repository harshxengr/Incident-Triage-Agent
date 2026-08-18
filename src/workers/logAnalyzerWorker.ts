import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import { GeminiClient } from "../llm/client";
import { analyzeLog } from "../agents/logAnalyzer";
import { xadd } from "../streams/client";
import { runWorker } from "../streams/runWorker";
import { STREAMS, GROUPS } from "../streams/topics";

const llm = new GeminiClient(process.env.GEMINI_API_KEY!);

runWorker(STREAMS.NEW, GROUPS.LOG_ANALYZER, "log-analyzer-1", async (fields, client) => {
  const incidentId = fields.incidentId;
  if (!incidentId) {
    throw new Error("Missing incidentId in stream message");
  }
  const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });

  // idempotency guard: if this incident has already entered or finished
  // the pipeline, don't reprocess it. without this, re-enqueueing the
  // same id (accidentally, or via a retry) resets a resolved incident
  // back to DIAGNOSING and runs the whole pipeline again.
  if (incident.status !== "OPEN") {
    console.log(`[log-analyzer-1] skipping ${incidentId} - already in status "${incident.status}", not reprocessing`);
    return;
  }

  await prisma.incident.update({ where: { id: incidentId }, data: { status: "DIAGNOSING" } });

  const logAnalysis = await analyzeLog(llm, incident.rawLog);
  await logAction({
    incidentId,
    agentType: "LOG_ANALYZER",
    input: { rawLog: incident.rawLog },
    output: logAnalysis,
  });

  await xadd(client, STREAMS.LOG_ANALYZED, { incidentId });
}).catch((err) => {
  console.error("log-analyzer worker crashed:", err);
  process.exit(1);
});