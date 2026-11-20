module

public import Kernel.Laws.MultiInstance.Rules
public import Kernel.Laws.Step.Signals

/-! # Laws of Multi-Instance Activities: non-vacuity witnesses

The witnesses of the laws of `Kernel.Laws.MultiInstance.Rules`: values that satisfy each law and, where the law could otherwise
hold of everything, values that violate it. It reads no body. Nothing executable imports this module.

A body occurrence 1 of `Review` in the root, its scope occurrence 2, and instance scope occurrences 3 and 4 holding the
instance occurrences 5 (activation 1) and 6 (activation 2).
-/

@[expose] public section

namespace Kernel.Laws.MultiInstance

open Kernel

def review : ElementId := ⟨"Review"⟩
def root : ScopeOccurrenceId := .ofSegments []
def bodyScope : ScopeOccurrenceId := .ofSegments [{ element := review, ordinal := 0 }]
def firstScope : ScopeOccurrenceId := .ofSegments [{ element := review, ordinal := 0 }, { element := review, ordinal := 0 }]
def secondScope : ScopeOccurrenceId := .ofSegments [{ element := review, ordinal := 1 }, { element := review, ordinal := 0 }]

/-- The witnesses' occurrence keys: the body's in the root and each instance's in its own scope occurrence. -/
@[simp] def bodyKey : OccurrenceId := { scope := root, element := review, ordinal := 0 }
@[simp] def firstKey : OccurrenceId := { scope := firstScope, element := review, ordinal := 0 }
@[simp] def secondKey : OccurrenceId := { scope := secondScope, element := review, ordinal := 0 }

def running : MultiInstanceRun :=
  { scope := bodyScope, element := review, occurrence := bodyKey, collection := .stringList ["x", "x"]
    instances := [.active firstScope, .active secondScope] }

def bodyOccurrence : Occurrence := { id := bodyKey, element := review, scope := root, activation := 1, role := .multiInstanceBody }
def firstInstance : Occurrence :=
  { id := firstKey, element := review, scope := firstScope, activation := 1, continuation := .multiInstance bodyKey }
def secondInstance : Occurrence :=
  { id := secondKey, element := review, scope := secondScope, activation := 2, continuation := .multiInstance bodyKey }

def firstOwned : ScopeOccurrence := { id := firstScope, element := some review }
def secondOwned : ScopeOccurrence := { id := secondScope, element := some review }
def firstLocals : ScopeVariables := { scope := firstScope, entries := [("item", .string "x"), ("loopCounter", .int 0)] }
def secondLocals : ScopeVariables := { scope := secondScope, entries := [("item", .string "x"), ("loopCounter", .int 1)] }

def entered : State :=
  { instanceId := "p"
    scopes := [{ id := root, element := none },
      { id := bodyScope, element := some review, occurrence := some bodyKey }, firstOwned, secondOwned]
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
    | 0 => simp [running] at slot; subst slot; exact ⟨firstOwned, by simp [entered], rfl, by simp [firstOwned, firstScope, running, bodyScope]⟩
    | 1 => simp [running] at slot; subst slot; exact ⟨secondOwned, by simp [entered], rfl, by simp [secondOwned, secondScope, running, bodyScope]⟩
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

theorem body_owned : BodyOwns entered running := by
  intro entry member named
  simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl | rfl <;> simp_all [running, root, bodyScope, firstOwned, secondOwned, firstScope,
    secondScope]

/-- A body scope occurrence no occurrence owns breaks `BodyOwns`. -/
theorem unowned_body_rejected :
    ¬ BodyOwns { entered with scopes := [{ id := bodyScope, element := some review }] } running :=
  fun owns => by simpa using owns { id := bodyScope, element := some review } (by simp) rfl

theorem instances_unowned : InstancesUnowned entered running := by
  intro scope active entry member named
  simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at member
  simp only [running, List.mem_cons, List.not_mem_nil, or_false] at active
  rcases member with rfl | rfl | rfl | rfl <;> rcases active with ⟨⟩ | ⟨⟩ <;>
    simp_all [root, bodyScope, firstOwned, secondOwned, firstScope, secondScope]

/-- An instance scope occurrence an occurrence owns breaks `InstancesUnowned`. -/
theorem owned_instance_rejected :
    ¬ InstancesUnowned { entered with scopes := [{ firstOwned with occurrence := some firstKey }] } running :=
  fun unowned => by
    simpa [firstOwned] using unowned firstScope (by simp [running]) { firstOwned with occurrence := some firstKey } (by simp) rfl

theorem instances_unheld : InstancesUnheld entered running := fun _ _ _ member => by simp [entered] at member

def heldFirst : CompensationRun :=
  { trigger := ⟨"p", review, 1⟩, scope := bodyScope, pending := [], leave := none, resume := none
    running := [(firstScope, { subject := review, handler := none, scope := bodyScope })] }

/-- A compensation run whose handler runs in an instance's scope occurrence breaks `InstancesUnheld`. -/
theorem held_instance_rejected :
    ¬ InstancesUnheld { entered with slots := { entered.slots with compensation := { runs := [heldFirst] } } } running :=
  fun unheld => unheld firstScope (by simp [running]) heldFirst (by simp) (by simp [heldFirst])

theorem runs_keyed : RunsKeyed entered := by simp [RunsKeyed, entered, running]

/-- Two runs of one body occurrence break `RunsKeyed`. -/
theorem twice_keyed_rejected : ¬ RunsKeyed { entered with slots := { multiInstances := [running, running] } } := by
  simp [RunsKeyed]

theorem entered_numbered : NumberedInOrder entered running := by
  intro first second one two lower inFirst inSecond earlier earlierMember later laterMember atFirst atSecond continued
    continued'
  clear continued continued'
  match first, second with
  | 0, 1 =>
    simp [running] at inFirst inSecond
    subst inFirst inSecond
    simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at earlierMember laterMember
    rcases earlierMember with rfl | rfl | rfl <;> rcases laterMember with rfl | rfl | rfl <;>
      simp_all [bodyOccurrence, firstInstance, secondInstance, firstScope, secondScope, root]
  | _ + 2, _ => simp [running] at inFirst
  | _, _ + 2 => simp [running] at inSecond
  | 0, 0 | 1, 0 | 1, 1 => omega

/-- Instance activations need not be consecutive: another body of the element may number instances in between. -/
theorem gapped_numbered :
    NumberedInOrder { entered with occurrences := [bodyOccurrence, firstInstance, { secondInstance with activation := 4 }] }
      running := by
  intro first second one two lower inFirst inSecond earlier earlierMember later laterMember atFirst atSecond continued
    continued'
  clear continued continued'
  match first, second with
  | 0, 1 =>
    simp [running] at inFirst inSecond
    subst inFirst inSecond
    simp only [List.mem_cons, List.not_mem_nil, or_false] at earlierMember laterMember
    rcases earlierMember with rfl | rfl | rfl <;> rcases laterMember with rfl | rfl | rfl <;>
      simp_all [bodyOccurrence, firstInstance, secondInstance, firstScope, secondScope, root]
  | _ + 2, _ => simp [running] at inFirst
  | _, _ + 2 => simp [running] at inSecond
  | 0, 0 | 1, 0 | 1, 1 => omega

/-- Instance activations in reverse slot order break `NumberedInOrder`. -/
theorem reversed_numbering_rejected :
    ¬ NumberedInOrder entered { running with instances := [.active secondScope, .active firstScope] } := fun numbered => by
  have := numbered 0 1 secondScope firstScope (by omega) (by simp) (by simp) secondInstance (by simp [entered])
    firstInstance (by simp [entered]) rfl rfl rfl rfl
  simp [secondInstance, firstInstance] at this

theorem instances_placed : InstancesPlaced entered running := by
  intro scope active o member at_ _ _
  simp only [entered, List.mem_cons, List.not_mem_nil, or_false] at member
  simp only [running, List.mem_cons, List.not_mem_nil, or_false] at active
  rcases member with rfl | rfl | rfl
  · rcases active with same | same <;> obtain rfl := Iteration.active.inj same
    · simp [bodyOccurrence, root, firstScope] at at_
    · simp [bodyOccurrence, root, secondScope] at at_
  · rfl
  · rfl

/-- `InstancesPlaced` states identity, not isolation: it holds of a state with an occurrence of another element in an
instance's scope occurrence. -/
theorem other_element_placed :
    InstancesPlaced
      { entered with occurrences := [{
          id := { scope := firstScope, element := ⟨"Other"⟩, ordinal := 0 }, element := ⟨"Other"⟩, scope := firstScope,
          activation := 1 }] } running := by
  intro scope _ o member _ element _
  simp only [List.mem_singleton] at member
  subst member
  simp [running, review] at element

/-- An occurrence of the Activity under the element role in an instance's scope occurrence that continues into another
body breaks `InstancesPlaced`. -/
theorem stray_occurrence_rejected :
    ¬ InstancesPlaced
      { entered with occurrences :=
        [{
          id := { scope := firstScope, element := review, ordinal := 1 }, element := review, scope := firstScope,
          activation := 3, continuation := .multiInstance { scope := root, element := review, ordinal := 1 } }] }
      running := fun placed => by
  have := Continuation.multiInstance.inj
    (placed firstScope (by simp [running]) _ (List.mem_singleton_self _) rfl rfl rfl)
  simp [running] at this

theorem slots_counted : SlotsCounted { entered with scopes := entered.scopes.take 2 } entered := by
  intro run member index scope slot _
  simp only [entered, List.mem_singleton] at member
  subst member
  match index with
  | 0 => simp [running] at slot; subst slot; exact ⟨firstLocals, by simp [entered], rfl, by simp [firstLocals]⟩
  | 1 => simp [running] at slot; subst slot; exact ⟨secondLocals, by simp [entered], rfl, by simp [secondLocals]⟩
  | _ + 2 => simp [running] at slot

/-- A one-based `loopCounter` breaks `SlotsCounted`. -/
theorem one_based_rejected :
    ¬ SlotsCounted { entered with scopes := entered.scopes.take 2 }
      { entered with variables := [{ scope := firstScope, entries := [("loopCounter", .int 1)] }] } :=
  fun counted => by
    obtain ⟨locals, member, _, entry⟩ :=
      counted running (by simp [entered]) 0 firstScope (by simp [running])
        (by
          rw [show firstScope = bodyScope.child review 0 by
            rw [Laws.State.child_eq]; simp [firstScope, bodyScope]]
          exact Laws.State.unissued_of_count (parent := bodyScope) (element := review) (ordinal := 0) (by simp [entered])
            (by simp [Laws.State.slotCount, entered]))
    simp only [List.mem_singleton] at member
    subst member
    simp at entry

def bodyLocals : List (String × Value) :=
  [("nrOfInstances", .int 2), ("nrOfActiveInstances", .int 2), ("nrOfCompletedInstances", .int 0)]

def reviews (mode : MultiInstanceMode) : MultiInstance := { mode, count := .cardinality (.literal (.int 2)) }

theorem counters_held : CountersHeld firstLocals.entries bodyLocals running (reviews .parallel) 0 :=
  ⟨rfl, rfl, rfl, rfl⟩

/-- A sequential body counts one active instance, so two break `CountersHeld`. -/
theorem sequential_active_rejected : ¬ CountersHeld firstLocals.entries bodyLocals running (reviews .sequential) 0 :=
  fun ⟨_, _, active, _⟩ => by
    have : some (Value.int 2) = some (Value.int (1 : Nat)) := active
    simp at this

/-- The second instance's `loopCounter` read for the first breaks `CountersHeld`. -/
theorem other_counter_rejected : ¬ CountersHeld secondLocals.entries bodyLocals running (reviews .parallel) 0 :=
  fun ⟨counter, _⟩ => by
    have : some (Value.int 1) = some (Value.int (0 : Nat)) := counter
    simp at this

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
def withOutput (output : Option String) : MultiInstance :=
  { mode := .parallel, count := .collection (.variable "items"), outputDataItem := output }

theorem outputs_fit :
    OutputsFit { running with instances := [.completed (some (.string "a")), .active secondScope] } (withOutput (some "out")) := by
  intro output member
  simp at member
  subst member
  exact ⟨fun _ => rfl, fun value same _ _ => ⟨"a", (Option.some.inj same).symm⟩⟩

/-- A filled slot without the output data item's value breaks `OutputsFit`. -/
theorem missing_output_rejected : ¬ OutputsFit { running with instances := [.completed none] } (withOutput (some "out")) :=
  fun fit => by simpa using (fit none (by simp)).1 rfl

/-- A non-String output of a String List body breaks `OutputsFit`. -/
theorem foreign_output_rejected :
    ¬ OutputsFit { running with instances := [.completed (some (.int 1))] } (withOutput none) := fun fit => by
  obtain ⟨_, wrong⟩ := (fit (some (.int 1)) (by simp)).2 (.int 1) rfl ["x", "x"] rfl
  cases wrong


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

/-! ## Queued instance begins -/

/-- The begin of the second instance, queued. -/
def secondBegin : BeginRequest := { element := review, scope := secondScope, continuation := .multiInstance bodyKey }

/-- The first instance begun, the second's begin queued. -/
def queuing : State :=
  { entered with occurrences := [firstInstance], batchSignals := [.begin secondBegin] }

theorem queuing_queued : QueuedFor running 1 secondBegin := ⟨rfl, rfl⟩

/-- Under any program whose `Review` loops. -/
theorem begins_queued {program : Program} {loop : MultiInstance} (looping : LoopOf program review loop) :
    BeginsQueued program queuing where
  looped run member := by
    simp only [queuing, entered, List.mem_singleton] at member
    subst member
    exact ⟨loop, looping⟩
  uncalled run member scope _ entry inside _ := by
    simp only [queuing, entered, List.mem_singleton] at member
    simp only [queuing, entered, List.mem_cons, List.not_mem_nil, or_false] at inside
    rcases inside with rfl | rfl | rfl | rfl <;> rfl
  continued run member o inside _ _ := by
    simp only [queuing, entered, List.mem_singleton] at member inside
    subst member inside
    exact ⟨rfl, rfl⟩
  targets request queued body continued _ := by
    rcases queued with signal | token
    · simp only [Laws.State.allSignals, queuing, entered, Laws.State.toList_empty, List.map_nil, List.nil_append, List.mem_singleton] at signal
      have := Signal.begin.inj signal
      subst this
      obtain rfl := Continuation.multiInstance.inj continued
      exact ⟨running, by simp [queuing, entered], rfl, rfl, rfl, by simp [running, secondBegin]⟩
    · simp [Laws.State.allQueuedTokens, queuing, entered] at token
  reserved request queued _ _ _ id reserved := by
    rcases queued with signal | token
    · simp only [Laws.State.allSignals, queuing, entered, Laws.State.toList_empty, List.map_nil, List.nil_append, List.mem_singleton] at signal
      have := Signal.begin.inj signal
      subst this
      simp [secondBegin] at reserved
    · simp [Laws.State.allQueuedTokens, queuing, entered] at token
  reservations o inside unbegun := by
    simp only [queuing, List.mem_singleton] at inside
    subst inside
    simp [firstInstance] at unbegun
  occurs _ pending := by
    rcases pending with signal | compensate | resumed
    · obtain ⟨_, rest⟩ := signal
      obtain ⟨_, _, _, member⟩ := rest
      exact absurd (List.mem_singleton.mp member) Laws.Step.occur_ne_begin
    · obtain ⟨_, _, _, rest⟩ := compensate
      obtain ⟨_, _, _, member⟩ := rest
      exact absurd (List.mem_singleton.mp member) Laws.Step.compensate_ne_begin
    · obtain ⟨_, member, _⟩ := resumed
      simp [queuing, entered] at member
  ordered _ _ := {
    signals := fun first second _ _ precedes _ _ => by
      have := precedes.length_le
      simp [queuing] at this
    tokens := fun _ _ _ _ precedes _ _ => by
      have := precedes.length_le
      simp [queuing, entered] at this
    queues := fun _ _ _ _ _ token _ _ => by simp [queuing, entered] at token
    apart := fun _ _ _ _ _ _ _ keyed _ => by simp [queuing, entered] at keyed
    keyedSignals := fun _ _ _ _ _ _ one _ _ _ _ => by simp [queuing, entered] at one
    keyedTokens := fun _ _ _ _ _ _ one _ _ _ => by simp [queuing, entered] at one
    keyedQueues := fun _ _ _ _ _ _ one _ _ _ => by simp [queuing, entered] at one }
  deferred _ _ token := by simp [Laws.State.allQueuedTokens, queuing, entered] at token
  above run member request index queued scope inQueue for_ slot begun := by
    simp only [queuing, entered, List.mem_singleton] at member
    subst member
    obtain ⟨o, inside, at_, _⟩ := begun
    simp only [queuing, List.mem_singleton] at inside
    subst inside
    rcases inQueue with signal | token
    · simp only [Laws.State.allSignals, queuing, entered, Laws.State.toList_empty, List.map_nil, List.nil_append, List.mem_singleton] at signal
      have := Signal.begin.inj signal
      subst this
      obtain ⟨_, queuedSlot⟩ := for_
      have one : queued = 1 := by
        match queued, queuedSlot with
        | 0, slotted => simp [running, secondBegin, firstScope, secondScope] at slotted
        | 1, _ => rfl
        | _ + 2, slotted => simp [running] at slotted
      have zero : index = 0 := by
        subst at_
        match index, slot with
        | 0, _ => rfl
        | 1, slotted => simp [running, firstInstance, firstScope, secondScope] at slotted
        | _ + 2, slotted => simp [running] at slotted
      omega
    · simp [Laws.State.allQueuedTokens, queuing, entered] at token

/-- A pending reservation of a looping element breaks `BeginsQueued`. -/
theorem looping_occur_rejected {program : Program} {loop : MultiInstance} (looping : LoopOf program review loop) :
    ¬ BeginsQueued program { queuing with batchSignals := [.occur review firstScope .outgoing [] .outward] } :=
  fun queued => queued.occurs review (.inl ⟨firstScope, .outgoing, [], .outward, List.mem_singleton_self _⟩) loop looping

/-- Begun occurrences alone name no looping element unbegun. -/
theorem entered_unbegun (program : Program) : UnbegunUnlooped program entered := fun o member unbegun => by
  simp only [entered, bodyOccurrence, firstInstance, secondInstance, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp at unbegun

/-- A reservation of a looping element breaks `UnbegunUnlooped`. -/
theorem looping_reservation_rejected {program : Program} {loop : MultiInstance} (looping : LoopOf program review loop) :
    ¬ UnbegunUnlooped program { entered with occurrences := [{ firstInstance with begun := false }] } :=
  fun unlooped => unlooped _ (List.mem_singleton_self _) rfl loop looping

/-- Two begins queued out of slot order break `BeginsQueued`. -/
theorem reversed_begins_rejected {program : Program} :
    ¬ BeginsQueued program
      { entered with occurrences := [], batchSignals := [.begin secondBegin, .begin { secondBegin with scope := firstScope }] } :=
    fun queued => by
  have := (queued.ordered running (by simp [entered])).signals secondBegin { secondBegin with scope := firstScope } 1 0
    (List.Sublist.refl _) ⟨rfl, rfl⟩ ⟨rfl, rfl⟩
  omega

/-- A begin queued below an instance that has begun breaks `BeginsQueued`. -/
theorem begun_above_rejected {program : Program} :
    ¬ BeginsQueued program
      { entered with occurrences := [secondInstance], batchSignals := [.begin { secondBegin with scope := firstScope }] } :=
    fun queued => by
  have := queued.above running (by simp [entered]) { secondBegin with scope := firstScope } 1 0 secondScope
    (.inl (by simp [Laws.State.allSignals, entered])) ⟨rfl, rfl⟩ rfl ⟨secondInstance, by simp, rfl, rfl⟩
  omega

end Kernel.Laws.MultiInstance
