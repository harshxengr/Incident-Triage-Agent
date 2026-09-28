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
    const priorAction = await prisma.agentAction.findFirst({
        where: { incidentId, agentType: "ACTION" },
        orderBy: { createdAt: "desc" },
    });

    if (!priorAction) {
        return { ok: false, reason: "No proposed action exists for this incident." };
    }

    const now = new Date();
    const updated = await prisma.incident.updateMany({
        where: { id: incidentId, status: "PENDING_APPROVAL" },
        data:
            decision === "approved"
                ? {
                    status: "APPROVED",
                    approvedAt: now,
                    approvedBy: decidedBy,
                    failureReason: null,
                }
                : {
                    status: "REJECTED",
                    rejectedAt: now,
                    rejectedBy: decidedBy,
                    rejectionReason: rejectionReason ?? null,
                    resolvedAt: now,
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

    let execution: import("../execution/actionExecutor").ExecutionResult | undefined;

    if (decision === "approved") {
        await prisma.incident.update({
            where: { id: incidentId },
            data: {
                status: "EXECUTING",
                executionStartedAt: new Date(),
            },
        });

        const executor = new SimulatedActionExecutor();
        const proposedAction = priorAction.output as { action: string; target: string | null };
        execution = await executor.execute(proposedAction.action as any, proposedAction.target);

        const resolved = execution.executed === true;
        await prisma.incident.update({
            where: { id: incidentId },
            data: {
                status: resolved ? "RESOLVED" : "FAILED",
                resolvedAt: resolved ? new Date() : null,
                executionCompletedAt: new Date(),
                failureReason: resolved ? null : execution.detail,
            },
        });
    }

    const broadcastClient = createStreamClient();
    await logAction({
        incidentId,
        agentType: "ORCHESTRATOR",
        input: { decision, decidedBy, rejectionReason },
        output: {
            proposedAction: priorAction.output,
            execution: execution ?? null,
        },
        reasoning:
            decision === "approved"
                ? `${decidedBy} approved the proposed action.${execution?.simulated ? " Execution was simulated." : ""}`
                : `${decidedBy} rejected the proposed action.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        broadcast: broadcastClient,
    });
    broadcastClient.close();

    const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });

    const message =
        decision === "approved"
            ? `Incident "${incident.title}" approved by ${decidedBy}. ${execution?.detail ?? "Action submitted."}`
            : `Incident "${incident.title}" rejected by ${decidedBy}.${rejectionReason ? ` Reason: ${rejectionReason}` : ""} Needs manual follow-up.`;

    await notifier.send(message);

    return { ok: true };
}
