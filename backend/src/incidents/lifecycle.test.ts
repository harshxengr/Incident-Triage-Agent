import { describe, expect, test } from "bun:test";
import { canTransition, isActiveStatus, isTerminalStatus } from "./lifecycle";

describe("incident lifecycle", () => {
  test("allows the normal automated path", () => {
    expect(canTransition("OPEN", "DIAGNOSING")).toBe(true);
    expect(canTransition("DIAGNOSING", "DIAGNOSED")).toBe(true);
    expect(canTransition("DIAGNOSED", "ACTION_PROPOSED")).toBe(true);
    expect(canTransition("ACTION_PROPOSED", "EXECUTING")).toBe(true);
    expect(canTransition("EXECUTING", "RESOLVED")).toBe(true);
  });

  test("allows the human approval path", () => {
    expect(canTransition("ACTION_PROPOSED", "PENDING_APPROVAL")).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "EXECUTING")).toBe(true);
  });

  test("allows rejection and failure exits", () => {
    expect(canTransition("PENDING_APPROVAL", "REJECTED")).toBe(true);
    expect(canTransition("EXECUTING", "FAILED")).toBe(true);
    expect(canTransition("OPEN", "FAILED")).toBe(true);
  });

  test("rejects illegal jumps", () => {
    expect(canTransition("OPEN", "RESOLVED")).toBe(false);
    expect(canTransition("PENDING_APPROVAL", "RESOLVED")).toBe(false);
    expect(canTransition("RESOLVED", "EXECUTING")).toBe(false);
    expect(canTransition("REJECTED", "APPROVED")).toBe(false);
  });

  test("classifies active and terminal statuses", () => {
    expect(isActiveStatus("EXECUTING")).toBe(true);
    expect(isActiveStatus("PENDING_APPROVAL")).toBe(true);
    expect(isTerminalStatus("RESOLVED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
    expect(isTerminalStatus("PENDING_APPROVAL")).toBe(false);
  });
});
