import { prisma } from "./client";
import type { Prisma } from "../../generated/prisma/client";

type AgentType = "ORCHESTRATOR" | "LOG_ANALYZER" | "DIAGNOSIS" | "ACTION" | "COMMUNICATOR";

export async function logAction(params: {
  incidentId: string;
  agentType: AgentType;
  input: unknown;
  output: unknown;
  reasoning?: string;
  confidence?: number;
}) {
  await prisma.agentAction.create({
    data: {
      incidentId: params.incidentId,
      agentType: params.agentType,
      input: params.input as Prisma.InputJsonValue,
      output: params.output as Prisma.InputJsonValue,
      reasoning: params.reasoning,
      confidence: params.confidence,
    },
  });
}