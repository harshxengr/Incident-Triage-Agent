import { describe, expect, test } from "bun:test";
import {
  createApprovalHandler,
  type ApprovalDecision,
  type ApprovalNotifier,
  type ApprovalResult,
} from "./approvalRoutes";

interface TestOptions {
  operatorKey?: string;
  incident?: { status: string } | null;
  result?: ApprovalResult;
}

function createHarness(options: TestOptions = {}) {
  const calls = {
    lookups: [] as string[],
    decisions: [] as Array<{
      incidentId: string;
      decision: ApprovalDecision;
      decidedBy: string;
      reason?: string;
    }>,
    notifierCreations: 0,
  };

  const handler = createApprovalHandler({
    operatorKey: options.operatorKey ?? "test-operator-key",

    findDemoIncident: async (incidentId) => {
      calls.lookups.push(incidentId);

      return options.incident === undefined
        ? { status: "PENDING_APPROVAL" }
        : options.incident;
    },

    resumeIncident: async (
      incidentId,
      decision,
      decidedBy,
      _notifier,
      reason,
    ) => {
      calls.decisions.push({
        incidentId,
        decision,
        decidedBy,
        reason,
      });

      return options.result ?? { ok: true };
    },

    createNotifier: (): ApprovalNotifier => {
      calls.notifierCreations += 1;

      return {
        send: async () => undefined,
      };
    },
  });

  return { handler, calls };
}

function makeRequest(
  path: string,
  payload: unknown = {},
  apiKey: string | null = "test-operator-key",
) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (apiKey !== null) {
    headers.set("X-API-Key", apiKey);
  }

  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

describe("approval HTTP routes", () => {
  test("rejects requests without an operator key", async () => {
    const { handler, calls } = createHarness();

    const response = await handler(
      makeRequest("/approve", { incidentId: "demo-1" }, null),
    );

    expect(response.status).toBe(401);
    expect(calls.lookups).toHaveLength(0);
    expect(calls.decisions).toHaveLength(0);
  });

  test("rejects requests with an incorrect operator key", async () => {
    const { handler, calls } = createHarness();

    const response = await handler(
      makeRequest("/approve", { incidentId: "demo-1" }, "wrong-key"),
    );

    expect(response.status).toBe(401);
    expect(calls.lookups).toHaveLength(0);
  });

  test("rejects malformed JSON", async () => {
    const { handler } = createHarness();

    const response = await handler(
      new Request("http://localhost/approve", {
        method: "POST",
        headers: { "X-API-Key": "test-operator-key" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("requires an incident ID", async () => {
    const { handler, calls } = createHarness();

    const response = await handler(
      makeRequest("/approve", { incidentId: "  " }),
    );

    expect(response.status).toBe(400);
    expect(calls.lookups).toHaveLength(0);
  });

  test("rejects incidents that are not eligible demo incidents", async () => {
    const { handler, calls } = createHarness({
      incident: null,
    });

    const response = await handler(
      makeRequest("/approve", { incidentId: "real-incident" }),
    );

    expect(response.status).toBe(404);
    expect(calls.decisions).toHaveLength(0);
  });

  test("rejects incidents that are not awaiting approval", async () => {
    const { handler, calls } = createHarness({
      incident: { status: "RESOLVED" },
    });

    const response = await handler(
      makeRequest("/approve", { incidentId: "demo-1" }),
    );

    expect(response.status).toBe(409);
    expect(calls.decisions).toHaveLength(0);
  });

  test("approves an eligible incident using normalized input", async () => {
    const { handler, calls } = createHarness();

    const response = await handler(
      makeRequest("/approve", {
        incidentId: " demo-1 ",
        decidedBy: " operator-1 ",
      }),
    );

    expect(response.status).toBe(200);
    expect(calls.decisions).toEqual([
      {
        incidentId: "demo-1",
        decision: "approved",
        decidedBy: "operator-1",
        reason: undefined,
      },
    ]);
    expect(calls.notifierCreations).toBe(1);
  });

  test("passes the rejection reason to the decision handler", async () => {
    const { handler, calls } = createHarness();

    const response = await handler(
      makeRequest("/reject", {
        incidentId: "demo-2",
        decidedBy: "operator-2",
        reason: "The proposed action is not justified.",
      }),
    );

    expect(response.status).toBe(200);
    expect(calls.decisions[0]).toEqual({
      incidentId: "demo-2",
      decision: "rejected",
      decidedBy: "operator-2",
      reason: "The proposed action is not justified.",
    });
  });

  test("returns a conflict when the decision handler refuses the action", async () => {
    const { handler } = createHarness({
      result: {
        ok: false,
        reason: "Incident status changed.",
      },
    });

    const response = await handler(
      makeRequest("/approve", { incidentId: "demo-1" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      reason: "Incident status changed.",
    });
  });

  test("returns not found for unsupported routes", async () => {
    const { handler, calls } = createHarness();

    const response = await handler(
      makeRequest("/delete", { incidentId: "demo-1" }),
    );

    expect(response.status).toBe(404);
    expect(calls.lookups).toHaveLength(0);
  });
});