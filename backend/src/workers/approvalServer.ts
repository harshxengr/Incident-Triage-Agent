import { prisma } from "../db/client";
import { PUBLIC_DEMO_SCENARIOS } from "../publicDemo";
import { resumeIncident } from "../agents/resume";
import { ConsoleNotifier } from "../notifier/client";
import { createApprovalHandler } from "./approvalRoutes";

const PORT = Number(
  process.env.APPROVAL_SERVER_PORT ?? 3001,
);

const handleApprovalRequest = createApprovalHandler({
  operatorKey: process.env.DASHBOARD_OPERATOR_KEY ?? "",

  findDemoIncident: async (incidentId) => {
    return prisma.incident.findFirst({
      where: {
        id: incidentId,
        scenarioType: {
          in: [...PUBLIC_DEMO_SCENARIOS],
        },
      },
      select: {
        status: true,
      },
    });
  },

  resumeIncident,

  createNotifier: () => new ConsoleNotifier(),
});

Bun.serve({
  port: PORT,
  fetch: handleApprovalRequest,
});

console.log(
  `Approval server listening on http://localhost:${PORT}`,
);