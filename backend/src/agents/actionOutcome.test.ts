
import { describe, expect, test } from "bun:test";
import { classifyActionHandling } from "./actionOutcome";

describe("action outcome policy", () => {
  test("monitor never executes remediation", () => {
    expect(classifyActionHandling("monitor", false))
      .toBe("NO_ACTION_REQUIRED");
  });

  test("escalation requests human investigation", () => {
    expect(classifyActionHandling("escalateToHuman", true))
      .toBe("ESCALATED");
  });

  test("risky actions require approval", () => {
    expect(classifyActionHandling("rollbackDeployment", true))
      .toBe("PENDING_APPROVAL");
  });

  test("approved low-risk policy actions use the executor", () => {
    expect(classifyActionHandling("restartService", false))
      .toBe("EXECUTE");
  });
});
