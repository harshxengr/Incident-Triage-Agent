import { createStreamClient, xadd } from "./client";
import { STREAMS } from "./topics";

const incidentId = process.argv[2];
if (!incidentId) {
  console.error("Usage: bun run src/streams/enqueueIncident.ts <incidentId>");
  process.exit(1);
}

const client = createStreamClient();
await xadd(client, STREAMS.NEW, { incidentId });
console.log(`Enqueued incident ${incidentId} onto ${STREAMS.NEW}`);
process.exit(0);