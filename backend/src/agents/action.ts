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
  execution?: import("../execution/actionExecutor").ExecutionResult;
}

export async function decideAction(
  llm: LLMClient,
  diagnosis: Diagnosis,
): Promise<ActionDecision> {
  const raw = await llm.complete(
    ACTION_SYSTEM,
    actionPrompt(diagnosis),
  );

  const proposed = parseLLMJson(raw, isProposedAction);

  // A rollback must target an explicitly identified deployment.
  // Never allow the model to guess or substitute the target.
  if (proposed.action === "rollbackDeployment") {
    if (!diagnosis.suspectedDeploymentId) {
      return {
        ...proposed,
        action: "escalateToHuman",
        target: null,
        reasoning:
          "Rollback was proposed without a specific identified deployment. Escalating instead of guessing the target.",
        confidence: Math.min(proposed.confidence, 0.5),
        requiresHuman: true,
      };
    }

    return {
      ...proposed,
      target: diagnosis.suspectedDeploymentId,
      requiresHuman: true,
    };
  }

  // These actions do not need a resource target.
  if (
    proposed.action === "monitor" ||
    proposed.action === "escalateToHuman"
  ) {
    return {
      ...proposed,
      target: null,
      requiresHuman: requiresHumanApproval(proposed.action),
    };
  }

  return {
    ...proposed,
    requiresHuman: requiresHumanApproval(proposed.action),
  };
}