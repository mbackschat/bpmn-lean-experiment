/** Run-local semantic-command admission budgets for the production Workflow chain. */
import {
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import type {
  WorkflowChainObservedCapacityBound,
} from "./workflow-chain-capacity.js";

export type WorkflowCommandCapacityLimits = Readonly<{
  semanticStimulusBytes: number;
  semanticInputQueueEntries: number;
  semanticInputQueueBytes: number;
  acceptedUpdatesPerRun: number;
  concurrentInFlightUpdates: number;
}>;

export type WorkflowCommandCapacitySnapshot = Readonly<{
  acceptedUpdates: number;
  inFlightUpdates: number;
  queuedStimuli: number;
  queuedCanonicalUtf8Bytes: number;
  rolloverRequested: boolean;
}>;

export enum WorkflowCommandCapacityPreflightKind {
  Ready = "ready",
  Rollover = "rollover",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowCommandCapacityPreflight =
  | Readonly<{
      kind: WorkflowCommandCapacityPreflightKind.Ready;
    }>
  | Readonly<{
      kind: WorkflowCommandCapacityPreflightKind.Rollover;
      bound: WorkflowChainObservedCapacityBound;
    }>
  | Readonly<{
      kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded;
      failure: WorkflowChainObservedCapacityBound;
    }>;

type QueuedStimulus = Readonly<{
  encoding: string;
  canonicalUtf8Bytes: number;
}>;

const ready = Object.freeze({
  kind: WorkflowCommandCapacityPreflightKind.Ready,
} as const);

/**
 * Owns one Run's transient queue and Update counters.
 *
 * The state is deliberately not carried across Continue-As-New. Exact boundary fills request a
 * rollover, while an Update that arrives during transient queue or handler pressure is rejected
 * before acceptance. Signals and derived inputs use `reserveStimulus`, because they cannot return
 * that refusal and therefore convert an overage into the chain's typed infrastructure failure.
 */
export class WorkflowCommandCapacityState {
  readonly #limits: WorkflowCommandCapacityLimits;
  readonly #queued = new Map<string, QueuedStimulus>();
  #queuedCanonicalUtf8Bytes = 2;
  #acceptedUpdates = 0;
  #inFlightUpdates = 0;
  #rolloverBound: WorkflowChainObservedCapacityBound | null = null;

  constructor(limits: WorkflowCommandCapacityLimits = productionLimits()) {
    this.#limits = requireLimits(limits);
  }

  snapshot(): WorkflowCommandCapacitySnapshot {
    return {
      acceptedUpdates: this.#acceptedUpdates,
      inFlightUpdates: this.#inFlightUpdates,
      queuedStimuli: this.#queued.size,
      queuedCanonicalUtf8Bytes: this.#queuedCanonicalUtf8Bytes,
      rolloverRequested: this.#rolloverBound !== null,
    };
  }

  rolloverRequested(): boolean {
    return this.#rolloverBound !== null;
  }

  preflightStimulus(stimulus: Stimulus): WorkflowCommandCapacityPreflight {
    const observedValue = workflowChainCanonicalUtf8ByteLength(stimulus);
    const failure = countBound(
      WorkflowChainBudgetKind.SemanticStimulusBytes,
      this.#limits.semanticStimulusBytes,
      observedValue,
    );
    return failure === null
      ? ready
      : {
          kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded,
          failure,
        };
  }

  preflightUpdate(
    stimulus: Stimulus,
    reserveQueue = true,
  ): WorkflowCommandCapacityPreflight {
    if (this.#rolloverBound !== null) {
      return {
        kind: WorkflowCommandCapacityPreflightKind.Rollover,
        bound: { ...this.#rolloverBound },
      };
    }
    const accepted = countBound(
      WorkflowChainBudgetKind.AcceptedUpdatesPerRun,
      this.#limits.acceptedUpdatesPerRun,
      this.#acceptedUpdates + 1,
    );
    if (accepted !== null) {
      return rollover(accepted);
    }
    const inFlight = countBound(
      WorkflowChainBudgetKind.ConcurrentInFlightUpdates,
      this.#limits.concurrentInFlightUpdates,
      this.#inFlightUpdates + 1,
    );
    if (inFlight !== null) {
      return rollover(inFlight);
    }
    if (!reserveQueue) {
      return ready;
    }
    const reservation = this.#inspectReservation(stimulus);
    if (reservation === null) {
      return ready;
    }
    return reservation.budget === WorkflowChainBudgetKind.SemanticStimulusBytes
      ? {
          kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded,
          failure: reservation,
        }
      : rollover(reservation);
  }

  beginUpdate(
    stimulus: Stimulus,
    reserveQueue = true,
  ): WorkflowCommandCapacityPreflight {
    const preflight = this.preflightUpdate(stimulus, reserveQueue);
    if (preflight.kind !== WorkflowCommandCapacityPreflightKind.Ready) {
      return preflight;
    }
    this.#acceptedUpdates += 1;
    this.#inFlightUpdates += 1;
    if (reserveQueue) {
      const reservation = this.#reserve(stimulus);
      if (reservation !== null) {
        throw new TypeError("Update capacity changed after its synchronous preflight");
      }
    }
    this.#requestRolloverAtExactBoundary(
      WorkflowChainBudgetKind.AcceptedUpdatesPerRun,
      this.#limits.acceptedUpdatesPerRun,
      this.#acceptedUpdates,
    );
    return ready;
  }

  finishUpdate(): void {
    if (this.#inFlightUpdates < 1) {
      throw new TypeError("Workflow Update capacity has no in-flight handler");
    }
    this.#inFlightUpdates -= 1;
  }

  reserveStimulus(stimulus: Stimulus): WorkflowCommandCapacityPreflight {
    const failure = this.#reserve(stimulus);
    return failure === null
      ? ready
      : {
          kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded,
          failure,
        };
  }

  releaseStimulus(stimulus: Stimulus): void {
    const commandId = stimulusCommandId(stimulus);
    const queued = this.#queued.get(commandId);
    if (queued === undefined) {
      throw new TypeError(`Semantic input ${commandId} has no queue reservation`);
    }
    if (queued.encoding !== canonicalWorkflowChainJson(stimulus)) {
      throw new TypeError(`Semantic input ${commandId} changed while queued`);
    }
    this.#queued.delete(commandId);
    this.#queuedCanonicalUtf8Bytes -= queued.canonicalUtf8Bytes;
    if (this.#queued.size > 0) {
      this.#queuedCanonicalUtf8Bytes -= 1;
    }
  }

  #reserve(stimulus: Stimulus): WorkflowChainObservedCapacityBound | null {
    const commandId = stimulusCommandId(stimulus);
    const encoding = canonicalWorkflowChainJson(stimulus);
    const queued = this.#queued.get(commandId);
    if (queued !== undefined) {
      if (queued.encoding !== encoding) {
        throw new TypeError(`Semantic input ${commandId} has a queued command identity conflict`);
      }
      return null;
    }
    const failure = this.#inspectReservation(stimulus);
    if (failure !== null) {
      return failure;
    }
    const canonicalUtf8Bytes = workflowChainCanonicalUtf8ByteLength(stimulus);
    this.#queued.set(commandId, { encoding, canonicalUtf8Bytes });
    this.#queuedCanonicalUtf8Bytes += canonicalUtf8Bytes +
      (this.#queued.size === 1 ? 0 : 1);
    this.#requestRolloverAtExactBoundary(
      WorkflowChainBudgetKind.SemanticInputQueueEntries,
      this.#limits.semanticInputQueueEntries,
      this.#queued.size,
    );
    this.#requestRolloverAtExactBoundary(
      WorkflowChainBudgetKind.SemanticInputQueueBytes,
      this.#limits.semanticInputQueueBytes,
      this.#queuedCanonicalUtf8Bytes,
    );
    return null;
  }

  #inspectReservation(
    stimulus: Stimulus,
  ): WorkflowChainObservedCapacityBound | null {
    const commandId = stimulusCommandId(stimulus);
    const encoding = canonicalWorkflowChainJson(stimulus);
    const queued = this.#queued.get(commandId);
    if (queued !== undefined) {
      if (queued.encoding !== encoding) {
        throw new TypeError(`Semantic input ${commandId} has a queued command identity conflict`);
      }
      return null;
    }
    const stimulusPreflight = this.preflightStimulus(stimulus);
    if (
      stimulusPreflight.kind ===
        WorkflowCommandCapacityPreflightKind.CapacityExceeded
    ) {
      return stimulusPreflight.failure;
    }
    const stimulusBytes = workflowChainCanonicalUtf8ByteLength(stimulus);
    const queueEntries = countBound(
      WorkflowChainBudgetKind.SemanticInputQueueEntries,
      this.#limits.semanticInputQueueEntries,
      this.#queued.size + 1,
    );
    if (queueEntries !== null) {
      return queueEntries;
    }
    return countBound(
      WorkflowChainBudgetKind.SemanticInputQueueBytes,
      this.#limits.semanticInputQueueBytes,
      this.#queuedCanonicalUtf8Bytes + stimulusBytes +
        (this.#queued.size === 0 ? 0 : 1),
    );
  }

  #requestRolloverAtExactBoundary(
    budget: WorkflowChainBudgetKind,
    configuredBound: number,
    observedValue: number,
  ): void {
    if (this.#rolloverBound === null && observedValue === configuredBound) {
      this.#rolloverBound = { budget, configuredBound, observedValue };
    }
  }
}

function rollover(
  bound: WorkflowChainObservedCapacityBound,
): WorkflowCommandCapacityPreflight {
  return {
    kind: WorkflowCommandCapacityPreflightKind.Rollover,
    bound,
  };
}

function countBound(
  budget: WorkflowChainBudgetKind,
  configuredBound: number,
  observedValue: number,
): WorkflowChainObservedCapacityBound | null {
  return observedValue <= configuredBound
    ? null
    : { budget, configuredBound, observedValue };
}

function productionLimits(): WorkflowCommandCapacityLimits {
  return {
    semanticStimulusBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.SemanticStimulusBytes,
    ),
    semanticInputQueueEntries: workflowChainProductionLimit(
      WorkflowChainBudgetKind.SemanticInputQueueEntries,
    ),
    semanticInputQueueBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.SemanticInputQueueBytes,
    ),
    acceptedUpdatesPerRun: workflowChainProductionLimit(
      WorkflowChainBudgetKind.AcceptedUpdatesPerRun,
    ),
    concurrentInFlightUpdates: workflowChainProductionLimit(
      WorkflowChainBudgetKind.ConcurrentInFlightUpdates,
    ),
  };
}

function requireLimits(
  limits: WorkflowCommandCapacityLimits,
): WorkflowCommandCapacityLimits {
  const entries = [
    ["semanticStimulusBytes", WorkflowChainBudgetKind.SemanticStimulusBytes],
    ["semanticInputQueueEntries", WorkflowChainBudgetKind.SemanticInputQueueEntries],
    ["semanticInputQueueBytes", WorkflowChainBudgetKind.SemanticInputQueueBytes],
    ["acceptedUpdatesPerRun", WorkflowChainBudgetKind.AcceptedUpdatesPerRun],
    ["concurrentInFlightUpdates", WorkflowChainBudgetKind.ConcurrentInFlightUpdates],
  ] as const;
  for (const [name, budget] of entries) {
    const value = limits[name];
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} limit must be a positive safe integer`);
    }
    if (value > workflowChainProductionLimit(budget)) {
      throw new RangeError(`${name} limit exceeds production`);
    }
  }
  if (limits.semanticInputQueueBytes < 2) {
    throw new RangeError("semanticInputQueueBytes limit cannot encode an empty queue");
  }
  return { ...limits };
}
