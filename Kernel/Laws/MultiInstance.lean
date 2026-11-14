module

public import Kernel.Hooks
public import Kernel.Laws.State
public import Kernel.Feature.MultiInstance
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

/-! ## Preservation

A body that completes completes the occurrence its run holds, which may since have left the state; `MultiInstanceOps`
names what such an occurrence keeps as `settled`, which `Kernel.Proofs.Step` fills with `Laws.State.Settled`. An
arrival enters the body's scope occurrence below its own and one per instance below that, and queues each instance's
begin, which names no reservation, in its instance's scope occurrence. -/

/-- What the Multi-Instance hooks need of the state operations they apply, for an invariant `inv` and what the
occurrence a body completes keeps, `settled`. -/
structure MultiInstanceOps (inv : State → Prop) (settled : State → Nat → Prop) : Prop where
  bodies : ∀ state run, inv state → run ∈ state.slots.multiInstances → settled state run.occurrence
  placed : ∀ state run, inv state → run ∈ state.slots.multiInstances → Laws.State.Placed state run
  complete : ∀ state id leave writes rule, inv state → settled state id →
    inv (state.signal (.complete id leave writes rule))
  begun : ∀ state occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    settled state occurrence.id
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    occurrence.scope ∈ Laws.State.scopeIds state
  hold : ∀ state held, inv state → inv (state.hold held)
  /-- A scope occurrence entered below one that stands; it alone holds the identity entering issues. -/
  enter : ∀ state element parent locals owner, inv state → parent ∈ Laws.State.scopeIds state →
    (∀ id, owner = some id → ∃ occurrence ∈ state.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = parent) → inv (state.enterScope element parent locals owner).1 ∧
      (∀ id, settled state id → settled (state.enterScope element parent locals owner).1 id) ∧
      ∀ entry ∈ state.scopes, entry.id ≠ (state.enterScope element parent locals owner).2
  arm : ∀ state occurrence element, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.signal (.arm occurrence.id element occurrence.scope)) ∧
      ∀ id, settled state id → settled (state.signal (.arm occurrence.id element occurrence.scope)) id
  begin : ∀ state request, inv state → Laws.State.names request = [] → request.scope ∈ Laws.State.scopeIds state →
    inv (state.signal (.begin request)) ∧ ∀ id, settled state id → settled (state.signal (.begin request)) id
  defer : ∀ state requests, inv state →
    (∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state) →
    inv (state.deferBegins requests) ∧ ∀ id, settled state id → settled (state.deferBegins requests) id
  runs : ∀ state runs, inv state → (∀ run ∈ runs, run ∈ state.slots.multiInstances ∨
      settled state run.occurrence ∧ Laws.State.Placed state run) →
    inv { state with slots := { state.slots with multiInstances := runs } }

/-- `Hooks.completeBody` keeps `inv`: an idle body completes its run's occurrence. -/
theorem completeBody_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance} {occurrence : Occurrence}
    {state after : State} (holds : inv state)
    (ran : Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after) : inv after := by
  unfold Feature.MultiInstance.completeBody Feature.MultiInstance.runOf? at ran
  split at ran
  · cases ran
  · rename_i run found
    cases ran
    exact ops.complete _ _ _ _ _ holds (ops.bodies _ _ holds (List.mem_of_find?_eq_some found))

/-- A property every step of a left fold keeps over the list's members holds of the fold. -/
theorem foldl_keeps {α β : Type} (P : α → Prop) (f : α → β → α) :
    ∀ (l : List β) (a : α), (∀ a b, b ∈ l → P a → P (f a b)) → P a → P (l.foldl f a)
  | [], _, _, holds => holds
  | b :: l, a, step, holds =>
    foldl_keeps P f l (f a b) (fun a' b' member => step a' b' (List.mem_cons_of_mem _ member)) (step a b (by simp) holds)

/-- What a body keeps while it enters and queues its instances, `instances` its slots so far: `inv`, that its
occurrence has settled, its scope occurrence, its instances' placement and the scope occurrences the queued begins
name. -/
def Entering (inv : State → Prop) (settled : State → Nat → Prop) (run : MultiInstanceRun) (state : State)
    (instances : List Iteration) (requests : List BeginRequest) : Prop :=
  inv state ∧ settled state run.occurrence ∧ run.scope ∈ Laws.State.scopeIds state ∧
    Laws.State.Placed state { run with instances } ∧
    ∀ request ∈ requests, Laws.State.names request = [] ∧ request.scope ∈ Laws.State.scopeIds state

/-- A change that keeps the scope occurrences and the counter keeps what a body keeps while it enters. -/
theorem Entering.frame {inv : State → Prop} {settled : State → Nat → Prop} {run : MultiInstanceRun}
    {state after : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (holds : inv after)
    (carried : settled after run.occurrence) (scopes : after.scopes = state.scopes)
    (issued : after.nextIssue = state.nextIssue) : Entering inv settled run after instances requests := by
  obtain ⟨_, _, stands, rest⟩ := entering
  obtain ⟨placed, queued⟩ := rest
  have same : Laws.State.scopeIds after = Laws.State.scopeIds state := by simp [Laws.State.scopeIds, scopes]
  exact ⟨holds, carried, same ▸ stands, placed.transport (Nat.le_of_eq issued.symm)
    (fun _ member => .inl (scopes ▸ member)), fun request member => same ▸ queued request member⟩

/-- Queuing the instances' begins keeps what a body keeps while it enters. -/
theorem queueInstances_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {mode : MultiInstanceMode} {run : MultiInstanceRun} {state : State} {instances : List Iteration}
    {requests : List BeginRequest} (entering : Entering inv settled run state instances requests) :
    Entering inv settled run (Feature.MultiInstance.queueInstances ctx mode requests state) instances [] := by
  have empty : ∀ {current}, Entering inv settled run current instances requests →
      Entering inv settled run current instances [] := fun held => ⟨held.1, held.2.1, held.2.2.1, held.2.2.2.1, by simp⟩
  have signalled : Entering inv settled run
      (requests.foldl (fun state request => state.signal (.begin request)) state) instances requests := by
    refine foldl_keeps (fun state => Entering inv settled run state instances requests) _ requests state
      (fun current request member held => ?_) entering
    obtain ⟨begun, carry⟩ := ops.begin _ _ held.1 (held.2.2.2.2 request member).1 (held.2.2.2.2 request member).2
    exact held.frame begun (carry _ held.2.1) (by rw [Laws.State.signal_eq]) (by rw [Laws.State.signal_eq])
  unfold Feature.MultiInstance.queueInstances
  split
  · exact empty signalled
  · split
    · obtain ⟨deferred, carry⟩ := ops.defer _ _ entering.1 entering.2.2.2.2
      exact empty (entering.frame deferred (carry _ entering.2.1) (by rw [Laws.State.deferBegins_eq])
        (by rw [Laws.State.deferBegins_eq]))
    · exact empty signalled

/-- Entering one instance's scope occurrence below the body's keeps what the body keeps, its slot active there and its
begin queued. -/
theorem enterInstance_entering {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {run : MultiInstanceRun} {state : State} {instances : List Iteration} {requests : List BeginRequest}
    (entering : Entering inv settled run state instances requests) (index : Nat) (locals : List (String × Value))
    (continuation : Continuation) :
    Entering inv settled run (state.enterScope run.element run.scope locals none).1
      (instances.set index (.active (state.enterScope run.element run.scope locals none).2))
      (requests ++ [{ element := run.element, continuation, scope := (state.enterScope run.element run.scope
        locals none).2 }]) := by
  obtain ⟨holds, carried, stands, rest⟩ := entering
  obtain ⟨placed, queued⟩ := rest
  obtain ⟨entered, carry, fresh⟩ := ops.enter state run.element run.scope locals none holds stands
    fun _ named => by cases named
  rw [Laws.State.enterScope_eq] at entered carry fresh ⊢
  refine ⟨entered, carry _ carried, by simp [Laws.State.scopeIds] at stands ⊢; exact .inl stands,
    fun scope active => ?_, fun request inside => ?_⟩
  · rcases List.mem_or_eq_of_mem_set active with old | new
    · obtain ⟨below, parent⟩ := placed scope old
      refine ⟨Nat.lt_succ_of_lt below, fun entry member named => ?_⟩
      rcases List.mem_append.mp member with present | added
      · exact parent entry present named
      · rw [List.mem_singleton.mp added] at named
        rw [← named] at below
        exact absurd below (Nat.lt_irrefl _)
    · obtain rfl := Iteration.active.inj new
      refine ⟨Nat.lt_succ_self _, fun entry member named => ?_⟩
      rcases List.mem_append.mp member with present | added
      · exact absurd named (fresh entry present)
      · rw [List.mem_singleton.mp added]
  · rcases List.mem_append.mp inside with old | new
    · refine ⟨(queued request old).1, ?_⟩
      have := (queued request old).2
      simp [Laws.State.scopeIds] at this ⊢
      exact .inl this
    · rw [List.mem_singleton.mp new]
      exact ⟨by simp [Laws.State.names], by simp [Laws.State.scopeIds]⟩

/-- Entering and queuing a body's instances below its scope occurrence keeps `inv`. -/
theorem beginInstances_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {run : MultiInstanceRun} {state : State}
    (entering : Entering inv settled run state run.instances []) :
    inv (Feature.MultiInstance.beginInstances ctx loop items run state) := by
  unfold Feature.MultiInstance.beginInstances
  split
  rename_i current instances requests folded
  have same := congrArg (fun acc : State × List Iteration × List BeginRequest =>
    Entering inv settled run acc.1 acc.2.1 acc.2.2) folded
  have done : Entering inv settled run current instances requests :=
    same.mp (foldl_keeps (fun acc : State × List Iteration × List BeginRequest =>
      Entering inv settled run acc.1 acc.2.1 acc.2.2) _ _ _
        (fun acc index _ held => enterInstance_entering ops held index _ _) entering)
  obtain ⟨holds, carried, _, rest⟩ := queueInstances_keeps (ctx := ctx) (mode := loop.mode) ops done
  have placed := rest.1
  unfold Feature.MultiInstance.setRun
  refine ops.runs _ _ holds fun other inside => ?_
  dsimp only at inside
  split at inside
  · obtain ⟨found, kept, rfl⟩ := List.mem_map.mp inside
    split
    · exact .inr ⟨carried, placed⟩
    · exact .inl kept
  · rcases List.mem_append.mp inside with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr ⟨carried, placed⟩

/-- Entering the body's scope occurrence below a begun occurrence's own, which it owns, arming its boundaries or not, and
beginning the instances below it, none active yet, keeps `inv`. -/
theorem enterBody_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : MultiInstanceOps inv settled)
    {ctx : Ctx} {loop : MultiInstance} {items : List Value} {occurrence : Occurrence} {state : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (element : ElementId)
    (locals : List (String × Value)) (unarmed : Bool) (collection : Value) (instances : List Iteration)
    (waiting : ∀ scope, Iteration.active scope ∉ instances) :
    inv (Feature.MultiInstance.beginInstances ctx loop items
      { scope := (state.enterScope element occurrence.scope locals (some occurrence.id)).2, element,
        occurrence := occurrence.id, collection, instances }
      (if unarmed then (state.enterScope element occurrence.scope locals (some occurrence.id)).1
        else (state.enterScope element occurrence.scope locals (some occurrence.id)).1.signal
          (.arm occurrence.id element occurrence.scope))) := by
  have stands := ops.housed _ _ holds member
  obtain ⟨entered, carry, _⟩ := ops.enter state element occurrence.scope locals (some occurrence.id) holds stands
    fun id named => ⟨occurrence, member, Option.some.inj named, begun, rfl⟩
  have carried := carry _ (ops.begun _ _ holds member begun)
  rw [Laws.State.enterScope_eq] at entered carried ⊢
  refine beginInstances_keeps ops ?_
  have none : ∀ (current : State) (run : MultiInstanceRun), run.instances = instances →
      Laws.State.Placed current { run with instances := run.instances } := fun _ run same scope active => by
    rw [same] at active
    exact absurd active (waiting scope)
  cases unarmed
  · have present : occurrence ∈ (_ : State).occurrences := member
    obtain ⟨armed, carryArm⟩ := ops.arm _ occurrence element entered present begun
    refine ⟨armed, carryArm _ carried, ?_, none _ _ rfl, fun _ none => by cases none⟩
    rw [Laws.State.signal_eq]
    simp [Laws.State.scopeIds]
  · exact ⟨entered, carried, by simp [Laws.State.scopeIds], none _ _ rfl, fun _ none => by cases none⟩

/-- `Hooks.arriveMultiInstance` keeps `inv`: an unavailable read holds the begun occurrence, an empty body completes
it, and otherwise it enters the body's scope occurrence, which it owns, arms its boundaries and begins the instances. -/
theorem arriveMultiInstance_keeps {inv : State → Prop} {settled : State → Nat → Prop}
    (ops : MultiInstanceOps inv settled) {ctx : Ctx} {header : Header} {envelope : Envelope} {loop : MultiInstance}
    {occurrence : Occurrence} {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (begun : occurrence.begun = true)
    (ran : Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after) :
    inv after := by
  unfold Feature.MultiInstance.arriveMultiInstance at ran
  simp only [bind, Except.bind] at ran
  split at ran
  · cases ran
  · split at ran
    · cases ran
      exact ops.hold _ _ holds
    · cases ran
      exact ops.complete _ _ _ _ _ holds (ops.begun _ _ holds member begun)
    · cases ran
      exact enterBody_keeps ops holds member begun _ _ _ _ _ fun _ active => by simp at active

end Kernel.Laws.MultiInstance
