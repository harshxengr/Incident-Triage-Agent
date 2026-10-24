
import { describe, expect, test } from "bun:test";
import {
    isPublicDemoScenario,
    PUBLIC_DEMO_SCENARIOS,
} from "./publicDemo";

describe("public demo scenario allowlist", () => {
    test("accepts all known synthetic scenarios", () => {
        for (const scenario of PUBLIC_DEMO_SCENARIOS) {
            expect(isPublicDemoScenario(scenario)).toBe(true);
        }
    });

    test("rejects real and unknown scenarios", () => {
        expect(isPublicDemoScenario("real")).toBe(false);
        expect(isPublicDemoScenario("unknown")).toBe(false);
        expect(isPublicDemoScenario(null)).toBe(false);
        expect(isPublicDemoScenario(undefined)).toBe(false);
    });
});
