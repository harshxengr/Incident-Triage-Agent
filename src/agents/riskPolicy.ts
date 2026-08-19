import type { ActionName } from "./types";

export type RiskLevel = "low" | "high";

// rollback and escalation are the two actions that can't be cheaply undone
// or that already imply the system is unsure - everything else is safe to
// auto-execute
const HIGH_RISK_ACTIONS: ActionName[] = ["rollbackDeployment", "escalateToHuman"];

export function classifyRisk(action: ActionName): RiskLevel {
  return HIGH_RISK_ACTIONS.includes(action) ? "high" : "low";
}

export function requiresHumanApproval(action: ActionName): boolean {
  return classifyRisk(action) === "high";
}