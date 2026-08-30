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

test("retains pinned deterministic capacity facts below every boundary", () => {
  assert.equal(retainedSequentialMultiInstanceHistoryMeasurement.state, "measured");
  assert.deepEqual(requireSequentialMultiInstanceHistoryCapacity(), {
    eventTrigger,
    byteTrigger,
    activationEventReserve,
    activationByteReserve,
    maximumMeasuredRunEvents: 87,
    maximumMeasuredRunBytes: 569_546,
    maximumMeasuredActivationEvents: 10,
    maximumMeasuredActivationPayloadBytes: 247_171,
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
    maximumMeasuredRunEvents: 87,
    maximumMeasuredRunBytes: 425_984,
    maximumMeasuredActivationEvents: 9,
    maximumMeasuredActivationPayloadBytes: 65_536,
    maximumInterruptedCompletedItems: 15,
  });
});

test("keeps the closed topology below whole-Run triggers and enforces activation boundaries", () => {
  const fixture = measuredFixture();
  const capacity = requireSequentialMultiInstanceHistoryCapacity(fixture);
  assert.ok(capacity.maximumMeasuredRunEvents < eventTrigger);
  assert.ok(capacity.maximumMeasuredRunBytes < byteTrigger);
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
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      measurementAtBoundary(
        fixture,
        "largestActivationCanonicalPayloadBytes",
        activationByteReserve + 1,
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
    conservativeFinalHistorySize: armed.conservativeFinalHistorySize +
      activationByteReserve - 9 * historyEventEnvelopeBytes -
      armed.largestActivationCanonicalPayloadBytes,
  });
  assert.doesNotThrow(() => requireSequentialMultiInstanceHistoryCapacity(inside));
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      replaceNaturalArmedRun(inside as SequentialMultiInstanceMeasuredHistory, {
        largestActivationCanonicalPayloadBytes:
          activationByteReserve - 9 * historyEventEnvelopeBytes + 1,
        conservativeFinalHistorySize:
          (inside as SequentialMultiInstanceMeasuredHistory).natural.runs[1]!
            .conservativeFinalHistorySize + 1,
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
      }),
    ),
    /envelope/u,
  );
});

test("treats service History sizes as bounded observations rather than exact retained facts", () => {
  const fixture = measuredFixture();
  const armed = fixture.natural.runs[1];
  assert.ok(armed !== undefined);
  assert.doesNotThrow(() => requireSequentialMultiInstanceHistoryCapacity(
    replaceNaturalArmedRun(fixture, {
      stableCheckpoints: armed.stableCheckpoints.map((checkpoint) => ({
        ...checkpoint,
        historySize: checkpoint.historySize + 84,
      })),
    }),
  ));
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      replaceNaturalArmedRun(fixture, {
        stableCheckpoints: armed.stableCheckpoints.map((checkpoint) => ({
          ...checkpoint,
          historySize: armed.conservativeFinalHistorySize + 1,
        })),
      }),
    ),
    /upper envelope/iu,
  );
});

test("rejects a component estimate in place of closed whole-topology facts", () => {
  const estimated = replaceNaturalArmedRun(measuredFixture(), {
    componentEstimate: {
      timerEvents: 2,
      updateEvents: 32,
      workflowTaskEvents: 3,
    },
  } as never);
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(estimated),
    /open or omitted field/u,
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

test("rejects a final History Event outside the closed Event-family account", () => {
  const fixture = measuredFixture();
  const armed = fixture.natural.runs[1];
  const last = armed?.stableCheckpoints.at(-1);
  assert.ok(armed !== undefined && last !== undefined);
  assert.throws(
    () => requireSequentialMultiInstanceHistoryCapacity(
      replaceNaturalArmedRun(fixture, {
        finalEventCount: armed.finalEventCount + 1,
        conservativeFinalHistorySize: armed.conservativeFinalHistorySize +
          historyEventEnvelopeBytes,
        stableCheckpoints: armed.stableCheckpoints.with(-1, {
          ...last,
          historyLength: last.historyLength + 1,
        }),
      }),
    ),
    /event[- ]famil|classified/iu,
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
          workflowExecutionStarted: 1,
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
          workflowExecutionStarted: 1,
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
          workflowExecutionStarted: 1,
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
          workflowExecutionStarted: 1,
          workflowTask: 51,
          updateAccepted: 15,
          updateCompleted: 15,
          timerStarted: 1,
          timerCanceled: 0,
          timerFired: 1,
          continuedAsNew: 1,
          terminalCompleted: 0,
        }),
        run(3, SequentialMultiInstanceHistoryRunRole.StaleRefusal, {
          workflowExecutionStarted: 1,
          workflowTask: 6,
          updateAccepted: 1,
          updateCompleted: 1,
          timerStarted: 0,
          timerCanceled: 0,
          timerFired: 0,
          continuedAsNew: 1,
          terminalCompleted: 0,
        }),
        run(4, SequentialMultiInstanceHistoryRunRole.Escalation, {
          workflowExecutionStarted: 1,
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
    | "largestActivationEvents"
    | "largestActivationCanonicalPayloadBytes",
  boundary: number,
): SequentialMultiInstanceMeasuredHistory {
  const armed = measurement.natural.runs[1];
  assert.ok(armed !== undefined);
  const pairedBoundary = field === "largestActivationCanonicalPayloadBytes"
    ? {
      largestActivationEvents: 0,
      conservativeFinalHistorySize: armed.conservativeFinalHistorySize +
        boundary - armed.largestActivationCanonicalPayloadBytes,
    }
    : {};
  return replaceNaturalArmedRun(measurement, {
    [field]: boundary,
    ...pairedBoundary,
  }) as SequentialMultiInstanceMeasuredHistory;
}

function run(
  runOrdinal: number,
  role: SequentialMultiInstanceRunHistoryMeasurement["role"],
  eventFamilies: SequentialMultiInstanceRunHistoryMeasurement["eventFamilies"],
): SequentialMultiInstanceRunHistoryMeasurement {
  const finalEventCount = Object.values(eventFamilies).reduce((sum, count) => sum + count, 0);
  const historySize = runOrdinal === 2 ? 122_880 : 8_192;
  const largestActivationCanonicalPayloadBytes = runOrdinal === 2 ? 65_536 : 8_192;
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
    conservativeFinalHistorySize: finalEventCount * historyEventEnvelopeBytes +
      largestActivationCanonicalPayloadBytes + 4_096,
    largestActivationEvents: runOrdinal === 2 ? 9 : 4,
    largestActivationCanonicalPayloadBytes,
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
    case SequentialMultiInstanceHistoryRunRole.StaleRefusal:
      return ["run-open", "update-16", "before-stale-refusal-continue-as-new"];
    case SequentialMultiInstanceHistoryRunRole.Escalation:
      return ["run-open", "update-17", "before-escalation-terminal"];
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
