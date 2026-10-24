export interface ProposedAction {
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

export interface Incident {
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

export interface TimelineEvent {
  agentType: string;
  input: unknown;
  output: unknown;
  reasoning: string | null;
  confidence: number | null;
  createdAt: string;
}

export interface IncidentHistory {
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

export interface AgentEvent {
  incidentId: string;
  agentType: string;
  output: unknown;
  reasoning: string | null;
  confidence: number | null;
  createdAt: string;
}
