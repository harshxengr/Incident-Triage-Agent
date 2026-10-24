import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

let updateCount = 1;
let persistedStatus: string | null = null;

const updateMany = mock(async (_args: unknown) => ({
  count: updateCount,
}));

const findUnique = mock(async (_args: unknown) => {
  return persistedStatus ? { status: persistedStatus } : null;
});

// Mock the database before importing the lifecycle module.
mock.module("../db/client", () => ({
  prisma: {
    incident: {
      updateMany,
      findUnique,
    },
  },
}));

const {
  transitionIncident,
  InvalidIncidentTransitionError,
  ConcurrentIncidentTransitionError,
} = await import("./lifecycle");

describe("incident lifecycle transitions", () => {
  beforeEach(() => {
    updateCount = 1;
    persistedStatus = null;

    updateMany.mockClear();
    findUnique.mockClear();
  });

  test("records a successful approval transition", async () => {
    const result = await transitionIncident(
      "incident-approval",
      "APPROVED",
      {
        from: "PENDING_APPROVAL",
        data: {
          approvedBy: "test-operator",
        },
      },
    );

    expect(result).toEqual({
      changed: true,
      status: "APPROVED",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "incident-approval",
        status: {
          in: ["PENDING_APPROVAL"],
        },
      },
      data: {
        status: "APPROVED",
        approvedBy: "test-operator",
      },
    });
  });

  test("records a successful rejection transition", async () => {
    const result = await transitionIncident(
      "incident-rejection",
      "REJECTED",
      {
        from: "PENDING_APPROVAL",
        data: {
          rejectedBy: "test-operator",
          rejectionReason: "Insufficient evidence",
          resolvedAt: null,
        },
      },
    );

    expect(result).toEqual({
      changed: true,
      status: "REJECTED",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "incident-rejection",
        status: {
          in: ["PENDING_APPROVAL"],
        },
      },
      data: {
        status: "REJECTED",
        rejectedBy: "test-operator",
        rejectionReason: "Insufficient evidence",
        resolvedAt: null,
      },
    });
  });

  test("treats an already-completed identical transition as unchanged", async () => {
    updateCount = 0;
    persistedStatus = "APPROVED";

    const result = await transitionIncident(
      "incident-approval",
      "APPROVED",
      {
        from: "PENDING_APPROVAL",
      },
    );

    expect(result).toEqual({
      changed: false,
      status: "APPROVED",
    });

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  test("rejects an illegal transition before updating the database", async () => {
    await expect(
      transitionIncident("incident-approval", "RESOLVED", {
        from: "PENDING_APPROVAL",
      }),
    ).rejects.toBeInstanceOf(InvalidIncidentTransitionError);

    expect(updateMany).not.toHaveBeenCalled();
  });

  test("detects when another process changes the incident status", async () => {
    updateCount = 0;
    persistedStatus = "REJECTED";

    await expect(
      transitionIncident("incident-approval", "APPROVED", {
        from: "PENDING_APPROVAL",
      }),
    ).rejects.toBeInstanceOf(ConcurrentIncidentTransitionError);
  });

  test("reports when the incident no longer exists", async () => {
    updateCount = 0;
    persistedStatus = null;

    await expect(
      transitionIncident("missing-incident", "APPROVED", {
        from: "PENDING_APPROVAL",
      }),
    ).rejects.toBeInstanceOf(ConcurrentIncidentTransitionError);
  });
});