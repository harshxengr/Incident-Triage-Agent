
import { Badge } from "@/components/ui/badge";

interface IncidentLifecycleProps {
  status: string;
}

const MAIN_STEPS = [
  "OPEN",
  "DIAGNOSING",
  "DIAGNOSED",
  "ACTION_PROPOSED",
] as const;

const OUTCOME_STEPS: Record<string, string[]> = {
  PENDING_APPROVAL: ["PENDING_APPROVAL"],
  APPROVED: ["PENDING_APPROVAL", "APPROVED"],
  EXECUTING: ["EXECUTING"],
  NO_ACTION_REQUIRED: ["NO_ACTION_REQUIRED"],
  ESCALATED: ["ESCALATED"],
  SIMULATED: ["EXECUTING", "SIMULATED"],
  RESOLVED: ["RESOLVED"],
  REJECTED: ["PENDING_APPROVAL", "REJECTED"],
  FALSE_POSITIVE: ["FALSE_POSITIVE"],
  FAILED: ["FAILED"],
};

function formatStep(step: string): string {
  return step
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getSteps(status: string): string[] {
  const currentMainStep = MAIN_STEPS.indexOf(
    status as (typeof MAIN_STEPS)[number],
  );

  if (currentMainStep >= 0) {
    return MAIN_STEPS.slice(0, currentMainStep + 1);
  }

  const outcomes = OUTCOME_STEPS[status];

  if (!outcomes) {
    return [status];
  }

  return [...MAIN_STEPS, ...outcomes];
}

export function IncidentLifecycle({
  status,
}: IncidentLifecycleProps) {
  const steps = getSteps(status);

  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const isCurrent = index === steps.length - 1;

        return (
          <Badge
            key={`${step}-${index}`}
            variant={isCurrent ? "default" : "outline"}
            className="text-xs"
          >
            {isCurrent ? "→ " : ""}
            {formatStep(step)}
          </Badge>
        );
      })}
    </div>
  );
}
