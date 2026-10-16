import { checkApiKey } from "../security/auth";

export type ApprovalDecision = "approved" | "rejected";

export interface ApprovalResult {
  ok: boolean;
  reason?: string;
}

export interface ApprovalNotifier {
  send(message: string): Promise<void>;
}

export interface ApprovalRouteDependencies {
  operatorKey: string;

  findDemoIncident(
    incidentId: string,
  ): Promise<{ status: string } | null>;

  resumeIncident(
    incidentId: string,
    decision: ApprovalDecision,
    decidedBy: string,
    notifier: ApprovalNotifier,
    reason?: string,
  ): Promise<ApprovalResult>;

  createNotifier(): ApprovalNotifier;
}

export function createApprovalHandler(
  dependencies: ApprovalRouteDependencies,
) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (
      req.method !== "POST" ||
      !["/approve", "/reject"].includes(url.pathname)
    ) {
      return new Response("Not found", { status: 404 });
    }

    if (
      !dependencies.operatorKey ||
      !checkApiKey(req, dependencies.operatorKey)
    ) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return Response.json(
        { error: "request body must be a JSON object" },
        { status: 400 },
      );
    }

    const payload = body as {
      incidentId?: unknown;
      decidedBy?: unknown;
      reason?: unknown;
    };

    if (
      typeof payload.incidentId !== "string" ||
      payload.incidentId.trim() === ""
    ) {
      return Response.json(
        { error: "incidentId is required" },
        { status: 400 },
      );
    }

    const incidentId = payload.incidentId.trim();

    const incident =
      await dependencies.findDemoIncident(incidentId);

    if (!incident) {
      return Response.json(
        { error: "No matching demo incident is available." },
        { status: 404 },
      );
    }

    if (incident.status !== "PENDING_APPROVAL") {
      return Response.json(
        { error: "Incident is not awaiting approval." },
        { status: 409 },
      );
    }

    const decision: ApprovalDecision =
      url.pathname === "/approve" ? "approved" : "rejected";

    const decidedBy =
      typeof payload.decidedBy === "string" &&
      payload.decidedBy.trim()
        ? payload.decidedBy.trim()
        : "unknown";

    const reason =
      typeof payload.reason === "string"
        ? payload.reason
        : undefined;

    const result = await dependencies.resumeIncident(
      incidentId,
      decision,
      decidedBy,
      dependencies.createNotifier(),
      reason,
    );

    return Response.json(result, {
      status: result.ok ? 200 : 409,
    });
  };
}