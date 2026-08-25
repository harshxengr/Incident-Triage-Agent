import type { RedisClient } from "bun";
import { createStreamClient, ensureConsumerGroup, readGroup, ack, xadd } from "./client";
import { STREAMS } from "./topics";

const DEFAULT_PENDING_IDLE_MS = Number(process.env.WORKER_PENDING_IDLE_MS ?? 30_000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);
const PENDING_SCAN_COUNT = Number(process.env.WORKER_PENDING_SCAN_COUNT ?? 50);

interface PendingEntry {
  id: string;
  consumer: string;
  idleMs: number;
  deliveries: number;
}

interface WorkerOptions {
  pendingIdleMs?: number;
  maxAttempts?: number;
  onDeadLetter?: (fields: Record<string, string>, failure: DeadLetterFailure, client: RedisClient) => Promise<void>;
}

export interface DeadLetterFailure {
  stream: string;
  group: string;
  consumerName: string;
  messageId: string;
  attempts: number;
  error: string;
}

export async function runWorker(
  stream: string,
  group: string,
  consumerName: string,
  handler: (fields: Record<string, string>, client: RedisClient) => Promise<void>,
  options: WorkerOptions = {}
): Promise<never> {
  // this worker owns one connection for its whole lifetime. the read/ack
  // cycle and any xadd the handler does happen sequentially within this
  // loop, so one connection is fine here - what's NOT fine is sharing a
  // connection ACROSS workers (see the comment in client.ts for why).
  let client = createStreamClient();
  const pendingIdleMs = options.pendingIdleMs ?? DEFAULT_PENDING_IDLE_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  while (true) {
    try {
      await ensureConsumerGroup(client, stream, group);
      console.log(`[${consumerName}] listening on ${stream}`);

      while (true) {
        try {
          const entries = await readGroup(client, stream, group, consumerName);

          for (const entry of entries) {
            try {
              await processEntry(client, stream, group, consumerName, entry.id, entry.fields, 1, maxAttempts, handler, options);
            } catch (err) {
              console.error(`[${consumerName}] unexpected error on ${entry.id}: ${formatError(err)}`);
            }
          }

          const stalePending = await listStalePending(client, stream, group, pendingIdleMs);
          for (const pending of stalePending) {
            try {
              const claimed = await claimPending(client, stream, group, consumerName, pendingIdleMs, pending.id);
              for (const entry of claimed) {
                await processEntry(
                  client,
                  stream,
                  group,
                  consumerName,
                  entry.id,
                  entry.fields,
                  pending.deliveries + 1,
                  maxAttempts,
                  handler,
                  options
                );
              }
            } catch (err) {
              console.error(`[${consumerName}] failed claiming ${pending.id}: ${formatError(err)}`);
            }
          }
        } catch (err) {
          // Redis/read failures must not kill the process — back off and keep looping.
          console.error(`[${consumerName}] loop error (continuing): ${formatError(err)}`);
          await sleep(1000);
        }
      }
    } catch (err) {
      console.error(`[${consumerName}] worker crashed, reconnecting in 2s: ${formatError(err)}`);
      await sleep(2000);
      try {
        client.close();
      } catch {
        // ignore close errors on a dead connection
      }
      client = createStreamClient();
    }
  }
}

async function processEntry(
  client: RedisClient,
  stream: string,
  group: string,
  consumerName: string,
  id: string,
  fields: Record<string, string>,
  attempts: number,
  maxAttempts: number,
  handler: (fields: Record<string, string>, client: RedisClient) => Promise<void>,
  options: WorkerOptions
): Promise<void> {
  try {
    await handler(fields, client);
    await ack(client, stream, group, id);
  } catch (err) {
    const error = formatError(err);
    console.error(`[${consumerName}] failed on ${id} (attempt ${attempts}/${maxAttempts}): ${error}`);

    if (attempts >= maxAttempts) {
      try {
        const failure: DeadLetterFailure = {
          stream,
          group,
          consumerName,
          messageId: id,
          attempts,
          error,
        };
        await deadLetter(client, fields, failure);
        await options.onDeadLetter?.(fields, failure, client);
        await ack(client, stream, group, id);
        console.error(`[${consumerName}] dead-lettered ${id} after ${attempts} attempts`);
      } catch (dlqErr) {
        console.error(`[${consumerName}] failed to dead-letter ${id}: ${formatError(dlqErr)}`);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listStalePending(
  client: RedisClient,
  stream: string,
  group: string,
  minIdleMs: number
): Promise<PendingEntry[]> {
  const pending = await client.send("XPENDING", [stream, group, "-", "+", String(PENDING_SCAN_COUNT)]);
  if (!Array.isArray(pending)) return [];

  return pending
    .map((row): PendingEntry | null => {
      if (!Array.isArray(row)) return null;
      const [id, consumer, idleMs, deliveries] = row;
      if (typeof id !== "string" || typeof consumer !== "string") return null;
      return {
        id,
        consumer,
        idleMs: Number(idleMs),
        deliveries: Number(deliveries),
      };
    })
    .filter((entry): entry is PendingEntry => entry !== null && entry.idleMs >= minIdleMs);
}

async function claimPending(
  client: RedisClient,
  stream: string,
  group: string,
  consumerName: string,
  minIdleMs: number,
  id: string
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const result = await client.send("XCLAIM", [stream, group, consumerName, String(minIdleMs), id]);
  if (!Array.isArray(result)) return [];

  return result.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const [entryId, flat] = row;
    if (typeof entryId !== "string" || !Array.isArray(flat)) return [];
    return [{ id: entryId, fields: flatToObject(flat) }];
  });
}

async function deadLetter(
  client: RedisClient,
  fields: Record<string, string>,
  failure: DeadLetterFailure
): Promise<void> {
  await xadd(client, STREAMS.FAILED, {
    incidentId: fields.incidentId ?? "",
    originalStream: failure.stream,
    originalGroup: failure.group,
    originalMessageId: failure.messageId,
    consumerName: failure.consumerName,
    attempts: String(failure.attempts),
    error: failure.error,
    fields: JSON.stringify(fields),
    failedAt: new Date().toISOString(),
  });
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

function flatToObject(flat: unknown[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) {
    const key = flat[i];
    const val = flat[i + 1];
    if (typeof key === "string" && val !== undefined) {
      obj[key] = String(val);
    }
  }
  return obj;
}
