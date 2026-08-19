import { prisma } from "../db/client";
import { createStreamClient } from "../streams/client";

const PORT = Number(process.env.DASHBOARD_PORT ?? 3002);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // fine for local dev; lock this down before deploying anywhere real
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
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
    message() {},
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