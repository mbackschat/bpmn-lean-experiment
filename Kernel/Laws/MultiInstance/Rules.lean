module

public import Kernel.Hooks
public import Kernel.Laws.State

/-! # Laws of Multi-Instance Activities: the rules

The rules of the [Multi-Instance semantics](../../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md) over a
running body's slot record `MultiInstanceRun` and the `State` around it, stated without reading
`Kernel.Feature.MultiInstance`, so that what reads them alone, the witnesses (`Kernel.Laws.MultiInstance.Witnesses`),
stays outside the feature's rebuild cone (guard 15): the instance count fixed on entry, a sequential re-read's item,
generation numbering and the counter locals, ownership of the instance scope occurrences, sequential and parallel slot
shapes, early completion and the output collection. `Kernel.Laws.MultiInstance` proves what the feature's hooks keep of
them.

The mode of a loop is `MultiInstanceMode`, whose matching `Kernel.Feature.MultiInstance` owns (guard 1), so the
sequential and parallel slot shapes are separate laws the proof wave selects by the loop's mode. Each law has its
non-vacuity witness in `Kernel.Laws.MultiInstance.Witnesses`: values that satisfy it and, where the law could otherwise
hold of everything, values that violate it. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel
open Kernel.Laws.State (Within)

/-- The Multi-Instance loop characteristics the element `element` carries (BPMN 2.0.2 §10.3.8, Table 10.30). -/
def LoopOf (program : Program) (element : ElementId) (loop : MultiInstance) : Prop :=
  ((program.element? element).bind (·.envelope?)).bind (·.multiInstance) = some loop

/-- The program's identifiers are unique: no two of its elements share a header identifier, and no boundary of its
elements has an identifier that names an element. It is the IL contract that `Boundary.id` "is unique in the program,
as `Header.id` is" (`Kernel/IL/Types.lean:118`), which compiled programs satisfy and the codec does not check. A
reservation is an occurrence of its identifier under the element role (`State.reserve`), so a boundary or a start Event
whose identifier named a Multi-Instance Activity could reserve an occurrence of that Activity, which is no instance, in
an instance's scope occurrence: the statements that read instance identity (`InstancesPlaced`) are false of programs
that break the contract, and take it as a model premise (root decision, 2026-11-14). The boundary clause ranges over
every element the program lists, since a firing finds its boundary among them all (`Program.boundary?`). -/
structure IdsUnique (program : Program) : Prop where
  headers : (program.elements.map (·.header.id)).Nodup
  boundaries : ∀ element ∈ program.elements, ∀ envelope, element.envelope? = some envelope →
    ∀ boundary ∈ envelope.boundaries, program.element? boundary.id = none

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

/-- The body's scope occurrence belongs to the body occurrence, which entered it (`MultiInstance.arriveMultiInstance`),
so removing the body occurrence removes the scope occurrence and every instance below it (§13.3.7). -/
def BodyOwns (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ entry ∈ s.scopes, entry.id = run.scope → entry.occurrence = some run.occurrence

/-- An active instance's scope occurrence belongs to no occurrence: the body enters it and leaves it itself when the
instance completes (`MultiInstance.beginInstances`, `MultiInstance.instanceCompleted`), so no occurrence's removal
leaves it while its slot is active. -/
def InstancesUnowned (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ scope, Iteration.active scope ∈ run.instances → ∀ entry ∈ s.scopes, entry.id = scope → entry.occurrence = none

/-- No compensation run holds an active instance's scope occurrence as a running handler's context: a context is a scope
occurrence entered afresh for its handler (`Compensation.beginHandler`), so releasing one never leaves an instance. -/
def InstancesUnheld (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ scope, Iteration.active scope ∈ run.instances → ∀ other ∈ s.slots.compensation.runs, scope ∉ other.running.map (·.1)

/-- One running body per body occurrence: the slot record of an occurrence is the one `MultiInstance.runOf?` finds. -/
def RunsKeyed (s : State) : Prop :=
  (s.slots.multiInstances.map (·.occurrence)).Nodup

/-- The instances of one body are numbered in item order: of two active slots, the instance in the earlier slot's scope
occurrence has the lower activation. An instance is an occurrence carrying the continuation `.multiInstance` of the
body occurrence, which its begin carries (`MultiInstance.beginInstances`); that an occurrence of the Activity in an
instance's scope occurrence is its instance is `InstancesPlaced`, and the two together number every occurrence of the
Activity in the slots' scope occurrences (`numbered_of_placed`). The activation counter runs across the whole Process
instance, so an instance's activation is `offset + index + 1` only while no other body of the element begins instances
in between, and only the order within a body is its own: two concurrent bodies interleave their numbers
([Multi-Instance, entry and generation](../../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md#entry-and-generation),
the instance activation item, and its witness `multi-instance-nesting/parallel-sequential-sites-in-order`). -/
def NumberedInOrder (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ (first second : Nat) (firstScope secondScope : ScopeOccurrenceId), first < second →
    run.instances[first]? = some (.active firstScope) → run.instances[second]? = some (.active secondScope) →
    ∀ earlier ∈ s.occurrences, ∀ later ∈ s.occurrences, earlier.scope = firstScope → later.scope = secondScope →
      earlier.continuation = .multiInstance run.occurrence → later.continuation = .multiInstance run.occurrence →
      earlier.activation < later.activation

/-- Instance identity: an occurrence of the body's element under the element role in an active instance's scope
occurrence is that instance, continuing into the body (§13.3.7; CIB runs each instance in an execution of its own below
the body's). It states identity, not isolation: that nothing else stands in an instance's scope occurrence is not
stated, since a raise rethrown from an Event Sub-Process of a Multi-Instance Sub-Process begins that handler again there
(#158). -/
def InstancesPlaced (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ scope, Iteration.active scope ∈ run.instances → ∀ o ∈ s.occurrences, o.scope = scope → o.element = run.element →
    o.role = .element → o.continuation = .multiInstance run.occurrence

/-- Numbered instances, each the one occurrence of the body's element under the element role in its scope occurrence,
number every such occurrence in the slots' scope occurrences in item order. -/
theorem numbered_of_placed {s : State} {run : MultiInstanceRun} (numbered : NumberedInOrder s run)
    (placed : InstancesPlaced s run) :
    ∀ (first second : Nat) (firstScope secondScope : ScopeOccurrenceId), first < second →
      run.instances[first]? = some (.active firstScope) → run.instances[second]? = some (.active secondScope) →
      ∀ earlier ∈ s.occurrences, ∀ later ∈ s.occurrences, earlier.scope = firstScope → later.scope = secondScope →
        earlier.element = run.element → later.element = run.element → earlier.role = .element →
        later.role = .element → earlier.activation < later.activation :=
  fun first second firstScope secondScope lower one two earlier earlierIn later laterIn atFirst atSecond earlierElement
      laterElement earlierRole laterRole =>
    numbered first second firstScope secondScope lower one two earlier earlierIn later laterIn atFirst atSecond
      (placed firstScope (List.mem_of_getElem? one) earlier earlierIn atFirst earlierElement earlierRole)
      (placed secondScope (List.mem_of_getElem? two) later laterIn atSecond laterElement laterRole)

/-! ## Queued instance begins

An instance's begin waits in a queue from its body's entry or from its predecessor's completion until the closure
reaches it, so whether instances number in item order depends on the order of the begins still queued. A committed
running state queues nothing, so these are inductive strengthening (root decision, 2026-11-14). -/

/-- The queued begin `request` begins the instance in slot `index` of `run`. -/
def QueuedFor (run : MultiInstanceRun) (index : Nat) (request : BeginRequest) : Prop :=
  request.continuation = .multiInstance run.occurrence ∧ run.instances[index]? = some (.active request.scope)

/-- A reservation of `element` still to be made: a queued `Signal.occur`, or the resume of a queued compensation or of a
compensation run that ends by reserving it (`Compensation.advance`). -/
def OccurPending (s : State) (element : ElementId) : Prop :=
  (∃ scope leave writes rule, Signal.occur element scope leave writes rule ∈ s.signals) ∨
    (∃ scope activity trigger leave at_ resumed,
      Signal.compensate scope activity trigger leave (some (.occur element at_ resumed)) ∈ s.signals) ∨
    ∃ run ∈ s.slots.compensation.runs, ∃ at_ leave, run.resume = some (.occur element at_ leave)

/-- `element` is a reservation still to be made in a state that keeps `rel`: where a queued `Signal.occur`, a queued
compensation's resume or a held compensation run's resume came from once the closure has taken it. -/
def PendingIn (rel : State → Prop) (element : ElementId) : Prop :=
  ∃ held, rel held ∧ OccurPending held element

/-- What the instances' begins still queued need for the numbering: every body's element loops, and its instances'
scope occurrences belong to no called instance, so they share one activation counter; an instance is an occurrence of
the body's element under the element role (`continued`); a queued instance begin targets an active slot of its body,
while that slot's scope occurrence stands, with the body's element and no reservation (`targets`); no queued begin into
an instance's scope occurrence begins a reservation of the body's element under the element role, and every reservation
continues by its flows (`reserved`, `reservations`), and no reservation still to be made names a looping element, as a
boundary's or an Event's never does under `IdsUnique` (`occurs`); the closure takes queued begins in slot order: begin signals first
in, first out, deferred begins last in, first out, and only under `declarationDepthFirst` (`Step.nextToken`); and every
instance that has begun lies in a slot below every one still queued (`above`). -/
structure BeginsQueued (program : Program) (s : State) : Prop where
  looped : ∀ run ∈ s.slots.multiInstances, ∃ loop, LoopOf program run.element loop
  uncalled : ∀ run ∈ s.slots.multiInstances, ∀ scope, Iteration.active scope ∈ run.instances →
    ∀ entry ∈ s.scopes, entry.id = scope → entry.calledInstance = none
  continued : ∀ run ∈ s.slots.multiInstances, ∀ o ∈ s.occurrences, o.continuation = .multiInstance run.occurrence →
    o.element = run.element ∧ o.role = .element
  targets : ∀ request, Laws.State.Queued s request → ∀ body, request.continuation = .multiInstance body →
    request.scope ∈ Laws.State.scopeIds s → ∃ run ∈ s.slots.multiInstances, run.occurrence = body ∧
      request.element = run.element ∧ request.reserved = none ∧ Iteration.active request.scope ∈ run.instances
  reserved : ∀ request, Laws.State.Queued s request → ∀ run ∈ s.slots.multiInstances,
    Iteration.active request.scope ∈ run.instances → ∀ id, request.reserved = some id → ∀ o ∈ s.occurrences,
      o.id = id → o.element = run.element → o.role = .element → False
  reservations : ∀ o ∈ s.occurrences, o.begun = false → o.continuation = .flow
  occurs : ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop
  signalsOrdered : ∀ run ∈ s.slots.multiInstances, ∀ first second first' second',
    Laws.State.Precedes s.signals (.begin first) (.begin second) → QueuedFor run first' first →
    QueuedFor run second' second → first' < second'
  tokensOrdered : ∀ run ∈ s.slots.multiInstances, ∀ first second first' second',
    Laws.State.Precedes s.tokens (.begin first) (.begin second) → QueuedFor run first' first →
    QueuedFor run second' second → second' < first'
  queuesOrdered : ∀ run ∈ s.slots.multiInstances, ∀ first second first' second', Signal.begin first ∈ s.signals →
    Token.begin second ∈ s.tokens → QueuedFor run first' first → QueuedFor run second' second → first' < second'
  deferred : program.options.branchSchedule = .orderInvariant → ∀ request, Token.begin request ∉ s.tokens
  above : ∀ run ∈ s.slots.multiInstances, ∀ request (index queued : Nat) scope, Laws.State.Queued s request →
    QueuedFor run queued request → run.instances[index]? = some (.active scope) →
    (∃ o ∈ s.occurrences, o.scope = scope ∧ o.continuation = .multiInstance run.occurrence) → index < queued

/-- Under `MultiInstanceCounters.cibLocals` each instance's scope occurrence is entered holding `loopCounter`, its
zero-based index (CIB-INT-0018, `MultiInstanceActivityBehavior:76-78`): every active slot of `after` whose scope
occurrence was issued since `before` has a variable set there binding it. -/
def SlotsCounted (before after : State) : Prop :=
  ∀ run ∈ after.slots.multiInstances, ∀ (index : Nat) (scope : ScopeOccurrenceId),
    run.instances[index]? = some (.active scope) → before.nextIssue ≤ scope.value →
    ∃ locals ∈ after.variables, locals.scope = scope ∧ ("loopCounter", Value.int index) ∈ locals.entries

/-- The number of a body's filled slots. -/
def filledCount (run : MultiInstanceRun) : Nat :=
  (run.instances.filter fun
    | .completed _ => true
    | .waiting => false
    | .active _ => false).length

/-- The number of a body's active instances as CIB counts them: never below 1 in sequential mode
(`SequentialMultiInstanceActivityBehavior:38-45`), the unfilled slots in parallel mode
(`ParallelMultiInstanceActivityBehavior:84-87`). -/
def activeCount (mode : MultiInstanceMode) (run : MultiInstanceRun) : Nat :=
  match mode with
  | .sequential => 1
  | .parallel => run.instances.length - filledCount run

/-- Under `MultiInstanceCounters.cibLocals` the counters a completing instance reads are CIB's (CIB-INT-0018): the
locals of its scope occurrence, `instanceLocals`, bind `loopCounter` to its zero-based `index`, and the locals of the body's
scope occurrence, `bodyLocals`, the count, the active instances and the filled slots of `run`
(`MultiInstanceActivityBehavior:196-204`). -/
def CountersHeld (instanceLocals bodyLocals : List (String × Value)) (run : MultiInstanceRun) (loop : MultiInstance)
    (index : Nat) : Prop :=
  instanceLocals.lookup "loopCounter" = some (.int index) ∧
    bodyLocals.lookup "nrOfInstances" = some (.int run.instances.length) ∧
    bodyLocals.lookup "nrOfActiveInstances" = some (.int (activeCount loop.mode run)) ∧
    bodyLocals.lookup "nrOfCompletedInstances" = some (.int (filledCount run))

/-- Instances begin in generation order: within one input's journal the start facts of `element` in the process
instance `processInstance` carry increasing activations, so with `NumberedInOrder` the instance of item `k` begins before
the instance of item `k + 1`, in both modes and under both branch schedules. -/
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

/-- A filled slot holds what its instance submitted (`SMI-ITERATE-01`, `PMI-COMPLETE-01`): an output whenever the loop
names an output data item, and a String when the input collection is a String List, whose output collection holds
Strings only (`MultiInstance.submitted`). -/
def OutputsFit (run : MultiInstanceRun) (loop : MultiInstance) : Prop :=
  ∀ output, Iteration.completed output ∈ run.instances → (loop.outputDataItem.isSome → output.isSome) ∧
    ∀ value, output = some value → ∀ items, run.collection = .stringList items → ∃ text, value = .string text

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


end Kernel.Laws.MultiInstance
