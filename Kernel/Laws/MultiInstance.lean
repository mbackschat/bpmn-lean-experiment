module

public import Kernel.Hooks
public import Kernel.Laws.State
import all Kernel.Feature.MultiInstance

/-! # Laws of Multi-Instance Activities

The rules of the [Multi-Instance semantics](../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md) over a
running body's slot record `MultiInstanceRun` and the `State` around it, independent of `Kernel.Feature.MultiInstance`'s
code: the instance count fixed on entry, a sequential re-read's item, generation numbering and the `loopCounter` local, ownership of the instance
scope occurrences, sequential and parallel slot shapes, early completion and the output collection.

The mode of a loop is `MultiInstanceMode`, whose matching `Kernel.Feature.MultiInstance` owns (guard 1), so the
sequential and parallel slot shapes are separate laws the proof wave selects by the loop's mode. Nothing executable
imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel
open Kernel.Laws.State (Within)

/-! ## Entry and generation -/

/-- One slot per item or per count, fixed on entry, and never none: an empty collection completes the Activity at once
with no instance (§13.3.7, `PMI-ENTER-01`, `SMI-ENTER-01`). -/
def Generated (run : MultiInstanceRun) (count : Nat) : Prop :=
  run.instances.length = count ∧ 0 < count

/-- While a body runs, its snapshot, slot count and identity never change, and a filled slot keeps its output whatever
the completion order (`SMI-ITERATE-01`, `PMI-COMPLETE-01`). -/
structure SnapshotFixed (before after : MultiInstanceRun) : Prop where
  collection : after.collection = before.collection
  count : after.instances.length = before.instances.length
  scope : after.scope = before.scope
  element : after.element = before.element
  occurrence : after.occurrence = before.occurrence
  filledStays : ∀ (index : Nat) (output : Option Value), before.instances[index]? = some (.completed output) →
    after.instances[index]? = some (.completed output)

/-- The body occurrence is present under the body role; every running instance has a scope occurrence of its own,
directly below the body's, and no two slots share one (§13.3.7; CIB makes each instance a scope under the body). -/
structure Owned (s : State) (run : MultiInstanceRun) : Prop where
  body : ∃ occurrence ∈ s.occurrences, occurrence.id = run.occurrence ∧ occurrence.element = run.element ∧
    occurrence.role = .multiInstanceBody
  bodyScope : run.scope ∈ s.scopes.map (·.id)
  instanceScopes : ∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
    ∃ owned ∈ s.scopes, owned.id = scope ∧ owned.parent = some run.scope
  ownScopes : ∀ (first second : Nat) (scope : ScopeOccurrenceId), run.instances[first]? = some (.active scope) →
    run.instances[second]? = some (.active scope) → first = second

/-- An instance's activation is its begin order: the occurrence of the Activity in the scope occurrence of slot `index`
is activation `offset + index + 1`, `offset` counting the instances of the element begun before the body, while no
other body of the element begins instances in between
([Multi-Instance, entry and generation](../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#entry-and-generation)). -/
def Numbered (s : State) (run : MultiInstanceRun) (offset : Nat) : Prop :=
  ∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
    ∀ occurrence ∈ s.occurrences, occurrence.scope = scope → occurrence.element = run.element →
      occurrence.role = .element → occurrence.activation = offset + index + 1

/-- Under `cibLocals` the scope occurrence of slot `index` holds `loopCounter = index`, zero-based (CIB-INT-0018). -/
def CounterHeld (s : State) (run : MultiInstanceRun) (counters : MultiInstanceCounters) : Prop :=
  counters = .cibLocals → ∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
    ∃ locals ∈ s.variables, locals.scope = scope ∧ ("loopCounter", Value.int index) ∈ locals.entries

/-- Instances begin in generation order: within one input's journal the start facts of `element` in the process
instance `processInstance` carry increasing activations, so with `Numbered` the instance of item `k` begins before the
instance of item `k + 1`, in both modes and under both branch schedules. -/
def BeginsInOrder (facts : List StartedFact) (processInstance : String) (element : ElementId) : Prop :=
  ((facts.filter fun fact => fact.occurrence.processInstanceId == processInstance &&
      fact.occurrence.element == element && fact.occurrence.role == .element).map
    (·.occurrence.activation)).Pairwise (· < ·)

/-! ## Slot shapes -/

/-- A sequential body runs one instance at a time: the slots before the running one are filled, those after it wait
(§13.3.7, Table 10.29). -/
def SequentialSlots (run : MultiInstanceRun) : Prop :=
  ∃ filled current waiting, run.instances = filled ++ current ++ waiting ∧
    (∀ slot ∈ filled, ∃ output, slot = .completed output) ∧ current.length ≤ 1 ∧
    (∀ slot ∈ current, ∃ scope, slot = .active scope) ∧ ∀ slot ∈ waiting, slot = .waiting

/-- A parallel body generates every instance together, so no slot waits; when each begins is the branch schedule's. -/
def ParallelSlots (run : MultiInstanceRun) : Prop :=
  ∀ slot ∈ run.instances, slot ≠ .waiting

/-! ## Completion and output -/

/-- The output collection is written only once every slot is filled, and lists each instance's output in item order,
duplicates kept (`SMI-COMPLETE-01`, `PMI-FINISH-01`); `none` is no collection written. -/
def Collects (run : MultiInstanceRun) : Option (List Value) → Prop
  | some outputs => run.instances = outputs.map fun output => .completed (some output)
  | none => ∃ slot ∈ run.instances, ∀ output, slot ≠ .completed (some output)

/-- The output collection keeps the form of the input: a String List stays a String List. -/
def FormKept : Value → Value → Prop
  | .stringList _, .stringList _ => True
  | .list _, .list _ => True
  | _, _ => False

/-- Under `CollectionRead.sequentialReread` a later sequential instance holds the item at its index in the collection
`current` read as it is generated, while the slot count stays the entry count and `run.collection` the entry value
(`SnapshotFixed`): a grown collection adds no instance, and one shorter than the index generates none (CIB-INT-0043). -/
def RereadItem (run : MultiInstanceRun) (current : List Value) (index : Nat) (item : Value) : Prop :=
  index < run.instances.length ∧ current[index]? = some item

/-- An early completion: the completion condition held before every slot was filled, so the Activity completes, every
remaining instance in its scope ends with all it holds, the body's slot record goes, and no output collection is
written (`PMI-EARLY-01`). -/
structure EndsEarly (before after : State) (run : MultiInstanceRun) (output : Option String) : Prop where
  unfilled : ∃ slot ∈ run.instances, ∀ value, slot ≠ .completed value
  slotsGone : ∀ other ∈ after.slots.multiInstances, other.occurrence ≠ run.occurrence
  scopesGone : ∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
    ∀ inner ∈ after.scopes, ¬ Within before inner.id scope
  occurrencesGone : ∀ (index : Nat) (scope : ScopeOccurrenceId), run.instances[index]? = some (.active scope) →
    ∀ occurrence ∈ after.occurrences, ¬ Within before occurrence.scope scope
  noOutput : ∀ name, output = some name → ∀ locals ∈ after.variables, ∀ value, (name, value) ∈ locals.entries →
    ∃ earlier ∈ before.variables, earlier.scope = locals.scope ∧ (name, value) ∈ earlier.entries

/-! ## Non-vacuity

A body occurrence 1 of `Review` in the root, its scope occurrence 2, and instance scope occurrences 3 and 4 holding the
instance occurrences 5 (activation 1) and 6 (activation 2). -/

def review : ElementId := ⟨"Review"⟩
def root : ScopeOccurrenceId := ⟨0⟩
def bodyScope : ScopeOccurrenceId := ⟨2⟩
def firstScope : ScopeOccurrenceId := ⟨3⟩
def secondScope : ScopeOccurrenceId := ⟨4⟩

def running : MultiInstanceRun :=
  { scope := bodyScope, element := review, occurrence := 1, collection := .stringList ["x", "x"]
    instances := [.active firstScope, .active secondScope] }

def bodyOccurrence : Occurrence := { id := 1, element := review, scope := root, activation := 1, role := .multiInstanceBody }
def firstInstance : Occurrence := { id := 5, element := review, scope := firstScope, activation := 1 }
def secondInstance : Occurrence := { id := 6, element := review, scope := secondScope, activation := 2 }

def firstOwned : ScopeOccurrence := { id := firstScope, element := some review, parent := some bodyScope }
def secondOwned : ScopeOccurrence := { id := secondScope, element := some review, parent := some bodyScope }
def firstLocals : ScopeVariables := { scope := firstScope, entries := [("item", .string "x"), ("loopCounter", .int 0)] }
def secondLocals : ScopeVariables := { scope := secondScope, entries := [("item", .string "x"), ("loopCounter", .int 1)] }

def entered : State :=
  { instanceId := "p"
    scopes := [{ id := root, element := none, parent := none },
      { id := bodyScope, element := some review, parent := some root, occurrence := some 1 }, firstOwned, secondOwned]
    occurrences := [bodyOccurrence, firstInstance, secondInstance]
    variables := [firstLocals, secondLocals]
    slots := { multiInstances := [running] } }

theorem two_generated : Generated running 2 := ⟨rfl, by omega⟩

theorem empty_run_rejected : ¬ Generated { running with instances := [] } 0 := fun ⟨_, positive⟩ => by
  simp at positive

theorem entered_owned : Owned entered running where
  body := ⟨bodyOccurrence, by simp [entered], rfl, rfl, rfl⟩
  bodyScope := by simp [entered, running]
  instanceScopes := by
    intro index scope slot
    match index with
    | 0 => simp [running] at slot; subst slot; exact ⟨firstOwned, by simp [entered], rfl, rfl⟩
    | 1 => simp [running] at slot; subst slot; exact ⟨secondOwned, by simp [entered], rfl, rfl⟩
    | _ + 2 => simp [running] at slot
  ownScopes := by
    intro first second scope one two
    match first, second with
    | 0, 0 | 1, 1 => rfl
    | 0, 1 | 1, 0 => simp [running, firstScope, secondScope] at one two; subst one; simp at two
    | _ + 2, _ | _, _ + 2 => simp [running] at one two

/-- Two slots in one scope occurrence break `Owned`. -/
theorem shared_scope_rejected :
    ¬ Owned entered { running with instances := [.active firstScope, .active firstScope] } := fun owned => by
  have := owned.ownScopes 0 1 firstScope (by simp) (by simp)
  simp at this

theorem entered_numbered : Numbered entered running 0 := by
  intro index scope slot occurrence member inScope sameElement role
  match index with
  | 0 =>
    simp [running] at slot
    subst slot
    simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl | rfl <;> simp_all [bodyOccurrence, firstInstance, secondInstance, firstScope, secondScope]
  | 1 =>
    simp [running] at slot
    subst slot
    simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at member
    rcases member with rfl | rfl | rfl <;> simp_all [bodyOccurrence, firstInstance, secondInstance, firstScope, secondScope]
  | _ + 2 => simp [running] at slot

/-- Instance activations in reverse slot order break `Numbered`. -/
theorem reversed_numbering_rejected :
    ¬ Numbered entered { running with instances := [.active secondScope, .active firstScope] } 0 := fun numbered => by
  have := numbered 0 secondScope (by simp) secondInstance (by simp [entered]) rfl rfl rfl
  simp [secondInstance] at this

theorem counters_held : CounterHeld entered running .cibLocals := by
  intro _ index scope slot
  match index with
  | 0 => simp [running] at slot; subst slot; exact ⟨firstLocals, by simp [entered], rfl, by simp [firstLocals]⟩
  | 1 => simp [running] at slot; subst slot; exact ⟨secondLocals, by simp [entered], rfl, by simp [secondLocals]⟩
  | _ + 2 => simp [running] at slot

/-- A one-based `loopCounter` breaks `CounterHeld`. -/
theorem one_based_rejected :
    ¬ CounterHeld { entered with variables := [{ scope := firstScope, entries := [("loopCounter", .int 1)] }] } running
      .cibLocals := fun held => by
  obtain ⟨locals, member, scope, entry⟩ := held rfl 0 firstScope (by simp [running])
  simp only [List.mem_singleton] at member
  subst member
  simp at entry

def startOf (activation : Nat) : StartedFact :=
  { occurrence := { processInstanceId := "p", element := review, activation }, owner := root, sourceType := "userTask" }

theorem begins_in_order : BeginsInOrder [startOf 1, startOf 2] "p" review := by
  simp [BeginsInOrder, startOf]

theorem later_item_first_rejected : ¬ BeginsInOrder [startOf 2, startOf 1] "p" review := by
  simp [BeginsInOrder, startOf]

theorem sequential_shape :
    SequentialSlots { running with instances := [.completed (some (.string "a")), .active secondScope, .waiting] } :=
  ⟨[.completed (some (.string "a"))], [.active secondScope], [.waiting], rfl, by simp, by simp, by simp, by simp⟩

/-- Two running instances break the sequential shape. -/
theorem two_running_rejected : ¬ SequentialSlots running := by
  rintro ⟨filled, current, waiting, facts⟩
  obtain ⟨split, done, single, shape⟩ := facts
  obtain ⟨_, idle⟩ := shape
  match filled, current with
  | [], [] => simp [running] at split; simp [← split] at idle
  | [], [_] =>
    simp [running] at split
    obtain ⟨_, rfl⟩ := split
    simp at idle
  | [], _ :: _ :: _ => simp at single
  | slot :: _, _ =>
    simp [running] at split
    obtain ⟨rfl, _⟩ := split
    obtain ⟨_, impossible⟩ := done (.active firstScope) (by simp)
    simp at impossible

theorem parallel_shape : ParallelSlots running := by
  simp [ParallelSlots, running]

theorem waiting_parallel_rejected : ¬ ParallelSlots { running with instances := [.active firstScope, .waiting] } :=
  fun shape => shape .waiting (by simp) rfl

theorem collects_in_order :
    Collects { running with instances := [.completed (some (.string "b")), .completed (some (.string "a")),
      .completed (some (.string "b"))] } (some [.string "b", .string "a", .string "b"]) := rfl

/-- A collection with the duplicate dropped, or reordered, is not the output collection. -/
theorem dropped_duplicate_rejected :
    ¬ Collects { running with instances := [.completed (some (.string "b")), .completed (some (.string "b"))] }
      (some [.string "b"]) := by
  simp [Collects]

theorem partial_not_collected : Collects running none :=
  ⟨.active firstScope, by simp [running], by simp⟩

theorem partial_collected_rejected : ¬ Collects running (some [.string "a", .string "b"]) := by
  simp [Collects, running]

theorem string_list_kept : FormKept (.stringList ["x"]) (.stringList ["y"]) := trivial

theorem form_change_rejected : ¬ FormKept (.stringList ["x"]) (.list [.string "y"]) := id

theorem reread_takes_current : RereadItem running [.string "a", .string "c", .string "d"] 1 (.string "c") := by
  simp [RereadItem, running]

/-- A grown collection adds no instance: its item beyond the entry count is no later instance's. -/
theorem grown_beyond_entry_rejected : ¬ RereadItem running [.string "a", .string "c", .string "d"] 2 (.string "d") := by
  simp [RereadItem, running]

/-- A shortened collection gives the next index no item. -/
theorem shortened_rejected : ∀ item, ¬ RereadItem running [.string "a"] 1 item := by
  simp [RereadItem]

/-- The condition held after the first instance completed: the second instance's scope occurrence and occurrence go,
with the slot record, and the output name `out` is not written. -/
def endedEarly : State :=
  { entered with
    scopes := [{ id := root, element := none, parent := none }], occurrences := []
    variables := [], slots := {} }

def halfDone : MultiInstanceRun := { running with instances := [.completed none, .active secondScope] }

theorem ends_early : EndsEarly { entered with slots := { multiInstances := [halfDone] } } endedEarly halfDone (some "out") where
  unfilled := ⟨.active secondScope, by simp [halfDone], by simp⟩
  slotsGone := by simp [endedEarly]
  scopesGone := by
    intro index scope slot inner member within
    simp only [endedEarly, List.mem_singleton] at member
    subst member
    match index with
    | 1 =>
      simp [halfDone] at slot
      subst slot
      have := Within.parentless (s := { entered with slots := { multiInstances := [halfDone] } })
        (by simp [entered, root, bodyScope, firstOwned, secondOwned, firstScope, secondScope]) within
      simp [root, secondScope] at this
    | 0 => simp [halfDone] at slot
    | _ + 2 => simp [halfDone] at slot
  occurrencesGone := by simp [endedEarly]
  noOutput := by simp [endedEarly]

/-- Writing a partial output collection is no early completion. -/
theorem partial_output_rejected :
    ¬ EndsEarly entered { endedEarly with variables := [{ scope := root, entries := [("out", .list [])] }] } halfDone
      (some "out") := fun early => by
  obtain ⟨earlier, member, _, entry⟩ :=
    early.noOutput "out" rfl { scope := root, entries := [("out", .list [])] } (by simp) (.list []) (by simp)
  simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [firstLocals, secondLocals] at entry

end Kernel.Laws.MultiInstance
