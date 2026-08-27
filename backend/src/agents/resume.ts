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
    const updated = await prisma.incident.updateMany({
        where: { id: incidentId, status: "PENDING_APPROVAL" },
        data: {
            status: decision === "approved" ? "FAILED" : "REJECTED",
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
            ? `Incident "${incident.title}" approved by ${decidedBy}, but the simulated action was not executed.`
            : `Incident "${incident.title}" rejected by ${decidedBy}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""} Needs manual follow-up.`;

    await notifier.send(message);

    return { ok: true };
}