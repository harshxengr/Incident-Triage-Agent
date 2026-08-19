export type ServiceName =
    | "PAYMENTS_SERVICE"
    | "AUTH_SERVICE"
    | "ORDER_SERVICE"
    | "NOTIFICATION_SERVICE"
    | "DATABASE"
    | "REDIS_CACHE";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type IncidentStatus =
    | "OPEN"
    | "DIAGNOSING"
    | "PENDING_APPROVAL"
    | "RESOLVED"
    | "FALSE_POSITIVE";

export type ScenarioType =
    | "deploy_caused"
    | "resource_exhaustion"
    | "false_positive"
    | "cascading_failure";

export interface GeneratedDeployment {
    service: ServiceName;
    commitHash: string;
    commitMessage: string;
    deployedBy: string;
    deployedAt: Date;
}

export interface GeneratedIncident {
    title: string;
    rawLog: string;
    service: ServiceName;
    severity: IncidentSeverity;
    status: IncidentStatus;
    suspectedDeploymentIndex: number | null;
    createdAt: Date;
    expectedDiagnosis: string;
    expectedAction: string;
    expectedRequiresHuman: boolean;
    scenarioType: ScenarioType;
}