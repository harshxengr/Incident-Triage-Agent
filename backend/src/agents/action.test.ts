import { describe, expect, test } from "bun:test";
import { decideAction } from "./action";
import type { Diagnosis } from "./types";
import type { LLMClient } from "../llm/client";

function mockLLM(response: string): LLMClient {
  return {
    async complete() {
      return response;
    },
  };
}

const diagnosis: Diagnosis = {
  diagnosis: "A recent deployment likely caused a 5xx spike.",
  suspectedDeploymentId: "deployment-record-123",
  confidence: 0.95,
};

function response(action: string, target: string | null) {
  return JSON.stringify({
    action,
    target,
    reasoning: "Test action decision.",
    confidence: 0.95,
  });
}

describe("action decision safety", () => {
  test("forces rollback to use the identified deployment ID", async () => {
    const result = await decideAction(
      mockLLM(response("rollbackDeployment", "wrong-target")),
      diagnosis,
    );

    expect(result.action).toBe("rollbackDeployment");
    expect(result.target).toBe("deployment-record-123");
    expect(result.requiresHuman).toBe(true);
  });

  test("escalates when rollback has no identified deployment", async () => {
    const result = await decideAction(
      mockLLM(response("rollbackDeployment", "invented-target")),
      {
        ...diagnosis,
        suspectedDeploymentId: null,
      },
    );

    expect(result.action).toBe("escalateToHuman");
    expect(result.target).toBeNull();
    expect(result.requiresHuman).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  test("monitor does not retain a resource target", async () => {
    const result = await decideAction(
      mockLLM(response("monitor", "DATABASE")),
      diagnosis,
    );

    expect(result.action).toBe("monitor");
    expect(result.target).toBeNull();
    expect(result.requiresHuman).toBe(false);
  });

  test("escalation does not retain a resource target", async () => {
    const result = await decideAction(
      mockLLM(response("escalateToHuman", "DATABASE")),
      diagnosis,
    );

    expect(result.action).toBe("escalateToHuman");
    expect(result.target).toBeNull();
    expect(result.requiresHuman).toBe(true);
  });
});