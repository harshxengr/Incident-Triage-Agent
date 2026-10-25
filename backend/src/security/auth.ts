import { timingSafeEqual } from "crypto";

// --- Simple API key check, for our own webhook endpoints ---
export function checkApiKey(req: Request, expectedKey: string): boolean {
  const provided = req.headers.get("x-api-key");
  if (!provided) return false;
  return constantTimeEqual(provided, expectedKey);
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}