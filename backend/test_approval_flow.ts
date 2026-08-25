import { prisma } from "./src/db/client.ts";

// Find an incident that has an action requiring human approval
const incidents = await prisma.incident.findMany({
  where: { status: { in: ["AWAITING_APPROVAL", "RESOLVED"] } },
  include: { actions: true },
  take: 5,
  orderBy: { createdAt: "desc" }
});

console.log("\n=== Incidents with actions ===\n");
incidents.forEach(incident => {
  console.log(`Incident: ${incident.id}`);
  console.log(`Title: ${incident.title}`);
  console.log(`Status: ${incident.status}`);
  console.log(`Actions: ${incident.actions.length}`);
  incident.actions.forEach(action => {
    console.log(`  - ${action.name}: ${action.approved}`);
  });
  console.log();
});

process.exit(0);
