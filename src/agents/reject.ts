import { prisma } from "../db/client";
import { ConsoleNotifier } from "../notifier/client";
import { resumeIncident } from "./resume";

const incidentId = process.argv[2];
const reason = process.argv[3];
const decidedBy = process.argv[4] ?? "on-call-engineer";

if (!incidentId) {
    console.error('Usage: bun run src/agents/reject.ts <incidentId> "<reason>" [decidedBy]');
    process.exit(1);
}

const result = await resumeIncident(incidentId, "rejected", decidedBy, new ConsoleNotifier(), reason);
console.log(result.ok ? "Rejected." : `Not rejected: ${result.reason}`);
await prisma.$disconnect();
process.exit(result.ok ? 0 : 1);