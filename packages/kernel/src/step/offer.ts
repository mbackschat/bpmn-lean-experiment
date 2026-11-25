/**
 * The parked joins a quiescent closure offers again, transcribed from `Kernel/Step/Offer.lean`: which parked join
 * `settle` in `step.ts` fires once no signal, token or idle scope occurrence is left (`reoffer`): the order it offers the
 * parked arrivals' joins in, the arrival it offers each join slot, and the unit key the offer runs as. Under
 * `BranchSchedule.orderInvariant` every join fires here as its slot's own unit (DC16), so each choice reads the join slot
 * and order positions, never the parking order; under `declarationDepthFirst` a Parallel join fires in place and the
 * offers keep parking order.
 */
import {
  BranchSchedule, assertNever, compareStrings, elementGateway, mergeSort, programElement, programTarget, type ElementId,
} from "../il/types.js";
import {
  SemanticCause, committed, compareScopeOccurrenceId, issuerFor, occurrenceOf, offersOccurrence, offerUnit, orderedCount,
  parkedLeastBy, semanticFailure, type OccurrenceId, type Parked, type Result, type ScopeOccurrenceId, type State,
  type UnitKey,
} from "../state.js";
import { ctxPositionLe, type Ctx, type Hooks } from "../hooks.js";

export type Reoffered = Readonly<{ gateway: ElementId; scope: ScopeOccurrenceId; occurrence: OccurrenceId; unit: UnitKey; state: State }>;

/**
 * Lean's `offerRound`: how many times the closure already offered the parked occurrence `occurrence` (`offerUnit`): the
 * offer units among its transitions, a count, which reads no order.
 */
export function offerRound(state: State, occurrence: OccurrenceId): number {
  return orderedCount(state.transitions, (unit) => offersOccurrence(state.issued, occurrence, unit));
}

/**
 * Lean's `slotOffer`: the arrival a join slot is offered among `slot`, the arrivals parked on one join in one scope
 * occurrence: under `declarationDepthFirst` the latest parked; under `orderInvariant` the one of greatest order position,
 * so the offer, and the unit it runs as, are the slot's whatever order the closure parked them in (DC16).
 */
function slotOffer(ctx: Ctx, state: State, slot: readonly Parked[]): Parked | null {
  const schedule = ctx.program.options.branchSchedule;
  switch (schedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return slot.at(-1) ?? null;
    case BranchSchedule.OrderInvariant: {
      const le = ctxPositionLe(ctx, state);
      return parkedLeastBy((left, right) => le(right, left), slot);
    }
  }
  return assertNever(schedule);
}

/**
 * Lean's `offerParked`: the offer of the parked arrival `waiting` when no arrival parked before it fired (`reoffer`): its
 * join is offered the arrival `slotOffer` picks among those parked on that join in that scope occurrence, under the
 * offer's unit, and fires when the offer queues a signal, `null` when it does not; a parked flow leading to no gateway is
 * an invariant failure.
 */
function offerParked(hooks: Hooks, ctx: Ctx, state: State, waiting: Parked): Result<Reoffered | null> {
  const target = programTarget(ctx.program, waiting.flow);
  const element = target === null ? null : programElement(ctx.program, target);
  const gateway = element === null ? null : elementGateway(element);
  const offeredArrival = slotOffer(ctx, state, state.slots.parked
    .filter((other) => other.scope === waiting.scope && programTarget(ctx.program, other.flow) === target));
  const occurrence = offeredArrival === null ? null : occurrenceOf(state, offeredArrival.occurrence);
  if (gateway === null || occurrence === null) return semanticFailure(SemanticCause.Invariant, "parked-without-gateway");
  // the offer's issues are its unit's, so its key is the one `settle` runs it under (DC12)
  const unit = offerUnit(state.issued, occurrence.id, offerRound(state, occurrence.id));
  if (unit === null) return semanticFailure(SemanticCause.Invariant, "offer-unit-unkeyed");
  const offered = hooks.arriveGateway(ctx, gateway[0], gateway[1], occurrence, { ...state, issuing: issuerFor(state, unit), issueNext: 0 });
  if (!offered.ok) return offered;
  return committed(offered.value.batchSignals.length === 0 ? null
    : { gateway: gateway[0].id, scope: waiting.scope, occurrence: occurrence.id, unit, state: offered.value });
}

/**
 * Lean's `offerOrder`: the order `reoffer` offers the parked arrivals' joins in: under `declarationDepthFirst` parking
 * order; under `orderInvariant` by join slot, its scope occurrence and then its gateway, since parking order is the order
 * the closure ran the arrivals in and which ready join fires first decides what the next firing sees (DC16).
 */
function offerOrder(ctx: Ctx, parked: readonly Parked[]): readonly Parked[] {
  const schedule = ctx.program.options.branchSchedule;
  switch (schedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return parked;
    case BranchSchedule.OrderInvariant: {
      const gateway = (waiting: Parked): string => programTarget(ctx.program, waiting.flow) ?? "";
      return mergeSort(parked, (left, right) =>
        (compareScopeOccurrenceId(left.scope, right.scope) || compareStrings(gateway(left), gateway(right))) <= 0);
    }
  }
  return assertNever(schedule);
}

/**
 * The first parked join that fires when it is offered again, with its scope occurrence, its offer's unit and the state it
 * leaves. Table 13.3 activates an Inclusive join by the state, not by an arrival, and `settle` offers the parked joins
 * only once no signal, token or idle scope occurrence is left, so `positions` in `Feature.Flow` sees every position: a
 * completion still queued is no position it can see. Each join is offered one parked occurrence (`slotOffer`), in
 * `offerOrder`. Under `declarationDepthFirst` a Parallel join is ready only on an arrival, so offering it never fires it;
 * under `orderInvariant` every join fires here (`parksOnly` in `Feature.Flow`).
 */
export function reoffer(hooks: Hooks, ctx: Ctx, state: State): Result<Reoffered | null> {
  for (const waiting of offerOrder(ctx, state.slots.parked)) {
    const offered = offerParked(hooks, ctx, state, waiting);
    if (!offered.ok || offered.value !== null) return offered;
  }
  return committed(null);
}
