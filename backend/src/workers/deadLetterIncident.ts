import type { RedisClient } from "bun";
import { prisma } from "../db/client";
import type { DeadLetterFailure } from "../streams/runWorker";

export async function markIncidentDeadLettered(
  fields: Record<string, string>,
  failure: DeadLetterFailure,
  client: RedisClient
): Promise<void> {
  const incidentId = fields.incidentId;
  if (!incidentId) return;

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: "FAILED" },
  });

  await client.publish(
    "agent-events",
    JSON.stringify({
      incidentId,
      agentType: "WORKER_FAILURE",
      output: {
        stream: failure.stream,
        group: failure.group,
        originalMessageId: failure.messageId,
        attempts: failure.attempts,
        error: failure.error,
      },
      reasoning: failure.error,
      confidence: null,
      createdAt: new Date().toISOString(),
    })
  );
}
