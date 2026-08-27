import { resumeIncident } from "../agents/resume";
import { ConsoleNotifier } from "../notifier/client";
import { checkApiKey } from "../security/auth";

const PORT = Number(process.env.APPROVAL_SERVER_PORT ?? 3001);

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method !== "POST" || !["/approve", "/reject"].includes(url.pathname)) {
            return new Response("Not found", { status: 404 });
        }

        if (!checkApiKey(req, process.env.WEBHOOK_API_KEY ?? "")) {
            return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
        }

        if (typeof body !== "object" || body === null) {
            return Response.json({ error: "request body must be a JSON object" }, { status: 400 });
        }

        const payload = body as {
            incidentId?: unknown;
            decidedBy?: unknown;
            reason?: unknown;
        };
        if (typeof payload.incidentId !== "string" || payload.incidentId.trim() === "") {
            return Response.json({ error: "incidentId is required" }, { status: 400 });
        }

        const decision = url.pathname === "/approve" ? "approved" : "rejected";
        const result = await resumeIncident(
            payload.incidentId,
            decision,
            typeof payload.decidedBy === "string" && payload.decidedBy.trim()
                ? payload.decidedBy.trim()
                : "unknown",
            new ConsoleNotifier(),
            typeof payload.reason === "string" ? payload.reason : undefined,
        );
        return Response.json(result, { status: result.ok ? 200 : 409 });
    },
});

console.log(`Approval server listening on http://localhost:${PORT}`);