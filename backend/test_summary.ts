import { prisma } from "./src/db/client.ts";

const incidents = await prisma.incident.findMany();
const statuses: Record<string, number> = {};
incidents.forEach((inc) => {
  statuses[inc.status] = (statuses[inc.status] || 0) + 1;
});

console.log("\nIncident statistics");
console.log(`Total incidents: ${incidents.length}`);
console.log("By Status:");
Object.entries(statuses).forEach(([status, count]) => {
  console.log(`  - ${status}: ${count}`);
});

console.log("\nThis command reports database contents only; it does not run tests.\n");

process.exit(0);
