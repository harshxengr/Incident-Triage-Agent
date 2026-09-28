import type { RedisClient } from "bun";
import { prisma } from "../db/client";
import type { DeadLetterFailure } from "../streams/runWorker";
import { transitionIncident } from "../incidents/lifecycle";

export async function markIncidentDeadLettered(
  fields: Record<string, string>,
  failure: DeadLetterFailure,
  client: RedisClient
): Promise<void> {
  const incidentId = fields.incidentId;
  if (!incidentId) return;

  const activeStates = [
    "OPEN",
    "DIAGNOSING",
    "DIAGNOSED",
    "ACTION_PROPOSED",
    "PENDING_APPROVAL",
    "APPROVED",
    "EXECUTING",
  ] as const;

  try {
    await transitionIncident(incidentId, "FAILED", {
      from: [...activeStates],
      data: { failureReason: failure.error },
    });
  } catch {
    // If another worker already moved the incident to a terminal state,
    // retain that final state and keep the dead-letter event as the audit record.
  }

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
