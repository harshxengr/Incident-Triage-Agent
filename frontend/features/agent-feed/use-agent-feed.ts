
"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/features/incidents/api";
import type { AgentEvent } from "@/types/incident";

function getWebSocketUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  const socketBase = API_BASE
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:")
    .replace(/\/$/, "");

  return `${socketBase}/ws`;
}

function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;

  return (
    typeof event.incidentId === "string" &&
    typeof event.agentType === "string"
  );
}

interface UseAgentFeedOptions {
  onEvent?: (event: AgentEvent) => void;
}

export function useAgentFeed({ onEvent }: UseAgentFeedOptions = {}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let keepaliveTimer: number | null = null;
    let reconnectDelay = 1000;
    let disposed = false;

    function clearTimers() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (keepaliveTimer !== null) {
        window.clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
    }

    function connect() {
      if (disposed) {
        return;
      }

      socket = new WebSocket(getWebSocketUrl());

      socket.onopen = () => {
        if (disposed) {
          socket?.close();
          return;
        }

        setConnected(true);
        reconnectDelay = 1000;
        clearTimers();

        keepaliveTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
      };

      socket.onmessage = (message) => {
        if (typeof message.data !== "string") {
          return;
        }

        if (message.data === "pong") {
          return;
        }

        let event: unknown;

        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }

        if (!isAgentEvent(event)) {
          return;
        }

        setEvents((previous) => [event, ...previous].slice(0, 100));
        onEventRef.current?.(event);
      };

      socket.onerror = (event) => {
        console.error("[dashboard] WebSocket error:", event);
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }

        setConnected(false);
        clearTimers();

        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, reconnectDelay);

        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimers();
      socket?.close();
    };
  }, []);

  return { events, connected };
}
