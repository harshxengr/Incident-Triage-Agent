import { describe, expect, test } from "bun:test";
import { checkApiKey } from "./auth";

const OPERATOR_KEY = "test-dashboard-operator-key";

describe("operator API-key authentication", () => {
  test("accepts a correct API key", () => {
    const request = new Request(
      "http://localhost/api/incidents/demo/approve",
      {
        method: "POST",
        headers: {
          "X-API-Key": OPERATOR_KEY,
        },
      },
    );

    expect(checkApiKey(request, OPERATOR_KEY)).toBe(true);
  });

  test("rejects a request without an API key", () => {
    const request = new Request(
      "http://localhost/api/incidents/demo/approve",
      { method: "POST" },
    );

    expect(checkApiKey(request, OPERATOR_KEY)).toBe(false);
  });

  test("rejects an incorrect API key", () => {
    const request = new Request(
      "http://localhost/api/incidents/demo/reject",
      {
        method: "POST",
        headers: {
          "X-API-Key": "wrong-key",
        },
      },
    );

    expect(checkApiKey(request, OPERATOR_KEY)).toBe(false);
  });

  test("rejects a request when the configured key is empty", () => {
    const request = new Request(
      "http://localhost/api/incidents/demo/approve",
      {
        method: "POST",
        headers: {
          "X-API-Key": "some-key",
        },
      },
    );

    expect(checkApiKey(request, "")).toBe(false);
  });
});