
import type {
  Incident,
  IncidentHistory,
} from "@/types/incident";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3002";

export async function fetchIncidents(): Promise<Incident[]> {
  const response = await fetch(`${API_BASE}/api/incidents`);

  if (!response.ok) {
    throw new Error(
      `Incident request failed: ${response.status}`,
    );
  }

  return response.json() as Promise<Incident[]>;
}

export async function fetchIncidentHistory(
  incidentId: string,
): Promise<IncidentHistory> {
  const response = await fetch(
    `${API_BASE}/api/incidents/${encodeURIComponent(incidentId)}/history`,
  );

  if (!response.ok) {
    throw new Error(
      `History request failed: ${response.status}`,
    );
  }

  return response.json() as Promise<IncidentHistory>;
}
