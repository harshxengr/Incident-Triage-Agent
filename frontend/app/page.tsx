"use client";

import type {
  AgentEvent,
  Incident,
  IncidentHistory
} from "@/types/incident";

import {
  API_BASE
} from "@/features/incidents/api";

import { useCallback, useEffect, useState } from "react";

import { useAgentFeed } from "@/features/agent-feed/use-agent-feed";
import { IncidentTable } from "@/components/dashboard/incident-table";
import { IncidentDetailDialog } from "@/components/dashboard/incident-detail-dialog";
import { AgentEventFeed } from "@/components/dashboard/agent-event-feed";

const OPERATOR_KEY_STORAGE = "incident-triage-dashboard-operator-key";

export default function Dashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [demoCooldown, setDemoCooldown] = useState(0);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);
  const [busyIncidentId, setBusyIncidentId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<IncidentHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);


  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      fetchIncidents()
        .then(setIncidents)
        .catch((error) => {
          console.error("Failed to refresh incidents:", error);
        });

      if (selectedIncidentId === event.incidentId) {
        fetchHistory(event.incidentId)
          .then(setSelectedHistory)
          .catch((error) => {
            console.error("Failed to refresh incident history:", error);
          });
      }
    },
    [selectedIncidentId],
  );

  const { events, connected } = useAgentFeed({
    onEvent: handleAgentEvent,
  });


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


  async function handleResolveEscalation(incident: Incident) {
    const reason = window.prompt(
      `Explain how you investigated "${incident.title}" and verified that the issue is no longer active:`,
    );

    if (reason === null) return;

    if (!reason.trim()) {
      window.alert("Please enter a resolution reason.");
      return;
    }

    const operatorKey = getOperatorKey();
    if (!operatorKey) return;

    setBusyIncidentId(incident.id);

    try {
      const response = await fetch(
        `${API_BASE}/api/incidents/${encodeURIComponent(incident.id)}/resolve-escalation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": operatorKey,
          },
          body: JSON.stringify({
            decidedBy: "dashboard-operator",
            reason: reason.trim(),
          }),
        },
      );

      const body = await response.json().catch(() => null);

      if (response.status === 401) {
        window.sessionStorage.removeItem(OPERATOR_KEY_STORAGE);
        throw new Error("Invalid dashboard operator key.");
      }

      if (!response.ok || !body?.ok) {
        throw new Error(
          body?.error ?? "Could not resolve the escalation.",
        );
      }

      await fetchIncidents().then(setIncidents);

      if (selectedIncidentId === incident.id) {
        const history = await fetchHistory(incident.id);
        setSelectedHistory(history);
      }
    } catch (error) {
      console.error("Escalation resolution failed:", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Escalation resolution failed.",
      );
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
        <IncidentTable
          incidents={incidents}
          busyIncidentId={busyIncidentId}
          onOpenHistory={openHistory}
          onDecision={handleDecision}
          onResolveEscalation={handleResolveEscalation}
        />

        <AgentEventFeed
          events={events}
          onOpenHistory={openHistory}
        />
      </div>

      <IncidentDetailDialog
        open={selectedIncidentId !== null}
        loading={historyLoading}
        history={selectedHistory}
        onClose={closeHistory}
      />
    </main>
  );
}
