"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AgentEvent } from "@/types/incident";

interface AgentEventFeedProps {
  events: AgentEvent[];
  onOpenHistory: (incidentId: string) => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleTimeString();
}

export function AgentEventFeed({
  events,
  onOpenHistory,
}: AgentEventFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Agent Feed</CardTitle>
        <CardDescription>
          Recent activity from the incident triage pipeline.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="max-h-[600px] space-y-4 overflow-y-auto">
          {events.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Waiting for agent activity…
            </p>
          )}

          {events.map((event, index) => (
            <article
              key={`${event.incidentId}-${event.agentType}-${event.createdAt}-${index}`}
              className="border-b pb-4 last:border-b-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 font-semibold"
                  onClick={() => onOpenHistory(event.incidentId)}
                >
                  {event.agentType}
                  <span className="ml-2 font-normal text-muted-foreground">
                    · {event.incidentId.slice(0, 8)}
                  </span>
                </Button>

                <span className="text-xs text-muted-foreground">
                  {formatDate(event.createdAt)}
                </span>
              </div>

              {event.reasoning && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {event.reasoning}
                </p>
              )}

              {event.confidence != null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Confidence: {(event.confidence * 100).toFixed(0)}%
                </p>
              )}
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}