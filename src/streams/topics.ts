export const STREAMS = {
  NEW: "incidents:new",
  LOG_ANALYZED: "incidents:log-analyzed",
  DIAGNOSED: "incidents:diagnosed",
  ACTION_DECIDED: "incidents:action-decided",
} as const;

export const GROUPS = {
  LOG_ANALYZER: "log-analyzer-group",
  DIAGNOSIS: "diagnosis-group",
  ACTION: "action-group",
  COMMUNICATOR: "communicator-group",
} as const;