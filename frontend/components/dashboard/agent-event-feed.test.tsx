import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentEventFeed } from "@/components/dashboard/agent-event-feed";
import type { AgentEvent } from "@/types/incident";

afterEach(() => {
  cleanup();
});

const sampleEvent: AgentEvent = {
  incidentId: "incident-12345678",
  agentType: "DIAGNOSIS",
  output: {
    diagnosis: "Database connection pool exhausted",
  },
  reasoning: "Repeated database connection failures were detected.",
  confidence: 0.92,
  createdAt: "2026-10-15T10:00:00.000Z",
};

describe("AgentEventFeed", () => {
  it("shows an empty state when there are no events", () => {
    render(
      <AgentEventFeed events={[]} onOpenHistory={vi.fn()} />,
    );

    expect(
      screen.getByText(/waiting for agent activity/i),
    ).toBeInTheDocument();
  });

  it("displays event details", () => {
    render(
      <AgentEventFeed
        events={[sampleEvent]}
        onOpenHistory={vi.fn()}
      />,
    );

    expect(screen.getByText("DIAGNOSIS")).toBeInTheDocument();

    expect(
      screen.getByText(/repeated database connection failures/i),
    ).toBeInTheDocument();

    expect(screen.getByText("Confidence: 92%")).toBeInTheDocument();
  });

  it("opens incident history when an event is clicked", () => {
    const onOpenHistory = vi.fn();

    render(
      <AgentEventFeed
        events={[sampleEvent]}
        onOpenHistory={onOpenHistory}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /DIAGNOSIS/i }),
    );

    expect(onOpenHistory).toHaveBeenCalledOnce();
    expect(onOpenHistory).toHaveBeenCalledWith(
      "incident-12345678",
    );
  });
});