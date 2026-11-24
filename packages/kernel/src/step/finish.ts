/**
 * The finish of a Multi-Instance body, transcribed from `Kernel/Step/Finish.lean`: which unit a body's finish runs as
 * (DC30). The instance whose completion makes a body finish is the one the closure ran last among its siblings, so a
 * finish run in that instance's unit is keyed by the order the closure ran them in (probe P11). Under
 * `BranchSchedule.orderInvariant` the finish therefore runs under the body's finish root (`finishUnit`), keyed by the
 * scope occurrence holding the body's instances, the body's element and the number of the body's finishes the closure
 * queued before it: `conclude` in `step.ts` queues it there, and `absorb` never runs it in place.
 */
import { BranchSchedule, assertNever } from "../il/types.js";
import {
  SemanticCause, committed, compareUnitKey, finishUnit, orderedHas, semanticFailure, type MultiInstanceRun, type Result, type State,
  type UnitKey,
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
        ? state.slots.multiInstances.find((run) => run.occurrence === body) ?? null : null;
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
  const taken = (key: UnitKey | null): boolean =>
    key !== null && (orderedHas(state.queuedSignals, key, compareUnitKey) || orderedHas(state.transitions, key, compareUnitKey));
  let ordinal = 0;
  while (taken(finishUnit(state.issued, run.scope, run.element, ordinal))) ordinal += 1;
  const key = finishUnit(state.issued, run.scope, run.element, ordinal);
  return key === null ? semanticFailure(SemanticCause.Invariant, "finish-unit-unkeyed") : committed(key);
}
