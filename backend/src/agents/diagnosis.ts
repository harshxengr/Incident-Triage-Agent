import type { LLMClient } from "../llm/client";
import type { Diagnosis, LogAnalysis } from "./types";
import { parseLLMJson } from "./parseLLMJson";
import { DIAGNOSIS_SYSTEM, diagnosisPrompt } from "./prompts";

export interface CandidateDeployment {
  id: string;
  commitHash: string;
  commitMessage: string;
  minutesBeforeIncident: number;
}

function isDiagnosis(value: unknown): value is Diagnosis {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.diagnosis === "string" &&
    (typeof v.suspectedDeploymentId === "string" || v.suspectedDeploymentId === null) &&
    typeof v.confidence === "number"
  );
}

export async function diagnose(
  llm: LLMClient,
  logAnalysis: LogAnalysis,
  candidateDeployments: CandidateDeployment[]
): Promise<Diagnosis> {
  const raw = await llm.complete(DIAGNOSIS_SYSTEM, diagnosisPrompt(logAnalysis, candidateDeployments));
  return parseLLMJson(raw, isDiagnosis);
}