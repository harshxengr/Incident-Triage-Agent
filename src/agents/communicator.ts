import type { LLMClient } from "../llm/client";
import type { Notifier } from "../notifier/client";
import type { CommunicatorOutput, Diagnosis } from "./types";
import type { ActionDecision } from "./action";
import { parseLLMJson } from "./parseLLMJson";
import { COMMUNICATOR_SYSTEM, communicatorPrompt } from "./prompts";

function isSummary(value: unknown): value is { summary: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).summary === "string";
}

export async function communicate(
  llm: LLMClient,
  notifier: Notifier,
  incidentId: string,
  incidentTitle: string,
  diagnosis: Diagnosis,
  action: ActionDecision
): Promise<CommunicatorOutput> {
  const raw = await llm.complete(COMMUNICATOR_SYSTEM, communicatorPrompt(incidentTitle, diagnosis, action));
  const { summary } = parseLLMJson(raw, isSummary);

  const actionable = action.requiresHuman
    ? `\n\nTo approve: bun run src/agents/approve.ts ${incidentId}\nTo reject: bun run src/agents/reject.ts ${incidentId} "<reason>"`
    : "";

  await notifier.send(summary + actionable);

  return { summary, channel: "incidents" };
}