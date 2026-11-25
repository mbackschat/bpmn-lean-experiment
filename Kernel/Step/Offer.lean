module

public import Kernel.Hooks

/-! # Step: the parked joins a quiescent closure offers again

Which parked join `Kernel.Step.settle` fires once no signal, token or idle scope occurrence is left (`reoffer?`): the
order it offers the parked arrivals' joins in, the arrival it offers each join slot, and the unit key the offer runs as.
Under `BranchSchedule.orderInvariant` every join fires here as its slot's own unit (DC16), so each choice reads the
join slot and order positions, never the parking order; under `declarationDepthFirst` a Parallel join fires in place
and the offers keep parking order.
-/

public section

namespace Kernel.Step

/-- How many times the closure already offered the parked occurrence `occurrence` (`UnitKey.offerUnit?`): the offer
units among its transitions, a count, which reads no order. -/
def offerRound (state : State) (occurrence : OccurrenceId) : Nat :=
  (state.transitions.filter fun unit _ => UnitKey.offers occurrence unit).size

/-- The arrival a join slot is offered among `slot`, the arrivals parked on one join in one scope occurrence: under
`declarationDepthFirst` the latest parked; under `orderInvariant` the one of greatest order position, so the offer, and
the unit it runs as, are the slot's whatever order the closure parked them in (DC16). -/
def slotOffer (ctx : Ctx) (slot : List Parked) : Option Parked :=
  match ctx.program.options.branchSchedule with
  | .declarationDepthFirst => slot.getLast?
  | .orderInvariant => Parked.leastBy (fun a b => ctx.positionLe b a) slot

/-- The offer of the parked arrival `waiting` when no arrival parked before it fired (`reoffer?`): its join is offered
the arrival `slotOffer` picks among those parked on that join in that scope occurrence, under the offer's unit, and fires
when the offer queues a signal (`some`), `none` when it does not; a parked flow leading to no gateway is an invariant
failure. -/
def offerParked (hooks : Hooks) (ctx : Ctx) (state : State) (waiting : Parked) :
    Except Failure (Option (ElementId × ScopeOccurrenceId × OccurrenceId × State)) :=
  match (ctx.program.target? waiting.flow).bind ctx.program.element? with
  | none => .error (.semanticFailure .invariant "parked-without-gateway")
  | some element =>
    match element.gateway?, (slotOffer ctx (state.slots.parked.filter fun other => other.scope == waiting.scope &&
        ctx.program.target? other.flow == ctx.program.target? waiting.flow)).bind (state.occurrence? ·.occurrence) with
    | some (header, payload), some occurrence => do
      -- the offer's issues are its unit's, so its key is the one `settle` runs it under (DC12)
      let some unit := UnitKey.offerUnit? occurrence.id (offerRound state occurrence.id)
        | .error (.semanticFailure .invariant "offer-unit-unkeyed")
      let offered ← hooks.arriveGateway ctx header payload occurrence { state with issuing := unit, issueNext := 0 }
      .ok (if offered.batchSignals.isEmpty then none else some (header.id, waiting.scope, occurrence.id, offered))
    | _, _ => .error (.semanticFailure .invariant "parked-without-gateway")

/-- The order `reoffer?` offers the parked arrivals' joins in: under `declarationDepthFirst` parking order; under
`orderInvariant` by join slot, its scope occurrence and then its gateway, since parking order is the order the closure ran
the arrivals in and which ready join fires first decides what the next firing sees (DC16). -/
def offerOrder (ctx : Ctx) (parked : List Parked) : List Parked :=
  match ctx.program.options.branchSchedule with
  | .declarationDepthFirst => parked
  | .orderInvariant =>
    let gateway (waiting : Parked) := ((ctx.program.target? waiting.flow).map (·.value)).getD ""
    parked.mergeSort fun a b => compareLex (compareOn (·.scope)) (compareOn gateway) a b != .gt

/-- The first parked join that fires when it is offered again, as the gateway, its scope occurrence and the state it
leaves. Table 13.3 activates an Inclusive join by the state, not by an arrival, and `settle` offers the parked joins
only once no signal, token or idle scope occurrence is left, so `Feature.Flow.positions` sees every position: a
completion still queued is no position it can see. Each join is offered one parked occurrence (`slotOffer`), in
`offerOrder`. Under `declarationDepthFirst` a Parallel join is ready only on an arrival, so offering it never fires it;
under `orderInvariant` every join fires here (`Feature.Flow.parksOnly`). -/
def reoffer? (hooks : Hooks) (ctx : Ctx) (state : State) :
    Except Failure (Option (ElementId × ScopeOccurrenceId × OccurrenceId × State)) :=
  (offerOrder ctx state.slots.parked).foldlM (init := none) fun found waiting =>
    match found with
    | some _ => .ok found
    | none => offerParked hooks ctx state waiting

end Kernel.Step
