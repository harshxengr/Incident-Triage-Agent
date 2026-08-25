import type { ActionName } from "../agents/types";

export interface ExecutionResult {
  executed: boolean;
  detail: string;
}

export interface ActionExecutor {
  execute(action: ActionName, target: string | null): Promise<ExecutionResult>;
}

// Default - touches nothing real, just logs. This is what the whole
// project has run on so far. Keep using this until you deliberately wire
// a real executor below.
export class SimulatedActionExecutor implements ActionExecutor {
  async execute(action: ActionName, target: string | null): Promise<ExecutionResult> {
    const detail = `[simulated] would run ${action}(${target ?? ""})`;
    console.log(detail);
    return { executed: false, detail };
  }
}

// Reference implementation for Railway - a STARTING POINT, not drop-in.
// Two things you must fill in before this does anything real:
//
// 1. SERVICE_ID_MAP: map our synthetic ServiceName enum to your actual
//    Railway service IDs (from the dashboard, or `railway status --json`).
// 2. rollbackDeployment is NOT implemented - Railway does expose a rollback
//    mutation, but verify its exact name/arguments in your own account's
//    GraphiQL explorer (https://backboard.railway.com/graphql/v2) before
//    wiring in something that changes production infra.
export class RailwayActionExecutor implements ActionExecutor {
  private readonly endpoint = "https://backboard.railway.com/graphql/v2";

  private readonly SERVICE_ID_MAP: Partial<Record<string, string>> = {
    // DATABASE: "railway-service-id-here",
    // REDIS_CACHE: "railway-service-id-here",
  };

  constructor(private apiToken: string) { }

  async execute(action: ActionName, target: string | null): Promise<ExecutionResult> {
    if (action === "restartService") return this.restartService(target);
    return {
      executed: false,
      detail: `RailwayActionExecutor has no real implementation for "${action}" yet.`,
    };
  }

  private async restartService(serviceName: string | null): Promise<ExecutionResult> {
    if (!serviceName) return { executed: false, detail: "restartService called with no target" };

    const serviceId = this.SERVICE_ID_MAP[serviceName];
    if (!serviceId) {
      return { executed: false, detail: `No Railway service ID configured for "${serviceName}".` };
    }

    const deploymentId = await this.getCurrentDeploymentId(serviceId);
    if (!deploymentId) {
      return { executed: false, detail: `Could not find a current deployment for service ${serviceId}` };
    }

    const result = await this.graphql(
      `mutation RestartDeployment($id: String!) { deploymentRestart(id: $id) }`,
      { id: deploymentId }
    );

    return {
      executed: true,
      detail: `Restarted deployment ${deploymentId} for ${serviceName}. Railway response: ${JSON.stringify(result)}`,
    };
  }

  private async getCurrentDeploymentId(serviceId: string): Promise<string | null> {
    const result = await this.graphql(
      `query GetService($id: String!) {
        service(id: $id) { deployments(first: 1) { edges { node { id } } } }
      }`,
      { id: serviceId }
    );
    const anyResult = result as any;
    return anyResult?.service?.deployments?.edges?.[0]?.node?.id ?? null;
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiToken}` },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Railway API error ${res.status}: ${await res.text()}`);
    const body = await res.json() as any;
    if (body.errors) throw new Error(`Railway API returned errors: ${JSON.stringify(body.errors)}`);
    return body.data;
  }
}