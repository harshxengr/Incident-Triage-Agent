"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IncidentLifecycle } from "@/components/dashboard/incident-lifecycle";
import { IncidentStatusBadge } from "@/components/dashboard/incident-status-badge";
import type {
  IncidentHistory,
  TimelineEvent,
} from "@/types/incident";

interface IncidentDetailDialogProps {
  open: boolean;
  loading: boolean;
  history: IncidentHistory | null;
  onClose: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function timelineLabel(agentType: string, output: unknown): string {
  if (agentType === "LOG_ANALYZER") return "Log analysis completed";
  if (agentType === "DIAGNOSIS") return "Diagnosis completed";
  if (agentType === "ACTION") return "Action proposed";
  if (agentType === "COMMUNICATOR") return "Incident communication sent";

  if (agentType === "ORCHESTRATOR") {
    const result = readObject(output);
    const decision = result?.decision;

    if (decision === "approved") return "Human approved action";
    if (decision === "rejected") return "Human rejected action";
    if (decision === "resolved_escalation") {
      return "Investigation marked resolved";
    }

    return "Incident decision recorded";
  }

  return agentType;
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const output = readObject(event.output);
  const input = readObject(event.input);
  const decision =
    event.agentType === "ORCHESTRATOR" ? output?.decision : null;

  const decisionColor =
    decision === "approved"
      ? "border-green-500 bg-green-50"
      : decision === "rejected"
        ? "border-red-500 bg-red-50"
        : "border-border bg-muted/30";

  return (
    <div className="grid grid-cols-[12px_minmax(0,1fr)] gap-3">
      <div className="mt-2 h-2.5 w-2.5 rounded-full bg-muted-foreground" />

      <div className="min-w-0 border-l pl-4 pb-5">
        <p className="font-medium">
          {timelineLabel(event.agentType, event.output)}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {event.agentType} · {formatDate(event.createdAt)}
        </p>

        {event.reasoning && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
            <span className="font-medium">Reasoning: </span>
            {event.reasoning}
          </p>
        )}

        {event.confidence != null && (
          <p className="mt-2 text-xs text-muted-foreground">
            Confidence: {(event.confidence * 100).toFixed(0)}%
          </p>
        )}

        {event.agentType === "ORCHESTRATOR" && (
          <div className={`mt-3 rounded-md border p-3 text-sm ${decisionColor}`}>
            <p>
              <span className="font-medium">Decision: </span>
              {String(decision ?? "recorded")}
            </p>

            {typeof input?.decidedBy === "string" && (
              <p className="mt-1">
                <span className="font-medium">Decided by: </span>
                {input.decidedBy}
              </p>
            )}

            {typeof input?.reason === "string" && (
              <p className="mt-1">
                <span className="font-medium">Reason: </span>
                {input.reason}
              </p>
            )}

            {typeof input?.rejectionReason === "string" && (
              <p className="mt-1">
                <span className="font-medium">Rejection reason: </span>
                {input.rejectionReason}
              </p>
            )}

            {output?.execution != null && (
              <div className="mt-3">
                <p className="font-medium">Execution result</p>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">
                  {prettyJson(output.execution)}
                </pre>
              </div>
            )}
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            View event data
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {prettyJson(event.output)}
          </pre>
        </details>
      </div>
    </div>
  );
}

export function IncidentDetailDialog({
  open,
  loading,
  history,
  onClose,
}: IncidentDetailDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {history?.title ?? "Incident history"}
          </DialogTitle>
          <DialogDescription>
            Review the incident lifecycle, agent decisions, and recorded events.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading incident history…
          </p>
        )}

        {!loading && !history && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No incident history is available.
          </p>
        )}

        {!loading && history && (
          <div className="space-y-6">
            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{history.service}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm text-muted-foreground">
                  {history.severity}
                </span>
                <IncidentStatusBadge status={history.status} />
              </div>

              <IncidentLifecycle status={history.status} />

              <div className="text-sm text-muted-foreground">
                <p>Created: {formatDate(history.createdAt)}</p>

                {history.approvedAt && (
                  <p>Approved: {formatDate(history.approvedAt)}</p>
                )}

                {history.executionStartedAt && (
                  <p>
                    Execution started:{" "}
                    {formatDate(history.executionStartedAt)}
                  </p>
                )}

                {history.executionCompletedAt && (
                  <p>
                    Execution finished:{" "}
                    {formatDate(history.executionCompletedAt)}
                  </p>
                )}

                {history.resolvedAt && (
                  <p>Finished: {formatDate(history.resolvedAt)}</p>
                )}
              </div>

              {history.approvedBy && (
                <p className="text-sm">
                  <span className="font-medium">Approved by: </span>
                  {history.approvedBy}
                </p>
              )}

              {history.rejectedBy && (
                <p className="text-sm">
                  <span className="font-medium">Rejected by: </span>
                  {history.rejectedBy}
                  {history.rejectionReason
                    ? ` — ${history.rejectionReason}`
                    : ""}
                </p>
              )}

              {history.failureReason && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium">Failure</p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {history.failureReason}
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">Agent timeline</h3>
                <p className="text-sm text-muted-foreground">
                  Events are shown in the order returned by the API.
                </p>
              </div>

              {history.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No agent history has been recorded yet.
                </p>
              ) : (
                <div>
                  {history.timeline.map((event, index) => (
                    <TimelineItem
                      key={`${event.createdAt}-${event.agentType}-${index}`}
                      event={event}
                    />
                  ))}
                </div>
              )}
            </section>

            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">
                View raw incident log
              </summary>

              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {history.rawLog}
              </pre>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}