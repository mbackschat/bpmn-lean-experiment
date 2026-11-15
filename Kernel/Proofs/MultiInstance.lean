module

public import Kernel.Proofs.MultiInstance.Occurs
public import Kernel.Laws.Population

/-! # Proofs: Multi-Instance (P4)

The statements of the proof wave's Multi-Instance lane ([PLAN, P4](../../docs/PLAN.md#proof-wave)): `Laws.MultiInstance`
under `Step`, from a `Laws.State.WellFormed` before-state that keeps the lane's slot invariant `RunsFormed`, for generation, numbering, counters, begin order, sequential
and parallel slots, collection, early end and instance isolation; an outer interruption ends every instance, through
the cancellation lane (`Kernel.Proofs.Cancellation`). Each is stated over a hooks parameter and closes when
`Kernel.Proofs.Step` proves it of `Registry.hooks`.

The model premises are the loop a run's element carries (`LoopOf`), read from the IL, two loop conditions, and, for the
statements that read instance identity, the IL contract that the program's identifiers are unique (`IdsUnique`), which
the codec does not check. Admission enforces `ItemApart` under `MultiInstanceCounters.cibLocals`, the only option the
statements taking it read it under (`multiInstance.itemNamedLikeCounter`), and `OutputsNamed` for every instance but
one whose submission installs variables (CIB-EXT-0005), which needs no output data item and which no shipped profile
pairs with `MultiInstanceOutputs.aggregates` (`multiInstance.outputDataItem` under `SubmissionRule.outputSet`,
`multiInstance.instanceResult`). That admission refuses the loops the kernel does not run (`multiInstance.*`,
`scope.multiInstance`) stays scenario evidence (guard 12's refusal tests): no statement here names the admission
evaluator. Nothing executable imports this module.

The counters and the output collection are stated of the hooks that write them (`CountersEntered`, `CountersRead`,
`CollectsOnCompletion`, `CollectionWritten`, `StopsUncollected`), not of every state: a write admission cannot see may reach a counter local
inside an instance and is `unsupported` when the instance completes (`multiInstance.resultShadowsInstance`, CIB-INT-0018),
and an early stop's state may hold any value under the output collection's name that another write left.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds occurrenceIds Queues)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique Generated SnapshotFixed Owned BodyOwns InstancesUnowned InstancesUnheld RunsKeyed
  NumberedInOrder InstancesPlaced BeginsQueued UnbegunUnlooped SlotsCounted CountersHeld BeginsInOrder SequentialSlots ParallelSlots OutputsFit Collects)

/-- A running body's slots shaped by its loop's mode, its filled slots holding what its instances submitted, and its
instances numbered in item order (`PMI-*`, `SMI-*`; the numbering of
[Multi-Instance, entry and generation](../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#entry-and-generation),
whose offset holds only while no other body of the element begins instances in between). -/
def Shaped (s : State) (run : MultiInstanceRun) (loop : MultiInstance) : Prop :=
  (loop.mode = .sequential → SequentialSlots run) ∧ (loop.mode = .parallel → ParallelSlots run) ∧ OutputsFit run loop ∧
    NumberedInOrder s run

/-- A running body's instances are isolated: no active instance's scope occurrence lies within another's. -/
def Apart (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ (first second : Nat) (firstScope secondScope : ScopeOccurrenceId),
    run.instances[first]? = some (.active firstScope) → run.instances[second]? = some (.active secondScope) →
    first ≠ second → ¬ Within s firstScope secondScope

/-- What the lane keeps of one running body: it is `Owned` whatever the loop, `Shaped` by its loop, its instances lie
`Apart`, its scope occurrence is its body occurrence's (`BodyOwns`), and each active instance's scope occurrence belongs to
no occurrence (`InstancesUnowned`), is no compensation handler's context (`InstancesUnheld`) and holds no occurrence of
the Activity but its instance (`InstancesPlaced`), so that `Shaped`'s numbering of the instances numbers every
occurrence of the Activity in them (`Laws.MultiInstance.numbered_of_placed`; root decision, 2026-11-14). -/
structure RunFormed (program : Program) (s : State) (run : MultiInstanceRun) : Prop where
  owned : Owned s run
  shaped : ∀ loop, LoopOf program run.element loop → Shaped s run loop
  apart : Apart s run
  bodyOwns : BodyOwns s run
  unowned : InstancesUnowned s run
  unheld : InstancesUnheld s run
  placed : InstancesPlaced s run

/-- The lane's slot invariant: one running body per body occurrence (`RunsKeyed`), each `RunFormed`, and the instance
begins still queued in the order the numbering needs (`BeginsQueued`). It is a lane
premise beside `WellFormed`, not a clause of it, since feature slot entries are each feature's own laws; the lane
proves it preserved, as P2 does `WellFormed`: by a committed input (`RunsShaped` and `InstancesApart` are its parts of
the after-state), at a start (`RunsFormedAtStart`) and in every instance of a population run
(`RunsFormedInPopulation`). The clauses besides `Shaped` and `Apart` are inductive strengthening: without them a
body whose occurrence is no Multi-Instance element's would outlive its occurrence, and two runs of one occurrence would
let a completion fill one and finish the other (root decision, 2026-11-14), without `BeginsQueued` a before-state
whose queues hold begins out of slot order would number its instances out of order (root decision, 2026-11-14), and
without `UnbegunUnlooped` a reservation of a looping element begun after a fresh instance would journal its lower
activation last (root decision, 2026-11-14). -/
structure RunsFormed (program : Program) (s : State) : Prop where
  keyed : RunsKeyed s
  formed : ∀ run ∈ s.slots.multiInstances, RunFormed program s run
  queued : BeginsQueued program s
  unbegun : UnbegunUnlooped program s

/-- A committed input from `before` to `after`, from a well-formed before-state that keeps the lane's slot invariant. -/
def Commits (hooks : Hooks) (program : Program) (before after : State) : Prop :=
  WellFormed program before ∧ RunsFormed program before ∧ ∃ input, Step.step hooks program (some before) input = .ok after

/-- A committed start keeps the lane's slot invariant, under a program whose identifiers are unique. -/
def RunsFormedAtStart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), IdsUnique program →
    Step.step hooks program none input = .ok after → RunsFormed program after

/-- Every instance a committed population run holds keeps the lane's slot invariant under its deployment's program,
where that program's identifiers are unique. -/
def RunsFormedInPopulation (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, IdsUnique instance_.deployment.program →
      RunsFormed instance_.deployment.program instance_.state

/-- Every running body after a committed input is `Shaped` by its loop, under a program whose identifiers are
unique. -/
def RunsShaped (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (loop : MultiInstance),
    IdsUnique program → Commits hooks program before after → run ∈ after.slots.multiInstances → LoopOf program run.element loop →
    Shaped after run loop

/-- A body begun by the input has at least one slot; a body running before and after it keeps its snapshot, slot
count and filled slots. -/
def RunsGenerated (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun),
    Commits hooks program before after → run ∈ after.slots.multiInstances →
    ((∀ earlier ∈ before.slots.multiInstances, earlier.occurrence ≠ run.occurrence) → Generated run run.instances.length) ∧
      ∀ earlier ∈ before.slots.multiInstances, earlier.occurrence = run.occurrence → SnapshotFixed earlier run

/-- Within the input's journal, the instances of a Multi-Instance element begin in generation order, under a program
whose identifiers are unique: the IL contract (`Boundary.id`, `Kernel/IL/Types.lean:118`) keeps every reservation off a
looping element, and a reservation of one keeps its lower activation when it begins after a fresh instance. -/
def BeginOrder (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (element : ElementId) (loop : MultiInstance) (processInstance : String),
    IdsUnique program → Commits hooks program before after → LoopOf program element loop →
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element

/-- Instances stay isolated: the instances of every running body after a committed input lie `Apart`. -/
def InstancesApart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun),
    Commits hooks program before after → run ∈ after.slots.multiInstances → Apart after run

/-- A body that ends, completed, early or interrupted from outside, takes every instance with it: its slot record,
the instance scope occurrences and what lies in them go (`PMI-EARLY-01`, BPMN 2.0.2 §13.3.7). -/
def EndsWithInstances (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (index : Nat) (scope : ScopeOccurrenceId),
    Commits hooks program before after → run ∈ before.slots.multiInstances → run.occurrence ∉ occurrenceIds after →
    run.instances[index]? = some (.active scope) →
    (∀ other ∈ after.slots.multiInstances, other.occurrence ≠ run.occurrence) ∧ scope ∉ scopeIds after ∧
      ∀ occurrence ∈ after.occurrences, ¬ Within before occurrence.scope scope

/-! ## Counters and the output collection, per hook -/

/-- No item local of `loop` is named `loopCounter`: under `MultiInstanceCounters.cibLocals` admission refuses such a loop
(`multiInstance.itemNamedLikeCounter`), since CIB sets the item and the counter on one execution, so one overwrites the
other. -/
def ItemApart (loop : MultiInstance) : Prop :=
  loop.inputDataItem ≠ some "loopCounter" ∧ loop.inputDataItemName ≠ some "loopCounter" ∧
    loop.elementVariable ≠ some "loopCounter"

/-- Under `MultiInstanceOutputs.aggregates` a loop with an output collection names an output data item, so every filled
slot holds an output for the collection to list. Admission refuses the loop of an instance submitting its OutputSet
without one (`multiInstance.outputDataItem`) and of an instance submitting nothing with an output collection
(`multiInstance.instanceResult`); an installing submission (CIB-EXT-0005) needs none, and no shipped profile pairs it with
`aggregates`. -/
def OutputsNamed (program : Program) (loop : MultiInstance) : Prop :=
  program.options.multiInstanceOutputs = .aggregates → loop.outputCollection.isSome → loop.outputDataItem.isSome

/-- Under `MultiInstanceCounters.cibLocals` each instance's scope occurrence is entered holding its zero-based
`loopCounter` (CIB-INT-0018, `MultiInstanceActivityBehavior:76-78`): stated of `Hooks.arriveMultiInstance`, which
enters a body's first instances, and of `Hooks.instanceCompleted`, which enters a sequential body's next one or, under
`declarationDepthFirst`, a parallel body's next deferred one, for every slot whose scope occurrence the hook issued
(`SlotsCounted`). It replaces a state clause, which a write admission cannot see breaks (`CountersRead`). Each hook
is taken where `Step` calls it (`Laws.Step.HookContract`): on a begun occurrence of the state, and for an instance whose
scope occurrence stands. -/
def CountersEntered (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance) (occurrence : Occurrence)
      (state after : State),
      WellFormed ctx.program state → occurrence ∈ state.occurrences → occurrence.begun = true →
      ctx.program.options.multiInstanceCounters = .cibLocals → ItemApart loop →
      hooks.arriveMultiInstance ctx header envelope loop occurrence state = .ok after → SlotsCounted state after) ∧
    ∀ (ctx : Ctx) (body : Nat) (occurrence : Occurrence) (writes : List (String × Value)) (state after : State),
      WellFormed ctx.program state → occurrence.scope ∈ scopeIds state →
      ctx.program.options.multiInstanceCounters = .cibLocals →
      (∀ element loop, LoopOf ctx.program element loop → ItemApart loop) →
      hooks.instanceCompleted ctx body occurrence writes state = .ok after → SlotsCounted state after

/-- Under `MultiInstanceCounters.cibLocals` a committed instance completion found CIB's counters held: its instance's
`loopCounter` and its body's counts (`CountersHeld`), which `Hooks.instanceCompleted` checks before it reads them, failing
as `unsupported` (`multiInstance.resultShadowsInstance`) when a write admission cannot see reached one (CIB-INT-0018). -/
def CountersRead (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (body : Nat) (occurrence : Occurrence) (writes : List (String × Value)) (state after : State)
    (run : MultiInstanceRun) (loop : MultiInstance) (index : Nat),
    RunsFormed ctx.program state → ctx.program.options.multiInstanceCounters = .cibLocals →
    hooks.instanceCompleted ctx body occurrence writes state = .ok after → run ∈ state.slots.multiInstances →
    run.occurrence = body → LoopOf ctx.program run.element loop → run.instances[index]? = some (.active occurrence.scope) →
    CountersHeld (state.ownVariables occurrence.scope) (state.ownVariables run.scope) run loop index

/-- The output collection a body's completion writes lists each instance's output in item order, so it is written
only once every slot is filled (`SMI-COMPLETE-01`, `PMI-FINISH-01`; BPMN 2.0.2 §13.3.7, Table 10.30). Stated of
`Hooks.completeBody`, which `Step` calls when the body's scope occurrence is idle, with the body's slot record before it,
and of `Hooks.instanceCompleted`, whose completion of the last instance completes the body, with the slot record it
leaves; each of the completion or write it newly queues (`Laws.State.Queues`). -/
def CollectsOnCompletion (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance) (occurrence : Occurrence)
      (state after : State) (run : MultiInstanceRun) (name : String),
      RunsFormed ctx.program state → OutputsNamed ctx.program loop → LoopOf ctx.program run.element loop →
      run ∈ state.slots.multiInstances → run.occurrence = occurrence.id → loop.outputCollection = some name →
      hooks.completeBody ctx header envelope loop occurrence state = .ok after →
      ∃ new, Queues state after new ∧ ∀ queued ∈ new, ∀ writes value, (name, value) ∈ writes →
        ((∃ id leave rule, queued = .complete id leave writes rule) ∨ ∃ scope rule, queued = .write scope writes rule) →
        ∃ outputs, collectionItems value = some outputs ∧ Collects run (some outputs)) ∧
    ∀ (ctx : Ctx) (body : Nat) (occurrence : Occurrence) (writes : List (String × Value)) (state after : State)
      (run : MultiInstanceRun) (loop : MultiInstance) (name : String),
      RunsFormed ctx.program state → OutputsNamed ctx.program loop → LoopOf ctx.program run.element loop →
      run ∈ after.slots.multiInstances → run.occurrence = body → loop.outputCollection = some name →
      hooks.instanceCompleted ctx body occurrence writes state = .ok after →
      ∃ new, Queues state after new ∧ ∀ id leave written rule, Signal.complete id leave written rule ∈ new →
        ∀ value, (name, value) ∈ written → ∃ outputs, collectionItems value = some outputs ∧ Collects run (some outputs)

/-- A body's completion writes its output collection: under `MultiInstanceOutputs.aggregates`, once every slot of a body
whose loop names an output collection is filled, the completion it newly queues (`Laws.State.Queues`) writes that
collection (BPMN 2.0.2 §13.3.7, Table 10.30), listing what `CollectsOnCompletion` says. Stated of `Hooks.completeBody`
with the body's slot record before it, and of `Hooks.instanceCompleted` for the instance active in the one slot of the
record before it that is unfilled. -/
def CollectionWritten (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance) (occurrence : Occurrence)
      (state after : State) (run : MultiInstanceRun) (name : String),
      RunsFormed ctx.program state → run ∈ state.slots.multiInstances → run.occurrence = occurrence.id →
      ctx.program.options.multiInstanceOutputs = .aggregates → loop.outputCollection = some name →
      (∀ slot ∈ run.instances, ∃ output, slot = .completed output) →
      hooks.completeBody ctx header envelope loop occurrence state = .ok after →
      ∃ new, Queues state after new ∧
        ∃ written value, Signal.complete occurrence.id .outgoing written .outward ∈ new ∧ (name, value) ∈ written) ∧
    ∀ (ctx : Ctx) (body : Nat) (occurrence : Occurrence) (writes : List (String × Value)) (state after : State)
      (run : MultiInstanceRun) (loop : MultiInstance) (index : Nat) (name : String),
      RunsFormed ctx.program state → LoopOf ctx.program run.element loop → run ∈ state.slots.multiInstances →
      run.occurrence = body → run.instances[index]? = some (.active occurrence.scope) →
      (∀ other slot, run.instances[other]? = some slot → other ≠ index → ∃ output, slot = .completed output) →
      ctx.program.options.multiInstanceOutputs = .aggregates → loop.outputCollection = some name →
      hooks.instanceCompleted ctx body occurrence writes state = .ok after →
      ∃ new, Queues state after new ∧
        ∃ written value, Signal.complete body .outgoing written .outward ∈ new ∧ (name, value) ∈ written

/-- An early stop writes no output collection: an instance's completion that leaves a slot of its body unfilled, as one
whose completion condition holds before the last instance completes does, queues no completion writing the loop's output
collection (`PMI-EARLY-01`; BPMN 2.0.2 §13.3.7, whose output collection is complete only once every instance has
completed). Stated of `Hooks.instanceCompleted` and the body's slot record as its after-state leaves it; it replaces a
state clause that a value another write left under the collection's name falsifies. -/
def StopsUncollected (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (body : Nat) (occurrence : Occurrence) (writes : List (String × Value)) (state after : State)
    (run : MultiInstanceRun) (loop : MultiInstance) (name : String),
    hooks.instanceCompleted ctx body occurrence writes state = .ok after → run ∈ after.slots.multiInstances →
    run.occurrence = body → (∃ slot ∈ run.instances, ∀ output, slot ≠ .completed output) →
    LoopOf ctx.program run.element loop → loop.outputCollection = some name →
    ∃ new, Queues state after new ∧ ∀ id leave written rule, Signal.complete id leave written rule ∈ new →
      ∀ value, (name, value) ∉ written

end Kernel.Proofs.MultiInstance
