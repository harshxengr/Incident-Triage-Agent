import type { LLMClient } from "../llm/client";
import type { ActionName, Diagnosis, ProposedAction } from "./types";
import { parseLLMJson } from "./parseLLMJson";
import { requiresHumanApproval } from "./riskPolicy";
import { ACTION_SYSTEM, actionPrompt } from "./prompts";

const VALID_ACTIONS: ActionName[] = [
  "restartService",
  "rollbackDeployment",
  "scaleReplicas",
  "escalateToHuman",
  "monitor",
];

function isProposedAction(value: unknown): value is ProposedAction {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.action === "string" &&
    VALID_ACTIONS.includes(v.action as ActionName) &&
    (typeof v.target === "string" || v.target === null) &&
    typeof v.reasoning === "string" &&
    typeof v.confidence === "number"
  );
}

export interface ActionDecision extends ProposedAction {
  requiresHuman: boolean;
}

export async function decideAction(llm: LLMClient, diagnosis: Diagnosis): Promise<ActionDecision> {
  const raw = await llm.complete(ACTION_SYSTEM, actionPrompt(diagnosis));
  const proposed = parseLLMJson(raw, isProposedAction);

  return {
    ...proposed,
    requiresHuman: requiresHumanApproval(proposed.action),
  };
}