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
  service: string;
  severity: string;
  status: string;
  scenarioType: string;
  createdAt: string;
  resolvedAt: string | null;
  proposedAction: ProposedAction | null;
  actionReasoning: string | null;
  actionConfidence: number | null;
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
    PENDING_APPROVAL: "#d9534f",
    RESOLVED: "#28a745",
    REJECTED: "#6c757d",
    FALSE_POSITIVE: "#6c757d",
    FAILED: "#b45309",
  };
  return <span style={{ color: colors[status] ?? "#000", fontWeight: "bold" }}>{status}</span>;
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [busyIncidentId, setBusyIncidentId] = useState<string | null>(null);

  async function fetchIncidents() {
    const response = await fetch(`${API_BASE}/api/incidents`);
    if (!response.ok) throw new Error(`Incident request failed: ${response.status}`);
    return response.json() as Promise<Incident[]>;
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
      if (typeof event.incidentId !== "string" || typeof event.agentType !== "string") return;
      setEvents((prev) => [event, ...prev].slice(0, 100));

      fetchIncidents()
        .then(setIncidents)
        .catch((err) => console.error("failed to refresh incidents:", err));
    };

    return () => ws.close();
  }, []);

  async function handleTriggerDemo() {
    setTriggering(true);
    try {
      const response = await fetch(`${API_BASE}/demo/trigger`, { method: "POST" });
      if (!response.ok) throw new Error(`Demo request failed: ${response.status}`);
    } catch (err) {
      console.error("Failed to trigger demo:", err);
    } finally {
      setTimeout(() => setTriggering(false), 3000);
    }
  }

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Incident Triage Dashboard</h1>

      <button
        onClick={handleTriggerDemo}
        disabled={triggering}
        style={{
          marginBottom: 24,
          padding: "8px 16px",
          fontFamily: "monospace",
          cursor: triggering ? "not-allowed" : "pointer",
          opacity: triggering ? 0.5 : 1,
        }}
      >
        {triggering ? "Triggering..." : "▶ Trigger a Live Demo Incident"}
      </button>

      <p style={{ color: connected ? "green" : "red", marginBottom: 24 }}>
        {connected ? "● live" : "○ disconnected"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>
        <section>
          <h2>Incidents</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th>Title</th>
                <th>Service</th>
                <th style={{ width: 80 }}>Severity</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 260 }}>Human review</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 6px" }}>{inc.title}</td>
                  <td style={{ padding: "8px 6px" }}>{inc.service}</td>
                  <td style={{ padding: "8px 6px" }}>{inc.severity}</td>
                  <td style={{ padding: "8px 6px" }}><StatusBadge status={inc.status} /></td>
                  <td style={{ padding: "8px 6px" }}>
                    {inc.status === "PENDING_APPROVAL" ? (
                      <div>
                        <div style={{ marginBottom: 8, fontSize: 12 }}>
                          <strong>{inc.proposedAction?.action ?? "human review required"}</strong>
                          {inc.proposedAction?.target ? ` → ${inc.proposedAction.target}` : ""}
                        </div>
                        {inc.actionReasoning && (
                          <div style={{ color: "#666", fontSize: 11, marginBottom: 8 }}>
                            {inc.actionReasoning}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleDecision(inc, "approve")}
                            disabled={busyIncidentId === inc.id}
                            style={{
                              padding: "6px 10px",
                              fontFamily: "monospace",
                              cursor: busyIncidentId === inc.id ? "not-allowed" : "pointer",
                              border: "1px solid #2f855a",
                            }}
                          >
                            {busyIncidentId === inc.id ? "Processing..." : "✓ Approve"}
                          </button>
                          <button
                            onClick={() => handleDecision(inc, "reject")}
                            disabled={busyIncidentId === inc.id}
                            style={{
                              padding: "6px 10px",
                              fontFamily: "monospace",
                              cursor: busyIncidentId === inc.id ? "not-allowed" : "pointer",
                              border: "1px solid #c53030",
                            }}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#888", fontSize: 11 }}>No approval needed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Live Agent Feed</h2>
          <div style={{ maxHeight: 600, overflowY: "auto", border: "1px solid #ccc", padding: 12 }}>
            {events.length === 0 && <p style={{ color: "#888" }}>Waiting for agent activity...</p>}
            {events.map((ev, i) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px dashed #ddd" }}>
                <div style={{ fontWeight: "bold" }}>
                  {ev.agentType} <span style={{ fontWeight: "normal", color: "#888" }}>· {ev.incidentId.slice(0, 8)}</span>
                </div>
                {ev.reasoning && <div style={{ fontSize: 12, color: "#555" }}>{ev.reasoning}</div>}
                {ev.confidence != null && (
                  <div style={{ fontSize: 11, color: "#888" }}>confidence: {(ev.confidence * 100).toFixed(0)}%</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
