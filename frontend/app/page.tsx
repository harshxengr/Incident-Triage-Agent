"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3002";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3002/ws";
const OPERATOR_KEY_STORAGE = "incident-triage-dashboard-operator-key";

interface ProposedAction {
  action: string;
  target: string | null;
  reasoning: string;
  confidence: number;
  requiresHuman?: boolean;
  execution?: {
    executed: boolean;
    simulated?: boolean;
    detail: string;
  };
}

interface Incident {
  id: string;
  title: string;
  rawLog: string;
  service: string;
  severity: string;
  status: string;
  scenarioType: string;
  createdAt: string;
  resolvedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  executionStartedAt: string | null;
  executionCompletedAt: string | null;
  failureReason: string | null;
  logAnalysis: {
    errorCount: number | null;
    timeWindowMinutes: number | null;
    affectedLocation: string | null;
    pattern: string;
  } | null;
  diagnosis: {
    diagnosis: string;
    suspectedDeploymentId: string | null;
    confidence: number;
  } | null;
  diagnosisReasoning: string | null;
  diagnosisConfidence: number | null;
  proposedAction: ProposedAction | null;
  actionReasoning: string | null;
  actionConfidence: number | null;
}

interface TimelineEvent {
  agentType: string;
  input: unknown;
  output: unknown;
  reasoning: string | null;
  confidence: number | null;
  createdAt: string;
}

interface IncidentHistory {
  id: string;
  title: string;
  rawLog: string;
  service: string;
  severity: string;
  status: string;
  scenarioType: string;
  createdAt: string;
  resolvedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  executionStartedAt: string | null;
  executionCompletedAt: string | null;
  failureReason: string | null;
  timeline: TimelineEvent[];
}

interface AgentEvent {
  incidentId: string;
  agentType: string;
  output: unknown;
  reasoning: string | null;
  confidence: number | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "#888",
    DIAGNOSING: "#e0a800",
    DIAGNOSED: "#805ad5",
    ACTION_PROPOSED: "#805ad5",
    PENDING_APPROVAL: "#d9534f",
    APPROVED: "#3182ce",
    EXECUTING: "#3182ce",
    RESOLVED: "#28a745",
    REJECTED: "#6c757d",
    FALSE_POSITIVE: "#6c757d",
    FAILED: "#b45309",
  };
  return (
    <span style={{ color: colors[status] ?? "#000", fontWeight: "bold" }}>
      {status}
    </span>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function timelineLabel(agentType: string, output: unknown): string {
  if (agentType === "LOG_ANALYZER") return "Log analysis completed";
  if (agentType === "DIAGNOSIS") return "Diagnosis completed";
  if (agentType === "ACTION") return "Action proposed";
  if (agentType === "COMMUNICATOR") return "Incident communication sent";

  if (agentType === "ORCHESTRATOR") {
    if (typeof output === "object" && output !== null) {
      const decision = (output as Record<string, unknown>).decision;
      if (decision === "approved") return "Human approved action";
      if (decision === "rejected") return "Human rejected action";
    }
    return "Incident decision recorded";
  }

  return agentType;
}

const LIFECYCLE_STEPS = [
  "OPEN",
  "DIAGNOSING",
  "DIAGNOSED",
  "ACTION_PROPOSED",
  "PENDING_APPROVAL",
  "APPROVED",
  "EXECUTING",
  "RESOLVED",
] as const;

function lifecycleIndex(status: string): number {
  if (status === "REJECTED" || status === "FAILED") {
    return LIFECYCLE_STEPS.indexOf("PENDING_APPROVAL");
  }
  return Math.max(0, LIFECYCLE_STEPS.indexOf(status as (typeof LIFECYCLE_STEPS)[number]));
}

function Lifecycle({ status }: { status: string }) {
  const current = lifecycleIndex(status);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {LIFECYCLE_STEPS.map((step, index) => {
        const done = index < current || status === "RESOLVED";
        const active = index === current && status !== "RESOLVED";
        return (
          <span
            key={step}
            style={{
              padding: "4px 7px",
              border: "1px solid #ccc",
              fontSize: 10,
              fontWeight: done || active ? "bold" : "normal",
              opacity: done || active ? 1 : 0.45,
              background: done
                ? "#edf7ed"
                : active
                  ? "#eef6ff"
                  : "#fafafa",
            }}
          >
            {done ? "✓ " : active ? "→ " : ""}{step}
          </span>
        );
      })}
      {(status === "REJECTED" || status === "FAILED") && (
        <span
          style={{
            padding: "4px 7px",
            border: "1px solid #c53030",
            color: "#c53030",
            fontSize: 10,
            fontWeight: "bold",
          }}
        >
          {status}
        </span>
      )}
    </div>
  );
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [demoCooldown, setDemoCooldown] = useState(0);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [busyIncidentId, setBusyIncidentId] = useState<string | null>(null);

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<IncidentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function fetchIncidents() {
    const response = await fetch(`${API_BASE}/api/incidents`);
    if (!response.ok) throw new Error(`Incident request failed: ${response.status}`);
    return response.json() as Promise<Incident[]>;
  }

  async function fetchHistory(incidentId: string) {
    const response = await fetch(
      `${API_BASE}/api/incidents/${encodeURIComponent(incidentId)}/history`,
    );
    if (!response.ok) {
      throw new Error(`History request failed: ${response.status}`);
    }
    return response.json() as Promise<IncidentHistory>;
  }

  async function openHistory(incidentId: string) {
    setSelectedIncidentId(incidentId);
    setSelectedHistory(null);
    setHistoryLoading(true);

    try {
      const history = await fetchHistory(incidentId);
      setSelectedHistory(history);
    } catch (error) {
      console.error("failed to load incident history:", error);
      window.alert(
        error instanceof Error ? error.message : "Failed to load incident history",
      );
      setSelectedIncidentId(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setSelectedIncidentId(null);
    setSelectedHistory(null);
  }

  function getOperatorKey(): string | null {
    const saved = window.sessionStorage.getItem(OPERATOR_KEY_STORAGE);
    if (saved) return saved;

    const entered = window.prompt("Enter dashboard operator key");
    if (!entered?.trim()) return null;

    const key = entered.trim();
    window.sessionStorage.setItem(OPERATOR_KEY_STORAGE, key);
    return key;
  }

  async function handleDecision(incident: Incident, decision: "approve" | "reject") {
    if (decision === "approve") {
      const actionName = incident.proposedAction?.action ?? "the proposed action";
      const confirmed = window.confirm(
        `Approve ${actionName} for "${incident.title}"?\n\nThis will pass the decision to the executor.`,
      );
      if (!confirmed) return;
    }

    let reason: string | undefined;
    if (decision === "reject") {
      const enteredReason = window.prompt(
        `Reject the proposed action for "${incident.title}"? Enter a reason (optional):`,
      );
      if (enteredReason === null) return;
      reason = enteredReason.trim() || undefined;
    }

    const operatorKey = getOperatorKey();
    if (!operatorKey) return;

    setBusyIncidentId(incident.id);
    try {
      const response = await fetch(
        `${API_BASE}/api/incidents/${encodeURIComponent(incident.id)}/${decision}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": operatorKey,
          },
          body: JSON.stringify({
            decidedBy: "dashboard-operator",
            reason,
          }),
        },
      );

      const body = await response.json().catch(() => null);
      if (response.status === 401) {
        window.sessionStorage.removeItem(OPERATOR_KEY_STORAGE);
        throw new Error("Invalid dashboard operator key.");
      }

      if (!response.ok || !body?.ok) {
        throw new Error(body?.reason ?? `Decision request failed: ${response.status}`);
      }

      await fetchIncidents().then(setIncidents);

      if (selectedIncidentId === incident.id) {
        const history = await fetchHistory(incident.id);
        setSelectedHistory(history);
      }
    } catch (error) {
      console.error("Human decision failed:", error);
      window.alert(error instanceof Error ? error.message : "Human decision failed");
    } finally {
      setBusyIncidentId(null);
    }
  }

  useEffect(() => {
    fetchIncidents()
      .then(setIncidents)
      .catch((err) => console.error("failed to load incidents:", err));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      let event: AgentEvent;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      if (
        typeof event.incidentId !== "string" ||
        typeof event.agentType !== "string"
      ) {
        return;
      }

      setEvents((prev) => [event, ...prev].slice(0, 100));

      fetchIncidents()
        .then(setIncidents)
        .catch((err) =>
          console.error("failed to refresh incidents:", err),
        );

      if (selectedIncidentId === event.incidentId) {
        fetchHistory(event.incidentId)
          .then(setSelectedHistory)
          .catch((err) => console.error("failed to refresh history:", err));
      }
    };

    return () => ws.close();
  }, [selectedIncidentId]);

  useEffect(() => {
    if (demoCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setDemoCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [demoCooldown]);

  async function handleTriggerDemo() {
    if (triggering || demoCooldown > 0) return;

    setTriggering(true);
    setDemoMessage(null);

    try {
      const response = await fetch(`${API_BASE}/demo/trigger`, {
        method: "POST",
      });

      if (response.status === 429) {
        const body = await response.json().catch(() => null) as
          | { retryAfterSeconds?: number; error?: string }
          | null;
        const retryAfter =
          typeof body?.retryAfterSeconds === "number"
            ? body.retryAfterSeconds
            : Number(response.headers.get("Retry-After") ?? 30);

        setDemoCooldown(Math.max(1, retryAfter));
        setDemoMessage(`Demo trigger is rate-limited. Try again in ${Math.max(1, retryAfter)}s.`);
        return;
      }

      if (!response.ok) {
        throw new Error(`Demo request failed: ${response.status}`);
      }

      const body = await response.json().catch(() => null) as
        | { id?: string }
        | null;

      setDemoCooldown(30);
      setDemoMessage(
        body?.id
          ? `Demo incident created: ${body.id.slice(0, 8)}`
          : "Demo incident created.",
      );
    } catch (err) {
      console.error("Failed to trigger demo:", err);
      setDemoMessage(err instanceof Error ? err.message : "Failed to trigger demo.");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: "2rem",
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 4 }}>Incident Triage Dashboard</h1>

      <button
        onClick={handleTriggerDemo}
        disabled={triggering || demoCooldown > 0}
        style={{
          marginBottom: 8,
          padding: "8px 16px",
          fontFamily: "monospace",
          cursor: triggering || demoCooldown > 0 ? "not-allowed" : "pointer",
          opacity: triggering || demoCooldown > 0 ? 0.5 : 1,
        }}
      >
        {triggering
          ? "Triggering..."
          : demoCooldown > 0
            ? `▶ Trigger Demo (${demoCooldown}s)`
            : "▶ Trigger a Live Demo Incident"}
      </button>
      {demoMessage && (
        <div style={{ marginBottom: 24, fontSize: 12, color: "#666" }}>
          {demoMessage}
        </div>
      )}

      <p style={{ color: connected ? "green" : "red", marginBottom: 24 }}>
        {connected ? "● live" : "○ disconnected"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>
        <section>
          <h2>Incidents</h2>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th>Title</th>
                <th>Service</th>
                <th style={{ width: 80 }}>Severity</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 280 }}>Human review</th>
              </tr>
            </thead>

            <tbody>
              {incidents.map((inc) => (
                <tr
                  key={inc.id}
                  style={{
                    borderBottom: "1px solid #eee",
                    verticalAlign: "top",
                  }}
                >
                  <td style={{ padding: "8px 6px" }}>
                    <div>{inc.title}</div>
                    <button
                      onClick={() => openHistory(inc.id)}
                      style={{
                        marginTop: 6,
                        padding: "4px 8px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      View incident history
                    </button>
                  </td>

                  <td style={{ padding: "8px 6px" }}>{inc.service}</td>
                  <td style={{ padding: "8px 6px" }}>{inc.severity}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <StatusBadge status={inc.status} />
                  </td>

                  <td style={{ padding: "8px 6px" }}>
                    {inc.status === "PENDING_APPROVAL" ? (
                      <div
                        style={{
                          minWidth: 0,
                          border: "1px solid #e0a800",
                          padding: 10,
                          background: "#fffdf5",
                        }}
                      >
                        <div style={{ marginBottom: 8 }}>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#8a6d00",
                              fontWeight: "bold",
                            }}
                          >
                            HUMAN APPROVAL REQUIRED
                          </div>
                          <div style={{ marginTop: 4, fontSize: 13 }}>
                            <strong>
                              {inc.proposedAction?.action ?? "Unknown action"}
                            </strong>
                            {inc.proposedAction?.target
                              ? ` → ${inc.proposedAction.target}`
                              : ""}
                          </div>
                        </div>

                        <div style={{ fontSize: 11, marginBottom: 8 }}>
                          <strong>Why:</strong>{" "}
                          {inc.actionReasoning ??
                            "The agent classified this action as requiring human approval."}
                        </div>

                        {inc.proposedAction?.confidence != null && (
                          <div style={{ fontSize: 11, marginBottom: 8 }}>
                            <strong>Action confidence:</strong>{" "}
                            {(inc.proposedAction.confidence * 100).toFixed(0)}%
                          </div>
                        )}

                        {inc.diagnosis && (
                          <details style={{ marginBottom: 8 }}>
                            <summary
                              style={{
                                cursor: "pointer",
                                fontWeight: "bold",
                                fontSize: 11,
                              }}
                            >
                              View diagnosis evidence
                            </summary>
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                lineHeight: 1.4,
                              }}
                            >
                              <div>
                                <strong>Diagnosis:</strong>{" "}
                                {inc.diagnosis.diagnosis}
                              </div>
                              <div>
                                <strong>Suspected deployment:</strong>{" "}
                                {inc.diagnosis.suspectedDeploymentId ?? "None"}
                              </div>
                              <div>
                                <strong>Diagnosis confidence:</strong>{" "}
                                {(inc.diagnosis.confidence * 100).toFixed(0)}%
                              </div>
                              {inc.diagnosisReasoning && (
                                <div style={{ marginTop: 4 }}>
                                  <strong>Reasoning:</strong>{" "}
                                  {inc.diagnosisReasoning}
                                </div>
                              )}
                            </div>
                          </details>
                        )}

                        {inc.logAnalysis && (
                          <details style={{ marginBottom: 8 }}>
                            <summary
                              style={{
                                cursor: "pointer",
                                fontWeight: "bold",
                                fontSize: 11,
                              }}
                            >
                              View log analysis
                            </summary>
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                lineHeight: 1.4,
                              }}
                            >
                              <div>
                                <strong>Pattern:</strong>{" "}
                                {inc.logAnalysis.pattern}
                              </div>
                              <div>
                                <strong>Error count:</strong>{" "}
                                {inc.logAnalysis.errorCount ?? "unknown"}
                              </div>
                              <div>
                                <strong>Window:</strong>{" "}
                                {inc.logAnalysis.timeWindowMinutes ?? "unknown"} min
                              </div>
                              <div>
                                <strong>Location:</strong>{" "}
                                {inc.logAnalysis.affectedLocation ?? "unknown"}
                              </div>
                            </div>
                          </details>
                        )}

                        <details style={{ marginBottom: 10 }}>
                          <summary
                            style={{
                              cursor: "pointer",
                              fontWeight: "bold",
                              fontSize: 11,
                            }}
                          >
                            View raw incident log
                          </summary>
                          <pre
                            style={{
                              marginTop: 6,
                              padding: 8,
                              maxHeight: 160,
                              overflow: "auto",
                              whiteSpace: "pre-wrap",
                              background: "#f7f7f7",
                              fontSize: 10,
                            }}
                          >
                            {inc.rawLog}
                          </pre>
                        </details>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={() => handleDecision(inc, "approve")}
                            disabled={busyIncidentId === inc.id}
                            style={{
                              padding: "7px 12px",
                              fontFamily: "monospace",
                              cursor:
                                busyIncidentId === inc.id
                                  ? "not-allowed"
                                  : "pointer",
                              border: "1px solid #2f855a",
                              fontWeight: "bold",
                            }}
                          >
                            {busyIncidentId === inc.id
                              ? "Processing..."
                              : "✓ Approve action"}
                          </button>

                          <button
                            onClick={() => handleDecision(inc, "reject")}
                            disabled={busyIncidentId === inc.id}
                            style={{
                              padding: "7px 12px",
                              fontFamily: "monospace",
                              cursor:
                                busyIncidentId === inc.id
                                  ? "not-allowed"
                                  : "pointer",
                              border: "1px solid #c53030",
                              fontWeight: "bold",
                            }}
                          >
                            ✕ Reject action
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#888", fontSize: 11 }}>
                        No approval needed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Live Agent Feed</h2>

          <div
            style={{
              maxHeight: 600,
              overflowY: "auto",
              border: "1px solid #ccc",
              padding: 12,
            }}
          >
            {events.length === 0 && (
              <p style={{ color: "#888" }}>Waiting for agent activity...</p>
            )}

            {events.map((ev, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: "1px dashed #ddd",
                }}
              >
                <button
                  onClick={() => openHistory(ev.incidentId)}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    textAlign: "left",
                    fontFamily: "monospace",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: "bold" }}>
                    {ev.agentType}{" "}
                    <span style={{ fontWeight: "normal", color: "#888" }}>
                      · {ev.incidentId.slice(0, 8)}
                    </span>
                  </div>
                </button>

                {ev.reasoning && (
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                    {ev.reasoning}
                  </div>
                )}

                {ev.confidence != null && (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    confidence: {(ev.confidence * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {selectedIncidentId && (
        <div
          onClick={closeHistory}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              border: "1px solid #999",
              padding: 20,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
          >
            {historyLoading && <p>Loading incident history...</p>}

            {!historyLoading && selectedHistory && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>{selectedHistory.title}</h2>
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      {selectedHistory.service} · {selectedHistory.severity} ·{" "}
                      <StatusBadge status={selectedHistory.status} />
                    </div>
                    <Lifecycle status={selectedHistory.status} />
                  </div>

                  <button
                    onClick={closeHistory}
                    style={{
                      padding: "5px 10px",
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: 12,
                    border: "1px solid #ddd",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                    Incident lifecycle
                  </div>

                  <div style={{ fontSize: 12, color: "#555" }}>
                    Created: {formatDate(selectedHistory.createdAt)}
                    {selectedHistory.approvedAt
                      ? ` · Approved: ${formatDate(selectedHistory.approvedAt)}`
                      : ""}
                    {selectedHistory.executionStartedAt
                      ? ` · Execution started: ${formatDate(selectedHistory.executionStartedAt)}`
                      : ""}
                    {selectedHistory.executionCompletedAt
                      ? ` · Execution finished: ${formatDate(selectedHistory.executionCompletedAt)}`
                      : ""}
                    {selectedHistory.resolvedAt
                      ? ` · Finished: ${formatDate(selectedHistory.resolvedAt)}`
                      : ""}
                  </div>

                  {selectedHistory.approvedBy && (
                    <div style={{ fontSize: 11, marginBottom: 8 }}>
                      <strong>Approved by:</strong> {selectedHistory.approvedBy}
                    </div>
                  )}

                  {selectedHistory.rejectedBy && (
                    <div style={{ fontSize: 11, marginBottom: 8 }}>
                      <strong>Rejected by:</strong> {selectedHistory.rejectedBy}
                      {selectedHistory.rejectionReason
                        ? ` — ${selectedHistory.rejectionReason}`
                        : ""}
                    </div>
                  )}

                  {selectedHistory.failureReason && (
                    <div
                      style={{
                        fontSize: 11,
                        marginBottom: 8,
                        padding: 8,
                        background: "#fff5f5",
                        border: "1px solid #c53030",
                      }}
                    >
                      <strong>Failure:</strong> {selectedHistory.failureReason}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {selectedHistory.timeline.length === 0 && (
                      <div style={{ color: "#888", fontSize: 12 }}>
                        No agent history yet.
                      </div>
                    )}

                    {selectedHistory.timeline.map((event, index) => {
                      const output = readObject(event.output);
                      const input = readObject(event.input);
                      const decision =
                        event.agentType === "ORCHESTRATOR"
                          ? output?.decision
                          : null;

                      return (
                        <div
                          key={`${event.createdAt}-${index}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "20px 1fr",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background:
                                decision === "approved"
                                  ? "#2f855a"
                                  : decision === "rejected"
                                    ? "#c53030"
                                    : "#4a5568",
                              marginTop: 4,
                            }}
                          />

                          <div
                            style={{
                              borderLeft: "1px solid #ddd",
                              paddingLeft: 10,
                              paddingBottom: 8,
                            }}
                          >
                            <div style={{ fontWeight: "bold", fontSize: 13 }}>
                              {timelineLabel(event.agentType, event.output)}
                            </div>

                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 10,
                                color: "#888",
                              }}
                            >
                              {event.agentType} · {formatDate(event.createdAt)}
                            </div>

                            {event.reasoning && (
                              <div
                                style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  lineHeight: 1.45,
                                }}
                              >
                                <strong>Reasoning:</strong> {event.reasoning}
                              </div>
                            )}

                            {event.confidence != null && (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 11,
                                  color: "#666",
                                }}
                              >
                                Confidence:{" "}
                                {(event.confidence * 100).toFixed(0)}%
                              </div>
                            )}

                            {event.agentType === "ORCHESTRATOR" && (
                              <div
                                style={{
                                  marginTop: 6,
                                  padding: 8,
                                  background:
                                    decision === "approved"
                                      ? "#f0fff4"
                                      : "#fff5f5",
                                  border: "1px solid #ddd",
                                  fontSize: 11,
                                }}
                              >
                                <div>
                                  <strong>Decision:</strong>{" "}
                                  {String(decision ?? "recorded")}
                                </div>
                                {typeof input?.decidedBy === "string" && (
                                  <div>
                                    <strong>Decided by:</strong>{" "}
                                    {input.decidedBy}
                                  </div>
                                )}
                                {typeof input?.rejectionReason === "string" && (
                                  <div>
                                    <strong>Reason:</strong>{" "}
                                    {input.rejectionReason}
                                  </div>
                                )}
                                {output?.execution != null && (
                                  <div style={{ marginTop: 4 }}>
                                    <strong>Execution:</strong>
                                    <pre
                                      style={{
                                        marginTop: 4,
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {prettyJson(output.execution)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}

                            <details style={{ marginTop: 6 }}>
                              <summary
                                style={{
                                  cursor: "pointer",
                                  fontSize: 10,
                                  color: "#666",
                                }}
                              >
                                View event data
                              </summary>

                              <pre
                                style={{
                                  marginTop: 5,
                                  maxHeight: 180,
                                  overflow: "auto",
                                  whiteSpace: "pre-wrap",
                                  background: "#f7f7f7",
                                  padding: 8,
                                  fontSize: 9,
                                }}
                              >
                                {prettyJson(event.output)}
                              </pre>
                            </details>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <details style={{ marginTop: 14 }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontSize: 12,
                    }}
                  >
                    View raw incident log
                  </summary>

                  <pre
                    style={{
                      marginTop: 6,
                      padding: 10,
                      maxHeight: 220,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      background: "#f7f7f7",
                      fontSize: 10,
                    }}
                  >
                    {selectedHistory.rawLog}
                  </pre>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
