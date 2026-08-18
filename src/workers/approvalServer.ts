import { resumeIncident } from "../agents/resume";
import { ConsoleNotifier } from "../notifier/client";

const PORT = Number(process.env.APPROVAL_SERVER_PORT ?? 3001);

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);

        if (req.method === "POST" && url.pathname === "/approve") {
            const body = (await req.json()) as { incidentId: string; decidedBy?: string; reason?: string };
            const result = await resumeIncident(body.incidentId, "approved", body.decidedBy ?? "unknown", new ConsoleNotifier());
            return Response.json(result, { status: result.ok ? 200 : 409 });
        }

        if (req.method === "POST" && url.pathname === "/reject") {
            const body = (await req.json()) as { incidentId: string; decidedBy?: string; reason?: string };
            const result = await resumeIncident(
                body.incidentId,
                "rejected",
                body.decidedBy ?? "unknown",
                new ConsoleNotifier(),
                body.reason
            );
            return Response.json(result, { status: result.ok ? 200 : 409 });
        }

        return new Response("Not found", { status: 404 });
    },
});

console.log(`Approval server listening on http://localhost:${PORT}`);