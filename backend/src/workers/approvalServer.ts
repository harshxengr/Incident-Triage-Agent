import { prisma } from "../db/client";
import { PUBLIC_DEMO_SCENARIOS } from "../publicDemo";
import { resumeIncident } from "../agents/resume";
import { ConsoleNotifier } from "../notifier/client";
import { checkApiKey } from "../security/auth";

const PORT = Number(process.env.APPROVAL_SERVER_PORT ?? 3001);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (
      req.method !== "POST" ||
      !["/approve", "/reject"].includes(url.pathname)
    ) {
      return new Response("Not found", { status: 404 });
    }

    // Approval and rejection use a dedicated operator key, not the webhook key.
    const operatorKey = process.env.DASHBOARD_OPERATOR_KEY ?? "";
    if (!operatorKey || !checkApiKey(req, operatorKey)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json(
        { error: "request body must be a JSON object" },
        { status: 400 },
      );
    }

    const payload = body as {
      incidentId?: unknown;
      decidedBy?: unknown;
      reason?: unknown;
    };

    if (
      typeof payload.incidentId !== "string" ||
      payload.incidentId.trim() === ""
    ) {
      return Response.json(
        { error: "incidentId is required" },
        { status: 400 },
      );
    }

    const incidentId = payload.incidentId.trim();

    // This HTTP server is for the public demo only. Real webhook incidents
    // must not be approved or rejected through this endpoint.
    const eligibleIncident = await prisma.incident.findFirst({
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

    if (!eligibleIncident) {
      return Response.json(
        { error: "No matching demo incident is available." },
        { status: 404 },
      );
    }

    if (eligibleIncident.status !== "PENDING_APPROVAL") {
      return Response.json(
        { error: "Incident is not awaiting approval." },
        { status: 409 },
      );
    }

    const decision = url.pathname === "/approve" ? "approved" : "rejected";
    const decidedBy =
      typeof payload.decidedBy === "string" && payload.decidedBy.trim()
        ? payload.decidedBy.trim()
        : "unknown";
    const reason =
      typeof payload.reason === "string" ? payload.reason : undefined;

    const result = await resumeIncident(
      incidentId,
      decision,
      decidedBy,
      new ConsoleNotifier(),
      reason,
    );

    return Response.json(result, { status: result.ok ? 200 : 409 });
  },
});

console.log(`Approval server listening on http://localhost:${PORT}`);
