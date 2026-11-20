module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.State.RemovalKeeps
public import Kernel.Proofs.MultiInstance.Occurs
public import Kernel.Proofs.Frame

/-! # Proofs: the reservations of looping elements and the order instances begin in

What an input keeps, under a program whose identifiers are unique (`IdsUnique`), of the reservations and begins of
looping elements (`BeginsKept`): no reservation names a looping element (`UnbegunUnlooped`), none is still to be made
(`OccurPending`), and the start facts the input has made of a looping element under the element role carry increasing
activations in the order they were made. Every reservation names a `Laws.IL.Reservable` element, a
boundary's identifier (`Laws.IL.BoundaryOf`) or one pending in a state that kept the relation, so none names a looping
element; a begin either begins a reservation, of an element that does not loop, or numbers a fresh activation above
every one its counter has issued, which every start fact of the input counts (`Laws.State.StartsCounted`).

The order is carried in two halves (DC4). A micro-step's body sees the closure's transitions as a fixed snapshot: its
draft's facts lie in order above every fact of the snapshot (`BeginsKept`, kept by `Laws.Step.BodyPhases`, which journal
nothing). Its conclusion journals the draft under its unit, which the run log records last, so the transitions of units
that ran later carry later activations (`LogOrder`, carried by `Laws.Step.settle_induction_log`), and the committed
journal, in run order (`Step.byRun`), carries them in order. The state operations' lemmas here
are each of what the frame records ask (`Proofs.Frame.FrameAlongside`, `ClosureAlongside`, `Alongside`), which this
module assembles and `Kernel.Proofs.MultiInstance.Registered` composes with the registered hooks, since this module may
not reach a feature's Laws module beyond its fan-in (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

open Kernel
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.IL (BoundaryOf Reservable)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique UnbegunUnlooped BeginsInOrder)
open Kernel.Laws.Step (OccurPending PendingIn)
open Kernel.Proofs.Frame (OccursAlongside ResumesPending Alongside StoresAlongside BodyAlongside)

/-! ## The relation -/

/-- The start facts of the closure's transitions, in no order. -/
def blockFacts (transitions : TreeMap UnitKey Transition compare) : List StartedFact :=
  (transitions.toList.map (·.2)).flatMap (·.started)

/-- A start fact of `element` under the element role in the process instance `processInstance`. -/
def Matches (processInstance : String) (element : ElementId) (fact : StartedFact) : Prop :=
  fact.occurrence.processInstanceId = processInstance ∧ fact.occurrence.element = element ∧ fact.occurrence.role = .element

/-- Every start fact of `element` in `later` carries an activation above every one in `earlier`. -/
def Above (earlier later : List StartedFact) (processInstance : String) (element : ElementId) : Prop :=
  ∀ first ∈ earlier, ∀ second ∈ later, Matches processInstance element first → Matches processInstance element second →
    first.occurrence.activation < second.occurrence.activation

/-- No reservation, made or still to be made, names a looping element, and the start facts of each looping element under
the element role that the micro-step in progress has made carry increasing activations in the order they were made, each
above every one of the closure's transitions `snapshot`, which the micro-step's body leaves as it found them. -/
structure Unlooped (program : Program) (snapshot : TreeMap UnitKey Transition compare) (s : State) : Prop where
  unbegun : UnbegunUnlooped program s
  occurs : ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop
  transitions : s.transitions = snapshot
  ordered : ∀ element loop processInstance, LoopOf program element loop →
    BeginsInOrder s.draft.started processInstance element
  above : ∀ element loop processInstance, LoopOf program element loop →
    Above (blockFacts snapshot) s.draft.started processInstance element

/-- `Unlooped` under a program whose identifiers are unique: the relation the frame and phase records carry, one for each
snapshot of the transitions. -/
def BeginsKept (program : Program) (transitions : TreeMap UnitKey Transition compare) (s : State) : Prop :=
  IdsUnique program → Unlooped program transitions s

variable {T : TreeMap UnitKey Transition compare}

/-- What `t` keeps of what `Unlooped` reads of `s`: each reservation of `t` is one of `s` or of an element that does not
loop, so is each reservation still to be made, and the transitions and draft start facts are `s`'s. -/
structure Keeps (program : Program) (s t : State) : Prop where
  unbegun : ∀ o ∈ t.occurrences, o.begun = false → o ∈ s.occurrences ∨ ∀ loop, ¬ LoopOf program o.element loop
  pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop
  transitions : t.transitions = s.transitions
  started : t.draft.started = s.draft.started

theorem Unlooped.carry {program : Program} {s t : State} (held : Unlooped program T s) (keeps : Keeps program s t) :
    Unlooped program T t :=
  ⟨fun o inside unbegun => (keeps.unbegun o inside unbegun).elim (fun old => held.unbegun o old unbegun) id,
    fun element pending => (keeps.pending element pending).elim (held.occurs element) id,
    keeps.transitions.trans held.transitions,
    fun element loop processInstance looped => keeps.started ▸ held.ordered element loop processInstance looped,
    fun element loop processInstance looped => keeps.started ▸ held.above element loop processInstance looped⟩

theorem BeginsKept.carry {program : Program} {s t : State} (held : BeginsKept program T s)
    (keeps : IdsUnique program → Keeps program s t) : BeginsKept program T t :=
  fun apart => (held apart).carry (keeps apart)

/-- A change that adds no occurrence, no reservation still to be made and no start fact keeps `BeginsKept`. -/
theorem BeginsKept.frame {program : Program} {s t : State} (held : BeginsKept program T s)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences)
    (pending : ∀ element, OccurPending t element → OccurPending s element) (transitions : t.transitions = s.transitions)
    (started : t.draft.started = s.draft.started) : BeginsKept program T t :=
  held.carry fun _ => ⟨fun o inside _ => .inl (occurrences o inside), fun element named => .inl (pending element named),
    transitions, started⟩

/-! ## The state operations the hooks apply -/

/-- Queuing a signal whose reservations name no looping element keeps `BeginsKept`. -/
theorem BeginsKept.signal {program : Program} {s : State} (held : BeginsKept program T s) (signal : Signal)
    (unlooped : IdsUnique program → ∀ element ∈ Laws.Step.occursOf [signal], ∀ loop, ¬ LoopOf program element loop) :
    BeginsKept program T (s.signal signal) := by
  rw [Laws.State.signal_eq]
  refine held.carry fun apart => ⟨fun o inside _ => .inl inside, fun element named => ?_, rfl, rfl⟩
  have queued : element ∈ Laws.Step.occursOf (Laws.State.allSignals { s with batchSignals := s.batchSignals ++ [signal] }) →
      OccurPending s element ∨
      ∀ loop, ¬ LoopOf program element loop := fun inside => by
    rw [Laws.State.allSignals_append, Laws.Step.occursOf_append] at inside
    rcases List.mem_append.mp inside with old | new
    · exact .inl ((Laws.Step.mem_occursOf.mp old).elim .inl (.inr ∘ .inl))
    · exact .inr (unlooped apart element new)
  rcases named with occur | compensate | resumed
  · exact queued (Laws.Step.mem_occursOf.mpr (.inl occur))
  · exact queued (Laws.Step.mem_occursOf.mpr (.inr compensate))
  · exact .inl (.inr (.inr resumed))

/-- Queuing a begin keeps `BeginsKept`. -/
theorem BeginsKept.signalBegin {program : Program} {s : State} (held : BeginsKept program T s) (request : BeginRequest) :
    BeginsKept program T (s.signal (.begin request)) :=
  held.signal _ fun _ _ inside => absurd inside List.not_mem_nil

theorem BeginsKept.takePosition {program : Program} {s : State} (held : BeginsKept program T s) : BeginsKept program T s.takePosition.1 := by
  rw [Laws.State.takePosition_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

theorem BeginsKept.enterScope {program : Program} {s : State} (held : BeginsKept program T s) (element : ElementId)
    (parent : ScopeOccurrenceId) (locals : List (String × Value)) (owner : Option OccurrenceId) :
    BeginsKept program T (s.enterScope element parent locals owner).1 := by
  rw [Laws.State.enterScope_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

theorem BeginsKept.enterCalled {program other : Program} {s : State} (formed : WellFormed other s)
    (held : BeginsKept program T s) (called : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) : BeginsKept program T (s.enterCalled called call variables definition).1 := by
  rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)]
  exact held.frame (fun _ inside => inside) (fun element named => pending_kept (.of_eq rfl rfl rfl rfl) rfl named) rfl rfl

/-- A reservation of an element that does not loop under a program whose identifiers are unique keeps `BeginsKept`. -/
theorem BeginsKept.reserve {program : Program} {s : State} {element : ElementId} (held : BeginsKept program T s)
    (unlooped : IdsUnique program → ∀ loop, ¬ LoopOf program element loop) (scope : ScopeOccurrenceId) :
    BeginsKept program T (s.reserve element scope).1 :=
  have reserves := Laws.State.reserve_reserves s element scope
  held.carry fun apart => ⟨fun o inside _ => by
      rw [reserves.occurrences] at inside
      rcases List.mem_append.mp inside with old | new
      · exact .inl old
      · rw [List.mem_singleton.mp new, reserves.kind]
        exact .inr (unlooped apart),
    fun element named => .inl (pending_kept reserves.queues (congrArg (·.compensation.runs) reserves.slots) named),
    reserves.transitions, by rw [reserves.draft]⟩

/-- Leaving a scope occurrence that stands keeps `BeginsKept`: it only takes away. -/
theorem BeginsKept.leaveScope {program other : Program} {s : State} (formed : WellFormed other s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (held : BeginsKept program T s) :
    BeginsKept program T (s.leaveScope scope) :=
  have left := Laws.State.leaveScope_left formed present
  held.frame (fun o inside => ((left.occurrences o).mp inside).1)
    (fun _ named => pending_of_sublist left.queues.signal_mem left.slots.runs named)
    left.transitions left.started

/-- Clearing a scope occurrence that stands keeps `BeginsKept`: it only takes away. -/
theorem BeginsKept.clearInside {program other : Program} {s : State} (formed : WellFormed other s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (keep : List OccurrenceId) (held : BeginsKept program T s) :
    BeginsKept program T (s.clearInside scope keep) :=
  have cleared := Laws.State.clearInside_cleared formed present keep
  held.frame (fun o inside => ((cleared.occurrences o).mp inside).1)
    (fun _ named => pending_of_sublist cleared.queues.signal_mem cleared.slots.runs named)
    cleared.transitions cleared.started

theorem BeginsKept.disarm {program : Program} {s : State} (host : OccurrenceId) (held : BeginsKept program T s) :
    BeginsKept program T (s.disarm host) := by
  rw [Laws.State.disarm_eq]
  exact held.frame (fun _ inside => (List.mem_filter.mp inside).1) (fun _ named => named) rfl rfl

theorem BeginsKept.setVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (value : Value) (held : BeginsKept program T s) : BeginsKept program T (s.setVariable target name value) :=
  have same := Laws.State.setVariable_same s target name value
  held.frame (fun _ inside => same.occurrences ▸ inside)
    (fun _ named => pending_kept same.queues (congrArg (·.compensation.runs) same.slots) named) same.transitions
    (congrArg (·.started) same.draft)

theorem BeginsKept.removeVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (held : BeginsKept program T s) : BeginsKept program T (s.removeVariable target name) :=
  have same := Laws.State.removeVariable_same s target name
  held.frame (fun _ inside => same.occurrences ▸ inside)
    (fun _ named => pending_kept same.queues (congrArg (·.compensation.runs) same.slots) named) same.transitions
    (congrArg (·.started) same.draft)

/-- Storing compensation runs that resume only by reservations pending in `s` or in a state that kept the relation
keeps `BeginsKept`. -/
theorem BeginsKept.storeRuns {program : Program} {s : State} (compensation : Compensations)
    (resumes : ResumesPending (BeginsKept program T) s compensation) (held : BeginsKept program T s) :
    BeginsKept program T { s with slots := { s.slots with compensation } } :=
  held.carry fun apart => ⟨fun o inside _ => .inl inside, fun element named => by
      rcases named with occur | compensate | resumed
      · exact .inl (.inl occur)
      · exact .inl (.inr (.inl compensate))
      · obtain ⟨run, member, rest⟩ := resumed
        obtain ⟨at_, leave, resume⟩ := rest
        exact (resumes run member element at_ leave resume).imp_right
          (PendingIn.unlooped fun _ kept => (kept apart).occurs),
    rfl, rfl⟩

theorem BeginsKept.defer {program : Program} {s : State} (requests : List BeginRequest) (held : BeginsKept program T s) :
    BeginsKept program T (s.deferBegins requests) := by
  rw [Laws.State.deferBegins_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

theorem BeginsKept.runs {program : Program} {s : State} (runs : List MultiInstanceRun) (held : BeginsKept program T s) :
    BeginsKept program T { s with slots := { s.slots with multiInstances := runs } } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

/-- Dropping an occurrence's record keeps `BeginsKept`. -/
theorem BeginsKept.withoutRecord {program : Program} {s : State} (id : OccurrenceId) (held : BeginsKept program T s) :
    BeginsKept program T (Laws.State.withoutRecord s id) :=
  held.frame (fun _ inside => (List.mem_filter.mp inside).1) (fun _ named => named) rfl rfl

/-- Replacing the draft by one with the same start facts keeps `BeginsKept`. -/
theorem BeginsKept.draft {program : Program} {s : State} (draft : Draft) (started : draft.started = s.draft.started)
    (held : BeginsKept program T s) : BeginsKept program T { s with draft } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl started

/-! ## The phases a closure runs -/

/-- A start fact of the closure's transitions or of the draft is one of the input's start facts. -/
theorem starts_mem {s : State} {fact : StartedFact} (inside : fact ∈ blockFacts s.transitions ∨ fact ∈ s.draft.started) :
    fact ∈ Laws.State.starts s := by
  rw [Laws.State.starts]
  rcases inside with blocked | drafted
  · exact List.mem_append_left _ (List.mem_append_right _ blocked)
  · exact List.mem_append_right _ drafted

/-- The order of `element`'s start facts holds of a sublist. -/
theorem BeginsInOrder.sublist {facts fewer : List StartedFact} {processInstance : String} {element : ElementId}
    (ordered : BeginsInOrder facts processInstance element) (sub : fewer.Sublist facts) :
    BeginsInOrder fewer processInstance element :=
  List.Pairwise.sublist ((sub.filter _).map _) ordered

/-- A fact made last keeps the order of `element`'s start facts when, if it is one of them, its activation lies above
every earlier one's. -/
theorem BeginsInOrder.append {facts : List StartedFact} {fact : StartedFact} {processInstance : String}
    {element : ElementId} (ordered : BeginsInOrder facts processInstance element)
    (above : fact.occurrence.processInstanceId = processInstance → fact.occurrence.element = element →
      fact.occurrence.role = .element → ∀ earlier ∈ facts, earlier.occurrence.processInstanceId = processInstance →
        earlier.occurrence.element = element → earlier.occurrence.role = .element →
          earlier.occurrence.activation < fact.occurrence.activation) :
    BeginsInOrder (facts ++ [fact]) processInstance element := by
  unfold BeginsInOrder at ordered ⊢
  rw [List.filter_append, List.map_append]
  refine List.pairwise_append.mpr ⟨ordered, List.pairwise_map.mpr (List.Pairwise.sublist List.filter_sublist
    (List.pairwise_singleton _ _)), fun a aIn b bIn => ?_⟩
  obtain ⟨earlier, earlierIn, rfl⟩ := List.mem_map.mp aIn
  obtain ⟨last, lastIn, rfl⟩ := List.mem_map.mp bIn
  obtain ⟨earlierMember, earlierKept⟩ := List.mem_filter.mp earlierIn
  obtain ⟨lastMember, lastKept⟩ := List.mem_filter.mp lastIn
  rw [List.mem_singleton.mp lastMember] at lastKept ⊢
  simp only [Bool.and_eq_true, beq_iff_eq] at earlierKept lastKept
  exact above lastKept.1.1 lastKept.1.2 lastKept.2 earlier earlierMember earlierKept.1.1 earlierKept.1.2 earlierKept.2

/-- Journalling the draft as the transition of a unit the closure has not run keeps `BeginsKept` of the transitions
that hold it: the draft it empties held no fact. -/
theorem BeginsKept.journal {program : Program} {s : State} (unit : UnitKey) (transition : Transition)
    (held : BeginsKept program T s) :
    BeginsKept program (s.transitions.insert unit transition)
      { s with transitions := s.transitions.insert unit transition, draft := {}, writes := [] } := fun apart =>
  have kept := held apart
  ⟨kept.unbegun, fun element named => kept.occurs element named, rfl,
    fun _ _ _ _ => by simp [BeginsInOrder], fun _ _ _ _ _ _ _ inside => by simp at inside⟩

/-- Moving a micro-step's batches under its unit key keeps `BeginsKept`: the queue views keep their signals. -/
theorem BeginsKept.queueBatch {program : Program} {s : State} (unit : UnitKey) (held : BeginsKept program T s) :
    BeginsKept program T (s.queueBatch unit) := by
  have signals := Laws.State.allSignals_queueBatch s unit
  have same := Laws.State.queueBatch_eq s unit
  exact held.frame (t := s.queueBatch unit) (fun _ inside => by rw [same] at inside; exact inside)
    (fun _ named => pending_of_sublist (fun _ inside => signals.subset inside)
      (fun _ member => by rw [same] at member; exact member) named)
    (by rw [same]) (by rw [same])

/-- Taking signals off the queue keeps `BeginsKept`. -/
theorem BeginsKept.dequeue {program : Program} {s : State} {signals : List Signal} (fewer : signals.Sublist s.batchSignals)
    (held : BeginsKept program T s) : BeginsKept program T { s with batchSignals := signals } :=
  held.frame (t := { s with batchSignals := signals }) (fun _ inside => inside) (fun _ named =>
    pending_of_sublist (s := s) (t := { s with batchSignals := signals }) (fun _ inside =>
      (List.mem_append.mp inside).elim (List.mem_append_left _) fun batch => List.mem_append_right _ (fewer.subset batch))
    (fun _ member => member) named) rfl rfl

/-- Taking the closure's next signal off the queue keeps `BeginsKept`. -/
theorem BeginsKept.unqueue {program : Program} {s : State} (unit : UnitKey) (held : BeginsKept program T s) :
    BeginsKept program T { s with queuedSignals := s.queuedSignals.erase unit } :=
  held.frame (t := { s with queuedSignals := s.queuedSignals.erase unit }) (fun _ inside => inside) (fun _ named =>
    pending_of_sublist (s := s) (t := { s with queuedSignals := s.queuedSignals.erase unit }) (fun _ inside => by
      rcases List.mem_append.mp inside with keyed | batch
      · obtain ⟨key, found⟩ := Laws.State.mem_values.mp keyed
        exact List.mem_append_left _ (Laws.State.mem_values.mpr ⟨key, (Laws.State.getElem?_of_erase found).1⟩)
      · exact List.mem_append_right _ batch) (fun _ member => member) named) rfl rfl

/-- Taking the closure's next token off the queue keeps `BeginsKept`. -/
theorem BeginsKept.untoken {program : Program} {s : State} (unit : UnitKey) (held : BeginsKept program T s) :
    BeginsKept program T { s with queuedTokens := s.queuedTokens.erase unit } :=
  held.frame (t := { s with queuedTokens := s.queuedTokens.erase unit }) (fun _ inside => inside) (fun _ named => named) rfl rfl

/-- Beginning an admitted request keeps `BeginsKept`: a reservation it begins is of an element that does not loop, and
a fresh occurrence numbers an activation above every one its counter has issued, which every start fact of the input
counts. -/
theorem BeginsKept.begin {program other : Program} {s : State} {request : BeginRequest} (formed : WellFormed other s)
    (admitted : Laws.Step.Admitted s request) (role : ActivationRole) (sourceType : String)
    (held : BeginsKept program T s) : BeginsKept program T (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  intro apart
  have kept := held apart
  have fresh : ∀ (fact : StartedFact) processInstance element loop, LoopOf program element loop →
      fact.occurrence = Laws.State.key (s.beginOccurrence request role sourceType).1
        (s.beginOccurrence request role sourceType).2 →
      Matches processInstance element fact → ∀ earlier ∈ Laws.State.starts s, Matches processInstance element earlier →
        earlier.occurrence.activation < fact.occurrence.activation := by
    intro fact processInstance element loop looped named ⟨instanceNamed, elementNamed, roled⟩ earlier earlierIn
      ⟨earlierInstance, earlierElement, earlierRole⟩
    rw [named] at instanceNamed elementNamed roled ⊢
    simp only [Laws.State.key] at instanceNamed elementNamed roled
    rcases begins.source with ⟨reserved, reservation⟩ | issued
    · have named : reserved.id ∈ Laws.State.names request := by
        simp [Laws.State.names, reservation.named]
      have unbegun := ((admitted.2.1 reserved.id named).1.2 reserved reservation.member rfl).1
      rw [reservation.element] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun reserved reservation.member unbegun loop)
    · obtain ⟨count, member, countInstance, rest⟩ := formed.counted earlier earlierIn
      obtain ⟨countElement, countRole, below⟩ := rest
      have bound := issued.activated.above count member
        (by rw [countInstance, earlierInstance, ← instanceNamed, begins.instances, begins.scope])
        (by rw [countElement, earlierElement, ← elementNamed, issued.element])
        (by rw [countRole, earlierRole, ← roled, issued.roled])
      exact Nat.lt_of_le_of_lt below bound
  refine ⟨fun o inside unbegun => ?_, fun element named => kept.occurs element
    (pending_kept begins.queues (congrArg (·.compensation.runs) begins.slots) named),
    begins.transitions.trans kept.transitions, fun element loop processInstance looped => ?_,
    fun element loop processInstance looped => ?_⟩
  · rw [begins.occurrences] at inside
    rcases List.mem_append.mp inside with old | new
    · exact kept.unbegun o (List.mem_filter.mp old).1 unbegun
    · rw [List.mem_singleton.mp new, begins.isBegun] at unbegun
      cases unbegun
  · rw [begins.started]
    exact BeginsInOrder.append (kept.ordered element loop processInstance looped)
      fun instanceNamed elementNamed roled earlier earlierIn earlierInstance earlierElement earlierRole =>
        fresh _ processInstance element loop looped rfl ⟨instanceNamed, elementNamed, roled⟩ earlier
          (starts_mem (.inr earlierIn)) ⟨earlierInstance, earlierElement, earlierRole⟩
  · rw [begins.started]
    intro first firstIn second secondIn firstMatches secondMatches
    rcases List.mem_append.mp secondIn with old | new
    · exact kept.above element loop processInstance looped first firstIn second old firstMatches secondMatches
    · rw [List.mem_singleton.mp new] at secondMatches ⊢
      exact fresh _ processInstance element loop looped rfl secondMatches first
        (starts_mem (.inl (by rw [kept.transitions]; exact firstIn))) firstMatches

/-! ## The completion pipeline's own phases -/

/-- Starting a reservation where it stands and closing its items keeps `BeginsKept`: the reservation is of an element
that does not loop, so its start fact is none of a looping element's. -/
theorem BeginsKept.startReserved {program : Program} {s : State} {occurrence : Occurrence} (sourceType : String)
    (member : occurrence ∈ s.occurrences) (held : BeginsKept program T s) :
    BeginsKept program T ((s.startReserved occurrence sourceType).1.closeOwnItems occurrence.id) := by
  rw [Laws.State.closeOwnItems_eq]
  cases begun : occurrence.begun
  · have starts := Laws.State.startReserved_starts s sourceType begun
    intro apart
    have kept := held apart
    refine ⟨fun o inside unbegun => ?_, fun element named => kept.occurs element
      (pending_kept starts.queues (congrArg (·.compensation.runs) starts.slots) named),
      starts.transitions.trans kept.transitions, fun element loop processInstance looped => ?_,
      fun element loop processInstance looped => ?_⟩
    · rw [starts.occurrences] at inside
      obtain ⟨old, oldIn, made⟩ := List.mem_map.mp inside
      by_cases same : old.id = occurrence.id
      · simp only [same, ↓reduceIte] at made
        rw [← made] at unbegun
        cases unbegun
      · simp only [same, ↓reduceIte] at made
        exact made ▸ kept.unbegun old oldIn (made ▸ unbegun)
    · rw [starts.started]
      refine BeginsInOrder.append (kept.ordered element loop processInstance looped) fun _ elementNamed _ => ?_
      simp only [Laws.State.key] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun occurrence member begun loop)
    · rw [starts.started]
      intro first firstIn second secondIn firstMatches secondMatches
      rcases List.mem_append.mp secondIn with old | new
      · exact kept.above element loop processInstance looped first firstIn second old firstMatches secondMatches
      · rw [List.mem_singleton.mp new] at secondMatches
        have elementNamed := secondMatches.2.1
        simp only [Laws.State.key] at elementNamed
        exact absurd (elementNamed ▸ looped) (kept.unbegun occurrence member begun loop)
  · rw [Laws.State.startReserved_begun s sourceType begun]
    exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

/-- Journalling an end keeps `BeginsKept`. -/
theorem BeginsKept.recordEnd {program : Program} {s : State} (key : OccurrenceKey) (terminal : Terminal)
    (held : BeginsKept program T s) : BeginsKept program T (s.recordEnd key terminal) := by
  rw [Laws.State.recordEnd_eq]
  exact held.draft _ rfl

/-! ## Subscriptions' reservations and queued occurrences -/

/-- A reservation or queued occurrence a subscription makes names a reservable element, a boundary's identifier or one
pending in a state that kept the relation, none of which loops under a program whose identifiers are unique. -/
theorem beginsKept_occursAlongside (program : Program) (T : TreeMap UnitKey Transition compare) :
    OccursAlongside program (BeginsKept program T) where
  reserve s _ scope _ _ reservable _ held := held.reserve (fun apart => reservable_unlooped apart reservable) scope
  occur s element scope leave writes rule _ named _ held := held.signal _ fun apart other inside => by
    rw [List.mem_singleton.mp inside]
    exact named.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept apart).occurs)
  compensate s scope activity trigger leave element at_ resumed named _ _ held := held.signal _ fun apart other inside => by
    rw [List.mem_singleton.mp inside]
    exact named.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept apart).occurs)
  throwCompensate s _ _ _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  raise s _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  enterCalled _ call variables definition formed _ _ _ _ _ held :=
    held.enterCalled formed program call variables definition

/-! ## Through a closure -/

/-- What the closure's run log says of its transitions (DC4): every unit it records holds a transition, every
transition's unit ran at a position the log records, a transition's start facts of a looping element are in order, and
each lies below every one of a transition whose unit ran later. -/
structure LogOrder (program : Program) (log : Step.RunLog) (transitions : TreeMap UnitKey Transition compare) : Prop where
  ran : ∀ unit, unit ∈ log.positions → unit ∈ transitions
  logged : ∀ unit, unit ∈ transitions → unit ∈ log.positions ∧ log.runPosition unit < log.positions.size
  ordered : ∀ (unit : UnitKey) (transition : Transition), transitions[unit]? = some transition →
    ∀ element loop processInstance,
    LoopOf program element loop → BeginsInOrder transition.started processInstance element
  later : ∀ (one two : UnitKey) (first second : Transition), transitions[one]? = some first → transitions[two]? = some second → one ≠ two →
    log.runPosition one ≤ log.runPosition two → ∀ element loop processInstance, LoopOf program element loop →
      Above first.started second.started processInstance element

theorem LogOrder.empty (program : Program) : LogOrder program {} ∅ :=
  ⟨fun _ inside => by simp at inside, fun _ inside => by simp at inside, fun _ _ found => by simp at found,
    fun _ _ _ _ found => by simp at found⟩

/-- A transition's start facts are among the closure's. -/
theorem blockFacts_mem {transitions : TreeMap UnitKey Transition compare} {unit : UnitKey} {transition : Transition}
    {fact : StartedFact} (found : transitions[unit]? = some transition) (inside : fact ∈ transition.started) :
    fact ∈ blockFacts transitions :=
  List.mem_flatMap.mpr ⟨transition, Laws.State.mem_values.mpr ⟨unit, found⟩, inside⟩

/-- Journalling a draft whose start facts lie in order above the closure's transitions as the transition of a unit the
closure has not run, which the run log then records last, keeps `LogOrder`. -/
theorem LogOrder.record {program : Program} {log : Step.RunLog} {s : State} {unit : UnitKey} {transition : Transition}
    (order : LogOrder program log T) (kept : Unlooped program T s) (fresh : T[unit]? = none)
    (started : transition.started = s.draft.started) : LogOrder program (log.record unit) (T.insert unit transition) := by
  have unlogged : unit ∉ log.positions := fun logged => by
    have inside := order.ran unit logged
    simp [Std.ExtTreeMap.mem_iff_isSome_getElem?, fresh] at inside
  have older : ∀ other, other ≠ unit → (T.insert unit transition)[other]? = T[other]? := fun other apart => by
    rw [Std.ExtTreeMap.getElem?_insert, ite_eq_right fun same => apart (Std.LawfulEqOrd.eq_of_compare same).symm]
  refine ⟨fun other inside => ?_, fun other inside => ?_, fun other block found => ?_,
    fun one two first second found found' apart below element loop processInstance looped => ?_⟩
  · rcases Laws.Step.mem_record.mp inside with same | old
    · rw [same]; exact Std.ExtTreeMap.mem_insert_self
    · exact Std.ExtTreeMap.mem_insert.mpr (.inr (order.ran other old))
  · rw [Laws.Step.size_record unlogged, Laws.Step.runPosition_record]
    by_cases same : other = unit
    · rw [ite_eq_left same]
      exact ⟨Laws.Step.mem_record.mpr (.inl same), Nat.lt_succ_self _⟩
    · rw [ite_eq_right same]
      have old : other ∈ T := by
        rw [Std.ExtTreeMap.mem_iff_isSome_getElem?, ← older other same, ← Std.ExtTreeMap.mem_iff_isSome_getElem?]
        exact inside
      exact ⟨Laws.Step.mem_record.mpr (.inr (order.logged other old).1), Nat.lt_succ_of_lt (order.logged other old).2⟩
  · by_cases same : other = unit
    · rw [same, Std.ExtTreeMap.getElem?_insert_self] at found
      cases found
      rw [started]
      exact kept.ordered
    · rw [older other same] at found
      exact order.ordered other block found
  · rw [Laws.Step.runPosition_record, Laws.Step.runPosition_record] at below
    by_cases oneSame : one = unit <;> by_cases twoSame : two = unit
    · exact absurd (oneSame.trans twoSame.symm) apart
    · rw [ite_eq_left oneSame, ite_eq_right twoSame] at below
      rw [older two twoSame] at found'
      have old : two ∈ T := Std.ExtTreeMap.mem_iff_isSome_getElem?.mpr (by simp [found'])
      exact absurd (Nat.lt_of_le_of_lt below (order.logged two old).2) (Nat.lt_irrefl _)
    · rw [twoSame, Std.ExtTreeMap.getElem?_insert_self] at found'
      cases found'
      rw [older one oneSame] at found
      rw [started]
      exact fun fact factIn later laterIn => kept.above element loop processInstance looped fact
        (blockFacts_mem found factIn) later laterIn
    · rw [ite_eq_right oneSame, ite_eq_right twoSame] at below
      rw [older one oneSame] at found
      rw [older two twoSame] at found'
      exact order.later one two first second found found' apart below element loop processInstance looped

/-- What a closure carries under its run log `log`: `WellFormed`, and under a program whose identifiers are unique
`Unlooped` of the state's transitions and `LogOrder`. -/
def Logged (program : Program) (log : Step.RunLog) (s : State) : Prop :=
  WellFormed program s ∧ (IdsUnique program → Unlooped program s.transitions s ∧ LogOrder program log s.transitions)

/-- Facts in order that each lie above the ones before keep their order when joined. -/
theorem BeginsInOrder.append_of {earlier later : List StartedFact} {processInstance : String} {element : ElementId}
    (first : BeginsInOrder earlier processInstance element) (second : BeginsInOrder later processInstance element)
    (above : Above earlier later processInstance element) : BeginsInOrder (earlier ++ later) processInstance element := by
  unfold BeginsInOrder at first second ⊢
  rw [List.filter_append, List.map_append]
  refine List.pairwise_append.mpr ⟨first, second, fun a aIn b bIn => ?_⟩
  obtain ⟨one, oneIn, rfl⟩ := List.mem_map.mp aIn
  obtain ⟨two, twoIn, rfl⟩ := List.mem_map.mp bIn
  obtain ⟨oneMember, oneKept⟩ := List.mem_filter.mp oneIn
  obtain ⟨twoMember, twoKept⟩ := List.mem_filter.mp twoIn
  simp only [Bool.and_eq_true, beq_iff_eq] at oneKept twoKept
  exact above one oneMember two twoMember ⟨oneKept.1.1, oneKept.1.2, oneKept.2⟩ ⟨twoKept.1.1, twoKept.1.2, twoKept.2⟩

/-- Transitions each in order, each lying above the ones listed before it, list their start facts in order. -/
theorem BeginsInOrder.flatMap {blocks : List (UnitKey × Transition)} {processInstance : String} {element : ElementId}
    (ordered : ∀ block ∈ blocks, BeginsInOrder block.2.started processInstance element)
    (above : blocks.Pairwise fun one two => Above one.2.started two.2.started processInstance element) :
    BeginsInOrder ((blocks.map (·.2)).flatMap (·.started)) processInstance element := by
  induction blocks with
  | nil => simp [BeginsInOrder]
  | cons block rest ih =>
    obtain ⟨heads, tails⟩ := List.pairwise_cons.mp above
    rw [List.map_cons, List.flatMap_cons]
    refine BeginsInOrder.append_of (ordered block (by simp))
      (ih (fun other inside => ordered other (List.mem_cons_of_mem _ inside)) tails) fun one oneIn two twoIn => ?_
    obtain ⟨transition, transitionIn, twoIn'⟩ := List.mem_flatMap.mp twoIn
    obtain ⟨other, otherIn, rfl⟩ := List.mem_map.mp transitionIn
    exact heads other otherIn one oneIn two twoIn'

/-- The transitions of a closure in the order its units ran (`Step.byRun`) list a looping element's start facts in
order, under `LogOrder`. -/
theorem LogOrder.byRun {program : Program} {log : Step.RunLog} {element : ElementId} {loop : MultiInstance}
    (order : LogOrder program log T) (processInstance : String) (looped : LoopOf program element loop) :
    BeginsInOrder ((Step.byRun log T).flatMap (·.started)) processInstance element := by
  obtain ⟨sorted, made, perm, positions⟩ := Laws.Step.byRun_sorted log T
  have found : ∀ entry ∈ sorted, T[entry.1]? = some entry.2 := fun entry inside =>
    Std.ExtTreeMap.mem_toList_iff_getElem?_eq_some.mp (perm.subset inside)
  rw [made]
  refine BeginsInOrder.flatMap (fun entry inside => order.ordered entry.1 entry.2 (found entry inside) element loop
    processInstance looped) ((positions.and ((perm.nodup_iff).mpr (Laws.State.toList_nodup T))).imp_of_mem
      fun {one two} oneIn twoIn ⟨below, apart⟩ => ?_)
  have keys : one.1 ≠ two.1 := fun same => apart (Prod.ext same (by
    have := (found one oneIn).symm.trans (same ▸ found two twoIn)
    exact Option.some.inj this))
  exact order.later one.1 two.1 one.2 two.2 (found one oneIn) (found two twoIn) keys below element loop processInstance
    looped

/-- An input's reset keeps every reservation and leaves no transition and no start fact. -/
theorem beginsKept_reset {program : Program} {s : State} (unbegun : IdsUnique program → UnbegunUnlooped program s)
    (occurs : IdsUnique program → ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop) :
    BeginsKept program ∅
      { s with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } := fun apart =>
  ⟨unbegun apart, occurs apart, rfl, fun _ _ _ _ => by simp [BeginsInOrder],
    fun _ _ _ _ _ _ _ inside => by simp at inside⟩

/-- A start's fresh instance holds no occurrence, no reservation still to be made and no transition. -/
theorem beginsKept_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    BeginsKept program ∅ ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  obtain ⟨occurrences, signals, _, runs⟩ := Laws.State.initial_empty instanceId variables businessKey
  have empty : BeginsKept program ∅ (State.initial instanceId variables businessKey) := fun _ =>
    ⟨fun o inside => by simp [occurrences] at inside, fun element named => by
      rcases named with occur | compensate | resumed
      · simp [Laws.State.allSignals, Laws.State.initial_eq] at occur
      · simp [Laws.State.allSignals, Laws.State.initial_eq] at compensate
      · simp [runs] at resumed,
      by simp [Laws.State.initial_eq], fun _ _ _ _ => by simp [BeginsInOrder, Laws.State.initial_eq],
      fun _ _ _ _ _ _ _ inside => by simp [Laws.State.initial_eq] at inside⟩
  exact empty.signal _ fun _ _ inside => absurd inside List.not_mem_nil

/-- What the reservations of looping elements need of a committed input: after one from a well-formed state none is
made or still to be made, and after a committed start none is made, under a program whose identifiers are unique. -/
structure UnbegunKept (hooks : Hooks) : Prop where
  step : ∀ program input before after, IdsUnique program → WellFormed program before → UnbegunUnlooped program before →
    (∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop) →
    Step.step hooks program (some before) input = .ok after → UnbegunUnlooped program after
  start : ∀ program input after, IdsUnique program → Step.step hooks program none input = .ok after →
    UnbegunUnlooped program after

section Walk

variable {hooks : Hooks}
  (contract : ∀ T, Laws.Step.HookContract hooks fun program s => WellFormed program s ∧ BeginsKept program T s)
  (phases : ∀ T, Laws.Step.BodyPhases fun program s => WellFormed program s ∧ BeginsKept program T s)
  (pipeline : ∀ T, Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ BeginsKept program T s)
  (formed : Laws.Step.ClosurePhases WellFormed)
  (facts : Laws.Step.StateFacts)

include contract formed in
/-- A micro-step's conclusion from a state that keeps `BeginsKept` of the closure's transitions `T` journals its draft
under its unit, which the run log records last: the state it commits keeps `Logged`. -/
theorem logged_conclude {ctx : Ctx} {log : Step.RunLog} {unit : UnitKey} {cause : Cause}
    {element : Option ElementId} {owner : ScopeOccurrenceId} {mid after : State}
    (holds : WellFormed ctx.program mid ∧ BeginsKept ctx.program T mid)
    (order : IdsUnique ctx.program → LogOrder ctx.program log T)
    (ran : Step.conclude hooks ctx unit cause element owner mid = .ok after) : Logged ctx.program (log.record unit) after := by
  obtain ⟨fresh, notified, written, rest₁⟩ := Laws.Step.conclude_ok ran
  obtain ⟨notifying, writing, made⟩ := rest₁
  subst made
  let transition : Transition := ⟨cause, element, owner, mid.draft.started, mid.draft.ended, mid.draft.ready⟩
  have journalled := And.intro
    (formed.journal _ mid unit transition holds.1 (Laws.State.getElem?_of_contains fresh) (by simp [transition])
      (by simp [transition]))
    (holds.2.journal unit transition)
  have kept := (contract (mid.transitions.insert unit transition)).written _ _ _ _
    (Laws.Step.foldlM_keeps
      (inv := fun program s => WellFormed program s ∧ BeginsKept program (mid.transitions.insert unit transition) s)
      (fun _ _ _ kept ran => (contract _).cancelled _ _ _ _ kept ran) _ _ _ journalled notifying) writing
  refine ⟨formed.queueBatch _ _ _ kept.1, fun apart => ?_⟩
  have queued := kept.2.queueBatch unit apart
  have before := holds.2 apart
  rw [queued.transitions]
  refine ⟨queued, ?_⟩
  rw [before.transitions]
  exact (order apart).record before (by rw [← before.transitions]; exact Laws.State.getElem?_of_contains fresh)
    (by simp [transition])

include contract phases pipeline formed facts in
/-- A closure micro-step keeps `Logged`, the run log gaining the unit it ran: its body sees the transitions as a
snapshot, which `Laws.Step.BodyPhases` keep, and its conclusion journals the draft under the unit. -/
theorem logged_step {ctx : Ctx} {log : Step.RunLog} {unit : UnitKey} {before after : State}
    (holds : Logged ctx.program log before) (step : Laws.Step.ClosureStep hooks ctx log unit before after) :
    Logged ctx.program (log.record unit) after := by
  obtain ⟨mid, _, _, rest₁⟩ := Laws.Step.closureStep_concludes (contract before.transitions)
    (phases before.transitions) facts
    (Laws.Step.complete_keeps (contract _) (phases _) (pipeline _) facts) ⟨holds.1, fun apart => (holds.2 apart).1⟩ step
  obtain ⟨_, kept, concluded⟩ := rest₁
  exact logged_conclude contract formed kept (fun apart => (holds.2 apart).2) concluded

include contract phases pipeline formed facts in
/-- A committed input on a running instance settles in a state that keeps `Logged` under its run log, which
`Step.orderJournal` commits, from a well-formed before-state whose reservations, made or still to be made, name no
looping element. -/
theorem logged_running {program : Program} {before after : State} {input : Input}
    (formedBefore : WellFormed program before) (unbegun : IdsUnique program → UnbegunUnlooped program before)
    (occurs : IdsUnique program → ∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop)
    (ran : Step.step hooks program (some before) input = .ok after) :
    ∃ settled : State × Step.RunLog, Logged program settled.2 settled.1 ∧ Step.orderJournal (.ok settled) = .ok after := by
  obtain ⟨mid, _, _, rest₁⟩ := Laws.Step.running_concludes (contract ∅)
    (phases ∅) (Laws.Step.complete_keeps (contract ∅) (phases ∅) (pipeline ∅) facts)
    ⟨Laws.State.reset_wellFormed formedBefore, beginsKept_reset unbegun occurs⟩ ran
  obtain ⟨_, _, settled, rest₂⟩ := rest₁
  obtain ⟨kept, concluded, settling, made⟩ := rest₂
  have done := Laws.Step.settle_induction_log (Logged (Laws.Step.inputCtx hooks program input).program)
    (fun _ _ _ _ holds step => logged_step contract phases pipeline formed facts holds step) _ _ _ _ _
    (logged_conclude contract formed kept (fun _ => LogOrder.empty _) concluded) settling
  rw [Laws.Step.inputCtx_program] at done
  exact ⟨settled, done, made⟩

include contract phases pipeline formed facts in
/-- A committed start settles in a state that keeps `Logged` under its run log, which `Step.orderJournal` commits. -/
theorem logged_start
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    {program : Program} {input : Input} {after : State} (ran : Step.step hooks program none input = .ok after) :
    ∃ settled : State × Step.RunLog, Logged program settled.2 settled.1 ∧ Step.orderJournal (.ok settled) = .ok after := by
  obtain ⟨mid, _, _, rest₁⟩ := Laws.Step.start_concludes (contract ∅)
    (phases ∅) facts (Laws.Step.complete_keeps (contract ∅) (phases ∅) (pipeline ∅) facts)
    (fun _ _ _ => ⟨formed.queueBatch _ _ _ (initial _ _ _ _), (beginsKept_initial _ _ _ _).queueBatch _⟩) ran
  obtain ⟨_, _, settled, rest₂⟩ := rest₁
  obtain ⟨kept, concluded, settling, made⟩ := rest₂
  have done := Laws.Step.settle_induction_log (Logged (Laws.Step.inputCtx hooks program input).program)
    (fun _ _ _ _ holds step => logged_step contract phases pipeline formed facts holds step) _ _ _ _ _
    (logged_conclude contract formed kept (fun _ => LogOrder.empty _) concluded) settling
  rw [Laws.Step.inputCtx_program] at done
  exact ⟨settled, done, made⟩

include contract phases pipeline formed facts in
/-- Hooks that keep `BeginsKept` beside `WellFormed` keep the reservations of looping elements unmade. -/
theorem unbegunKept_of
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root))) :
    UnbegunKept hooks where
  step _ _ _ _ apart formedBefore unbegun occurs ran := by
    obtain ⟨settled, kept, made⟩ := logged_running contract phases pipeline formed facts formedBefore (fun _ => unbegun)
      (fun _ => occurs) ran
    obtain ⟨_, _, same, made'⟩ := Laws.Step.orderJournal_ok made
    subst made'
    cases same
    exact ((kept.2 apart).1).unbegun
  start _ _ _ apart ran := by
    obtain ⟨settled, kept, made⟩ := logged_start contract phases pipeline formed facts initial ran
    obtain ⟨_, _, same, made'⟩ := Laws.Step.orderJournal_ok made
    subst made'
    cases same
    exact ((kept.2 apart).1).unbegun

include contract phases pipeline formed facts in
/-- Under hooks that keep `BeginsKept` beside `WellFormed`, a committed input's start facts of a looping element under
the element role carry increasing activations in journal order, from a well-formed before-state whose reservations,
made or still to be made, name no looping element: the journal lists the transitions in the order their units ran
(`Step.byRun`), which `LogOrder` orders. -/
theorem beginsInOrder_of {program : Program} {before after : State} {input : Input} {element : ElementId}
    {loop : MultiInstance} (processInstance : String) (apart : IdsUnique program) (formedBefore : WellFormed program before)
    (unbegun : UnbegunUnlooped program before)
    (occurs : ∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop)
    (ran : Step.step hooks program (some before) input = .ok after) (looped : LoopOf program element loop) :
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element := by
  obtain ⟨settled, kept, made⟩ := logged_running contract phases pipeline formed facts formedBefore (fun _ => unbegun)
    (fun _ => occurs) ran
  obtain ⟨state, log, same, made'⟩ := Laws.Step.orderJournal_ok made
  subst made'
  cases same
  exact ((kept.2 apart).2).byRun processInstance looped

end Walk

/-! ## The frame records -/

/-- The state operations the hooks apply keep `BeginsKept`. -/
theorem beginsKept_alongside (program : Program) (T : TreeMap UnitKey Transition compare) :
    Alongside program (BeginsKept program T) where
  frame _ _ moved held := held.frame (fun _ inside => moved.occurrences ▸ inside) moved.pending moved.transitions
    moved.started
  emit _ _ _ _ _ _ held := by
    rw [Laws.State.emit_eq]
    exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl
  complete _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  park _ _ _ _ held := held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl
  arm _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  armGateway _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  raise _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  signalBegin _ request _ _ _ held := held.signalBegin request
  takePosition _ held := held.takePosition
  enterScope _ element parent locals owner _ _ _ held := held.enterScope element parent locals owner
  reserve _ _ scope _ _ pending _ held :=
    held.reserve (fun apart => PendingIn.unlooped (fun _ kept => (kept apart).occurs) pending) scope
  leaveScope _ _ formed present _ held := held.leaveScope formed present
  clearInside _ _ keep formed present _ held := held.clearInside formed present keep
  disarm _ host _ held := held.disarm host
  setVariable _ target name value _ held := held.setVariable target name value
  removeVariable _ target name _ held := held.removeVariable target name
  instanceBegin _ request _ _ held := held.signalBegin request
  defer _ requests _ _ held := held.defer requests
  leaveInstance _ _ _ formed _ _ present held := held.leaveScope formed present
  runs _ runs _ _ held := held.runs runs

/-- Storing compensation runs that resume only by pending reservations keeps `BeginsKept`. -/
theorem beginsKept_stores (program : Program) (T : TreeMap UnitKey Transition compare) :
    StoresAlongside program (BeginsKept program T) :=
  { (beginsKept_alongside program T).toFrameAlongside with
    storeRuns := fun _ compensation _ _ resumes _ held => held.storeRuns compensation resumes }

/-- The phases a micro-step's body runs keep `BeginsKept` of a snapshot of the transitions, which they journal nothing
to; cancelling is `FrameAlongside.cancelOccurrence`. -/
theorem beginsKept_bodyAlongside (program : Program) (T : TreeMap UnitKey Transition compare) :
    BodyAlongside program (BeginsKept program T) where
  toFrameAlongside := (beginsKept_alongside program T).toFrameAlongside
  dequeue _ _ _ fewer held := held.dequeue fewer
  unqueue _ unit _ held := held.unqueue unit
  untoken _ unit _ held := held.untoken unit
  begin _ _ role sourceType formed _ admitted _ _ held := held.begin formed admitted role sourceType
  cancel _ _ formed held := (beginsKept_alongside program T).toFrameAlongside.cancelOccurrence
    (fun _ id _ kept => kept.withoutRecord id) (fun _ _ _ kept => kept.draft _ rfl) formed held

/-- The completion pipeline's own phases keep `BeginsKept` where they keep `WellFormed`. -/
theorem beginsKept_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) (T : TreeMap UnitKey Transition compare) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ BeginsKept program T s where
  startReserved _ _ occurrence sourceType holds member unnamed :=
    ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, holds.2.startReserved sourceType member⟩
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (beginsKept_alongside program T).toFrameAlongside.removeOccurrence
      (fun _ id _ kept => kept.withoutRecord id) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, holds.2.recordEnd key terminal⟩

end Kernel.Proofs.MultiInstance
