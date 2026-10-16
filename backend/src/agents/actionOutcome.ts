
import type { ActionName } from "./types";

export type ActionHandling =
  | "NO_ACTION_REQUIRED"
  | "ESCALATED"
  | "PENDING_APPROVAL"
  | "EXECUTE";

export function classifyActionHandling(
  action: ActionName,
  requiresHuman: boolean,
): ActionHandling {
  if (action === "monitor") {
    return "NO_ACTION_REQUIRED";
  }

  if (action === "escalateToHuman") {
    return "ESCALATED";
  }

  if (requiresHuman) {
    return "PENDING_APPROVAL";
  }

  return "EXECUTE";
}
