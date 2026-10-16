
export const PUBLIC_DEMO_SCENARIOS = [
    "deploy_caused",
    "resource_exhaustion",
    "false_positive",
    "cascading_failure",
] as const;

const PUBLIC_DEMO_SCENARIO_SET: ReadonlySet<string> = new Set(
    PUBLIC_DEMO_SCENARIOS,
);

export function isPublicDemoScenario(value: unknown): boolean {
    return (
        typeof value === "string" &&
        PUBLIC_DEMO_SCENARIO_SET.has(value)
    );
}
