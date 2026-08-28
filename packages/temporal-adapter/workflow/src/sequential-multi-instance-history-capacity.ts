/** Closed capacity owner for the pre-registration Sequential Multi-Instance host probe. */
import {
  CommandOutcome,
  sequentialMultiInstanceLimits,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import {
  requireWorkflowChainEventHistoryMargin,
  workflowChainHistoryEventEnvelopeBytes,
} from "./workflow-event-history-capacity.js";
import {
  SequentialMultiInstanceHistoryEventFamily,
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
} from "./sequential-multi-instance-history-measurement.js";
import type {
  SequentialMultiInstanceHistoryCheckpoint,
  SequentialMultiInstanceHistoryEnvironment,
  SequentialMultiInstanceHistoryEventFamilyCounts,
  SequentialMultiInstanceHistoryFinalBoundary,
  SequentialMultiInstanceHistoryMeasurement,
  SequentialMultiInstanceMeasuredHistory,
  SequentialMultiInstanceHistorySeparator,
  SequentialMultiInstanceRunHistoryMeasurement,
  SequentialMultiInstanceTopologyHistoryMeasurement,
} from "./sequential-multi-instance-history-measurement.js";

export {
  SequentialMultiInstanceHistoryEventFamily,
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
} from "./sequential-multi-instance-history-measurement.js";
export type {
  SequentialMultiInstanceHistoryCheckpoint,
  SequentialMultiInstanceHistoryEnvironment,
  SequentialMultiInstanceHistoryEventFamilyCounts,
  SequentialMultiInstanceHistoryFinalBoundary,
  SequentialMultiInstanceHistoryMeasurement,
  SequentialMultiInstanceHistorySeparator,
  SequentialMultiInstanceMeasuredHistory,
  SequentialMultiInstanceRunHistoryMeasurement,
  SequentialMultiInstanceTopologyHistoryMeasurement,
} from "./sequential-multi-instance-history-measurement.js";

export type SequentialMultiInstanceHistoryCapacity = Readonly<{
  eventTrigger: number;
  byteTrigger: number;
  activationEventReserve: number;
  activationByteReserve: number;
  maximumMeasuredRunEvents: number;
  maximumMeasuredRunBytes: number;
  maximumMeasuredActivationEvents: number;
  maximumMeasuredActivationPayloadBytes: number;
  maximumInterruptedCompletedItems: number;
}>;

/** Deterministic capacity record plus non-authoritative pinned service-size observations. */
export const retainedSequentialMultiInstanceHistoryMeasurement:
  SequentialMultiInstanceHistoryMeasurement = Object.freeze<
    SequentialMultiInstanceMeasuredHistory
  >({
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
        retainedRun(SequentialMultiInstanceHistoryTopology.Natural, SequentialMultiInstanceHistoryRunRole.PreArming, 1, [3, 3], [123_709, 123_709], [2, 123_670, 8_192], 5, 391_193, 5, 247_043, [1, 3, 0, 0, 0, 0, 0, 1, 0]),
        retainedRun(SequentialMultiInstanceHistoryTopology.Natural, SequentialMultiInstanceHistoryRunRole.Armed, 2, [3, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77, 82, 82], [124_188, 124_642, 126_706, 128_767, 130_828, 132_889, 134_950, 137_011, 139_072, 141_133, 143_194, 145_256, 147_320, 149_384, 151_448, 153_512, 155_576, 155_576], [5, 21_601, 20_480], 87, 501_623, 10, 123_670, [1, 51, 16, 16, 1, 1, 0, 0, 1]),
      ],
    },
    interrupted: {
      topology: SequentialMultiInstanceHistoryTopology.Interrupted,
      completedItemsBeforeTimerResolution: 15,
      terminalOutcome: CommandOutcome.Committed,
      runs: [
        retainedRun(SequentialMultiInstanceHistoryTopology.Interrupted, SequentialMultiInstanceHistoryRunRole.PreArming, 1, [3, 3], [109_388, 109_388], [2, 109_345, 8_192], 5, 348_218, 5, 218_393, [1, 3, 0, 0, 0, 0, 0, 1, 0]),
        retainedRun(SequentialMultiInstanceHistoryTopology.Interrupted, SequentialMultiInstanceHistoryRunRole.Armed, 2, [3, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77, 83, 83], [109_867, 110_321, 112_385, 114_446, 116_507, 118_568, 120_629, 122_690, 124_751, 126_812, 128_873, 130_935, 132_999, 135_063, 137_127, 139_191, 141_415, 141_415], [2, 110_629, 8_192], 85, 569_418, 8, 110_629, [1, 51, 15, 15, 1, 0, 1, 1, 0]),
        retainedRun(SequentialMultiInstanceHistoryTopology.Interrupted, SequentialMultiInstanceHistoryRunRole.StaleRefusal, 3, [3, 6, 6], [111_142, 111_560, 111_560], [4, 110_991, 16_384], 10, 263_884, 7, 111_933, [1, 6, 1, 1, 0, 0, 0, 1, 0]),
        retainedRun(SequentialMultiInstanceHistoryTopology.Interrupted, SequentialMultiInstanceHistoryRunRole.Escalation, 4, [3, 6, 6], [111_513, 111_931, 111_931], [4, 14_213, 16_384], 10, 166_164, 7, 110_991, [1, 6, 1, 1, 0, 0, 0, 0, 1]),
      ],
    },
  });

type RetainedEventFamilies = readonly [number, number, number, number, number, number, number, number, number];

function retainedRun(
  topology: SequentialMultiInstanceHistoryTopology,
  role: SequentialMultiInstanceHistoryRunRole,
  runOrdinal: number,
  historyLengths: readonly number[],
  historySizes: readonly number[],
  finalBoundary: readonly [number, number, number],
  finalEventCount: number,
  conservativeFinalHistorySize: number,
  largestActivationEvents: number,
  largestActivationCanonicalPayloadBytes: number,
  families: RetainedEventFamilies,
): SequentialMultiInstanceRunHistoryMeasurement {
  const labels = checkpointLabels(topology, role);
  if (labels.length !== historyLengths.length || labels.length !== historySizes.length) {
    throw new TypeError("retained SMI measurement checkpoint vectors disagree");
  }
  return {
    runOrdinal,
    role,
    stableCheckpoints: labels.map((label, index) => ({ label, historyLength: historyLengths[index]!, historySize: historySizes[index]! })),
    finalBoundary: { eventsNotIncludedAtCheckpoint: finalBoundary[0], canonicalPayloadBytes: finalBoundary[1], conservativeEnvelopeBytes: finalBoundary[2] },
    finalEventCount,
    conservativeFinalHistorySize,
    largestActivationEvents,
    largestActivationCanonicalPayloadBytes,
    eventFamilies: { workflowExecutionStarted: families[0], workflowTask: families[1], updateAccepted: families[2], updateCompleted: families[3], timerStarted: families[4], timerCanceled: families[5], timerFired: families[6], continuedAsNew: families[7], terminalCompleted: families[8] },
  };
}

const eventFamilyKeys = Object.freeze(
  Object.values(SequentialMultiInstanceHistoryEventFamily),
);

export function requireSequentialMultiInstanceHistoryCapacity(
  value: SequentialMultiInstanceHistoryMeasurement =
    retainedSequentialMultiInstanceHistoryMeasurement,
): SequentialMultiInstanceHistoryCapacity {
  if (value.state === "unmeasured") {
    throw new TypeError("SMI history capacity is unmeasured");
  }
  requireExactKeys(value, [
    "state",
    "environment",
    "separator",
    "natural",
    "interrupted",
  ], "SMI history measurement");
  requireEnvironment(value.environment);
  requireSeparator(value.separator);
  requireTopology(value.natural, SequentialMultiInstanceHistoryTopology.Natural);
  requireTopology(
    value.interrupted,
    SequentialMultiInstanceHistoryTopology.Interrupted,
  );

  const runs = [...value.natural.runs, ...value.interrupted.runs];
  const eventTrigger = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryEvents,
  );
  const byteTrigger = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryBytes,
  );
  const margin = requireWorkflowChainEventHistoryMargin();
  for (const run of runs) {
    if (run.finalEventCount >= eventTrigger) {
      throw capacityError(
        `${run.role} Run ${run.runOrdinal} reached ${eventTrigger} Events`,
      );
    }
    if (run.conservativeFinalHistorySize >= byteTrigger) {
      throw capacityError(
        `${run.role} Run ${run.runOrdinal} reached ${byteTrigger} History bytes`,
      );
    }
    if (run.largestActivationEvents > margin.reservedEvents) {
      throw capacityError(
        `${run.role} Run ${run.runOrdinal} exceeded the activation Event reserve`,
      );
    }
    if (
      run.largestActivationCanonicalPayloadBytes +
          run.largestActivationEvents * workflowChainHistoryEventEnvelopeBytes >
        margin.reservedBytes
    ) {
      throw capacityError(
        `${run.role} Run ${run.runOrdinal} exceeded the activation byte reserve`,
      );
    }
  }

  return {
    eventTrigger,
    byteTrigger,
    activationEventReserve: margin.reservedEvents,
    activationByteReserve: margin.reservedBytes,
    maximumMeasuredRunEvents: Math.max(...runs.map(({ finalEventCount }) =>
      finalEventCount
    )),
    maximumMeasuredRunBytes: Math.max(
      ...runs.map(({ conservativeFinalHistorySize }) =>
        conservativeFinalHistorySize
      ),
    ),
    maximumMeasuredActivationEvents: Math.max(
      ...runs.map(({ largestActivationEvents }) => largestActivationEvents),
    ),
    maximumMeasuredActivationPayloadBytes: Math.max(
      ...runs.map(({ largestActivationCanonicalPayloadBytes }) =>
        largestActivationCanonicalPayloadBytes
      ),
    ),
    maximumInterruptedCompletedItems:
      value.interrupted.completedItemsBeforeTimerResolution,
  };
}

function requireEnvironment(
  value: SequentialMultiInstanceHistoryEnvironment,
): void {
  requireExactKeys(value, [
    "temporalCliVersion",
    "temporalServerVersion",
    "temporalSdkVersion",
  ], "SMI history environment");
  if (
    value.temporalCliVersion !== "v1.8.1" ||
    value.temporalServerVersion !== "1.31.2" ||
    value.temporalSdkVersion !== "1.21.0"
  ) {
    throw capacityError("pinned Temporal environment changed");
  }
}

function requireSeparator(
  value: SequentialMultiInstanceHistorySeparator,
): void {
  requireExactKeys(value, [
    "maximumItems",
    "maximumItemUtf8Bytes",
    "maximumCanonicalCollectionUtf8Bytes",
    "canonicalMaximumCollectionBytes",
    "equal508CollectionBytes",
    "equal512CollectionBytes",
    "exact16Admitted",
    "exact17Refused",
  ], "SMI history separator");
  const maximumCollection = [
    "x".repeat(512),
    ...Array.from({ length: 14 }, () => "x".repeat(509)),
    "x".repeat(505),
  ];
  const equal508 = Array.from({ length: 16 }, () => "x".repeat(508));
  const equal512 = Array.from({ length: 16 }, () => "x".repeat(512));
  const canonicalMaximumCollectionBytes = utf8ByteLength(
    JSON.stringify(maximumCollection),
  );
  const equal508CollectionBytes = utf8ByteLength(JSON.stringify(equal508));
  const equal512CollectionBytes = utf8ByteLength(JSON.stringify(equal512));
  if (
    value.maximumItems !== sequentialMultiInstanceLimits.maximumItems ||
    value.maximumItemUtf8Bytes !==
      sequentialMultiInstanceLimits.maximumItemUtf8Bytes ||
    value.maximumCanonicalCollectionUtf8Bytes !==
      sequentialMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes ||
    value.canonicalMaximumCollectionBytes !== canonicalMaximumCollectionBytes ||
    value.equal508CollectionBytes !== equal508CollectionBytes ||
    value.equal512CollectionBytes !== equal512CollectionBytes ||
    canonicalMaximumCollectionBytes !== 8_192 ||
    equal508CollectionBytes !== 8_177 ||
    equal512CollectionBytes !== 8_241 ||
    value.exact16Admitted !== true ||
    value.exact17Refused !== true
  ) {
    throw capacityError("16/17 canonical separator changed");
  }
}

function requireTopology(
  value: SequentialMultiInstanceTopologyHistoryMeasurement,
  expected: SequentialMultiInstanceHistoryTopology,
): void {
  requireExactKeys(value, [
    "topology",
    "completedItemsBeforeTimerResolution",
    "terminalOutcome",
    "runs",
  ], `${expected} topology`);
  if (value.topology !== expected) {
    throw capacityError(`${expected} topology was substituted`);
  }
  if (value.terminalOutcome !== CommandOutcome.Committed) {
    throw capacityError(`${expected} topology did not close successfully`);
  }
  const expectedRoles = expected === SequentialMultiInstanceHistoryTopology.Natural
    ? [
      SequentialMultiInstanceHistoryRunRole.PreArming,
      SequentialMultiInstanceHistoryRunRole.Armed,
    ]
    : [
      SequentialMultiInstanceHistoryRunRole.PreArming,
      SequentialMultiInstanceHistoryRunRole.Armed,
      SequentialMultiInstanceHistoryRunRole.StaleRefusal,
      SequentialMultiInstanceHistoryRunRole.Escalation,
    ];
  if (value.runs.length !== expectedRoles.length) {
    throw capacityError(`${expected} topology has the wrong Run count`);
  }
  for (const [index, role] of expectedRoles.entries()) {
    const run = value.runs[index];
    if (run === undefined || run.runOrdinal !== index + 1 || run.role !== role) {
      throw capacityError(`${expected} topology has the wrong Run ${index + 1}`);
    }
    requireRun(run, checkpointLabels(expected, role));
  }
  if (expected === SequentialMultiInstanceHistoryTopology.Natural) {
    if (value.completedItemsBeforeTimerResolution !== 16) {
      throw capacityError("natural topology must complete exact 16 items");
    }
    requireFamilyArm(value.runs[0]!, preArmingFamilies);
    requireFamilyArm(value.runs[1]!, naturalArmedFamilies);
    return;
  }
  if (value.completedItemsBeforeTimerResolution !== 15) {
    throw capacityError(
      "interrupted topology must choose the worst admissible point after 15 items",
    );
  }
  requireFamilyArm(value.runs[0]!, preArmingFamilies);
  requireFamilyArm(value.runs[1]!, interruptedArmedFamilies);
  requireFamilyArm(value.runs[2]!, staleRefusalFamilies);
  requireFamilyArm(value.runs[3]!, escalationFamilies);
}

function requireRun(
  value: SequentialMultiInstanceRunHistoryMeasurement,
  expectedCheckpointLabels: readonly string[],
): void {
  requireExactKeys(value, [
    "runOrdinal",
    "role",
    "stableCheckpoints",
    "finalBoundary",
    "finalEventCount",
    "conservativeFinalHistorySize",
    "largestActivationEvents",
    "largestActivationCanonicalPayloadBytes",
    "eventFamilies",
  ], "SMI Run measurement");
  requirePositiveSafeInteger(value.runOrdinal, "Run ordinal");
  if (!Object.values(SequentialMultiInstanceHistoryRunRole).includes(value.role)) {
    throw capacityError("SMI Run role is unknown");
  }
  if (value.stableCheckpoints.length === 0) {
    throw capacityError("SMI Run has no service checkpoint");
  }
  if (
    value.stableCheckpoints.length !== expectedCheckpointLabels.length ||
    value.stableCheckpoints.some(
      (checkpoint, index) => checkpoint.label !== expectedCheckpointLabels[index],
    )
  ) {
    throw capacityError(`${value.role} Run has the wrong checkpoint order`);
  }
  let preceding: SequentialMultiInstanceHistoryCheckpoint | undefined;
  for (const checkpoint of value.stableCheckpoints) {
    requireExactKeys(checkpoint, ["label", "historyLength", "historySize"], "checkpoint");
    if (checkpoint.label.length === 0) {
      throw capacityError("checkpoint label is empty");
    }
    requireNonnegativeSafeInteger(checkpoint.historyLength, "checkpoint historyLength");
    requireNonnegativeSafeInteger(checkpoint.historySize, "checkpoint historySize");
    if (
      preceding !== undefined &&
      (checkpoint.historyLength < preceding.historyLength ||
        checkpoint.historySize < preceding.historySize)
    ) {
      throw capacityError("service checkpoints are not monotone");
    }
    preceding = checkpoint;
  }
  const last = value.stableCheckpoints.at(-1)!;
  requireFinalBoundary(value.finalBoundary);
  if (
    value.finalEventCount !==
      last.historyLength + value.finalBoundary.eventsNotIncludedAtCheckpoint
  ) {
    throw capacityError("final Event count does not close the service checkpoint");
  }
  requireNonnegativeSafeInteger(value.largestActivationEvents, "largest activation Events");
  requireNonnegativeSafeInteger(
    value.largestActivationCanonicalPayloadBytes,
    "largest activation payload bytes",
  );
  if (
    value.conservativeFinalHistorySize !==
      value.finalEventCount * workflowChainHistoryEventEnvelopeBytes +
        value.largestActivationCanonicalPayloadBytes +
        value.finalBoundary.canonicalPayloadBytes ||
    last.historySize > value.conservativeFinalHistorySize
  ) {
    throw capacityError("service History size exceeds or disagrees with its upper envelope");
  }
  requireEventFamilies(value.eventFamilies);
  const classifiedEvents = eventFamilyKeys.reduce((sum, family) => sum + value.eventFamilies[family], 0);
  if (!Number.isSafeInteger(classifiedEvents) || classifiedEvents !== value.finalEventCount) {
    throw capacityError("Event-family account does not classify every final Event");
  }
}

function requireFinalBoundary(
  value: SequentialMultiInstanceHistoryFinalBoundary,
): void {
  requireExactKeys(value, [
    "eventsNotIncludedAtCheckpoint",
    "canonicalPayloadBytes",
    "conservativeEnvelopeBytes",
  ], "final boundary");
  requirePositiveSafeInteger(
    value.eventsNotIncludedAtCheckpoint,
    "final boundary excluded service Events",
  );
  requireNonnegativeSafeInteger(value.canonicalPayloadBytes, "final payload bytes");
  requireNonnegativeSafeInteger(
    value.conservativeEnvelopeBytes,
    "final Event envelope bytes",
  );
  if (
    value.conservativeEnvelopeBytes !==
      value.eventsNotIncludedAtCheckpoint * workflowChainHistoryEventEnvelopeBytes
  ) {
    throw capacityError("final Event envelope does not match excluded Events");
  }
}

function checkpointLabels(
  topology: SequentialMultiInstanceHistoryTopology,
  role: SequentialMultiInstanceHistoryRunRole,
): readonly string[] {
  switch (role) {
    case SequentialMultiInstanceHistoryRunRole.PreArming:
      return ["run-open", "before-pre-arming-continue-as-new"];
    case SequentialMultiInstanceHistoryRunRole.Armed:
      return topology === SequentialMultiInstanceHistoryTopology.Natural
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

function requireEventFamilies(
  value: SequentialMultiInstanceHistoryEventFamilyCounts,
): void {
  requireExactKeys(value, eventFamilyKeys, "SMI event families");
  for (const family of eventFamilyKeys) {
    requireNonnegativeSafeInteger(value[family], `event family ${family}`);
  }
}

const preArmingFamilies: SequentialMultiInstanceHistoryEventFamilyCounts = {
  workflowExecutionStarted: 1,
  workflowTask: 3,
  updateAccepted: 0,
  updateCompleted: 0,
  timerStarted: 0,
  timerCanceled: 0,
  timerFired: 0,
  continuedAsNew: 1,
  terminalCompleted: 0,
};

const naturalArmedFamilies: SequentialMultiInstanceHistoryEventFamilyCounts = {
  workflowExecutionStarted: 1,
  workflowTask: 51,
  updateAccepted: 16,
  updateCompleted: 16,
  timerStarted: 1,
  timerCanceled: 1,
  timerFired: 0,
  continuedAsNew: 0,
  terminalCompleted: 1,
};

const interruptedArmedFamilies: SequentialMultiInstanceHistoryEventFamilyCounts = {
  workflowExecutionStarted: 1,
  workflowTask: 51,
  updateAccepted: 15,
  updateCompleted: 15,
  timerStarted: 1,
  timerCanceled: 0,
  timerFired: 1,
  continuedAsNew: 1,
  terminalCompleted: 0,
};

const staleRefusalFamilies: SequentialMultiInstanceHistoryEventFamilyCounts = {
  workflowExecutionStarted: 1,
  workflowTask: 6,
  updateAccepted: 1,
  updateCompleted: 1,
  timerStarted: 0,
  timerCanceled: 0,
  timerFired: 0,
  continuedAsNew: 1,
  terminalCompleted: 0,
};

const escalationFamilies: SequentialMultiInstanceHistoryEventFamilyCounts = {
  workflowExecutionStarted: 1,
  workflowTask: 6,
  updateAccepted: 1,
  updateCompleted: 1,
  timerStarted: 0,
  timerCanceled: 0,
  timerFired: 0,
  continuedAsNew: 0,
  terminalCompleted: 1,
};

function requireFamilyArm(
  run: SequentialMultiInstanceRunHistoryMeasurement,
  expected: SequentialMultiInstanceHistoryEventFamilyCounts,
): void {
  for (const family of eventFamilyKeys) {
    if (run.eventFamilies[family] !== expected[family]) {
      throw capacityError(
        `${run.role} Run substituted event family ${family}`,
      );
    }
  }
}

function requireExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw capacityError(`${label} has an open or omitted field`);
  }
}

function requireNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw capacityError(`${label} must be a nonnegative safe integer`);
  }
}

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw capacityError(`${label} must be a positive safe integer`);
  }
}

function capacityError(message: string): RangeError {
  return new RangeError(`SMI history capacity: ${message}`);
}
