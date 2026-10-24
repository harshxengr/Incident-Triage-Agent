
export interface EvalCase {
  incidentId: string;
  scenarioType: string;
  expectedAction: string;
  expectedTarget: string | null;
  expectedRequiresHuman: boolean;
  actualAction: string | null;
  actualTarget: string | null;
  actualRequiresHuman: boolean | null;
  actualConfidence: number | null;
}

export interface EvalResult extends EvalCase {
  actionMatch: boolean;
  targetMatch: boolean;
  requiresHumanMatch: boolean;
  fullyCorrect: boolean;
}

export function extractActionName(expectedAction: string): string {
  const idx = expectedAction.indexOf("(");
  return idx === -1
    ? expectedAction.trim()
    : expectedAction.slice(0, idx).trim();
}

export function expectedTargetForAction(
  expectedAction: string,
  expectedDeploymentId: string | null,
): string | null {
  const action = extractActionName(expectedAction);

  // Rollback target must be the actual deployment record ID,
  // not the commit hash embedded in expectedAction.
  if (action === "rollbackDeployment") {
    return expectedDeploymentId;
  }

  // These actions intentionally have no resource target.
  if (action === "monitor" || action === "escalateToHuman") {
    return null;
  }

  const open = expectedAction.indexOf("(");
  const close = expectedAction.lastIndexOf(")");

  if (open === -1 || close <= open) {
    return null;
  }

  const argumentsText = expectedAction.slice(open + 1, close).trim();

  if (!argumentsText) {
    return null;
  }

  // For scaleReplicas(DATABASE, +1), the target is DATABASE.
  return argumentsText.split(",")[0]?.trim() || null;
}

export function evaluateCase(c: EvalCase): EvalResult {
  const expectedName = extractActionName(c.expectedAction);

  const actionMatch =
    c.actualAction !== null &&
    c.actualAction === expectedName;

  const targetMatch =
    c.actualAction !== null &&
    c.actualTarget === c.expectedTarget;

  const requiresHumanMatch =
    c.actualAction !== null &&
    c.actualRequiresHuman !== null &&
    c.actualRequiresHuman === c.expectedRequiresHuman;

  return {
    ...c,
    actionMatch,
    targetMatch,
    requiresHumanMatch,
    fullyCorrect:
      actionMatch && targetMatch && requiresHumanMatch,
  };
}

export interface EvalSummary {
  total: number;
  processed: number;
  actionAccuracy: number;
  targetAccuracy: number;
  requiresHumanAccuracy: number;
  fullyCorrectRate: number;
  byScenario: Record<
    string,
    {
      total: number;
      processed: number;
      fullyCorrect: number;
      accuracy: number;
      targetCorrect: number;
      targetAccuracy: number;
    }
  >;
}

export function summarize(results: EvalResult[]): EvalSummary {
  const processedResults = results.filter(
    (result) => result.actualAction !== null,
  );

  const byScenario: EvalSummary["byScenario"] = {};

  for (const result of results) {
    const bucket = (byScenario[result.scenarioType] ??= {
      total: 0,
      processed: 0,
      fullyCorrect: 0,
      accuracy: 0,
      targetCorrect: 0,
      targetAccuracy: 0,
    });

    bucket.total++;

    if (result.actualAction !== null) {
      bucket.processed++;

      if (result.fullyCorrect) {
        bucket.fullyCorrect++;
      }

      if (result.targetMatch) {
        bucket.targetCorrect++;
      }
    }
  }

  for (const bucket of Object.values(byScenario)) {
    bucket.accuracy =
      bucket.processed > 0
        ? bucket.fullyCorrect / bucket.processed
        : 0;

    bucket.targetAccuracy =
      bucket.processed > 0
        ? bucket.targetCorrect / bucket.processed
        : 0;
  }

  const accuracy = (
    predicate: (result: EvalResult) => boolean,
  ): number =>
    processedResults.length > 0
      ? processedResults.filter(predicate).length /
      processedResults.length
      : 0;

  return {
    total: results.length,
    processed: processedResults.length,
    actionAccuracy: accuracy((result) => result.actionMatch),
    targetAccuracy: accuracy((result) => result.targetMatch),
    requiresHumanAccuracy: accuracy(
      (result) => result.requiresHumanMatch,
    ),
    fullyCorrectRate: accuracy(
      (result) => result.fullyCorrect,
    ),
    byScenario,
  };
}
