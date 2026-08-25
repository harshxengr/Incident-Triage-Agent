import { prisma } from "../db/client";
import { createStreamClient, xadd } from "./client";
import { STREAMS } from "./topics";

const openIncidents = await prisma.incident.findMany({
  where: { status: { in: ["OPEN", "DIAGNOSING"] } },
  select: {
    id: true,
    status: true,
    actions: {
      select: { agentType: true },
    },
  },
});

const client = createStreamClient();
let enqueued = 0;

for (const inc of openIncidents) {
  const completedAgents = new Set(inc.actions.map((action) => action.agentType));

  if (!completedAgents.has("LOG_ANALYZER")) {
    await xadd(client, STREAMS.NEW, { incidentId: inc.id });
    enqueued++;
    continue;
  }

  if (!completedAgents.has("DIAGNOSIS")) {
    await xadd(client, STREAMS.LOG_ANALYZED, { incidentId: inc.id });
    enqueued++;
    continue;
  }

  if (!completedAgents.has("ACTION")) {
    await xadd(client, STREAMS.DIAGNOSED, { incidentId: inc.id });
    enqueued++;
    continue;
  }

  if (!completedAgents.has("COMMUNICATOR")) {
    await xadd(client, STREAMS.ACTION_DECIDED, { incidentId: inc.id });
    enqueued++;
  }
}

console.log(`Enqueued/resumed ${enqueued} active incidents.`);
process.exit(0);
