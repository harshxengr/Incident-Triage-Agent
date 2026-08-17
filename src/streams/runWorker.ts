import type { RedisClient } from "bun";
import { createStreamClient, ensureConsumerGroup, readGroup, ack } from "./client";

export async function runWorker(
  stream: string,
  group: string,
  consumerName: string,
  handler: (fields: Record<string, string>, client: RedisClient) => Promise<void>
): Promise<never> {
  // this worker owns one connection for its whole lifetime. the read/ack
  // cycle and any xadd the handler does happen sequentially within this
  // loop, so one connection is fine here - what's NOT fine is sharing a
  // connection ACROSS workers (see the comment in client.ts for why).
  const client = createStreamClient();
  await ensureConsumerGroup(client, stream, group);
  console.log(`[${consumerName}] listening on ${stream}`);

  while (true) {
    const entries = await readGroup(client, stream, group, consumerName);

    for (const entry of entries) {
      try {
        await handler(entry.fields, client);
        await ack(client, stream, group, entry.id);
      } catch (err) {
        // deliberately not acking - the message stays pending in the group
        // and is visible via XPENDING for inspection/retry. a dead-letter
        // stream after N delivery attempts would be the natural next step,
        // not built here to keep this phase's scope contained.
        console.error(`[${consumerName}] failed on ${entry.id}:`, err);
      }
    }
  }
}