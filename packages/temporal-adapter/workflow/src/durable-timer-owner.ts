/**
 * One host-owned durable timer for a committed semantic wait: armed once, withdrawn on a rival's win.
 *
 * The timer is owned in a cancellation scope rather than awaited inline. Awaiting it would park the
 * semantic loop, leaving a competing callback to be drained in whatever order the jobs happened to
 * land, which would make the host — not BPMN — choose the victor. Ownership is keyed on committed
 * state alone, so a replay recomputes the same key and never mistakes a replaced wait for the live one.
 */
import { CancellationScope, isCancellation } from "@temporalio/workflow";
import type { FireTimerStimulus, OpenTimer } from "@bpmn-lean/semantic-core";

import { durableTimerKey } from "@bpmn-lean/temporal-protocol";
import { hostInvariantFailure } from "./host-invariant.js";
import { timerFiringStimulus } from "@bpmn-lean/temporal-protocol";

/** A committed timer wait together with the host delay that remains before it is due. */
export type DurableTimer = Readonly<{
  id: OpenTimer["id"];
  deadlineMs: number;
  remainingMs: number;
}>;

/** The two ways a committed identity can contradict the live scope, in the family's own words. */
export type DurableTimerRefusals = Readonly<{
  /** A different identity reached arming while a scope was already live. */
  replaced: string;
  /** Committed state kept its managed wait but changed the identity behind it. */
  identityChanged: string;
}>;

export type DurableTimerHost = Readonly<{
  waitForTimer: (durationMs: number) => Promise<void>;
  refusals: DurableTimerRefusals;
  /** Reports the elapsed deadline as semantic input; the caller owns its activation tag. */
  onFiring: (stimulus: FireTimerStimulus) => void;
  /** Reports a non-cancellation host failure, which must reach the semantic loop rather than be lost. */
  onFailure: (error: unknown) => void;
}>;

export type DurableTimerOwner = Readonly<{
  /** Whether this Run currently owns a native Timer that cannot cross Continue-As-New. */
  hasArmedTimer: () => boolean;
  /** Arms this identity, or accepts it as already armed. Refuses a different live identity. */
  ensureArmed: (timer: DurableTimer) => void;
  /**
   * Reconciles the live scope against committed state: `undefined` means the managed wait is gone, so
   * an unfired scope is withdrawn rather than left to expire against a wait that no longer exists.
   */
  reconcile: (timer: DurableTimer | undefined) => void;
}>;

export function createDurableTimerOwner({
  waitForTimer,
  refusals,
  onFiring,
  onFailure,
}: DurableTimerHost): DurableTimerOwner {
  let armed: ArmedTimer | undefined;

  return {
    hasArmedTimer: () => armed !== undefined,

    ensureArmed(timer) {
      const key = durableTimerKey(timer);
      if (armed !== undefined) {
        if (armed.key !== key) {
          throw hostInvariantFailure(refusals.replaced);
        }
        return;
      }
      const scope = new CancellationScope({ cancellable: true });
      const scoped: ArmedTimer = { key, scope, fired: false };
      armed = scoped;
      void scope.run(() => waitForTimer(timer.remainingMs)).then(
        () => {
          // A withdrawn scope can still resolve, so a scope that is no longer the owned one must not
          // report a firing against the wait that replaced it.
          if (armed !== scoped) {
            return;
          }
          scoped.fired = true;
          onFiring(timerFiringStimulus(timer));
        },
        (error: unknown) => {
          if (!isCancellation(error)) {
            onFailure(error);
          }
        },
      );
    },

    reconcile(timer) {
      if (timer !== undefined) {
        if (armed !== undefined && armed.key !== durableTimerKey(timer)) {
          throw hostInvariantFailure(refusals.identityChanged);
        }
        return;
      }
      if (armed !== undefined) {
        if (!armed.fired) {
          armed.scope.cancel();
        }
        armed = undefined;
      }
    },
  };
}

type ArmedTimer = {
  key: string;
  scope: CancellationScope;
  fired: boolean;
};
