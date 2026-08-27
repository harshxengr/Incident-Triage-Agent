import { RedisClient } from "bun";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// IMPORTANT: this is a factory, not a shared singleton. A blocking
// XREADGROUP holds up every other command queued on the same connection
// until it resolves - confirmed by testing, not just a theoretical
// concern. Each worker needs its own connection since each one blocks
// independently. Sharing one connection across workers causes acks and
// publishes from OTHER workers to silently queue up behind whichever
// worker is currently blocked reading.
export function createStreamClient(): RedisClient {
  return new RedisClient(REDIS_URL);
}

export async function xadd(
  client: RedisClient,
  stream: string,
  fields: Record<string, string>
): Promise<string> {
  const args = [stream, "*"];
  for (const [k, v] of Object.entries(fields)) args.push(k, v);
  return client.send("XADD", args);
}

// MKSTREAM means this also works the first time, before the stream exists.
// Safe to call on every worker startup - swallows "already exists" and
// re-throws anything else.
export async function ensureConsumerGroup(
  client: RedisClient,
  stream: string,
  group: string
): Promise<void> {
  try {
    await client.send("XGROUP", ["CREATE", stream, group, "0", "MKSTREAM"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("BUSYGROUP")) throw err;
  }
}

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

// blocks up to blockMs waiting for new entries. returns [] on timeout
// instead of null so callers don't need a null check every loop iteration.
export async function readGroup(
  client: RedisClient,
  stream: string,
  group: string,
  consumer: string,
  blockMs = Number(process.env.STREAM_BLOCK_MS ?? 5000)
): Promise<StreamEntry[]> {
  const result = await client.send("XREADGROUP", [
    "GROUP", group, consumer,
    "BLOCK", String(blockMs),
    "COUNT", "10",
    "STREAMS", stream, ">",
  ]);

  if (!result) return [];

  const [, entries] = Object.entries(result)[0] as [string, [string, string[]][]];
  return entries.map((e) => ({ id: e[0], fields: flatToObject(e[1]) }));
}

export async function ack(
  client: RedisClient,
  stream: string,
  group: string,
  id: string
): Promise<void> {
  await client.send("XACK", [stream, group, id]);
}

function flatToObject(flat: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) {
    const key = flat[i];
    const val = flat[i + 1];
    if (key !== undefined && val !== undefined) {
      obj[key] = val;
    }
  }
  return obj;
}