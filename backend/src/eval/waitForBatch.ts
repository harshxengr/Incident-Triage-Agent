import { prisma } from "../db/client";
import { createStreamClient } from "../streams/client";
import { GROUPS, STREAMS } from "../streams/topics";

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 min safety cap, in case something is genuinely stuck
const ACTIVE_STATUSES = ["OPEN", "DIAGNOSING"] as const;

const STREAM_GROUPS = [
    [STREAMS.NEW, GROUPS.LOG_ANALYZER],
    [STREAMS.LOG_ANALYZED, GROUPS.DIAGNOSIS],
    [STREAMS.DIAGNOSED, GROUPS.ACTION],
    [STREAMS.ACTION_DECIDED, GROUPS.COMMUNICATOR],
] as const;

async function main() {
    const start = Date.now();
    const redis = createStreamClient();

    while (true) {
        const inProgress = await prisma.incident.count({
            where: { status: { in: [...ACTIVE_STATUSES] } },
        });

        if (inProgress === 0) {
            console.log("All incidents have finished processing, need approval, or were dead-lettered.");
            break;
        }

        if (Date.now() - start > MAX_WAIT_MS) {
            await reportStuckState(redis, inProgress);
            process.exitCode = 1;
            break;
        }

        console.log(`${inProgress} incidents still processing... checking again in ${POLL_INTERVAL_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    await prisma.$disconnect();
    redis.close();
}

main();

async function reportStuckState(redis: ReturnType<typeof createStreamClient>, inProgress: number): Promise<void> {
    console.log(`Timed out after ${MAX_WAIT_MS / 60_000} minutes with ${inProgress} incidents still active.`);

    const incidents = await prisma.incident.findMany({
        where: { status: { in: [...ACTIVE_STATUSES] } },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            title: true,
            status: true,
            scenarioType: true,
            actions: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { agentType: true, createdAt: true },
            },
        },
    });

    console.log("\nActive incidents:");
    for (const incident of incidents) {
        const lastAction = incident.actions[0];
        const lastActionText = lastAction
            ? `lastAction=${lastAction.agentType} at ${lastAction.createdAt.toISOString()}`
            : "lastAction=none";
        console.log(`- ${incident.id} [${incident.status}/${incident.scenarioType}] ${incident.title} (${lastActionText})`);
    }

    console.log("\nRedis pending entries:");
    for (const [stream, group] of STREAM_GROUPS) {
        const pending = await redis.send("XPENDING", [stream, group, "-", "+", "20"]);
        if (!Array.isArray(pending) || pending.length === 0) {
            console.log(`- ${stream} ${group}: none`);
            continue;
        }

        console.log(`- ${stream} ${group}: ${pending.length} shown`);
        for (const row of pending) {
            if (!Array.isArray(row)) continue;
            const [id, consumer, idleMs, deliveries] = row;
            const payload = await redis.send("XRANGE", [stream, String(id), String(id)]);
            const incidentId = extractIncidentId(payload);
            console.log(`  ${id} incidentId=${incidentId ?? "unknown"} consumer=${consumer} idleMs=${idleMs} deliveries=${deliveries}`);
        }
    }

    const failed = await redis.send("XREVRANGE", [STREAMS.FAILED, "+", "-", "COUNT", "20"]);
    if (Array.isArray(failed) && failed.length > 0) {
        console.log("\nRecent dead-letter entries:");
        for (const row of failed) {
            if (!Array.isArray(row)) continue;
            const [id, flat] = row;
            const fields = Array.isArray(flat) ? flatToObject(flat) : {};
            console.log(`- ${id} incidentId=${fields.incidentId ?? ""} from=${fields.originalStream ?? ""} attempts=${fields.attempts ?? ""} error=${(fields.error ?? "").slice(0, 240)}`);
        }
    }
}

function extractIncidentId(payload: unknown): string | null {
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;
    const flat = payload[0][1];
    if (!Array.isArray(flat)) return null;
    return flatToObject(flat).incidentId ?? null;
}

function flatToObject(flat: unknown[]): Record<string, string> {
    const obj: Record<string, string> = {};
    for (let i = 0; i < flat.length; i += 2) {
        const key = flat[i];
        const val = flat[i + 1];
        if (typeof key === "string" && val !== undefined) obj[key] = String(val);
    }
    return obj;
}
