module

public import Kernel.Step.Stale

/-! # Step: the finish of a Multi-Instance body and a compensation run's readiness

Which unit a Multi-Instance body's finish and a compensation run's readiness work run as (DC30). The instance whose
completion makes a body finish is the one the closure ran last among its siblings, so a finish run in that instance's
unit is keyed by the order the closure ran them in (probe P11). Under `BranchSchedule.orderInvariant` the finish
therefore runs under the body's finish root (`UnitKey.finishUnit?`), keyed by the scope occurrence holding the body's
instances, the body's element and the number of the body's finishes the closure queued before it:
`Kernel.Step.conclude` queues it there, and `Kernel.Step.absorb` never runs it in place. A compensation run's end, and
the start of a handler that waits for two or more others, likewise lands in whichever handler's completion the closure
ran last (probe P17 W2, W3), so `Feature.Compensation.handlerCompleted` queues that work as `Signal.compensationReady`,
which runs under the run's readiness root (`UnitKey.readyUnit?`). None matches a guarded type.
-/

public section

namespace Kernel.Step

/-- The record of the Multi-Instance body a queued signal's work completes (`SignalWork.completion`), under
`BranchSchedule.orderInvariant`: the body's finish. Under `declarationDepthFirst` the finish stays in the completing
unit, where CIB leaves the body in the operation that ends its last instance
(`ParallelMultiInstanceActivityBehavior:84-96`). -/
def finishOf? (ctx : Ctx) (state : State) (work : SignalWork) : Option MultiInstanceRun :=
  match ctx.program.options.branchSchedule with
  | .declarationDepthFirst => none
  | .orderInvariant =>
    match work.completion, work.acts with
    | true, [body] => state.slots.multiInstanceMap[body]?.map (·.toRun body)
    | _, _ => none

/-- The least ordinal whose group unit key `key` names is neither queued nor run in the closure, which is the number
of the group's units before, since a queued one leaves the queue only to run. A probe per earlier unit, never a scan of
the closure's transitions. -/
def freeOrdinal (state : State) (key : Nat → Option UnitKey) : Nat :=
  let taken (ordinal : Nat) := (key ordinal).any fun key =>
    state.queuedSignals.contains key || state.transitions.contains key
  let rec least : Nat → Nat → Nat
    | 0, ordinal => ordinal
    | fuel + 1, ordinal => if taken ordinal then least fuel (ordinal + 1) else ordinal
  least (state.queuedSignals.size + state.transitions.size) 0

/-- The ordinal of the next finish of the body of `element` whose instances `scope` holds (`UnitKey.finishUnit?`). -/
def finishOrdinal (state : State) (scope : ScopeOccurrenceId) (element : ElementId) : Nat :=
  freeOrdinal state (UnitKey.finishUnit? scope element)

/-- The key a queued signal runs under instead of its index in the running batch (`State.queueBatch`): a body's finish
its finish root (`finishOf?`), `none` for every other signal; a finish without one is an invariant failure. It reads
no unit, so the finish's key is the same whichever unit queued it. -/
def finishKey? (ctx : Ctx) (state : State) (work : SignalWork) : Except Failure (Option UnitKey) :=
  match finishOf? ctx state work with
  | none => .ok none
  | some run =>
    match UnitKey.finishUnit? run.scope run.element (finishOrdinal state run.scope run.element) with
    | some key => .ok (some key)
    | none => .error (.semanticFailure .invariant "finish-unit-unkeyed")

/-- The key a compensation run's readiness signal (`SignalWork.ready`) runs under: the run's readiness root at the
least ordinal neither queued nor run (`UnitKey.readyUnit?`, `CompensationRun.anchor?`), `none` for every other signal; a
readiness without its run, or without a key, is an invariant failure. Only `Feature.Compensation.handlerCompleted`
queues one, under `BranchSchedule.orderInvariant`, at most one per micro-step, which completes at most one handler. It
reads no unit, so the work runs under one key whichever handler's completion released it. -/
def readyKey? (state : State) (work : SignalWork) : Except Failure (Option UnitKey) :=
  match work.ready with
  | none => .ok none
  | some (scope, context) =>
    match state.slots.compensation.runs.find? (·.holds scope context) with
    | none => .error (.semanticFailure .invariant "ready-run-missing")
    | some run =>
      let key := UnitKey.readyUnit? run.scope run.anchor?
      match key (freeOrdinal state key) with
      | some key => .ok (some key)
      | none => .error (.semanticFailure .invariant "ready-unit-unkeyed")

/-- The group root a queued signal runs under instead of its index in the running batch (`State.queueBatch`): a body's
finish (`finishKey?`) or a compensation run's readiness (`readyKey?`), `none` for every other signal. -/
def groupKey? (ctx : Ctx) (state : State) (work : SignalWork) : Except Failure (Option UnitKey) := do
  match ← finishKey? ctx state work with
  | some key => .ok (some key)
  | none => readyKey? state work

end Kernel.Step
