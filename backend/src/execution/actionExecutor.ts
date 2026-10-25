import type { ActionName } from "../agents/types";

export interface ExecutionResult {
  executed: boolean;
  simulated?: boolean;
  detail: string;
}

export interface ActionExecutor {
  execute(action: ActionName, target: string | null): Promise<ExecutionResult>;
}

// Default - touches nothing real, but reports a successful simulation so the
// incident lifecycle can reach RESOLVED without pretending production changed.
// The execution result explicitly says it was simulated.
export class SimulatedActionExecutor implements ActionExecutor {
  async execute(action: ActionName, target: string | null): Promise<ExecutionResult> {
    const detail = `[simulated] would run ${action}(${target ?? ""})`;
    console.log(detail);
    return { executed: true, simulated: true, detail };
  }
}