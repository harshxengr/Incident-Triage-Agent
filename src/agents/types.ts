export interface LogAnalysis {
    errorCount: number | null;
    timeWindowMinutes: number | null;
    affectedLocation: string | null;
    pattern: string;
}

export interface Diagnosis {
    diagnosis: string;
    suspectedDeploymentId: string | null;
    confidence: number;
}

export type ActionName =
    | "restartService"
    | "rollbackDeployment"
    | "scaleReplicas"
    | "escalateToHuman"
    | "monitor";

export interface ProposedAction {
    action: ActionName;
    target: string | null;
    reasoning: string;
    confidence: number;
}

export interface CommunicatorOutput {
    summary: string;
    channel: string;
}