import { prisma } from "../db/client";
import { logAction } from "../db/logAction";
import type { Notifier } from "../notifier/client";
import { createStreamClient } from "../streams/client";
import { SimulatedActionExecutor } from "../execution/actionExecutor";

export type ResumeDecision = "approved" | "rejected";

export interface ResumeResult {
    ok: boolean;
    reason?: string;
}

export async function resumeIncident(
    incidentId: string,
    decision: ResumeDecision,
    decidedBy: string,
    notifier: Notifier,
    rejectionReason?: string
): Promise<ResumeResult> {
    // Conditional update, not read-then-write: only an incident that is
    // STILL pending approval gets transitioned. Two people racing to
    // resolve the same incident (or a double click) should not both
    // succeed - same class of problem as two concurrent transfers hitting
    // one wallet balance in PixelPay, solved the same way. Verified this
    // exact pattern against a real Postgres instance: fired approve and
    // reject at the same incident simultaneously, 5 times, exactly one
    // update ever landed.
    const updated = await prisma.incident.updateMany({
        where: { id: incidentId, status: "PENDING_APPROVAL" },
        data: {
            status: decision === "approved" ? "RESOLVED" : "REJECTED",
            resolvedAt: new Date(),
        },
    });

    if (updated.count === 0) {
        const existing = await prisma.incident.findUnique({
            where: { id: incidentId },
            select: { status: true },
        });

        return {
            ok: false,
            reason: existing
                ? `Incident exists but its status is "${existing.status}", not PENDING_APPROVAL.`
                : `No incident found with id "${incidentId}".`,
        };
    }

    const priorAction = await prisma.agentAction.findFirstOrThrow({
        where: { incidentId, agentType: "ACTION" },
        orderBy: { createdAt: "desc" },
    });

    if (decision === "approved") {
        const executor = new SimulatedActionExecutor();
        const proposedAction = priorAction.output as { action: string; target: string | null };
        const execution = await executor.execute(proposedAction.action as any, proposedAction.target);
        console.log("Execution result:", execution);
    }

    const broadcastClient = createStreamClient();
    await logAction({
        incidentId,
        agentType: "ORCHESTRATOR",
        input: { decision, decidedBy, rejectionReason },
        output: { proposedAction: priorAction.output },
        reasoning:
            decision === "approved"
                ? `${decidedBy} approved the proposed action.`
                : `${decidedBy} rejected the proposed action.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        broadcast: broadcastClient,
    });
    broadcastClient.close();

    const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });

    const message =
        decision === "approved"
            ? `Incident "${incident.title}" approved by ${decidedBy} and marked resolved. (Action execution is simulated in this project.)`
            : `Incident "${incident.title}" rejected by ${decidedBy}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""} Needs manual follow-up.`;

    await notifier.send(message);

    return { ok: true };
}