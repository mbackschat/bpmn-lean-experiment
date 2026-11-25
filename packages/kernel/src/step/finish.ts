/**
 * The finish of a Multi-Instance body and a compensation run's readiness, transcribed from `Kernel/Step/Finish.lean`:
 * which unit a body's finish and a run's readiness work run as (DC30). The instance whose completion makes a body finish
 * is the one the closure ran last among its siblings, so a finish run in that instance's unit is keyed by the order the
 * closure ran them in (probe P11). Under `BranchSchedule.orderInvariant` the finish therefore runs under the body's
 * finish root (`finishUnit`), keyed by the scope occurrence holding the body's instances, the body's element and the
 * number of the body's finishes the closure queued before it: `conclude` in `step.ts` queues it there, and `absorb` never
 * runs it in place. A compensation run's end, and the start of a handler that waits for two or more others, likewise
 * lands in whichever handler's completion ran last (probe P17 W2, W3), so `feature/compensation.ts` queues it as
 * `Signal.compensationReady`, which runs under the run's readiness root (`readyUnit`).
 */
import { BranchSchedule, assertNever } from "../il/types.js";
import {
  SemanticCause, committed, compareUnitKey, finishUnit, lookupRun, orderedHas, readyUnit, runAnchor, runHolds, semanticFailure,
  type MultiInstanceRun, type Result, type State, type UnitKey,
} from "../state.js";
import type { Ctx } from "../hooks.js";
import type { SignalRun } from "./stale.js";

/**
 * Lean's `finishOf?`: the record of the Multi-Instance body a queued signal's work completes, under `orderInvariant`: the
 * body's finish. Under `declarationDepthFirst` the finish stays in the completing unit, where CIB leaves the body in the
 * operation that ends its last instance (`ParallelMultiInstanceActivityBehavior:84-96`).
 */
export function finishOf(ctx: Ctx, state: State, work: SignalRun): MultiInstanceRun | null {
  switch (ctx.program.options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return null;
    case BranchSchedule.OrderInvariant: {
      const [body, ...rest] = work.acts;
      return work.completion && body !== undefined && rest.length === 0
        ? lookupRun(state.slots.multiInstances, body) : null;
    }
  }
  return assertNever(ctx.program.options.branchSchedule);
}

/**
 * Lean's `finishKey?`: the key a queued signal runs under instead of its index in the running batch, a body's finish its
 * finish root at the least ordinal neither queued nor run (`finishOrdinal`), `null` for every other signal. It reads no
 * unit, so the finish's key is the same whichever unit queued it.
 */
export function finishKey(ctx: Ctx, state: State, work: SignalRun): Result<UnitKey | null> {
  const run = finishOf(ctx, state, work);
  if (run === null) return committed(null);
  const key = freeKey(state, (ordinal) => finishUnit(state.issued, run.scope, run.element, ordinal));
  return key === null ? semanticFailure(SemanticCause.Invariant, "finish-unit-unkeyed") : committed(key);
}

/** Lean's `freeOrdinal`: the group key `key` names at the least ordinal neither queued nor run in the closure. */
function freeKey(state: State, key: (ordinal: number) => UnitKey | null): UnitKey | null {
  const taken = (found: UnitKey | null): boolean => found !== null &&
    (orderedHas(state.queuedSignals, found, compareUnitKey) || orderedHas(state.transitions, found, compareUnitKey));
  let ordinal = 0;
  while (taken(key(ordinal))) ordinal += 1;
  return key(ordinal);
}

/**
 * Lean's `readyKey?`: the key a compensation run's readiness signal runs under, the run's readiness root at the least
 * ordinal neither queued nor run (`readyUnit`, `runAnchor`), `null` for every other signal; a readiness without its run,
 * or without a key, is an invariant failure. It reads no unit, so the work runs under one key whichever handler's
 * completion released it.
 */
function readyKey(state: State, work: SignalRun): Result<UnitKey | null> {
  if (work.ready === null) return committed(null);
  const [scope, context] = work.ready;
  const run = state.slots.compensation.runs.find(runHolds(scope, context));
  if (run === undefined) return semanticFailure(SemanticCause.Invariant, "ready-run-missing");
  const anchor = runAnchor(run);
  const key = freeKey(state, (ordinal) => readyUnit(state.issued, run.scope, anchor, ordinal));
  return key === null ? semanticFailure(SemanticCause.Invariant, "ready-unit-unkeyed") : committed(key);
}

/**
 * Lean's `groupKey?`: the group root a queued signal runs under instead of its index in the running batch, a body's
 * finish (`finishKey`) or a compensation run's readiness (`readyKey`), `null` for every other signal.
 */
export function groupKey(ctx: Ctx, state: State, work: SignalRun): Result<UnitKey | null> {
  const finish = finishKey(ctx, state, work);
  return !finish.ok || finish.value !== null ? finish : readyKey(state, work);
}
