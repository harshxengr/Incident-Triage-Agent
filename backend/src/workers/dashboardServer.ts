import { prisma } from "../db/client";
import { createStreamClient, xadd } from "../streams/client";
import { checkEnv } from "../config/checkEnv";
checkEnv();
import { checkApiKey } from "../security/auth";
import { validateIncidentPayload, validateDeploymentPayload } from "../webhooks/validate";
import { STREAMS } from "../streams/topics";
import { resumeIncident } from "../agents/resume";
import { ConsoleNotifier } from "../notifier/client";
import { triggerDemoIncident } from "../streams/triggerDemoIncident";
import {
  isPublicDemoScenario,
  PUBLIC_DEMO_SCENARIOS,
} from "../publicDemo";
import { transitionIncident } from "../incidents/lifecycle";
import { logAction } from "../db/logAction";

class RateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) { }

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const recent = (this.requests.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (recent.length >= this.limit) {
      this.requests.set(key, recent);
      const oldest = recent[0] ?? now;
      const retryAfterMs = Math.max(0, this.windowMs - (now - oldest));
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    recent.push(now);
    this.requests.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const demoLimiter = new RateLimiter(1, 30_000);

const PORT = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 3002);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    try {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: CORS_HEADERS });
      }

      if (url.pathname === "/healthz" && req.method === "GET") {
        try {
          await Promise.race([
            prisma.$queryRaw`SELECT 1`,
            new Promise((_, reject) => setTimeout(() => reject(new Error("DB query timed out after 5s")), 5000)),
          ]);
          return json({ status: "ok" });
        } catch (err) {
          console.error("Health check DB query failed:", err);
          return json({ status: "error", detail: String(err) }, 503);
        }
      }

      if (url.pathname === "/demo/trigger" && req.method === "POST") {
        const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
        const rate = demoLimiter.check(clientIp);
        if (!rate.allowed) {
          return new Response(
            JSON.stringify({
              error: "Demo incident rate limit reached.",
              retryAfterSeconds: rate.retryAfterSeconds,
            }),
            {
              status: 429,
              headers: {
                ...CORS_HEADERS,
                "Retry-After": String(rate.retryAfterSeconds),
                "Content-Type": "application/json",
              },
            },
          );
        }

        try {
          const result = await triggerDemoIncident();
          return json(result, 201);
        } catch (error) {
          console.error("Failed to create demo incident:", error);
          return json({ error: "Could not create demo incident" }, 500);
        }
      }

      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      const approvalMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)\/(approve|reject)$/);
      if (approvalMatch && req.method === "POST") {
        const dashboardOperatorKey =
          process.env.DASHBOARD_OPERATOR_KEY ?? "";

        if (!dashboardOperatorKey || !checkApiKey(req, dashboardOperatorKey)) {
          return json({ error: "unauthorized" }, 401);
        }

        const body = await readJson(req);
        const payload =
          typeof body === "object" && body !== null
            ? body as { decidedBy?: unknown; reason?: unknown }
            : {};

        const incidentId = approvalMatch[1];
        if (!incidentId) {
          return json({ error: "missing incident id" }, 400);
        }

        // The public dashboard may only approve or reject synthetic demo incidents.
        // Real incidents created through /webhook/incident must not be managed here.
        const eligibleIncident = await prisma.incident.findFirst({
          where: {
            id: incidentId,
            scenarioType: {
              in: [...PUBLIC_DEMO_SCENARIOS],
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!eligibleIncident) {
          return json(
            { error: "No matching demo incident is available." },
            404,
          );
        }

        if (eligibleIncident.status !== "PENDING_APPROVAL") {
          return json(
            {
              ok: false,
              reason: `Incident status is "${eligibleIncident.status}", not PENDING_APPROVAL.`,
            },
            409,
          );
        }

        const decision = approvalMatch[2] === "approve" ? "approved" : "rejected";
        const result = await resumeIncident(
          incidentId,
          decision,
          typeof payload.decidedBy === "string" && payload.decidedBy.trim()
            ? payload.decidedBy.trim()
            : "dashboard-operator",
          new ConsoleNotifier(),
          typeof payload.reason === "string" ? payload.reason : undefined,
        );

        return json(result, result.ok ? 200 : 409);
      }


      const escalationResolutionMatch = url.pathname.match(
        /^\/api\/incidents\/([^/]+)\/resolve-escalation$/,
      );

      if (escalationResolutionMatch && req.method === "POST") {
        const operatorKey =
          process.env.DASHBOARD_OPERATOR_KEY ?? "";

        if (!operatorKey || !checkApiKey(req, operatorKey)) {
          return json({ error: "unauthorized" }, 401);
        }

        const body = await readJson(req);
        const payload =
          typeof body === "object" && body !== null
            ? body as { decidedBy?: unknown; reason?: unknown }
            : {};

        const incidentId = escalationResolutionMatch[1];
        const decidedBy =
          typeof payload.decidedBy === "string"
            ? payload.decidedBy.trim()
            : "";
        const reason =
          typeof payload.reason === "string"
            ? payload.reason.trim()
            : "";

        if (!incidentId || !decidedBy || !reason) {
          return json(
            { error: "Incident ID, operator and resolution reason are required." },
            400,
          );
        }

        // Only permit resolution of synthetic demo incidents through
        // this dashboard endpoint.
        const incident = await prisma.incident.findFirst({
          where: {
            id: incidentId,
            status: "ESCALATED",
            scenarioType: {
              in: [...PUBLIC_DEMO_SCENARIOS],
            },
          },
          select: { id: true },
        });

        if (!incident) {
          return json(
            { error: "No matching escalated demo incident is available." },
            409,
          );
        }

        try {
          await transitionIncident(incidentId, "RESOLVED", {
            from: "ESCALATED",
            data: {
              resolvedAt: new Date(),
              failureReason: null,
            },
          });
        } catch {
          return json(
            { error: "The incident changed state. Refresh and try again if it is still escalated." },
            409,
          );
        }

        const auditClient = createStreamClient();

        try {
          await logAction({
            incidentId,
            agentType: "ORCHESTRATOR",
            input: {
              decision: "resolved_escalation",
              decidedBy,
              reason,
            },
            output: {
              decision: "resolved_escalation",
              decidedBy,
              reason,
            },
            reasoning: `Human investigation marked complete by ${decidedBy}: ${reason}`,
            broadcast: auditClient,
          });
        } finally {
          auditClient.close();
        }

        return json({ ok: true });
      }


      if (url.pathname === "/webhook/incident" && req.method === "POST") {
        if (!checkApiKey(req, process.env.WEBHOOK_API_KEY!)) {
          return json({ error: "unauthorized" }, 401);
        }
        const body = await readJson(req);
        const validation = validateIncidentPayload(body);
        if (!validation.ok) return json({ errors: validation.errors }, 400);

        const incident = await prisma.incident.create({
          data: {
            ...validation.data,
            status: "OPEN",
            expectedDiagnosis: "N/A - real incident",
            expectedAction: "N/A - real incident",
            expectedRequiresHuman: false,
            scenarioType: "real",
          },
        });

        const streamClient = createStreamClient();
        await xadd(streamClient, STREAMS.NEW, { incidentId: incident.id });
        streamClient.close();

        return json({ id: incident.id }, 201);
      }

      if (url.pathname === "/webhook/deployment" && req.method === "POST") {
        if (!checkApiKey(req, process.env.WEBHOOK_API_KEY!)) {
          return json({ error: "unauthorized" }, 401);
        }
        const body = await readJson(req);
        const validation = validateDeploymentPayload(body);
        if (!validation.ok) return json({ errors: validation.errors }, 400);

        const deployment = await prisma.deployment.create({ data: validation.data });
        return json({ id: deployment.id }, 201);
      }

      if (url.pathname === "/api/incidents" && req.method === "GET") {
        const incidents = await prisma.incident.findMany({
          where: {
            scenarioType: {
              in: [...PUBLIC_DEMO_SCENARIOS],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            title: true,
            rawLog: true,
            service: true,
            severity: true,
            status: true,
            scenarioType: true,
            createdAt: true,
            resolvedAt: true,
            approvedAt: true,
            approvedBy: true,
            rejectedAt: true,
            rejectedBy: true,
            rejectionReason: true,
            executionStartedAt: true,
            executionCompletedAt: true,
            failureReason: true,
            actions: {
              orderBy: { createdAt: "asc" },
              select: {
                agentType: true,
                output: true,
                reasoning: true,
                confidence: true,
                createdAt: true,
              },
            },
          },
        });

        return json(
          incidents.map((incident) => {
            const latest = (agentType: string) =>
              [...incident.actions].reverse().find((action) => action.agentType === agentType) ?? null;

            const logAnalysis = latest("LOG_ANALYZER");
            const diagnosis = latest("DIAGNOSIS");
            const action = latest("ACTION");

            return {
              id: incident.id,
              title: incident.title,
              rawLog: incident.rawLog,
              service: incident.service,
              severity: incident.severity,
              status: incident.status,
              scenarioType: incident.scenarioType,
              createdAt: incident.createdAt,
              resolvedAt: incident.resolvedAt,
              approvedAt: incident.approvedAt,
              approvedBy: incident.approvedBy,
              rejectedAt: incident.rejectedAt,
              rejectedBy: incident.rejectedBy,
              rejectionReason: incident.rejectionReason,
              executionStartedAt: incident.executionStartedAt,
              executionCompletedAt: incident.executionCompletedAt,
              failureReason: incident.failureReason,
              logAnalysis: logAnalysis?.output ?? null,
              diagnosis: diagnosis?.output ?? null,
              diagnosisReasoning: diagnosis?.reasoning ?? null,
              diagnosisConfidence: diagnosis?.confidence ?? null,
              proposedAction: action?.output ?? null,
              actionReasoning: action?.reasoning ?? null,
              actionConfidence: action?.confidence ?? null,
              actions: undefined,
            };
          }),
        );
      }

      const historyMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)\/history$/);
      if (historyMatch && req.method === "GET") {
        const incident = await prisma.incident.findUnique({
          where: {
            id: historyMatch[1],
            scenarioType: {
              in: [...PUBLIC_DEMO_SCENARIOS],
            },
          },
          select: {
            id: true,
            title: true,
            rawLog: true,
            service: true,
            severity: true,
            status: true,
            scenarioType: true,
            createdAt: true,
            resolvedAt: true,
            approvedAt: true,
            approvedBy: true,
            rejectedAt: true,
            rejectedBy: true,
            rejectionReason: true,
            executionStartedAt: true,
            executionCompletedAt: true,
            failureReason: true,
            actions: {
              orderBy: { createdAt: "asc" },
              select: {
                agentType: true,
                input: true,
                output: true,
                reasoning: true,
                confidence: true,
                createdAt: true,
              },
            },
          },
        });

        if (!incident) return json({ error: "not found" }, 404);

        return json({
          ...incident,
          timeline: incident.actions.map((action) => ({
            agentType: action.agentType,
            input: action.input,
            output: action.output,
            reasoning: action.reasoning,
            confidence: action.confidence,
            createdAt: action.createdAt,
          })),
          actions: undefined,
        });
      }

      const incidentMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)$/);
      if (incidentMatch && req.method === "GET") {

        const incident = await prisma.incident.findFirst({
          where: {
            id: incidentMatch[1],
            scenarioType: {
              in: [...PUBLIC_DEMO_SCENARIOS],
            },
          },
          select: {
            id: true,
            title: true,
            rawLog: true,
            service: true,
            severity: true,
            status: true,
            scenarioType: true,
            createdAt: true,
            resolvedAt: true,
            approvedAt: true,
            approvedBy: true,
            rejectedAt: true,
            rejectedBy: true,
            rejectionReason: true,
            executionStartedAt: true,
            executionCompletedAt: true,
            failureReason: true,
            actions: {
              orderBy: { createdAt: "asc" },
              select: {
                agentType: true,
                output: true,
                reasoning: true,
                confidence: true,
                createdAt: true,
              },
            },
          },
        });

        if (!incident) {
          return json({ error: "not found" }, 404);
        }

        return json(incident);

      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("Unhandled error in dashboard server:", err);
      return json({ error: "internal server error", detail: String(err) }, 500);
    }
  },
  websocket: {
    open(ws) {
      ws.subscribe("agent-events");
    },
    message(ws, message) {
      if (typeof message === "string" && message === "ping") {
        ws.send("pong");
      }
    },
    close(ws) {
      ws.unsubscribe("agent-events");
    },
  },
});

console.log(`Dashboard server: http://localhost:${PORT}  (WS at /ws)`);


const redisSub = createStreamClient();

await redisSub.subscribe("agent-events", (message: string) => {
  void publishPublicDemoEvent(message).catch((error) => {
    console.error("Failed to validate public demo event:", error);
  });
});

async function publishPublicDemoEvent(message: string): Promise<void> {
  let event: unknown;

  try {
    event = JSON.parse(message);
  } catch {
    return;
  }

  if (typeof event !== "object" || event === null) {
    return;
  }

  const incidentId = (event as Record<string, unknown>).incidentId;

  if (typeof incidentId !== "string") {
    return;
  }

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { scenarioType: true },
  });

  if (!incident || !isPublicDemoScenario(incident.scenarioType)) {
    return;
  }

  server.publish("agent-events", message);
}
