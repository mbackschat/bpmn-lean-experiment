/**
 * A host scheduler's activation-tagged callback record, its wake condition, and its batch boundary.
 *
 * Two managed-wait families share exactly this much: tag each callback with the activation that
 * produced it, close that activation before classifying, and hand back one activation's worth. Which
 * callback kinds may not share an activation, and under which failure identity, deliberately stays
 * with each family — the mechanisms coincide, the semantic claims do not, and an operator must be able
 * to tell which contract is unavailable.
 */
import { condition, workflowInfo } from "@temporalio/workflow";

import { firstActivationBatch } from "./activation-batch.js";
import type { ActivationTagged } from "./activation-batch.js";
import { hostInvariantFailure } from "./host-invariant.js";

/** Whether the activation-closing drain runs. `RemovedMutation` withholds it as a barrier probe. */
export const ActivationDrain = {
  Required: "required",
  RemovedMutation: "removedMutation",
} as const;

export type ActivationDrain =
  typeof ActivationDrain[keyof typeof ActivationDrain];

export type ActivationTaggedReadiness<T> = Readonly<{
  record: (item: T) => void;
  recordFailure: (error: unknown) => void;
  /** One activation's callbacks, or a rethrow of a failure recorded while waiting. */
  takeBatch: () => Promise<ReadonlyArray<T>>;
}>;

/**
 * @param drain whether to close the activation before classifying; only a probe withholds it.
 * @param emptyWakeMessage the family's invariant message for waking with nothing classified.
 */
export function createActivationTaggedReadiness<T>(
  drain: ActivationDrain,
  emptyWakeMessage: string,
): ActivationTaggedReadiness<T> {
  let recorded: ReadonlyArray<ActivationTagged<T>> = [];
  let failure: unknown;

  return {
    record(item) {
      recorded = [
        ...recorded,
        { activation: workflowInfo().historyLength, item },
      ];
    },

    recordFailure(error) {
      failure = error;
    },

    async takeBatch() {
      await condition(() => recorded.length > 0 || failure !== undefined);
      if (failure !== undefined) {
        throw failure;
      }
      // The drain must stay inline. Awaiting a helper that decides whether to yield yields anyway,
      // because the await on its promise is itself a microtask boundary — which silently reinstates
      // the barrier the removal probe exists to withhold.
      switch (drain) {
        case ActivationDrain.Required:
          // Closes the activation before classifying, so a callback delivered in the same batch is
          // counted with its own batch rather than appearing in the next one.
          await Promise.resolve();
          break;
        case ActivationDrain.RemovedMutation:
          break;
        default:
          return assertNever(drain);
      }
      const classified = firstActivationBatch(recorded);
      if (classified === undefined) {
        throw hostInvariantFailure(emptyWakeMessage);
      }
      recorded = classified.remaining;
      return classified.batch;
    },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported activation drain: ${String(value)}`);
}
