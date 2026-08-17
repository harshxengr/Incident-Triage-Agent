import type { LLMClient } from "../llm/client";
import type { LogAnalysis } from "./types";
import { parseLLMJson } from "./parseLLMJson";
import { LOG_ANALYZER_SYSTEM, logAnalyzerPrompt } from "./prompts";

function isLogAnalysis(value: unknown): value is LogAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (typeof v.errorCount === "number" || v.errorCount === null) &&
    (typeof v.timeWindowMinutes === "number" || v.timeWindowMinutes === null) &&
    (typeof v.affectedLocation === "string" || v.affectedLocation === null) &&
    typeof v.pattern === "string"
  );
}

export async function analyzeLog(llm: LLMClient, rawLog: string): Promise<LogAnalysis> {
  const raw = await llm.complete(LOG_ANALYZER_SYSTEM, logAnalyzerPrompt(rawLog));
  return parseLLMJson(raw, isLogAnalysis);
}