export interface ParsedSlackAction {
  actionId: "approve_incident" | "reject_incident";
  incidentId: string;
  slackUserId: string;
  slackUsername: string;
}

export type ParseResult = { ok: true; data: ParsedSlackAction } | { ok: false; error: string };

export function parseSlackInteractionBody(rawBody: string): ParseResult {
  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) return { ok: false, error: "no 'payload' field in form body" };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return { ok: false, error: "payload field was not valid JSON" };
  }

  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "payload was not a JSON object" };
  }
  const p = payload as Record<string, unknown>;

  if (p.type !== "block_actions") {
    return { ok: false, error: `unhandled interaction type: ${String(p.type)}` };
  }

  const actions = p.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return { ok: false, error: "no actions array in payload" };
  }

  const action = actions[0] as Record<string, unknown>;
  const actionId = action.action_id;
  if (actionId !== "approve_incident" && actionId !== "reject_incident") {
    return { ok: false, error: `unrecognised action_id: ${String(actionId)}` };
  }

  const incidentId = action.value;
  if (typeof incidentId !== "string" || incidentId.length === 0) {
    return { ok: false, error: "action had no incident id in its value field" };
  }

  const user = p.user as Record<string, unknown> | undefined;
  const slackUserId = typeof user?.id === "string" ? user.id : "unknown";
  const slackUsername = typeof user?.username === "string" ? user.username : "unknown";

  return { ok: true, data: { actionId, incidentId, slackUserId, slackUsername } };
}