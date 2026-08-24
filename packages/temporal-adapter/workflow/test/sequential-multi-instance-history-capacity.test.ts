import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";

import {
  SequentialMultiInstanceHistoryEventFamily,
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
  requireSequentialMultiInstanceHistoryCapacity,
  retainedSequentialMultiInstanceHistoryMeasurement,
} from "../dist/sequential-multi-instance-history-capacity.js";
import type {
  SequentialMultiInstanceHistoryMeasurement,
  SequentialMultiInstanceMeasuredHistory,
  SequentialMultiInstanceRunHistoryMeasurement,
} from "../dist/sequential-multi-instance-history-capacity.js";

const eventTrigger = 8_000;
const byteTrigger = 8 * 1_024 * 1_024;
const activationEventReserve = 2_240;
const activationByteReserve = 2 * 1_024 * 1_024;
const historyEventEnvelopeBytes = 4 * 1_024;

test("retains the exact pinned real-service measurement below every boundary", () => {
  assert.equal(retainedSequentialMultiInstanceHistoryMeasurement.state, "measured");
  assert.deepEqual(requireSequentialMultiInstanceHistoryCapacity(), {
    eventTrigger,
    byteTrigger,
    activationEventReserve,
    activationByteReserve,
    maximumMeasuredRunEvents: 87,
    maximumMeasuredRunBytes: 259_636,
    maximumMeasuredActivationEvents: 10,
    maximumMeasuredActivationPayloadBytes: 246_799,
    maximumInterruptedCompletedItems: 15,
  });
});

test("accepts a closed whole-topology measurement below every production boundary", () => {
  const measurement = measuredFixture();
  assert.deepEqual(requireSequentialMultiInstanceHistoryCapacity(measurement), {
    eventTrigger,
    byteTrigger,
    activationEventReserve,
    activationByteReserve,
    maximumMeasuredRunEvents: 113,
    maximumMeasuredRunBytes: 135_168,
    maximumMeasuredActivationEvents: 9,
    maximumMeasuredActivationPayloadBytes: 65_536,
    maximumInterruptedCompletedItems: 15,
  });
});

test("fails through the root criterion at every whole-topology and activation boundary", () => {
  const fixture = measuredFixture();
  for (const [field, boundary] of [
    ["finalEventCount", eventTrigger - 1],
    ["conservativeFinalHistorySize", byteTrigger - 1],
    ["largestActivationCanonicalPayloadBytes", activationByteReserve],
  ] as const) {
    const atBoundary = measurementAtBoundary(fixture, field, boundary);
    assert.doesNotThrow(() =>
      requireSequentialMultiInstanceHistoryCapacity(atBoundary)
    );
    assert.throws(
      () => requireSequentialMultiInstanceHistoryCapacity(
        measurementAtBoundary(atBoundary, field, boundary + 1),
      ),
      /SMI history capacity/u,
      `${field} must be enforced by the root criterion`,
    );
  }
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      measurementAtBoundary(
        fixture,
        "largestActivationEvents",
        activationEventReserve + 1,
      ),
    ),
    /activation/iu,
  );
});

test("combines activation Event envelopes with co-resident canonical payload bytes", () => {
  const fixture = measuredFixture();
  const armed = fixture.natural.runs[1];
  assert.ok(armed !== undefined);
  const inside = replaceNaturalArmedRun(fixture, {
    largestActivationEvents: 9,
    largestActivationCanonicalPayloadBytes:
      activationByteReserve - 9 * historyEventEnvelopeBytes,
  });
  assert.doesNotThrow(() => requireSequentialMultiInstanceHistoryCapacity(inside));
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      replaceNaturalArmedRun(inside as SequentialMultiInstanceMeasuredHistory, {
        largestActivationCanonicalPayloadBytes:
          activationByteReserve - 9 * historyEventEnvelopeBytes + 1,
      }),
    ),
    /activation byte reserve/u,
  );
});

test("requires exact per-role checkpoint order and the production Event envelope equation", () => {
  const fixture = measuredFixture();
  const armed = fixture.natural.runs[1];
  assert.ok(armed !== undefined);
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      replaceNaturalArmedRun(fixture, {
        stableCheckpoints: armed.stableCheckpoints.with(1, {
          ...armed.stableCheckpoints[1]!,
          label: "timer-fired",
        }),
      }),
    ),
    /checkpoint/u,
  );
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      replaceNaturalArmedRun(fixture, {
        finalBoundary: {
          ...armed.finalBoundary,
          conservativeEnvelopeBytes:
            armed.finalBoundary.conservativeEnvelopeBytes - 1,
        },
        conservativeFinalHistorySize: armed.conservativeFinalHistorySize - 1,
      }),
    ),
    /envelope/u,
  );
});

test("rejects an underestimated component sum when the whole service topology reaches a trigger", () => {
  const underestimated = replaceNaturalArmedRun(measuredFixture(), {
    finalEventCount: eventTrigger,
    componentEstimate: {
      timerEvents: 2,
      updateEvents: 32,
      workflowTaskEvents: 3,
    },
  } as never);
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(underestimated),
    /SMI history capacity/u,
  );
});

test("requires the closed Event-family vocabulary and each topology arm", () => {
  const fixture = measuredFixture();
  for (const family of Object.values(SequentialMultiInstanceHistoryEventFamily)) {
    const { [family]: _omitted, ...withoutFamily } = fixture.natural.runs[1]!
      .eventFamilies;
    assert.throws(
      () => requireSequentialMultiInstanceHistoryCapacity(
        replaceNaturalArmedRun(fixture, { eventFamilies: withoutFamily } as never),
      ),
      /event famil/iu,
      `${family} must not be omitted`,
    );
  }
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity({
      ...fixture,
      natural: {
        ...fixture.natural,
        runs: fixture.natural.runs.slice(0, 1),
      },
    }),
    /natural.*Run|Run.*natural/u,
  );
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity({
      ...fixture,
      interrupted: {
        ...fixture.interrupted,
        runs: fixture.interrupted.runs.slice(0, 2),
      },
    }),
    /interrupted.*Run|Run.*interrupted/u,
  );
});

test("locks the exact jointly admissible 16-item separator and exact 17 refusal", () => {
  const fixture = measuredFixture();
  assert.doesNotThrow(() => requireSequentialMultiInstanceHistoryCapacity(fixture));
  for (const separator of [
    { ...fixture.separator, canonicalMaximumCollectionBytes: 8_191 },
    { ...fixture.separator, equal508CollectionBytes: 8_178 },
    { ...fixture.separator, equal512CollectionBytes: 8_240 },
    { ...fixture.separator, exact16Admitted: false },
    { ...fixture.separator, exact17Refused: false },
  ]) {
    assert.throws(
      () => requireSequentialMultiInstanceHistoryCapacity({
        ...fixture,
        separator,
      }),
      /16|17|separator|canonical/iu,
    );
  }
});

function measuredFixture(): SequentialMultiInstanceMeasuredHistory {
  return {
    state: "measured",
    environment: {
      temporalCliVersion: "v1.8.1",
      temporalServerVersion: "1.31.2",
      temporalSdkVersion: "1.21.0",
    },
    separator: {
      maximumItems: 16,
      maximumItemUtf8Bytes: 512,
      maximumCanonicalCollectionUtf8Bytes: 8_192,
      canonicalMaximumCollectionBytes: 8_192,
      equal508CollectionBytes: 8_177,
      equal512CollectionBytes: 8_241,
      exact16Admitted: true,
      exact17Refused: true,
    },
    natural: {
      topology: SequentialMultiInstanceHistoryTopology.Natural,
      completedItemsBeforeTimerResolution: 16,
      terminalOutcome: CommandOutcome.Committed,
      runs: [
        run(1, SequentialMultiInstanceHistoryRunRole.PreArming, {
          workflowTask: 3,
          updateAccepted: 0,
          updateCompleted: 0,
          timerStarted: 0,
          timerCanceled: 0,
          timerFired: 0,
          continuedAsNew: 1,
          terminalCompleted: 0,
        }),
        run(2, SequentialMultiInstanceHistoryRunRole.Armed, {
          workflowTask: 51,
          updateAccepted: 16,
          updateCompleted: 16,
          timerStarted: 1,
          timerCanceled: 1,
          timerFired: 0,
          continuedAsNew: 0,
          terminalCompleted: 1,
        }),
      ],
    },
    interrupted: {
      topology: SequentialMultiInstanceHistoryTopology.Interrupted,
      completedItemsBeforeTimerResolution: 15,
      terminalOutcome: CommandOutcome.Committed,
      runs: [
        run(1, SequentialMultiInstanceHistoryRunRole.PreArming, {
          workflowTask: 3,
          updateAccepted: 0,
          updateCompleted: 0,
          timerStarted: 0,
          timerCanceled: 0,
          timerFired: 0,
          continuedAsNew: 1,
          terminalCompleted: 0,
        }),
        run(2, SequentialMultiInstanceHistoryRunRole.Armed, {
          workflowTask: 51,
          updateAccepted: 15,
          updateCompleted: 15,
          timerStarted: 1,
          timerCanceled: 0,
          timerFired: 1,
          continuedAsNew: 1,
          terminalCompleted: 0,
        }),
        run(3, SequentialMultiInstanceHistoryRunRole.Escalation, {
          workflowTask: 6,
          updateAccepted: 1,
          updateCompleted: 1,
          timerStarted: 0,
          timerCanceled: 0,
          timerFired: 0,
          continuedAsNew: 0,
          terminalCompleted: 1,
        }),
      ],
    },
  };
}

function measurementAtBoundary(
  measurement: SequentialMultiInstanceMeasuredHistory,
  field:
    | "finalEventCount"
    | "conservativeFinalHistorySize"
    | "largestActivationEvents"
    | "largestActivationCanonicalPayloadBytes",
  boundary: number,
): SequentialMultiInstanceMeasuredHistory {
  const armed = measurement.natural.runs[1];
  assert.ok(armed !== undefined);
  const checkpoint = armed.stableCheckpoints.at(-1);
  assert.ok(checkpoint !== undefined);
  const checkpointIndex = armed.stableCheckpoints.length - 1;
  const stableCheckpoints = field === "finalEventCount"
    ? armed.stableCheckpoints.with(checkpointIndex, {
      ...checkpoint,
      historyLength: boundary - armed.finalBoundary.eventsNotIncludedAtCheckpoint,
    })
    : field === "conservativeFinalHistorySize"
    ? armed.stableCheckpoints.with(checkpointIndex, {
      ...checkpoint,
      historySize: boundary - armed.finalBoundary.canonicalPayloadBytes -
        armed.finalBoundary.conservativeEnvelopeBytes,
    })
    : armed.stableCheckpoints;
  const pairedBoundary = field === "largestActivationEvents"
    ? { largestActivationCanonicalPayloadBytes: 0 }
    : field === "largestActivationCanonicalPayloadBytes"
    ? { largestActivationEvents: 0 }
    : {};
  return replaceNaturalArmedRun(measurement, {
    [field]: boundary,
    stableCheckpoints,
    ...pairedBoundary,
  }) as SequentialMultiInstanceMeasuredHistory;
}

function run(
  runOrdinal: number,
  role: SequentialMultiInstanceRunHistoryMeasurement["role"],
  eventFamilies: SequentialMultiInstanceRunHistoryMeasurement["eventFamilies"],
): SequentialMultiInstanceRunHistoryMeasurement {
  const finalEventCount = runOrdinal === 2 ? 113 : 7;
  const historySize = runOrdinal === 2 ? 122_880 : 8_192;
  const labels = checkpointLabels(role, eventFamilies);
  return {
    runOrdinal,
    role,
    stableCheckpoints: labels.map((label) => ({
      label,
      historyLength: finalEventCount - 2,
      historySize,
    })),
    finalBoundary: {
      eventsNotIncludedAtCheckpoint: 2,
      canonicalPayloadBytes: 4_096,
      conservativeEnvelopeBytes: 2 * historyEventEnvelopeBytes,
    },
    finalEventCount,
    conservativeFinalHistorySize:
      historySize + 4_096 + 2 * historyEventEnvelopeBytes,
    largestActivationEvents: runOrdinal === 2 ? 9 : 4,
    largestActivationCanonicalPayloadBytes: runOrdinal === 2 ? 65_536 : 8_192,
    eventFamilies,
  };
}

function checkpointLabels(
  role: SequentialMultiInstanceHistoryRunRole,
  eventFamilies: SequentialMultiInstanceRunHistoryMeasurement["eventFamilies"],
): readonly string[] {
  switch (role) {
    case SequentialMultiInstanceHistoryRunRole.PreArming:
      return ["run-open", "before-pre-arming-continue-as-new"];
    case SequentialMultiInstanceHistoryRunRole.Armed:
      return eventFamilies.timerCanceled === 1
        ? [
          "run-open",
          ...Array.from({ length: 16 }, (_, index) => `update-${index + 1}`),
          "before-natural-terminal",
        ]
        : [
          "run-open",
          ...Array.from({ length: 15 }, (_, index) => `update-${index + 1}`),
          "timer-fired",
          "before-interrupted-continue-as-new",
        ];
    case SequentialMultiInstanceHistoryRunRole.Escalation:
      return ["run-open", "update-16", "before-escalation-terminal"];
  }
}

function replaceNaturalArmedRun(
  measurement: SequentialMultiInstanceMeasuredHistory,
  replacement: Partial<SequentialMultiInstanceRunHistoryMeasurement>,
): SequentialMultiInstanceHistoryMeasurement {
  const armed = measurement.natural.runs[1];
  assert.ok(armed !== undefined);
  return {
    ...measurement,
    natural: {
      ...measurement.natural,
      runs: [
        measurement.natural.runs[0]!,
        { ...armed, ...replacement },
      ],
    },
  };
}
