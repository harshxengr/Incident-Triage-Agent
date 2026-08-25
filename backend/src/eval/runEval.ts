import { prisma } from "../db/client";
import { evaluateCase, extractActionName, summarize, type EvalCase } from "./compare";

async function main() {
    const incidents = await prisma.incident.findMany({
        include: {
            actions: {
                where: { agentType: "ACTION" },
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    const cases: EvalCase[] = incidents.map((inc) => {
        const actionRow = inc.actions[0];
        const output = actionRow?.output as { action?: string; requiresHuman?: boolean } | undefined;
        return {
            incidentId: inc.id,
            scenarioType: inc.scenarioType,
            expectedAction: inc.expectedAction,
            expectedRequiresHuman: inc.expectedRequiresHuman,
            actualAction: output?.action ?? null,
            actualRequiresHuman: output?.requiresHuman ?? null,
            actualConfidence: actionRow?.confidence ?? null,
        };
    });

    const results = cases.map(evaluateCase);
    const summary = summarize(results);

    console.log("\n=== Evaluation Summary ===");
    console.log(`Total incidents: ${summary.total}`);
    console.log(`Processed (have agent output): ${summary.processed}`);
    console.log(`Action-name accuracy: ${(summary.actionAccuracy * 100).toFixed(1)}%`);
    console.log(`Human-approval-flag accuracy: ${(summary.requiresHumanAccuracy * 100).toFixed(1)}%`);
    console.log(`Fully correct rate: ${(summary.fullyCorrectRate * 100).toFixed(1)}%`);

    console.log("\n=== By Scenario Type ===");
    for (const [scenario, stats] of Object.entries(summary.byScenario)) {
        console.log(
            `${scenario.padEnd(22)} ${stats.fullyCorrect}/${stats.processed} processed  (${(stats.accuracy * 100).toFixed(1)}%)  [${stats.total} total in dataset]`
        );
    }

    console.log("\n=== Mismatches ===");
    const mismatches = results.filter((r) => r.actualAction !== null && !r.fullyCorrect);
    if (mismatches.length === 0) console.log("(none)");
    for (const r of mismatches) {
        console.log(
            `- ${r.incidentId} [${r.scenarioType}]: expected "${extractActionName(r.expectedAction)}" (human=${r.expectedRequiresHuman}), got "${r.actualAction}" (human=${r.actualRequiresHuman})`
        );
    }

    // markdown report for the README
    const lines: string[] = [];
    lines.push("## Evaluation Results\n");
    lines.push(`Ran against ${summary.processed}/${summary.total} seeded incidents.\n`);
    lines.push("| Scenario | Processed | Correct | Accuracy |");
    lines.push("|---|---|---|---|");
    for (const [scenario, stats] of Object.entries(summary.byScenario)) {
        lines.push(`| ${scenario} | ${stats.processed} | ${stats.fullyCorrect} | ${(stats.accuracy * 100).toFixed(1)}% |`);
    }
    lines.push(`\n**Overall: ${(summary.fullyCorrectRate * 100).toFixed(1)}% fully correct** (action + human-approval flag both right).`);

    await Bun.write("EVAL_RESULTS.md", lines.join("\n"));
    console.log("\nWrote EVAL_RESULTS.md");

    await prisma.$disconnect();
}

main();