
import { Badge } from "@/components/ui/badge";

interface IncidentStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  DIAGNOSING: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  DIAGNOSED: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  ACTION_PROPOSED: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  PENDING_APPROVAL: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  APPROVED: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  EXECUTING: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  NO_ACTION_REQUIRED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ESCALATED: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  SIMULATED: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  RESOLVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  REJECTED: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  FALSE_POSITIVE: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function IncidentStatusBadge({
  status,
}: IncidentStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={
        STATUS_STYLES[status] ??
        "border-slate-500/30 bg-slate-500/10 text-slate-600"
      }
    >
      {formatStatus(status)}
    </Badge>
  );
}
