import { prisma } from "./src/db/client.ts";

const incidents = await prisma.incident.findMany({
  where: { status: { in: ["PENDING_APPROVAL", "RESOLVED"] } },
  include: { actions: true },
  take: 5,
  orderBy: { createdAt: "desc" }
});

console.log("\n=== Incidents with actions ===\n");
incidents.forEach((incident) => {
  console.log(`Incident: ${incident.id}`);
  console.log(`Title: ${incident.title}`);
  console.log(`Status: ${incident.status}`);
  console.log(`Actions: ${incident.actions.length}`);
  incident.actions.forEach((action) => {
    console.log(`  - ${action.agentType}: ${JSON.stringify(action.output)}`);
  });
  console.log();
});

process.exit(0);
