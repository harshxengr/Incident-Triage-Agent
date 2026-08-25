import { timingSafeEqual, createHmac } from "crypto";

// --- Simple API key check, for our own webhook endpoints ---
export function checkApiKey(req: Request, expectedKey: string): boolean {
  const provided = req.headers.get("x-api-key");
  if (!provided) return false;
  return constantTimeEqual(provided, expectedKey);
}

// --- Slack request signature verification ---
// https://docs.slack.dev/authentication/verifying-requests-from-slack/
const FIVE_MINUTES_SECONDS = 60 * 5;

export function verifySlackSignature(params: {
  signingSecret: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  rawBody: string;
  now?: number;
}): { valid: boolean; reason?: string } {
  const { signingSecret, timestampHeader, signatureHeader, rawBody } = params;
  const now = params.now ?? Math.floor(Date.now() / 1000);

  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: "missing timestamp or signature header" };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: "timestamp header is not a number" };
  }

  if (Math.abs(now - timestamp) > FIVE_MINUTES_SECONDS) {
    return { valid: false, reason: "timestamp too old or too far in the future - possible replay" };
  }

  const baseString = `v0:${timestampHeader}:${rawBody}`;
  const computed = "v0=" + createHmac("sha256", signingSecret).update(baseString).digest("hex");

  if (!constantTimeEqual(computed, signatureHeader)) {
    return { valid: false, reason: "signature mismatch" };
  }

  return { valid: true };
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}