import { prisma } from "./client";
import type { Prisma } from "../../generated/prisma/client";
import type { RedisClient } from "bun";

type AgentType = "ORCHESTRATOR" | "LOG_ANALYZER" | "DIAGNOSIS" | "ACTION" | "COMMUNICATOR";

export async function logAction(params: {
  incidentId: string;
  agentType: AgentType;
  input: unknown;
  output: unknown;
  reasoning?: string;
  confidence?: number;
  // pass the worker's own connection here to also notify the dashboard.
  // optional so existing callers that don't care about live updates don't
  // need to change.
  broadcast?: RedisClient;
}) {
  const row = await prisma.agentAction.create({
    data: {
      incidentId: params.incidentId,
      agentType: params.agentType,
      input: params.input as Prisma.InputJsonValue,
      output: params.output as Prisma.InputJsonValue,
      reasoning: params.reasoning,
      confidence: params.confidence,
    },
  });

  if (params.broadcast) {
    await params.broadcast.publish(
      "agent-events",
      JSON.stringify({
        incidentId: params.incidentId,
        agentType: params.agentType,
        output: params.output,
        reasoning: params.reasoning ?? null,
        confidence: params.confidence ?? null,
        createdAt: row.createdAt.toISOString(),
      })
    );
  }
}