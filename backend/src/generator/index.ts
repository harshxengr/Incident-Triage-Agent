import { prisma } from "../db/client";
import { generateDeploymentPool, generateIncidents } from "./scenarios";
import type { GeneratedDeployment } from "../types";

const DEPLOYMENT_COUNT = 15;
const INCIDENT_COUNT = 20;

async function seedDeployments(): Promise<GeneratedDeployment[]> {
    const deployments = generateDeploymentPool(DEPLOYMENT_COUNT);

    // createMany doesn't return rows, and we need real ids for the incident
    // relation, so inserting one at a time here. fine for a seed script.
    const created = [];
    for (const d of deployments) {
        created.push(await prisma.deployment.create({ data: d }));
    }

    console.log(`Seeded ${created.length} deployments.`);
    return deployments;
}

async function seedIncidents(deployments: GeneratedDeployment[]) {
    const dbDeployments = await prisma.deployment.findMany({
        orderBy: { deployedAt: "asc" },
    });

    if (dbDeployments.length === 0) {
        throw new Error("No deployments in DB yet - run seed:deployments first (or seed:all).");
    }

    const incidents = generateIncidents(INCIDENT_COUNT, deployments);
    let created = 0;

    for (const inc of incidents) {
        const suspectedDeploymentId =
            inc.suspectedDeploymentIndex !== null
                ? dbDeployments[inc.suspectedDeploymentIndex]?.id ?? null
                : null;

        await prisma.incident.create({
            data: {
                title: inc.title,
                rawLog: inc.rawLog,
                service: inc.service,
                severity: inc.severity,
                status: inc.status,
                suspectedDeploymentId,
                createdAt: inc.createdAt,
                expectedDiagnosis: inc.expectedDiagnosis,
                expectedAction: inc.expectedAction,
                expectedRequiresHuman: inc.expectedRequiresHuman,
                scenarioType: inc.scenarioType,
            },
        });
        created++;
    }

    console.log(`Seeded ${created} incidents.`);

    const byType = await prisma.incident.groupBy({
        by: ["scenarioType"],
        _count: true,
    });
    console.log("Distribution by scenario type:", byType);
}

async function main() {
    const mode = process.argv[2] ?? "all";

    if (mode === "deployments" || mode === "all") {
        const deployments = await seedDeployments();
        if (mode === "all") await seedIncidents(deployments);
    } else if (mode === "incidents") {
        // only makes sense right after seeding deployments in the same run -
        // for a clean slate use seed:all instead
        const deployments = generateDeploymentPool(DEPLOYMENT_COUNT);
        await seedIncidents(deployments);
    } else {
        console.error(`Unknown mode "${mode}". Use: deployments | incidents | all`);
        process.exit(1);
    }
}

main()
    .catch((err) => {
        console.error("Seed failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });