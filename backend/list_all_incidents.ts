import { prisma } from "./src/db/client.ts";

const incidents = await prisma.incident.findMany({
  include: { actions: true },
  take: 10,
  orderBy: { createdAt: "desc" }
});

console.log("\n=== All Recent Incidents ===\n");
incidents.forEach(incident => {
  console.log(`ID: ${incident.id}`);
  console.log(`Title: ${incident.title}`);
  console.log(`Status: ${incident.status}`);
  console.log(`Service: ${incident.service}`);
  console.log(`Actions: ${incident.actions.length}`);
  if (incident.actions.length > 0) {
    incident.actions.forEach((action) => {
      console.log(`  - ${action.agentType}: ${JSON.stringify(action.output)}`);
    });
  }
  console.log();
});

process.exit(0);
