module

public import Kernel.Proofs.Cancellation
public import Kernel.Laws.Scopes
public import Kernel.Laws.MultiInstance
public import Kernel.Laws.Population

/-! # Proofs: Multi-Instance (P4)

The statements of the proof wave's Multi-Instance lane ([PLAN, P4](../../docs/PLAN.md#proof-wave)): `Laws.MultiInstance`
under `Step`, from a `Laws.State.WellFormed` before-state that keeps the lane's slot invariant `RunsFormed`, for generation, numbering, counters, begin order, sequential
and parallel slots, collection, early end and instance isolation; an outer interruption ends every instance, through
the cancellation lane (`Kernel.Proofs.Cancellation`). Each is stated over a hooks parameter and closes when
`Kernel.Proofs.Step` proves it of `Registry.hooks`.

The model premise is the loop a run's element carries (`LoopOf`), read from the IL. That admission refuses the
loops the kernel does not run (`multiInstance.*`, `scope.multiInstance`) stays scenario evidence (guard 12's refusal
tests): no statement here names the admission evaluator. Nothing executable imports this module.
-/

public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds occurrenceIds Queues)
open Kernel.Laws.MultiInstance (Generated SnapshotFixed Numbered CounterHeld BeginsInOrder SequentialSlots
  ParallelSlots Collects EndsEarly)

/-- The Multi-Instance loop characteristics the element `element` carries (BPMN 2.0.2 §10.3.8, Table 10.30). -/
def LoopOf (program : Program) (element : ElementId) (loop : MultiInstance) : Prop :=
  ((program.element? element).bind (·.envelope?)).bind (·.multiInstance) = some loop

/-- A running body owned and shaped by its loop's mode, its instances numbered in begin order and, under
`MultiInstanceCounters.cibLocals`, holding their counters (`PMI-*`, `SMI-*`, CIB-INT-0018). -/
def Shaped (program : Program) (s : State) (run : MultiInstanceRun) (loop : MultiInstance) : Prop :=
  Laws.MultiInstance.Owned s run ∧ (loop.mode = .sequential → SequentialSlots run) ∧
    (loop.mode = .parallel → ParallelSlots run) ∧ CounterHeld s run program.options.multiInstanceCounters ∧
    ∃ offset, Numbered s run offset

/-- A running body's instances are isolated: no active instance's scope occurrence lies within another's. -/
def Apart (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ (first second : Nat) (firstScope secondScope : ScopeOccurrenceId),
    run.instances[first]? = some (.active firstScope) → run.instances[second]? = some (.active secondScope) →
    first ≠ second → ¬ Within s firstScope secondScope

/-- The lane's slot invariant: every running body is `Shaped` by its loop and its instances lie `Apart`. It is a lane
premise beside `WellFormed`, not a clause of it, since feature slot entries are each feature's own laws; the lane
proves it preserved, as P2 does `WellFormed`: by a committed input (`RunsShaped` and `InstancesApart` are its parts of
the after-state), at a start (`RunsFormedAtStart`) and in every instance of a population run
(`RunsFormedInPopulation`). -/
def RunsFormed (program : Program) (s : State) : Prop :=
  ∀ run ∈ s.slots.multiInstances, (∀ loop, LoopOf program run.element loop → Shaped program s run loop) ∧ Apart s run

/-- A committed input from `before` to `after`, from a well-formed before-state that keeps the lane's slot invariant. -/
def Commits (hooks : Hooks) (program : Program) (before after : State) : Prop :=
  WellFormed before ∧ RunsFormed program before ∧ ∃ input, Step.step hooks program (some before) input = .ok after

/-- A committed start keeps the lane's slot invariant. -/
def RunsFormedAtStart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), Step.step hooks program none input = .ok after →
    RunsFormed program after

/-- Every instance a committed population run holds keeps the lane's slot invariant under its deployment's program. -/
def RunsFormedInPopulation (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, RunsFormed instance_.deployment.program instance_.state

/-- Every running body after a committed input is `Shaped` by its loop. -/
def RunsShaped (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (loop : MultiInstance),
    Commits hooks program before after → run ∈ after.slots.multiInstances → LoopOf program run.element loop →
    Shaped program after run loop

/-- A body begun by the input has at least one slot; a body running before and after it keeps its snapshot, slot
count and filled slots. -/
def RunsGenerated (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun),
    Commits hooks program before after → run ∈ after.slots.multiInstances →
    ((∀ earlier ∈ before.slots.multiInstances, earlier.occurrence ≠ run.occurrence) → Generated run run.instances.length) ∧
      ∀ earlier ∈ before.slots.multiInstances, earlier.occurrence = run.occurrence → SnapshotFixed earlier run

/-- Within the input's journal, the instances of a Multi-Instance element begin in generation order. -/
def BeginOrder (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (element : ElementId) (loop : MultiInstance) (processInstance : String),
    Commits hooks program before after → LoopOf program element loop →
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

/-- A body that ends within a committed input either collected or ended early (`PMI-EARLY-01`, `SMI-COMPLETE-01`,
`PMI-FINISH-01`): its last slot record `final` had every slot filled and its output collection, when it has one, lists
the outputs in item order; or `final` had a slot unfilled and the body ended as `Laws.MultiInstance.EndsEarly` says, so
by its `noOutput` clause no output collection value was written. -/
def EndsCollectedOrEarly (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (loop : MultiInstance),
    Commits hooks program before after → run ∈ before.slots.multiInstances → LoopOf program run.element loop →
    (∀ other ∈ after.slots.multiInstances, other.occurrence ≠ run.occurrence) →
    ∃ final : MultiInstanceRun, final.occurrence = run.occurrence ∧ final.element = run.element ∧
      ((∃ outputs, Collects final (some outputs) ∧ ∀ name, loop.outputCollection = some name →
          ∃ frame ∈ after.variables, ∃ value, (name, value) ∈ frame.entries ∧ collectionItems value = some outputs) ∨
        EndsEarly before after final loop.outputCollection)

/-- The output collection the body's completion writes lists each instance's output in item order, so it is written
only once every slot is filled (`SMI-COMPLETE-01`, `PMI-FINISH-01`). Stated of `Hooks.completeBody`, which `Step` calls
when the body's scope occurrence is idle, and of the completion or write it newly queues (`Laws.State.Queues`). -/
def CollectsOnCompletion (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance) (occurrence : Occurrence)
    (state after : State) (run : MultiInstanceRun) (name : String),
    run ∈ state.slots.multiInstances → run.occurrence = occurrence.id → loop.outputCollection = some name →
    hooks.completeBody ctx header envelope loop occurrence state = .ok after →
    ∃ new, Queues state after new ∧ ∀ queued ∈ new, ∀ writes value, (name, value) ∈ writes →
      ((∃ id leave rule, queued = .complete id leave writes rule) ∨ ∃ scope rule, queued = .write scope writes rule) →
      ∃ outputs, collectionItems value = some outputs ∧ Collects run (some outputs)

end Kernel.Proofs.MultiInstance
