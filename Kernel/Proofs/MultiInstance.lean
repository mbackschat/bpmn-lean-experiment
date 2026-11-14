module

public import Kernel.Proofs.Cancellation
public import Kernel.Laws.Scopes
public import Kernel.Laws.MultiInstance

/-! # Proofs: Multi-Instance (P4)

The statements of the proof wave's Multi-Instance lane ([PLAN, P4](../../docs/PLAN.md#proof-wave)): `Laws.MultiInstance`
under `Step`, from a `Laws.State.WellFormed` before-state, for generation, numbering, counters, begin order, sequential
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
open Kernel.Laws.State (WellFormed Within scopeIds occurrenceIds)
open Kernel.Laws.MultiInstance (Generated SnapshotFixed Numbered CounterHeld BeginsInOrder SequentialSlots
  ParallelSlots Collects)

/-- The Multi-Instance loop characteristics the element `element` carries (BPMN 2.0.2 §10.3.8, Table 10.30). -/
def LoopOf (program : Program) (element : ElementId) (loop : MultiInstance) : Prop :=
  ((program.element? element).bind (·.envelope?)).bind (·.multiInstance) = some loop

/-- A committed input from `before` to `after`. -/
def Commits (hooks : Hooks) (program : Program) (before after : State) : Prop :=
  WellFormed before ∧ ∃ input, Step.step hooks program (some before) input = .ok after

/-- Every running body after a committed input is owned and shaped by its loop's mode, its instances numbered in
begin order and, under `MultiInstanceCounters.cibLocals`, holding their counters (`PMI-*`, `SMI-*`, CIB-INT-0018). -/
def RunsShaped (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (loop : MultiInstance),
    Commits hooks program before after → run ∈ after.slots.multiInstances → LoopOf program run.element loop →
    Laws.MultiInstance.Owned after run ∧ (loop.mode = .sequential → SequentialSlots run) ∧
      (loop.mode = .parallel → ParallelSlots run) ∧ CounterHeld after run program.options.multiInstanceCounters ∧
      ∃ offset, Numbered after run offset

/-- A body begun by the input has at least one slot; a body running before and after it keeps its snapshot, slot
count and filled slots. -/
def RunsGenerated (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun),
    Commits hooks program before after → run ∈ after.slots.multiInstances →
    (∀ earlier ∈ before.slots.multiInstances, earlier.occurrence ≠ run.occurrence → Generated run run.instances.length) ∧
      ∀ earlier ∈ before.slots.multiInstances, earlier.occurrence = run.occurrence → SnapshotFixed earlier run

/-- Within the input's journal, the instances of a Multi-Instance element begin in generation order. -/
def BeginOrder (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (element : ElementId) (loop : MultiInstance) (processInstance : String),
    Commits hooks program before after → LoopOf program element loop →
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element

/-- Instances are isolated: no instance scope occurrence of a running body lies within another's. -/
def InstancesApart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (first second : Nat)
    (firstScope secondScope : ScopeOccurrenceId),
    Commits hooks program before after → run ∈ after.slots.multiInstances →
    run.instances[first]? = some (.active firstScope) → run.instances[second]? = some (.active secondScope) →
    first ≠ second → ¬ Within after firstScope secondScope

/-- A body that ends, completed, early or interrupted from outside, takes every instance with it: its slot record,
the instance scope occurrences and what lies in them go (`PMI-EARLY-01`, BPMN 2.0.2 §13.3.7). -/
def EndsWithInstances (hooks : Hooks) : Prop :=
  ∀ (program : Program) (before after : State) (run : MultiInstanceRun) (index : Nat) (scope : ScopeOccurrenceId),
    Commits hooks program before after → run ∈ before.slots.multiInstances → run.occurrence ∉ occurrenceIds after →
    run.instances[index]? = some (.active scope) →
    (∀ other ∈ after.slots.multiInstances, other.occurrence ≠ run.occurrence) ∧ scope ∉ scopeIds after ∧
      ∀ occurrence ∈ after.occurrences, ¬ Within before occurrence.scope scope

/-- The output collection the body's completion writes lists each instance's output in item order, so it is written
only once every slot is filled (`SMI-COMPLETE-01`, `PMI-FINISH-01`). Stated of `Hooks.completeBody`, which `Step` calls
when the body's scope occurrence is idle, and of the completion or write it queues. -/
def CollectsOnCompletion (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance) (occurrence : Occurrence)
    (state after : State) (run : MultiInstanceRun) (name : String) (value : Value),
    run ∈ state.slots.multiInstances → run.occurrence = occurrence.id → loop.outputCollection = some name →
    hooks.completeBody ctx header envelope loop occurrence state = .ok after →
    (∃ queued ∈ after.signals, ∃ writes, (name, value) ∈ writes ∧
      ((∃ id leave rule, queued = .complete id leave writes rule) ∨ ∃ scope rule, queued = .write scope writes rule)) →
    ∃ outputs, collectionItems value = some outputs ∧ Collects run (some outputs)

end Kernel.Proofs.MultiInstance
