module

public import Kernel.Step.Stale

/-! # Step: the finish of a Multi-Instance body

Which unit a Multi-Instance body's finish runs as (DC30). The instance whose completion makes a body finish is the one
the closure ran last among its siblings, so a finish run in that instance's unit is keyed by the order the closure ran
them in (probe P11). Under `BranchSchedule.orderInvariant` the finish therefore runs under the body's finish root
(`UnitKey.finishUnit?`), keyed by the scope occurrence holding the body's instances, the body's element and the number
of the body's finishes the closure queued before it: `Kernel.Step.conclude` queues it there, and `Kernel.Step.absorb`
never runs it in place. None matches a guarded type.
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

/-- The ordinal of the next finish of the body of `element` whose instances `scope` holds: the least one whose unit key
(`UnitKey.finishUnit?`) is neither queued nor run in the closure, which is the number of its finishes before, since a
queued finish leaves the queue only to run. A probe per earlier finish, never a scan of the closure's transitions. -/
def finishOrdinal (state : State) (scope : ScopeOccurrenceId) (element : ElementId) : Nat :=
  let taken (ordinal : Nat) := (UnitKey.finishUnit? scope element ordinal).any fun key =>
    state.queuedSignals.contains key || state.transitions.contains key
  let rec least : Nat → Nat → Nat
    | 0, ordinal => ordinal
    | fuel + 1, ordinal => if taken ordinal then least fuel (ordinal + 1) else ordinal
  least (state.queuedSignals.size + state.transitions.size) 0

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

end Kernel.Step
