/** Capacity decision for the maximal admitted parallel Multi-Instance activation topology. */
import {
  parallelMultiInstanceLimits,
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
  ParallelMultiInstanceHistoryEventFamily,
  ParallelMultiInstanceCapacityTopology,
  type ParallelMultiInstanceHistoryMeasurement,
  type ParallelMultiInstanceServiceHistoryMeasurement,
  type ParallelMultiInstanceServiceHistoryRun,
} from "./parallel-multi-instance-history-measurement.js";

export {
  ParallelMultiInstanceHistoryEventFamily,
  ParallelMultiInstanceCapacityTopology,
} from "./parallel-multi-instance-history-measurement.js";
export type {
  ParallelMultiInstanceHistoryMeasurement,
  ParallelMultiInstanceHistoryEventFamilyCounts,
  ParallelMultiInstanceServiceHistoryCheckpoint,
  ParallelMultiInstanceServiceHistoryMeasurement,
  ParallelMultiInstanceServiceHistoryRun,
  ParallelMultiInstanceServiceTopologyMeasurement,
  ParallelMultiInstanceTopologyMeasurement,
} from "./parallel-multi-instance-history-measurement.js";

export type ParallelMultiInstanceHistoryCapacity = Readonly<{
  selectedMaximumItems: number;
  activationEventReserve: number;
  activationByteReserve: number;
  maximumMeasuredActivationEvents: number;
  maximumMeasuredActivationPayloadBytes: number;
  maximumMeasuredHistoryEnvelopeBytes: number;
}>;

export type ParallelMultiInstanceServiceHistoryCapacity = Readonly<{
  selectedMaximumItems: number;
  eventTrigger: number;
  byteTrigger: number;
  activationEventReserve: number;
  activationByteReserve: number;
  maximumMeasuredRunEvents: number;
  maximumMeasuredRunBytes: number;
  maximumMeasuredActivationEvents: number;
  maximumMeasuredActivationPayloadBytes: number;
}>;

/** Reproducible production-serializer measurement captured before profile registration. */
export const retainedParallelMultiInstanceHistoryMeasurement:
  ParallelMultiInstanceHistoryMeasurement = Object.freeze({
    selectedMaximumItems: 16,
    maximumItemUtf8Bytes: 512,
    maximumCanonicalCollectionUtf8Bytes: 8_192,
    canonicalMaximumCollectionBytes: 8_192,
    exactLimitAdmitted: true,
    limitPlusOneRefusedWithoutMutation: true,
    topologies: [
      measured(ParallelMultiInstanceCapacityTopology.Natural, 83_558, 128_614),
      measured(
        ParallelMultiInstanceCapacityTopology.TimerInterruption,
        83_598,
        128_654,
      ),
      measured(
        ParallelMultiInstanceCapacityTopology.EarlyCompletion,
        83_598,
        128_654,
      ),
    ],
  });

/** Deterministic service facts plus non-authoritative pinned History-size observations. */
export const retainedParallelMultiInstanceServiceHistoryMeasurement:
  ParallelMultiInstanceServiceHistoryMeasurement = Object.freeze({
    state: "measured",
    environment: {
      temporalCliVersion: "v1.8.1",
      temporalServerVersion: "1.31.2",
      temporalSdkVersion: "1.21.0",
    },
    separator: {
      selectedMaximumItems: 16,
      maximumItemUtf8Bytes: 512,
      maximumCanonicalCollectionUtf8Bytes: 8_192,
      canonicalMaximumCollectionBytes: 8_192,
      exactLimitAdmitted: true,
      limitPlusOneRefusedWithoutMutation: true,
    },
    topologies: [
      retainedServiceTopology(
        ParallelMultiInstanceCapacityTopology.Natural,
        0,
        [
          ["open", 7, 14_752, 13_490],
          ["complete-1", 12, 16_693, 921],
          ["complete-2", 17, 18_639, 925],
          ["complete-3", 22, 20_585, 925],
          ["complete-4", 27, 22_531, 925],
          ["complete-5", 32, 24_477, 925],
          ["complete-6", 37, 26_423, 925],
          ["complete-7", 42, 28_368, 923],
          ["complete-8", 47, 30_306, 922],
          ["complete-9", 52, 32_245, 922],
          ["complete-10", 57, 34_184, 922],
          ["complete-11", 62, 36_123, 922],
          ["complete-12", 67, 38_062, 922],
          ["complete-13", 72, 40_001, 922],
          ["complete-14", 77, 41_940, 922],
          ["complete-15", 82, 43_879, 922],
          ["terminal", 89, 65_948, 19_991],
        ],
        [89, 65_948, 384_535, 7, 19_991],
        [1, 51, 1, 1, 16, 16, 1, 1, 0, 0, 1],
      ),
      retainedServiceTopology(
        ParallelMultiInstanceCapacityTopology.TimerInterruption,
        15,
        [
          ["open", 7, 14_772, 13_510],
          ["one-completed", 12, 16_733, 951],
          ["timer-fired", 16, 17_271, 9_068],
          ["stale-refused", 21, 19_236, 954],
          ["terminal", 27, 30_394, 9_705],
        ],
        [27, 30_394, 124_102, 7, 13_510],
        [1, 15, 1, 1, 3, 3, 1, 0, 1, 0, 1],
      ),
      retainedServiceTopology(
        ParallelMultiInstanceCapacityTopology.EarlyCompletion,
        15,
        [
          ["open", 7, 14_770, 13_508],
          ["terminal", 14, 26_211, 9_351],
        ],
        [14, 26_211, 70_852, 7, 13_508],
        [1, 6, 1, 1, 1, 1, 1, 1, 0, 0, 1],
      ),
    ],
  } as const);

/** Validates that every required maximal topology fits the existing production reserves. */
export function requireParallelMultiInstanceHistoryCapacity(
  measurement: ParallelMultiInstanceHistoryMeasurement =
    retainedParallelMultiInstanceHistoryMeasurement,
): ParallelMultiInstanceHistoryCapacity {
  if (
    measurement.selectedMaximumItems !== parallelMultiInstanceLimits.maximumItems ||
    measurement.maximumItemUtf8Bytes !==
      parallelMultiInstanceLimits.maximumItemUtf8Bytes ||
    measurement.maximumCanonicalCollectionUtf8Bytes !==
      parallelMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes ||
    measurement.canonicalMaximumCollectionBytes !==
      parallelMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes ||
    measurement.exactLimitAdmitted !== true ||
    measurement.limitPlusOneRefusedWithoutMutation !== true
  ) {
    throw new TypeError("parallel Multi-Instance capacity separator changed");
  }
  const expected = Object.values(ParallelMultiInstanceCapacityTopology);
  if (measurement.topologies.length !== expected.length ||
      measurement.topologies.some((entry, index) =>
        entry.topology !== expected[index] ||
        entry.itemCount !== measurement.selectedMaximumItems ||
        !positiveSafe(entry.maximumCommittedTransitions) ||
        !positiveSafe(entry.maximumActivationEvents) ||
        !positiveSafe(entry.maximumActivationPayloadBytes) ||
        !positiveSafe(entry.maximumHistoryEnvelopeBytes))) {
    throw new TypeError("parallel Multi-Instance capacity topology changed");
  }
  const margin = requireWorkflowChainEventHistoryMargin();
  const maximumMeasuredActivationEvents = Math.max(
    ...measurement.topologies.map(({ maximumActivationEvents }) =>
      maximumActivationEvents),
  );
  const maximumMeasuredActivationPayloadBytes = Math.max(
    ...measurement.topologies.map(({ maximumActivationPayloadBytes }) =>
      maximumActivationPayloadBytes),
  );
  const maximumMeasuredHistoryEnvelopeBytes = Math.max(
    ...measurement.topologies.map(({ maximumHistoryEnvelopeBytes }) =>
      maximumHistoryEnvelopeBytes),
  );
  if (
    maximumMeasuredActivationEvents > margin.reservedEvents ||
    maximumMeasuredHistoryEnvelopeBytes > margin.reservedBytes
  ) {
    throw new RangeError(
      "parallel Multi-Instance maximal activation exceeds the Event History reserve",
    );
  }
  return {
    selectedMaximumItems: measurement.selectedMaximumItems,
    activationEventReserve: margin.reservedEvents,
    activationByteReserve: margin.reservedBytes,
    maximumMeasuredActivationEvents,
    maximumMeasuredActivationPayloadBytes,
    maximumMeasuredHistoryEnvelopeBytes,
  };
}

/** Validates actual pinned-service History and activation measurements. */
export function requireParallelMultiInstanceServiceHistoryCapacity(
  measurement: ParallelMultiInstanceServiceHistoryMeasurement =
    retainedParallelMultiInstanceServiceHistoryMeasurement,
): ParallelMultiInstanceServiceHistoryCapacity {
  if (
    measurement.state !== "measured" ||
    measurement.environment.temporalCliVersion !== "v1.8.1" ||
    measurement.environment.temporalServerVersion !== "1.31.2" ||
    measurement.environment.temporalSdkVersion !== "1.21.0"
  ) {
    throw new TypeError("parallel Multi-Instance service environment changed");
  }
  const separator = measurement.separator;
  if (
    separator.selectedMaximumItems !== parallelMultiInstanceLimits.maximumItems ||
    separator.maximumItemUtf8Bytes !==
      parallelMultiInstanceLimits.maximumItemUtf8Bytes ||
    separator.maximumCanonicalCollectionUtf8Bytes !==
      parallelMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes ||
    separator.canonicalMaximumCollectionBytes !==
      parallelMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes ||
    !separator.exactLimitAdmitted ||
    !separator.limitPlusOneRefusedWithoutMutation
  ) {
    throw new TypeError("parallel Multi-Instance service separator changed");
  }
  const expected = [
    [ParallelMultiInstanceCapacityTopology.Natural, 0],
    [ParallelMultiInstanceCapacityTopology.TimerInterruption, 15],
    [ParallelMultiInstanceCapacityTopology.EarlyCompletion, 15],
  ] as const;
  if (measurement.topologies.length !== expected.length) {
    throw new TypeError("parallel Multi-Instance service topology count changed");
  }
  const runs: ParallelMultiInstanceServiceHistoryRun[] = [];
  for (const [index, topology] of measurement.topologies.entries()) {
    const expectedTopology = expected[index];
    if (
      expectedTopology === undefined ||
      topology.topology !== expectedTopology[0] ||
      topology.activeChildrenAtDecision !== expectedTopology[1] ||
      topology.itemCount !== separator.selectedMaximumItems ||
      topology.runs.length !== 1 ||
      topology.runs[0]?.runOrdinal !== 1
    ) {
      throw new TypeError("parallel Multi-Instance service topology changed");
    }
    requireServiceRun(topology.runs[0]);
    runs.push(topology.runs[0]);
  }
  const eventTrigger = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryEvents,
  );
  const byteTrigger = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryBytes,
  );
  const margin = requireWorkflowChainEventHistoryMargin();
  for (const run of runs) {
    if (
      run.finalEventCount >= eventTrigger ||
      run.conservativeFinalHistoryEnvelopeBytes >= byteTrigger ||
      run.maximumActivationEvents > margin.reservedEvents ||
      run.maximumActivationCanonicalPayloadBytes +
          run.maximumActivationEvents * workflowChainHistoryEventEnvelopeBytes >
        margin.reservedBytes
    ) {
      throw new RangeError("parallel Multi-Instance service capacity exceeded");
    }
  }
  return {
    selectedMaximumItems: separator.selectedMaximumItems,
    eventTrigger,
    byteTrigger,
    activationEventReserve: margin.reservedEvents,
    activationByteReserve: margin.reservedBytes,
    maximumMeasuredRunEvents: Math.max(...runs.map((run) => run.finalEventCount)),
    maximumMeasuredRunBytes: Math.max(
      ...runs.map((run) => run.conservativeFinalHistoryEnvelopeBytes),
    ),
    maximumMeasuredActivationEvents: Math.max(
      ...runs.map((run) => run.maximumActivationEvents),
    ),
    maximumMeasuredActivationPayloadBytes: Math.max(
      ...runs.map((run) => run.maximumActivationCanonicalPayloadBytes),
    ),
  };
}

function requireServiceRun(run: ParallelMultiInstanceServiceHistoryRun): void {
  if (run.checkpoints.length < 2) {
    throw new TypeError("parallel Multi-Instance service checkpoints are absent");
  }
  let previousLength = 0;
  let previousSize = 0;
  for (const checkpoint of run.checkpoints) {
    if (
      checkpoint.label.length === 0 ||
      !positiveSafe(checkpoint.historyLength) ||
      !positiveSafe(checkpoint.historySize) ||
      !positiveSafe(checkpoint.canonicalActivationPayloadBytes) ||
      checkpoint.historyLength <= previousLength ||
      checkpoint.historySize < previousSize
    ) {
      throw new TypeError("parallel Multi-Instance service checkpoint changed");
    }
    previousLength = checkpoint.historyLength;
    previousSize = checkpoint.historySize;
  }
  const last = run.checkpoints.at(-1)!;
  const maximumActivationEvents = Math.max(
    ...run.checkpoints.map((checkpoint, index) =>
      checkpoint.historyLength - (run.checkpoints[index - 1]?.historyLength ?? 0)
    ),
  );
  const maximumPayloadBytes = Math.max(
    ...run.checkpoints.map((checkpoint) => checkpoint.canonicalActivationPayloadBytes),
  );
  const eventFamilyTotal = Object.values(ParallelMultiInstanceHistoryEventFamily)
    .reduce((total, family) => total + run.eventFamilies[family], 0);
  if (
    last.historyLength !== run.finalEventCount ||
    last.historySize !== run.finalHistorySize ||
    run.finalHistorySize > run.conservativeFinalHistoryEnvelopeBytes ||
    run.maximumActivationEvents !== maximumActivationEvents ||
    run.maximumActivationCanonicalPayloadBytes !== maximumPayloadBytes ||
    eventFamilyTotal !== run.finalEventCount
  ) {
    throw new TypeError("parallel Multi-Instance service History facts disagree");
  }
}

function retainedServiceTopology(
  topology: ParallelMultiInstanceCapacityTopology,
  activeChildrenAtDecision: number,
  checkpoints: readonly RetainedServiceCheckpoint[],
  final: RetainedServiceFinal,
  families: RetainedServiceFamilies,
) {
  return {
    topology,
    itemCount: 16,
    activeChildrenAtDecision,
    runs: [{
      runOrdinal: 1,
      checkpoints: checkpoints.map((checkpoint) => ({
        label: checkpoint[0],
        historyLength: checkpoint[1],
        historySize: checkpoint[2],
        canonicalActivationPayloadBytes: checkpoint[3],
      })),
      finalEventCount: final[0],
      finalHistorySize: final[1],
      conservativeFinalHistoryEnvelopeBytes: final[2],
      maximumActivationEvents: final[3],
      maximumActivationCanonicalPayloadBytes: final[4],
      eventFamilies: {
        workflowExecutionStarted: families[0],
        workflowTask: families[1],
        patchMarker: families[2],
        searchAttributeUpsert: families[3],
        updateAccepted: families[4],
        updateCompleted: families[5],
        timerStarted: families[6],
        timerCanceled: families[7],
        timerFired: families[8],
        continuedAsNew: families[9],
        terminalCompleted: families[10],
      },
    }],
  } as const;
}

type RetainedServiceCheckpoint = readonly [string, number, number, number];
type RetainedServiceFinal = readonly [number, number, number, number, number];
type RetainedServiceFamilies = readonly [
  number, number, number, number, number, number, number, number, number,
  number, number,
];

function measured(
  topology: ParallelMultiInstanceCapacityTopology,
  maximumActivationPayloadBytes: number,
  maximumHistoryEnvelopeBytes: number,
) {
  return {
    topology,
    itemCount: 16,
    maximumCommittedTransitions: 3,
    maximumActivationEvents: 11,
    maximumActivationPayloadBytes,
    maximumHistoryEnvelopeBytes,
  } as const;
}

function positiveSafe(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
