"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3002";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3002/ws";

interface Incident {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  scenarioType: string;
  createdAt: string;
  resolvedAt: string | null;
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

  async function fetchIncidents() {
    const response = await fetch(`${API_BASE}/api/incidents`);
    if (!response.ok) throw new Error(`Incident request failed: ${response.status}`);
    return response.json() as Promise<Incident[]>;
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
    setTimeout(() => setTriggering(false), 3000); // matches the rate limit window roughly
  }
}

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <section>
          <h2>Incidents</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th>Title</th>
                <th>Service</th>
                <th style={{ width: 80 }}>Severity</th>
                <th style={{ width: 140 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{inc.title}</td>
                  <td>{inc.service}</td>
                  <td>{inc.severity}</td>
                  <td><StatusBadge status={inc.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Live Agent Feed</h2>
          <div style={{ maxHeight: 500, overflowY: "auto", border: "1px solid #ccc", padding: 12 }}>
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