import { prisma } from "../db/client";
import { createStreamClient, xadd } from "../streams/client";
import { checkEnv } from "../config/checkEnv";
checkEnv();
import { checkApiKey, verifySlackSignature } from "../security/auth";
import { validateIncidentPayload, validateDeploymentPayload } from "../webhooks/validate";
import { parseSlackInteractionBody } from "../webhooks/slackInteraction";
import { STREAMS } from "../streams/topics";
import { resumeIncident } from "../agents/resume";
import { SlackNotifier } from "../notifier/client";
import { triggerDemoIncident } from "../streams/triggerDemoIncident";

class RateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allows(key: string): boolean {
    const now = Date.now();
    const recent = (this.requests.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (recent.length >= this.limit) {
      this.requests.set(key, recent);
      return false;
    }

    recent.push(now);
    this.requests.set(key, recent);
    return true;
  }
}

const demoLimiter = new RateLimiter(1, 30_000);

const PORT = Number(process.env.DASHBOARD_PORT ?? 3002);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/demo/trigger" && req.method === "POST") {
      const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
      if (!demoLimiter.allows(clientIp)) {
        return json({ error: "Please wait a bit before triggering another demo incident." }, 429);
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
          // real incidents have no synthetic ground truth - these fields exist
          // for the eval harness on generated data, not on real ingested ones.
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

    if (url.pathname === "/slack/interactions" && req.method === "POST") {
      const rawBody = await req.text();

      const sig = verifySlackSignature({
        signingSecret: process.env.SLACK_SIGNING_SECRET!,
        timestampHeader: req.headers.get("x-slack-request-timestamp"),
        signatureHeader: req.headers.get("x-slack-signature"),
        rawBody,
      });
      if (!sig.valid) {
        console.error("Rejected Slack interaction:", sig.reason);
        return new Response("unauthorized", { status: 401 });
      }

      const parsed = parseSlackInteractionBody(rawBody);
      if (!parsed.ok) {
        console.error("Could not parse Slack interaction:", parsed.error);
        return new Response("", { status: 200 }); // ack anyway so Slack doesn't retry a request we'll never understand
      }

      const decision = parsed.data.actionId === "approve_incident" ? "approved" : "rejected";
      const notifier = new SlackNotifier(process.env.SLACK_WEBHOOK_URL!);
      await resumeIncident(parsed.data.incidentId, decision, parsed.data.slackUsername, notifier);

      return new Response("", { status: 200 }); // Slack expects a fast 200, not a JSON body
    }

    if (url.pathname === "/api/incidents" && req.method === "GET") {
      const incidents = await prisma.incident.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          service: true,
          severity: true,
          status: true,
          scenarioType: true,
          createdAt: true,
          resolvedAt: true,
        },
      });
      return json(incidents);
    }

    const incidentMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)$/);
    if (incidentMatch && req.method === "GET") {
      const incident = await prisma.incident.findUnique({
        where: { id: incidentMatch[1] },
        include: { actions: { orderBy: { createdAt: "asc" } } },
      });
      if (!incident) return json({ error: "not found" }, 404);
      return json(incident);
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("agent-events");
    },
    message() { },
    close(ws) {
      ws.unsubscribe("agent-events");
    },
  },
});

console.log(`Dashboard server: http://localhost:${PORT}  (WS at /ws)`);

// bridge: redis pub/sub -> this server's websocket topic. dedicated
// connection since subscribe() holds the connection open indefinitely -
// same reasoning as blocking stream reads needing their own connection,
// found the hard way back in Phase 3.
const redisSub = createStreamClient();
await redisSub.subscribe("agent-events", (message: string) => {
  server.publish("agent-events", message);
});