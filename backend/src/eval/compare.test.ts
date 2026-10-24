
import { describe, expect, test } from "bun:test";
import {
  evaluateCase,
  expectedTargetForAction,
  summarize,
  type EvalCase,
} from "./compare";

function makeCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    incidentId: "incident-1",
    scenarioType: "deploy_caused",
    expectedAction: "rollbackDeployment(commit-hash)",
    expectedTarget: "deployment-record-1",
    expectedRequiresHuman: true,
    actualAction: "rollbackDeployment",
    actualTarget: "deployment-record-1",
    actualRequiresHuman: true,
    actualConfidence: 0.95,
    ...overrides,
  };
}

describe("evaluation target accuracy", () => {
  test("uses the deployment record ID for rollback ground truth", () => {
    expect(
      expectedTargetForAction(
        "rollbackDeployment(commit-hash)",
        "deployment-record-1",
      ),
    ).toBe("deployment-record-1");
  });

  test("extracts service from scaleReplicas", () => {
    expect(
      expectedTargetForAction(
        "scaleReplicas(DATABASE, +1)",
        null,
      ),
    ).toBe("DATABASE");
  });

  test("monitor and escalation have no target", () => {
    expect(
      expectedTargetForAction("monitor(noAction=true)", null),
    ).toBeNull();

    expect(
      expectedTargetForAction("escalateToHuman()", null),
    ).toBeNull();
  });

  test("passes when action, target and approval are correct", () => {
    const result = evaluateCase(makeCase());

    expect(result.actionMatch).toBe(true);
    expect(result.targetMatch).toBe(true);
    expect(result.requiresHumanMatch).toBe(true);
    expect(result.fullyCorrect).toBe(true);
  });

  test("fails when rollback action has the wrong target", () => {
    const result = evaluateCase(
      makeCase({ actualTarget: "wrong-deployment" }),
    );

    expect(result.actionMatch).toBe(true);
    expect(result.targetMatch).toBe(false);
    expect(result.fullyCorrect).toBe(false);
  });

  test("fails when the human-approval decision is wrong", () => {
    const result = evaluateCase(
      makeCase({ actualRequiresHuman: false }),
    );

    expect(result.requiresHumanMatch).toBe(false);
    expect(result.fullyCorrect).toBe(false);
  });

  test("does not count an unprocessed incident as correct", () => {
    const result = evaluateCase(
      makeCase({
        actualAction: null,
        actualTarget: null,
        actualRequiresHuman: null,
      }),
    );

    expect(result.fullyCorrect).toBe(false);
  });

  test("computes target accuracy over processed cases", () => {
    const results = [
      evaluateCase(makeCase()),
      evaluateCase(makeCase({
        incidentId: "incident-2",
        actualTarget: "wrong-deployment",
      })),
      evaluateCase(makeCase({
        incidentId: "incident-3",
        actualAction: null,
        actualTarget: null,
        actualRequiresHuman: null,
      })),
    ];

    const summary = summarize(results);

    expect(summary.total).toBe(3);
    expect(summary.processed).toBe(2);
    expect(summary.targetAccuracy).toBe(0.5);
  });
});
