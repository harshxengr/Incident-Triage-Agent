import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db/client";

export type IncidentStatus = Prisma.IncidentStatus;

const ACTIVE_STATUSES: IncidentStatus[] = [
  "OPEN",
  "DIAGNOSING",
  "DIAGNOSED",
  "ACTION_PROPOSED",
  "PENDING_APPROVAL",
  "APPROVED",
  "EXECUTING",
];

const TERMINAL_STATUSES: IncidentStatus[] = [
  "RESOLVED",
  "REJECTED",
  "FAILED",
  "FALSE_POSITIVE",
];

const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: ["DIAGNOSING", "FAILED"],
  DIAGNOSING: ["DIAGNOSED", "FAILED"],
  DIAGNOSED: ["ACTION_PROPOSED", "FAILED"],
  ACTION_PROPOSED: ["PENDING_APPROVAL", "EXECUTING", "FAILED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "FAILED"],
  APPROVED: ["EXECUTING", "FAILED"],
  EXECUTING: ["RESOLVED", "FAILED"],
  RESOLVED: [],
  REJECTED: [],
  FALSE_POSITIVE: [],
  FAILED: [],
};

export interface TransitionOptions {
  from: IncidentStatus | IncidentStatus[];
  data?: Record<string, unknown>;
}

export class InvalidIncidentTransitionError extends Error {
  constructor(
    public readonly incidentId: string,
    public readonly from: IncidentStatus,
    public readonly to: IncidentStatus,
  ) {
    super(`Invalid incident transition ${from} -> ${to} for ${incidentId}`);
    this.name = "InvalidIncidentTransitionError";
  }
}

export class ConcurrentIncidentTransitionError extends Error {
  constructor(
    public readonly incidentId: string,
    public readonly expected: IncidentStatus | IncidentStatus[],
    public readonly actual: IncidentStatus | null,
    public readonly to: IncidentStatus,
  ) {
    super(
      actual
        ? `Incident ${incidentId} changed from the expected state to ${actual}; cannot transition to ${to}`
        : `Incident ${incidentId} no longer exists`,
    );
    this.name = "ConcurrentIncidentTransitionError";
  }
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isActiveStatus(status: IncidentStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminalStatus(status: IncidentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export async function transitionIncident(
  incidentId: string,
  to: IncidentStatus,
  options: TransitionOptions,
): Promise<{ changed: boolean; status: IncidentStatus }> {
  const from = Array.isArray(options.from) ? options.from : [options.from];

  for (const source of from) {
    if (source === to || !canTransition(source, to)) {
      throw new InvalidIncidentTransitionError(incidentId, source, to);
    }
  }

  const updated = await prisma.incident.updateMany({
    where: {
      id: incidentId,
      status: { in: from },
    },
    data: {
      status: to,
      ...(options.data ?? {}),
    },
  });

  if (updated.count === 1) {
    return { changed: true, status: to };
  }

  const existing = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { status: true },
  });

  if (!existing) {
    throw new ConcurrentIncidentTransitionError(
      incidentId,
      options.from,
      null,
      to,
    );
  }

  if (existing.status === to) {
    return { changed: false, status: to };
  }

  throw new ConcurrentIncidentTransitionError(
    incidentId,
    options.from,
    existing.status,
    to,
  );
}
