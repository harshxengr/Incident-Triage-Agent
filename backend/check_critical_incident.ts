import { prisma } from "./src/db/client.ts";

const incident = await prisma.incident.findFirst({
  where: { id: "cmt7dbsuo0001udes0bmmzv4y" },
  include: { actions: true }
});

if (incident) {
  console.log("\n=== Critical Incident Status ===");
  console.log(`ID: ${incident.id}`);
  console.log(`Title: ${incident.title}`);
  console.log(`Status: ${incident.status}`);
  console.log(`Service: ${incident.service}`);
  console.log(`Severity: ${incident.severity}`);
  console.log(`Actions: ${incident.actions.length}`);
  if (incident.actions.length > 0) {
    incident.actions.forEach(action => {
      console.log(`  - ${action.name}: approved=${action.approved}`);
    });
  }
  console.log(`Created: ${incident.createdAt}`);
  console.log(`Resolved: ${incident.resolvedAt}`);
} else {
  console.log("Incident not found");
}

process.exit(0);
