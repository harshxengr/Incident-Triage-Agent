
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IncidentStatusBadge } from "@/components/dashboard/incident-status-badge";
import type { Incident } from "@/types/incident";

interface IncidentTableProps {
  incidents: Incident[];
  busyIncidentId: string | null;
  onOpenHistory: (incidentId: string) => void;
  onDecision: (
    incident: Incident,
    decision: "approve" | "reject",
  ) => void;
  onResolveEscalation: (incident: Incident) => void;
}

export function IncidentTable({
  incidents,
  busyIncidentId,
  onOpenHistory,
  onDecision,
  onResolveEscalation,
}: IncidentTableProps) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Incidents</CardTitle>
        <CardDescription>
          Review incidents, inspect evidence, and handle actions
          that require human attention.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">
                  Incident
                </TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[300px]">
                  Review
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {incidents.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-muted-foreground"
                  >
                    No incidents found. Trigger a demo incident
                    to get started.
                  </TableCell>
                </TableRow>
              ) : (
                incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="align-top">
                      <p className="font-medium">
                        {incident.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {incident.id.slice(0, 8)}
                      </p>

                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() =>
                          onOpenHistory(incident.id)
                        }
                      >
                        View history
                      </Button>
                    </TableCell>

                    <TableCell className="align-top">
                      <span className="text-sm">
                        {incident.service}
                      </span>
                    </TableCell>

                    <TableCell className="align-top">
                      <Badge variant="outline">
                        {incident.severity}
                      </Badge>
                    </TableCell>

                    <TableCell className="align-top">
                      <IncidentStatusBadge
                        status={incident.status}
                      />
                    </TableCell>

                    <TableCell className="align-top">
                      {incident.status === "PENDING_APPROVAL" ? (
                        <ApprovalPanel
                          incident={incident}
                          busy={busyIncidentId === incident.id}
                          onDecision={onDecision}
                        />
                      ) : incident.status === "ESCALATED" ? (
                        <EscalationPanel
                          incident={incident}
                          busy={busyIncidentId === incident.id}
                          onResolve={onResolveEscalation}
                        />
                      ) : (
                        <StatusMessage status={incident.status} />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ApprovalPanelProps {
  incident: Incident;
  busy: boolean;
  onDecision: IncidentTableProps["onDecision"];
}

function ApprovalPanel({
  incident,
  busy,
  onDecision,
}: ApprovalPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
      <div>
        <Badge className="bg-orange-600 text-white hover:bg-orange-600">
          Approval required
        </Badge>

        <p className="mt-2 font-medium">
          {incident.proposedAction?.action ?? "Unknown action"}
        </p>

        {incident.proposedAction?.target && (
          <p className="break-all text-sm text-muted-foreground">
            Target: {incident.proposedAction.target}
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {incident.actionReasoning ??
          "Review the recommendation before deciding."}
      </p>

      {incident.proposedAction?.confidence != null && (
        <p className="text-xs text-muted-foreground">
          Action confidence:{" "}
          {(incident.proposedAction.confidence * 100).toFixed(0)}%
        </p>
      )}

      {incident.diagnosis && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Diagnosis evidence
          </summary>

          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>{incident.diagnosis.diagnosis}</p>
            <p className="break-all">
              Suspected deployment:{" "}
              {incident.diagnosis.suspectedDeploymentId ?? "None"}
            </p>
          </div>
        </details>
      )}

      {incident.logAnalysis && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Log analysis
          </summary>

          <div className="mt-2 space-y-1 text-muted-foreground">
            <p>Pattern: {incident.logAnalysis.pattern}</p>
            <p>
              Error count:{" "}
              {incident.logAnalysis.errorCount ?? "Unknown"}
            </p>
            <p>
              Time window:{" "}
              {incident.logAnalysis.timeWindowMinutes ?? "Unknown"} min
            </p>
            <p>
              Location:{" "}
              {incident.logAnalysis.affectedLocation ?? "Unknown"}
            </p>
          </div>
        </details>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Raw incident log
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
          {incident.rawLog}
        </pre>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onDecision(incident, "approve")}
        >
          {busy ? "Processing..." : "Approve"}
        </Button>

        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => onDecision(incident, "reject")}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

interface EscalationPanelProps {
  incident: Incident;
  busy: boolean;
  onResolve: IncidentTableProps["onResolveEscalation"];
}

function EscalationPanel({
  incident,
  busy,
  onResolve,
}: EscalationPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <Badge variant="outline">Human investigation</Badge>

      <p className="text-sm text-muted-foreground">
        {incident.actionReasoning ??
          "The agent requested human investigation."}
      </p>

      {incident.diagnosis && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            View diagnosis
          </summary>
          <p className="mt-2 text-muted-foreground">
            {incident.diagnosis.diagnosis}
          </p>
        </details>
      )}

      <Button
        size="sm"
        disabled={busy}
        onClick={() => onResolve(incident)}
      >
        {busy ? "Processing..." : "Mark investigation resolved"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Record this only after a human has investigated the issue.
      </p>
    </div>
  );
}

function StatusMessage({ status }: { status: string }) {
  const messages: Record<string, string> = {
    NO_ACTION_REQUIRED: "No remediation required",
    SIMULATED: "Simulation only — no real change made",
    RESOLVED: "Resolved",
    REJECTED: "Action rejected",
    FAILED: "Processing failed",
    FALSE_POSITIVE: "Marked as false positive",
    EXECUTING: "Action in progress",
    APPROVED: "Approved",
    OPEN: "Waiting for processing",
    DIAGNOSING: "Analyzing incident",
    DIAGNOSED: "Diagnosis complete",
    ACTION_PROPOSED: "Preparing action",
  };

  return (
    <p className="text-sm text-muted-foreground">
      {messages[status] ?? status.replaceAll("_", " ")}
    </p>
  );
}
