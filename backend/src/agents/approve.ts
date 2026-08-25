import { prisma } from "../db/client";
import { ConsoleNotifier } from "../notifier/client";
import { resumeIncident } from "./resume";

const incidentId = process.argv[2];
const decidedBy = process.argv[3] ?? "on-call-engineer";

if (!incidentId) {
    console.error("Usage: bun run src/agents/approve.ts <incidentId> [decidedBy]");
    process.exit(1);
}

const result = await resumeIncident(incidentId, "approved", decidedBy, new ConsoleNotifier());
console.log(result.ok ? "Approved." : `Not approved: ${result.reason}`);
await prisma.$disconnect();
process.exit(result.ok ? 0 : 1);