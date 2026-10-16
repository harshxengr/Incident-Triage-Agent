import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { IncidentTable } from "@/components/dashboard/incident-table";
import type { Incident } from "@/types/incident";

afterEach(() => {
  cleanup();
});

const sampleIncident = {
  id: "incident-test-123",
  title: "API service is returning errors",
  rawLog: "ERROR: request failed",
  service: "api-service",
  severity: "HIGH",
  status: "PENDING_APPROVAL",
  scenarioType: "resource_exhaustion",
  createdAt: "2026-10-15T10:00:00.000Z",
  resolvedAt: null,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
  executionStartedAt: null,
  executionCompletedAt: null,
  failureReason: null,
  logAnalysis: {
    errorCount: 25,
    timeWindowMinutes: 5,
    affectedLocation: "api-service",
    pattern: "Repeated request failures",
  },
  diagnosis: {
    diagnosis: "Possible service resource exhaustion",
    suspectedDeploymentId: null,
    confidence: 0.9,
  },
  diagnosisReasoning: "The error rate increased significantly.",
  diagnosisConfidence: 0.9,
  proposedAction: {
    action: "restartService",
    target: "api-service",
    reasoning: "A restart may restore service health.",
    confidence: 0.9,
    requiresHuman: true,
  },
  actionReasoning: "Human approval is required.",
  actionConfidence: 0.9,
} as Incident;

function renderIncidentTable(incident: Incident = sampleIncident) {
  return render(
    <IncidentTable
      incidents={[incident]}
      busyIncidentId={null}
      onOpenHistory={vi.fn()}
      onDecision={vi.fn()}
      onResolveEscalation={vi.fn()}
    />,
  );
}

describe("IncidentTable human review", () => {
  it("shows approval controls for incidents awaiting approval", () => {
    renderIncidentTable();

    expect(
      screen.getByRole("button", { name: /^approve$/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /^reject$/i }),
    ).toBeInTheDocument();
  });

  it("calls the approval handler with the correct incident", () => {
    const onDecision = vi.fn();

    render(
      <IncidentTable
        incidents={[sampleIncident]}
        busyIncidentId={null}
        onOpenHistory={vi.fn()}
        onDecision={onDecision}
        onResolveEscalation={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^approve$/i }),
    );

    expect(onDecision).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith(
      sampleIncident,
      "approve",
    );
  });

  it("calls the rejection handler with the correct incident", () => {
    const onDecision = vi.fn();

    render(
      <IncidentTable
        incidents={[sampleIncident]}
        busyIncidentId={null}
        onOpenHistory={vi.fn()}
        onDecision={onDecision}
        onResolveEscalation={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^reject$/i }),
    );

    expect(onDecision).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith(
      sampleIncident,
      "reject",
    );
  });

  it("shows escalation resolution controls for escalated incidents", () => {
    const escalatedIncident = {
      ...sampleIncident,
      status: "ESCALATED",
    } as Incident;

    renderIncidentTable(escalatedIncident);

    expect(
      screen.getByRole("button", {
        name: /mark investigation resolved/i,
      }),
    ).toBeInTheDocument();
  });

  it("calls the resolution handler for an escalated incident", () => {
    const escalatedIncident = {
      ...sampleIncident,
      status: "ESCALATED",
    } as Incident;

    const onResolveEscalation = vi.fn();

    render(
      <IncidentTable
        incidents={[escalatedIncident]}
        busyIncidentId={null}
        onOpenHistory={vi.fn()}
        onDecision={vi.fn()}
        onResolveEscalation={onResolveEscalation}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /mark investigation resolved/i,
      }),
    );

    expect(onResolveEscalation).toHaveBeenCalledOnce();
    expect(onResolveEscalation).toHaveBeenCalledWith(
      escalatedIncident,
    );
  });
});