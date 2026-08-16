import type { GeneratedDeployment, GeneratedIncident, ServiceName } from "../types";

const SERVICES: ServiceName[] = [
    "PAYMENTS_SERVICE",
    "AUTH_SERVICE",
    "ORDER_SERVICE",
    "NOTIFICATION_SERVICE",
    "DATABASE",
    "REDIS_CACHE",
];

const ENGINEERS = ["priya.s", "arjun.k", "meera.r", "rohit.v", "ci-bot"];

const COMMIT_VERBS = [
    "Add rate limiting to",
    "Refactor connection pooling in",
    "Bump dependency versions for",
    "Fix pagination bug in",
    "Add caching layer to",
    "Update retry logic in",
];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomHash(): string {
    return Math.random().toString(16).slice(2, 9);
}

function minutesAgo(mins: number): Date {
    return new Date(Date.now() - mins * 60_000);
}

function hoursAgo(hrs: number): Date {
    return minutesAgo(hrs * 60);
}

// spread deployments over the last ~5 days so incidents have something real
// to correlate against later
export function generateDeploymentPool(count: number): GeneratedDeployment[] {
    const deployments: GeneratedDeployment[] = [];

    for (let i = 0; i < count; i++) {
        const service = pick(SERVICES);
        deployments.push({
            service,
            commitHash: randomHash(),
            commitMessage: `${pick(COMMIT_VERBS)} ${service.toLowerCase().replace("_", "-")}`,
            deployedBy: pick(ENGINEERS),
            deployedAt: hoursAgo(Math.floor(Math.random() * 120)),
        });
    }

    return deployments.sort((a, b) => a.deployedAt.getTime() - b.deployedAt.getTime());
}

// error spike right after a bad deploy - should get correlated + rolled back
function buildDeployCausedIncident(deployments: GeneratedDeployment[]): GeneratedIncident {
    const deployIndex = Math.floor(Math.random() * deployments.length);
    const deploy = deployments[deployIndex]!;
    const delayMin = 2 + Math.random() * 8;
    const incidentTime = new Date(deploy.deployedAt.getTime() + delayMin * 60_000);
    const errorCount = 40 + Math.floor(Math.random() * 400);

    return {
        title: `Error rate spike on ${deploy.service}`,
        rawLog:
            `[${incidentTime.toISOString()}] ERROR ${deploy.service}: ${errorCount} 5xx responses ` +
            `in the last 5 minutes (baseline: ~8/5min). First error ${Math.round(delayMin)} min after ` +
            `deploy ${deploy.commitHash} ("${deploy.commitMessage}"). Stack trace: TypeError: ` +
            `Cannot read property 'id' of undefined at handler.ts:${40 + Math.floor(Math.random() * 200)}`,
        service: deploy.service,
        severity: errorCount > 200 ? "CRITICAL" : "HIGH",
        status: "OPEN",
        suspectedDeploymentIndex: deployIndex,
        createdAt: incidentTime,
        expectedDiagnosis: `Error spike began ${Math.round(delayMin)} minutes after deploy ${deploy.commitHash} to ${deploy.service}. Strong temporal correlation.`,
        expectedAction: `rollbackDeployment(${deploy.commitHash})`,
        expectedRequiresHuman: true,
        scenarioType: "deploy_caused",
    };
}

// slow resource leak, no deploy involved - lower risk fix, no human needed
function buildResourceExhaustionIncident(): GeneratedIncident {
    const service = pick<ServiceName>(["DATABASE", "REDIS_CACHE"]);
    const incidentTime = minutesAgo(Math.floor(Math.random() * 30));
    const isDb = service === "DATABASE";
    const metric = isDb ? "connection pool" : "memory";
    const pct = 90 + Math.floor(Math.random() * 9);

    return {
        title: `${service} ${metric} exhaustion`,
        rawLog:
            `[${incidentTime.toISOString()}] WARN ${service}: ${metric} utilisation at ${pct}%. ` +
            `Trend: gradual increase over last 6 hours, no single spike. ` +
            `${isDb ? "Active connections: 198/200." : "Used memory: 3.8GB/4GB, no recent config change."} ` +
            `No correlated deployment found in the last 24h for this service.`,
        service,
        severity: pct > 95 ? "HIGH" : "MEDIUM",
        status: "OPEN",
        suspectedDeploymentIndex: null,
        createdAt: incidentTime,
        expectedDiagnosis: `Gradual ${metric} growth over 6+ hours with no corresponding deploy - looks like organic traffic growth or a slow leak, not a bad release.`,
        expectedAction: isDb ? "scaleReplicas(DATABASE, +1)" : "restartService(REDIS_CACHE)",
        expectedRequiresHuman: false,
        scenarioType: "resource_exhaustion",
    };
}

// noise that should NOT trigger any action - the trap most systems fall into
// is finding a cause anyway instead of recognizing there isn't one
function buildFalsePositiveIncident(): GeneratedIncident {
    const service = pick(SERVICES);
    const incidentTime = minutesAgo(Math.floor(Math.random() * 15));

    return {
        title: `Transient latency blip on ${service}`,
        rawLog:
            `[${incidentTime.toISOString()}] WARN ${service}: p99 latency briefly hit ` +
            `${800 + Math.floor(Math.random() * 400)}ms for a single 30-second window, then returned ` +
            `to baseline (~120ms). No error rate increase. No deploy in last 24h. Single occurrence.`,
        service,
        severity: "LOW",
        status: "OPEN",
        suspectedDeploymentIndex: null,
        createdAt: incidentTime,
        expectedDiagnosis: `Single transient latency blip, self-resolved within 30s, no error rate impact - consistent with noise (GC pause, slow DNS lookup), not a real incident.`,
        expectedAction: "monitor(noAction=true)",
        expectedRequiresHuman: false,
        scenarioType: "false_positive",
    };
}

// two services failing together, two overlapping deploys - genuinely
// ambiguous, agent should punt to a human no matter what it concludes
function buildCascadingFailureIncident(deployments: GeneratedDeployment[]): GeneratedIncident {
    const incidentTime = minutesAgo(Math.floor(Math.random() * 10));
    const primary = pick<ServiceName>(["DATABASE", "AUTH_SERVICE"]);
    const secondary = primary === "DATABASE" ? "ORDER_SERVICE" : "PAYMENTS_SERVICE";
    const idxA = Math.floor(Math.random() * deployments.length);
    const idxB = Math.min(idxA + 1, deployments.length - 1);

    return {
        title: `Cascading failure: ${primary} -> ${secondary}`,
        rawLog:
            `[${incidentTime.toISOString()}] CRITICAL ${primary}: timeout rate 34%. ` +
            `[${incidentTime.toISOString()}] CRITICAL ${secondary}: downstream errors calling ${primary}, ` +
            `error rate 61%. Two deployments in the preceding 40 minutes: ` +
            `${deployments[idxA]?.commitHash ?? "n/a"} (${deployments[idxA]?.service}) and ` +
            `${deployments[idxB]?.commitHash ?? "n/a"} (${deployments[idxB]?.service}). Unclear which, if either, is the trigger.`,
        service: primary,
        severity: "CRITICAL",
        status: "OPEN",
        suspectedDeploymentIndex: null,
        createdAt: incidentTime,
        expectedDiagnosis: `Two services failing together with two overlapping candidate deploys - root cause is ambiguous from logs alone.`,
        expectedAction: "escalateToHuman()",
        expectedRequiresHuman: true,
        scenarioType: "cascading_failure",
    };
}

const SCENARIO_WEIGHTS: Array<{
    build: (deployments: GeneratedDeployment[]) => GeneratedIncident;
    weight: number;
}> = [
        { build: buildDeployCausedIncident, weight: 3 },
        { build: (_d) => buildResourceExhaustionIncident(), weight: 3 },
        { build: (_d) => buildFalsePositiveIncident(), weight: 2 },
        { build: buildCascadingFailureIncident, weight: 1 },
    ];

function pickWeighted(deployments: GeneratedDeployment[]): GeneratedIncident {
    const total = SCENARIO_WEIGHTS.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;

    for (const s of SCENARIO_WEIGHTS) {
        if (r < s.weight) return s.build(deployments);
        r -= s.weight;
    }

    return buildFalsePositiveIncident(); // shouldn't happen, keeps TS happy
}

export function generateIncidents(count: number, deployments: GeneratedDeployment[]): GeneratedIncident[] {
    if (deployments.length === 0) {
        throw new Error("need at least one deployment to correlate against - call generateDeploymentPool first");
    }

    const incidents: GeneratedIncident[] = [];
    for (let i = 0; i < count; i++) {
        incidents.push(pickWeighted(deployments));
    }

    return incidents.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}