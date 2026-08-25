const VALID_SERVICES = [
  "PAYMENTS_SERVICE", "AUTH_SERVICE", "ORDER_SERVICE",
  "NOTIFICATION_SERVICE", "DATABASE", "REDIS_CACHE",
] as const;

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export interface IncomingIncidentPayload {
  title: string;
  rawLog: string;
  service: (typeof VALID_SERVICES)[number];
  severity: (typeof VALID_SEVERITIES)[number];
}

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

export function validateIncidentPayload(body: unknown): ValidationResult<IncomingIncidentPayload> {
  const errors: string[] = [];

  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.title !== "string" || b.title.trim().length === 0) {
    errors.push("title is required and must be a non-empty string");
  }
  if (typeof b.rawLog !== "string" || b.rawLog.trim().length === 0) {
    errors.push("rawLog is required and must be a non-empty string");
  }
  if (typeof b.service !== "string" || !VALID_SERVICES.includes(b.service as any)) {
    errors.push(`service must be one of: ${VALID_SERVICES.join(", ")}`);
  }
  if (typeof b.severity !== "string" || !VALID_SEVERITIES.includes(b.severity as any)) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      title: (b.title as string).trim(),
      rawLog: b.rawLog as string,
      service: b.service as IncomingIncidentPayload["service"],
      severity: b.severity as IncomingIncidentPayload["severity"],
    },
  };
}

export interface IncomingDeploymentPayload {
  service: (typeof VALID_SERVICES)[number];
  commitHash: string;
  commitMessage: string;
  deployedBy: string;
}

export function validateDeploymentPayload(body: unknown): ValidationResult<IncomingDeploymentPayload> {
  const errors: string[] = [];

  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.service !== "string" || !VALID_SERVICES.includes(b.service as any)) {
    errors.push(`service must be one of: ${VALID_SERVICES.join(", ")}`);
  }
  if (typeof b.commitHash !== "string" || b.commitHash.trim().length === 0) {
    errors.push("commitHash is required");
  }
  if (typeof b.commitMessage !== "string") {
    errors.push("commitMessage is required (can be empty string)");
  }
  if (typeof b.deployedBy !== "string" || b.deployedBy.trim().length === 0) {
    errors.push("deployedBy is required");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      service: b.service as IncomingDeploymentPayload["service"],
      commitHash: (b.commitHash as string).trim(),
      commitMessage: b.commitMessage as string,
      deployedBy: (b.deployedBy as string).trim(),
    },
  };
}