export interface EvalCase {
    incidentId: string;
    scenarioType: string;
    expectedAction: string;
    expectedRequiresHuman: boolean;
    actualAction: string | null;
    actualRequiresHuman: boolean | null;
    actualConfidence: number | null;
  }
  
  export interface EvalResult extends EvalCase {
    actionMatch: boolean;
    requiresHumanMatch: boolean;
    fullyCorrect: boolean;
  }
  
  // expectedAction strings look like "rollbackDeployment(8603e1d)" or
  // "monitor(noAction=true)" - the action name is everything before the
  // first "(".
  export function extractActionName(expectedAction: string): string {
    const idx = expectedAction.indexOf("(");
    return idx === -1 ? expectedAction.trim() : expectedAction.slice(0, idx).trim();
  }
  
  export function evaluateCase(c: EvalCase): EvalResult {
    const expectedName = extractActionName(c.expectedAction);
    const actionMatch = c.actualAction !== null && c.actualAction === expectedName;
    const requiresHumanMatch = c.actualRequiresHuman !== null && c.actualRequiresHuman === c.expectedRequiresHuman;
  
    return {
      ...c,
      actionMatch,
      requiresHumanMatch,
      fullyCorrect: actionMatch && requiresHumanMatch,
    };
  }
  
  export interface EvalSummary {
    total: number;
    processed: number;
    actionAccuracy: number;
    requiresHumanAccuracy: number;
    fullyCorrectRate: number;
    byScenario: Record<string, { total: number; processed: number; fullyCorrect: number; accuracy: number }>;
  }
  
  export function summarize(results: EvalResult[]): EvalSummary {
    const processedResults = results.filter((r) => r.actualAction !== null);
    const byScenario: EvalSummary["byScenario"] = {};
  
    for (const r of results) {
      const bucket = (byScenario[r.scenarioType] ??= { total: 0, processed: 0, fullyCorrect: 0, accuracy: 0 });
      bucket.total++;
      if (r.actualAction !== null) {
        bucket.processed++;
        if (r.fullyCorrect) bucket.fullyCorrect++;
      }
    }
    // accuracy is over PROCESSED cases only - an incident that hasn't run
    // through the pipeline yet is "not attempted", not "wrong". Conflating
    // the two would make an unfinished batch look worse than it is.
    for (const b of Object.values(byScenario)) {
      b.accuracy = b.processed > 0 ? b.fullyCorrect / b.processed : 0;
    }
  
    return {
      total: results.length,
      processed: processedResults.length,
      actionAccuracy:
        processedResults.length > 0
          ? processedResults.filter((r) => r.actionMatch).length / processedResults.length
          : 0,
      requiresHumanAccuracy:
        processedResults.length > 0
          ? processedResults.filter((r) => r.requiresHumanMatch).length / processedResults.length
          : 0,
      fullyCorrectRate:
        processedResults.length > 0
          ? processedResults.filter((r) => r.fullyCorrect).length / processedResults.length
          : 0,
      byScenario,
    };
  }
