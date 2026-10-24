import {
  afterAll,
  describe,
  expect,
  test,
} from "bun:test";

import { prisma } from "../db/client";
import { resumeIncident } from "../agents/resume";
import { PUBLIC_DEMO_SCENARIOS } from "../publicDemo";
import { createApprovalHandler } from "./approvalRoutes";

const integrationEnabled =
  process.env.RUN_DB_INTEGRATION_TESTS === "1";

const integrationSuite = integrationEnabled
  ? describe
  : describe.skip;

const OPERATOR_KEY = "integration-test-operator-key";
const createdIncidentIds: string[] = [];

function createHandler() {
  return createApprovalHandler({
    operatorKey: OPERATOR_KEY,

    findDemoIncident: async (incidentId) => {
      return prisma.incident.findFirst({
        where: {
          id: incidentId,
          scenarioType: {
            in: [...PUBLIC_DEMO_SCENARIOS],
          },
        },
        select: { status: true },
      });
    },

    resumeIncident,

    createNotifier: () => ({
      send: async () => undefined,
    }),
  });
}

async function createPendingIncident(title: string) {
  const incident = await prisma.incident.create({
    data: {
      title,
      rawLog: "Integration test: elevated database connection usage.",
      service: "DATABASE",
      severity: "HIGH",
      status: "PENDING_APPROVAL",
      expectedDiagnosis: "Integration test diagnosis",
      expectedAction: "rollbackDeployment(test-deployment)",
      expectedRequiresHuman: true,
      scenarioType: "deploy_caused",
    },
  });

  createdIncidentIds.push(incident.id);

  await prisma.agentAction.create({
    data: {
      incidentId: incident.id,
      agentType: "ACTION",
      input: { source: "integration-test" },
      output: {
        action: "rollbackDeployment",
        target: "test-deployment",
        reasoning: "Integration test action",
        confidence: 0.9,
        requiresHuman: true,
      },
      reasoning: "Integration test proposed action",
      confidence: 0.9,
    },
  });

  return incident;
}

function makeRequest(
  path: "/approve" | "/reject",
  incidentId: string,
  payload: Record<string, unknown> = {},
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": OPERATOR_KEY,
    },
    body: JSON.stringify({
      incidentId,
      decidedBy: "integration-test-operator",
      ...payload,
    }),
  });
}

integrationSuite("approval workflow integration", () => {
  afterAll(async () => {
    if (createdIncidentIds.length > 0) {
      await prisma.agentAction.deleteMany({
        where: {
          incidentId: { in: createdIncidentIds },
        },
      });

      await prisma.incident.deleteMany({
        where: {
          id: { in: createdIncidentIds },
        },
      });
    }

    await prisma.$disconnect();
  });

  test("approval persists the simulated outcome and audit record", async () => {
    const incident = await createPendingIncident(
      `Integration approval ${crypto.randomUUID()}`,
    );

    const response = await createHandler()(
      makeRequest("/approve", incident.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const savedIncident = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    });

    expect(savedIncident.status).toBe("SIMULATED");
    expect(savedIncident.approvedBy).toBe(
      "integration-test-operator",
    );
    expect(savedIncident.approvedAt).toBeInstanceOf(Date);
    expect(savedIncident.resolvedAt).toBeNull();

    const audit = await prisma.agentAction.findFirst({
      where: {
        incidentId: incident.id,
        agentType: "ORCHESTRATOR",
      },
    });

    expect(audit).not.toBeNull();
    expect(audit?.input).toMatchObject({
      decision: "approved",
      decidedBy: "integration-test-operator",
    });
    expect(audit?.output).toMatchObject({
      execution: {
        executed: true,
        simulated: true,
      },
    });
  });

  test("rejection persists the reason without executing remediation", async () => {
    const incident = await createPendingIncident(
      `Integration rejection ${crypto.randomUUID()}`,
    );

    const reason = "The proposed remediation needs further review.";

    const response = await createHandler()(
      makeRequest("/reject", incident.id, { reason }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const savedIncident = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    });

    expect(savedIncident.status).toBe("REJECTED");
    expect(savedIncident.rejectedBy).toBe(
      "integration-test-operator",
    );
    expect(savedIncident.rejectionReason).toBe(reason);
    expect(savedIncident.resolvedAt).toBeNull();
    expect(savedIncident.executionStartedAt).toBeNull();

    const audit = await prisma.agentAction.findFirst({
      where: {
        incidentId: incident.id,
        agentType: "ORCHESTRATOR",
      },
    });

    expect(audit?.input).toMatchObject({
      decision: "rejected",
      decidedBy: "integration-test-operator",
      rejectionReason: reason,
    });
    expect(audit?.output).toMatchObject({
      execution: null,
    });
  });
});