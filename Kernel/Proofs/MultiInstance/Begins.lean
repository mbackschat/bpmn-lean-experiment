module

public import Kernel.Laws.Step.Commits
public import Kernel.Laws.State.RemovalKeeps
public import Kernel.Proofs.MultiInstance.Occurs
public import Kernel.Proofs.Frame
public import Kernel.Proofs.MultiInstance.NumberedCompacts

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
nothing). Its conclusion journals the draft under its unit, which the run log records last; that half, through a
closure, is `Kernel.Proofs.MultiInstance.BeginsLog`'s. The state operations' lemmas here
are each of what the frame records ask (`Proofs.Frame.FrameAlongside`, `ClosureAlongside`, `Alongside`), which this
module assembles and `Kernel.Proofs.MultiInstance.Registered` composes with the registered hooks, since this module may
not reach a feature's Laws module beyond its fan-in (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

variable {le : Issue → Issue → Bool}

open Kernel
open Kernel.Step (RunLog byRun orderJournal microStep settle unitCtx closureBound closureWorkBound)
open Kernel.Laws.State (WellFormed scopeIds)
open Kernel.Laws.IL (BoundaryOf Reservable)
open Kernel.Laws.MultiInstance (LoopOf IdsUnique UnbegunUnlooped BeginsInOrder)
open Kernel.Laws.Step (OccurPending PendingIn)
open Kernel.Proofs.Frame (OccursAlongside ResumesPending Alongside StoresAlongside BodyAlongside)

/-! ## The relation -/

/-- The start facts of the closure's transitions, in no order. -/
def blockFacts (transitions : TreeMap UnitKey Transition compare) : List StartedFact :=
  (transitions.toList.map (·.2)).flatMap (·.started)

/-- A start fact of `element` under the element role. -/
def Looping (element : ElementId) (fact : StartedFact) : Prop :=
  fact.occurrence.element = element ∧ fact.occurrence.role = .element

/-- Every start fact of `element` in `later` carries an activation issued after every one in `earlier`. -/
def MadeAbove (log : RunLog) (earlier later : List StartedFact) (element : ElementId) : Prop :=
  ∀ first ∈ earlier, ∀ second ∈ later, Looping element first → Looping element second →
    FreshBefore log first.occurrence.activation second.occurrence.activation

/-- No reservation, made or still to be made, names a looping element, and the start facts of each looping element under
the element role that the micro-step in progress has made carry pending activations issued in the order they were made,
each after every one of the closure's transitions `snapshot`, which the micro-step's body leaves as it found them. -/
structure Unlooped (program : Program) (snapshot : TreeMap UnitKey Transition compare) (log : RunLog) (s : State) :
    Prop where
  unbegun : UnbegunUnlooped program s
  occurs : ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop
  transitions : s.transitions = snapshot
  pending : ∀ element loop, LoopOf program element loop → ∀ fact ∈ blockFacts snapshot ++ s.draft.started,
    Looping element fact → ∃ unit index, fact.occurrence.activation = .fresh unit index
  ordered : ∀ element loop, LoopOf program element loop → MadeInOrder log s.draft.started element
  above : ∀ element loop, LoopOf program element loop → MadeAbove log (blockFacts snapshot) s.draft.started element

/-- `Unlooped` under a program whose identifiers are unique, within a micro-step of the unit `unit` that ran after the
units `log` records (`LogFrame`): the relation the frame and phase records carry, one for each snapshot of the
transitions. -/
def BeginsKept (program : Program) (transitions : TreeMap UnitKey Transition compare) (log : RunLog) (unit : UnitKey)
    (s : State) : Prop :=
  IdsUnique program → Unlooped program transitions log s ∧ s.issuing = unit ∧ LogFrame log unit transitions

variable {T : TreeMap UnitKey Transition compare} {log : RunLog} {unit : UnitKey}

/-- What `t` keeps of what `Unlooped` reads of `s`: each reservation of `t` is one of `s` or of an element that does not
loop, so is each reservation still to be made, and the transitions, the issuer and the draft start facts are `s`'s. -/
structure Keeps (program : Program) (s t : State) : Prop where
  unbegun : ∀ o ∈ t.occurrences, o.begun = false → o ∈ s.occurrences ∨ ∀ loop, ¬ LoopOf program o.element loop
  pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop
  transitions : t.transitions = s.transitions
  issuing : t.issuing = s.issuing
  started : t.draft.started = s.draft.started

theorem Unlooped.carry {program : Program} {s t : State} (held : Unlooped program T log s) (keeps : Keeps program s t) :
    Unlooped program T log t :=
  ⟨fun o inside unbegun => (keeps.unbegun o inside unbegun).elim (fun old => held.unbegun o old unbegun) id,
    fun element pending => (keeps.pending element pending).elim (held.occurs element) id,
    keeps.transitions.trans held.transitions,
    fun element loop looped => keeps.started ▸ held.pending element loop looped,
    fun element loop looped => keeps.started ▸ held.ordered element loop looped,
    fun element loop looped => keeps.started ▸ held.above element loop looped⟩

theorem BeginsKept.carry {program : Program} {s t : State} (held : BeginsKept program T log unit s)
    (keeps : IdsUnique program → Keeps program s t) : BeginsKept program T log unit t :=
  fun apart => have kept := held apart
    ⟨kept.1.carry (keeps apart), (keeps apart).issuing.trans kept.2.1, kept.2.2⟩

/-- A change that adds no occurrence, no reservation still to be made and no start fact, and keeps the transitions and
the issuer, keeps `BeginsKept`. -/
theorem BeginsKept.frame {program : Program} {s t : State} (held : BeginsKept program T log unit s)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences)
    (pending : ∀ element, OccurPending t element → OccurPending s element) (transitions : t.transitions = s.transitions)
    (issuing : t.issuing = s.issuing) (started : t.draft.started = s.draft.started) : BeginsKept program T log unit t :=
  held.carry fun _ => ⟨fun o inside _ => .inl (occurrences o inside), fun element named => .inl (pending element named),
    transitions, issuing, started⟩

/-! ## The state operations the hooks apply -/

/-- Queuing a signal whose reservations name no looping element keeps `BeginsKept`. -/
theorem BeginsKept.signal {program : Program} {s : State} (held : BeginsKept program T log unit s) (signal : Signal)
    (unlooped : IdsUnique program → ∀ element ∈ Laws.Step.occursOf [signal], ∀ loop, ¬ LoopOf program element loop) :
    BeginsKept program T log unit (s.signal signal) := by
  rw [Laws.State.signal_eq]
  refine held.carry fun apart => ⟨fun o inside _ => .inl inside, fun element named => ?_, rfl, rfl, rfl⟩
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
theorem BeginsKept.signalBegin {program : Program} {s : State} (held : BeginsKept program T log unit s) (request : BeginRequest) :
    BeginsKept program T log unit (s.signal (.begin request)) :=
  held.signal _ fun _ _ inside => absurd inside List.not_mem_nil

theorem BeginsKept.takeCompletion {program : Program} {s : State} (held : BeginsKept program T log unit s) : BeginsKept program T log unit s.takeCompletion.1 := by
  rw [Laws.State.takeCompletion_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl

theorem BeginsKept.enterScope {program : Program} {s : State} (held : BeginsKept program T log unit s) (element : ElementId)
    (parent : ScopeOccurrenceId) (locals : List (String × Value)) (owner : Option OccurrenceId) :
    BeginsKept program T log unit (s.enterScope element parent locals owner).1 := by
  rw [Laws.State.enterScope_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl

theorem BeginsKept.enterCalled {program : Program} {s : State} (held : BeginsKept program T log unit s) (called : Program)
    (call : Occurrence) (variables : List (String × Value)) (definition : DefinitionRef) : BeginsKept program T log unit (s.enterCalled called call variables definition).1 := by
  rw [Laws.State.enterCalled_eq _ _ _ _ _]
  exact held.frame (fun _ inside => inside) (fun element named => pending_kept (.of_eq rfl rfl rfl rfl) rfl named) rfl rfl rfl

/-- A reservation of an element that does not loop under a program whose identifiers are unique keeps `BeginsKept`. -/
theorem BeginsKept.reserve {program : Program} {s : State} {element : ElementId} (held : BeginsKept program T log unit s)
    (unlooped : IdsUnique program → ∀ loop, ¬ LoopOf program element loop) (scope : ScopeOccurrenceId) :
    BeginsKept program T log unit (s.reserve element scope).1 :=
  have reserves := Laws.State.reserve_reserves s element scope
  held.carry fun apart => ⟨fun o inside _ => by
      rcases reserves.mem_occurrences inside with old | new
      · exact .inl old
      · rw [new, reserves.kind]
        exact .inr (unlooped apart),
    fun element named => .inl (pending_kept reserves.queues (congrArg (·.compensation.runs) reserves.slots) named),
    reserves.transitions, reserves.issuing, by rw [reserves.draft]⟩

/-- Leaving a scope occurrence that stands keeps `BeginsKept`: it only takes away. -/
theorem BeginsKept.leaveScope (le : Issue → Issue → Bool) {program other : Program} {s : State} (formed : WellFormed other s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (s.leaveScope le scope) :=
  have left := Laws.State.leaveScope_left (le := le) formed present
  held.frame (fun o inside => ((left.occurrences o).mp inside).1)
    (fun _ named => pending_of_sublist left.queues.signal_mem left.slots.runs named)
    left.transitions left.issuing left.started

/-- Clearing a scope occurrence that stands keeps `BeginsKept`: it only takes away. -/
theorem BeginsKept.clearInside (le : Issue → Issue → Bool) {program other : Program} {s : State} (formed : WellFormed other s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (keep : List OccurrenceId) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (s.clearInside le scope keep) :=
  have cleared := Laws.State.clearInside_cleared (le := le) formed present keep
  held.frame (fun o inside => ((cleared.occurrences o).mp inside).1)
    (fun _ named => pending_of_sublist cleared.queues.signal_mem cleared.slots.runs named)
    cleared.transitions cleared.issuing cleared.started

theorem BeginsKept.disarm {program : Program} {s : State} (host : OccurrenceId) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (s.disarm host) := by
  rw [Laws.State.disarm_eq]
  exact held.frame (fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1) (fun _ named => named) rfl rfl rfl

theorem BeginsKept.setVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (value : Value) (held : BeginsKept program T log unit s) : BeginsKept program T log unit (s.setVariable target name value) :=
  have same := Laws.State.setVariable_same s target name value
  held.frame (fun _ inside => same.occurrences ▸ inside)
    (fun _ named => pending_kept same.queues (congrArg (·.compensation.runs) same.slots) named) same.transitions
    same.issuing (congrArg (·.started) same.draft)

theorem BeginsKept.removeVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (held : BeginsKept program T log unit s) : BeginsKept program T log unit (s.removeVariable target name) :=
  have same := Laws.State.removeVariable_same s target name
  held.frame (fun _ inside => same.occurrences ▸ inside)
    (fun _ named => pending_kept same.queues (congrArg (·.compensation.runs) same.slots) named) same.transitions
    same.issuing (congrArg (·.started) same.draft)

/-- Storing compensation runs that resume only by reservations pending in `s` or in a state that kept the relation
keeps `BeginsKept`. -/
theorem BeginsKept.storeRuns {program : Program} {s : State} (compensation : Compensations)
    (resumes : ResumesPending (BeginsKept program T log unit) s compensation) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit { s with slots := { s.slots with compensation } } :=
  held.carry fun apart => ⟨fun o inside _ => .inl inside, fun element named => by
      rcases named with occur | compensate | resumed
      · exact .inl (.inl occur)
      · exact .inl (.inr (.inl compensate))
      · obtain ⟨run, member, rest⟩ := resumed
        obtain ⟨at_, leave, resume⟩ := rest
        exact (resumes run member element at_ leave resume).imp_right
          (PendingIn.unlooped fun _ kept => (kept apart).1.occurs),
    rfl, rfl, rfl⟩

theorem BeginsKept.defer {program : Program} {s : State} (requests : List BeginRequest) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (s.deferBegins requests) := by
  rw [Laws.State.deferBegins_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl

theorem BeginsKept.runs {program : Program} {s : State} (runs : MultiInstanceMap) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit { s with slots := { s.slots with multiInstanceMap := runs } } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl

/-- Dropping an occurrence's record keeps `BeginsKept`. -/
theorem BeginsKept.withoutRecord {program : Program} {s : State} (id : OccurrenceId) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (Laws.State.withoutRecord s id) :=
  held.frame (fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1) (fun _ named => named) rfl rfl rfl

/-- Replacing the draft by one with the same start facts keeps `BeginsKept`. -/
theorem BeginsKept.draft {program : Program} {s : State} (draft : Draft) (started : draft.started = s.draft.started)
    (held : BeginsKept program T log unit s) : BeginsKept program T log unit { s with draft } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl started

/-! ## The phases a closure runs -/

/-- A start fact of the closure's transitions or of the draft is one of the closure's start facts. -/
theorem starts_mem {s : State} {fact : StartedFact} (inside : fact ∈ blockFacts s.transitions ∨ fact ∈ s.draft.started) :
    fact ∈ Laws.State.starts s := by
  rw [Laws.State.starts]
  rcases inside with blocked | drafted
  · exact List.mem_append_left _ blocked
  · exact List.mem_append_right _ drafted

/-- The order of `element`'s start facts holds of a sublist. -/
theorem BeginsInOrder.sublist {facts fewer : List StartedFact} {processInstance : InstanceName} {element : ElementId}
    (ordered : BeginsInOrder facts processInstance element) (sub : fewer.Sublist facts) :
    BeginsInOrder fewer processInstance element :=
  List.Pairwise.sublist ((sub.filter _).map _) ordered

/-- A fact made last keeps `element`'s start facts in order when, if it is one of them, its activation was issued
after every earlier one's. -/
theorem MadeInOrder.append {facts : List StartedFact} {fact : StartedFact} {element : ElementId}
    (ordered : MadeInOrder log facts element)
    (above : Looping element fact → ∀ earlier ∈ facts, Looping element earlier →
      FreshBefore log earlier.occurrence.activation fact.occurrence.activation) :
    MadeInOrder log (facts ++ [fact]) element := by
  unfold MadeInOrder at ordered ⊢
  rw [List.filter_append, List.map_append]
  refine List.pairwise_append.mpr ⟨ordered, List.pairwise_map.mpr (List.Pairwise.sublist List.filter_sublist
    (List.pairwise_singleton _ _)), fun a aIn b bIn => ?_⟩
  obtain ⟨earlier, earlierIn, rfl⟩ := List.mem_map.mp aIn
  obtain ⟨last, lastIn, rfl⟩ := List.mem_map.mp bIn
  obtain ⟨earlierMember, earlierKept⟩ := List.mem_filter.mp earlierIn
  obtain ⟨lastMember, lastKept⟩ := List.mem_filter.mp lastIn
  rw [List.mem_singleton.mp lastMember] at lastKept ⊢
  simp only [Bool.and_eq_true, beq_iff_eq] at earlierKept lastKept
  exact above lastKept earlier earlierMember earlierKept

/-- A start fact of a transition the closure journals under `unit` is one of the transitions' before or the
transition's own. -/
theorem mem_blockFacts_insert {transitions : TreeMap UnitKey Transition compare} {key : UnitKey} {transition : Transition}
    {fact : StartedFact} (inside : fact ∈ blockFacts (transitions.insert key transition)) :
    fact ∈ blockFacts transitions ∨ fact ∈ transition.started := by
  obtain ⟨block, blockIn, factIn⟩ := List.mem_flatMap.mp inside
  rcases Laws.State.mem_values_insert blockIn with rfl | old
  · exact .inr factIn
  · exact .inl (List.mem_flatMap.mpr ⟨block, old, factIn⟩)

/-- Journalling the draft as the transition of the micro-step's unit keeps `BeginsKept` of the transitions that hold
it: the draft it empties holds no fact, and its facts join the snapshot's. -/
theorem BeginsKept.journal {program : Program} {s : State} (transition : Transition)
    (held : BeginsKept program T log unit s) (started : transition.started = s.draft.started := by exact rfl) :
    BeginsKept program (s.transitions.insert unit transition) log unit
      { s with transitions := s.transitions.insert unit transition, draft := {}, writes := [] } := fun apart =>
  have kept := held apart
  ⟨⟨kept.1.unbegun, fun element named => kept.1.occurs element named, rfl,
    fun element loop looped fact inside looping => by
      rcases List.mem_append.mp inside with blocked | drafted
      · rcases mem_blockFacts_insert blocked with old | new
        · exact kept.1.pending element loop looped fact
            (List.mem_append_left _ (by rw [← kept.1.transitions]; exact old)) looping
        · exact kept.1.pending element loop looped fact (List.mem_append_right _ (started ▸ new)) looping
      · simp at drafted,
    fun _ _ _ => by simp [MadeInOrder], fun _ _ _ _ _ _ inside => by simp at inside⟩, kept.2.1,
    ⟨kept.2.2.running, fun other inside => by
      by_cases same : other = unit
      · exact .inl same
      · have old : s.transitions.contains other = true := by
          rw [← Std.ExtTreeMap.mem_iff_contains] at inside ⊢
          rcases Std.ExtTreeMap.mem_insert.mp inside with equal | old
          · exact absurd (Std.LawfulEqOrd.eq_of_compare equal).symm same
          · exact old
        exact kept.2.2.logged other (kept.1.transitions ▸ old)⟩⟩

/-- Moving a micro-step's batches under its unit key keeps `BeginsKept`: the queue views keep their signals. -/
theorem BeginsKept.queueBatch {program : Program} {s : State} (key : UnitKey)
    (grouped : Nat → Option UnitKey := fun _ => none) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (s.queueBatch key grouped) := by
  have signals := Laws.State.allSignals_queueBatch s key grouped
  have same := Laws.State.queueBatch_grouped_eq s key grouped
  exact held.frame (t := s.queueBatch key grouped) (fun _ inside => by rw [same] at inside; exact inside)
    (fun _ named => pending_of_sublist (fun _ inside => signals.subset inside)
      (fun _ member => by rw [same] at member; exact member) named)
    (by rw [same]) (by rw [same]) (by rw [same])

/-- Taking signals off the queue keeps `BeginsKept`. -/
theorem BeginsKept.dequeue {program : Program} {s : State} {signals : List Signal} (fewer : signals.Sublist s.batchSignals)
    (held : BeginsKept program T log unit s) : BeginsKept program T log unit { s with batchSignals := signals } :=
  held.frame (t := { s with batchSignals := signals }) (fun _ inside => inside) (fun _ named =>
    pending_of_sublist (s := s) (t := { s with batchSignals := signals }) (fun _ inside =>
      (List.mem_append.mp inside).elim (List.mem_append_left _) fun batch => List.mem_append_right _ (fewer.subset batch))
    (fun _ member => member) named) rfl rfl rfl

/-- Taking the closure's next signal off the queue keeps `BeginsKept`. -/
theorem BeginsKept.unqueue {program : Program} {s : State} (key : UnitKey) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit { s with queuedSignals := s.queuedSignals.erase key } :=
  held.frame (t := { s with queuedSignals := s.queuedSignals.erase key }) (fun _ inside => inside) (fun _ named =>
    pending_of_sublist (s := s) (t := { s with queuedSignals := s.queuedSignals.erase key }) (fun _ inside => by
      rcases List.mem_append.mp inside with keyed | batch
      · obtain ⟨key, found⟩ := Laws.State.mem_values.mp keyed
        exact List.mem_append_left _ (Laws.State.mem_values.mpr ⟨key, (Laws.State.getElem?_of_erase found).1⟩)
      · exact List.mem_append_right _ batch) (fun _ member => member) named) rfl rfl rfl

/-- Taking the closure's next token off the queue keeps `BeginsKept`. -/
theorem BeginsKept.untoken {program : Program} {s : State} (key : UnitKey) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit { s with queuedTokens := s.queuedTokens.erase key } :=
  held.frame (t := { s with queuedTokens := s.queuedTokens.erase key }) (fun _ inside => inside) (fun _ named => named) rfl rfl rfl

/-- Beginning an admitted request keeps `BeginsKept`: a reservation it begins is of an element that does not loop, and
a fresh occurrence's activation is the running unit's next issue, after every issue a start fact of the input carries,
which is the running unit's at a lower index or one of a unit that ran (`ranBefore_issued`). -/
theorem BeginsKept.begin {program other : Program} {s : State} {request : BeginRequest} (formed : WellFormed other s)
    (admitted : Laws.Step.Admitted s request) (role : ActivationRole) (sourceType : String)
    (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  intro apart
  obtain ⟨kept, issuing, frame⟩ := held apart
  have framed : LogFrame log s.issuing s.transitions := by rw [issuing, kept.transitions]; exact frame
  have fresh : ∀ (fact : StartedFact) element loop, LoopOf program element loop →
      fact.occurrence = Laws.State.key (s.beginOccurrence request role sourceType).1
        (s.beginOccurrence request role sourceType).2 → Looping element fact →
      (∃ unit index, fact.occurrence.activation = .fresh unit index) ∧ ∀ earlier ∈ Laws.State.starts s,
        (∃ unit index, earlier.occurrence.activation = .fresh unit index) →
        FreshBefore log earlier.occurrence.activation fact.occurrence.activation := by
    intro fact element loop looped named ⟨elementNamed, roled⟩
    rw [named] at elementNamed roled ⊢
    simp only [Laws.State.key] at elementNamed roled ⊢
    rcases begins.source with ⟨reserved, reservation⟩ | ⟨reserved, reservation⟩ | issued
    · have named : reserved.id ∈ Laws.State.names request := by
        simp [Laws.State.names, reservation.named]
      have unbegun := ((admitted.2.1 reserved.id named).1.2 reserved reservation.member rfl).1
      rw [reservation.element] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun reserved reservation.member unbegun loop)
    · have named : reserved.id ∈ Laws.State.names request := by
        simp [Laws.State.names, reservation.named]
      have unbegun := ((admitted.2.1 reserved.id named).1.2 reserved reservation.member rfl).1
      rw [reservation.element] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun reserved reservation.member unbegun loop)
    · obtain ⟨index, above, pending⟩ := issued.activated.pending
      rw [pending]
      refine ⟨⟨_, _, rfl⟩, fun earlier earlierIn ⟨u, k, at_⟩ => ⟨⟨u, k, at_⟩, ⟨_, _, rfl⟩, ?_⟩⟩
      have counted := formed.counted earlier earlierIn
      unfold Laws.State.Counted at counted
      rw [at_] at counted ⊢
      exact ranBefore_issued formed framed counted above
  refine ⟨⟨fun o inside unbegun => ?_, fun element named => kept.occurs element
    (pending_kept begins.queues (congrArg (·.compensation.runs) begins.slots) named),
    begins.transitions.trans kept.transitions, fun element loop looped fact inside looping => ?_,
    fun element loop looped => ?_, fun element loop looped => ?_⟩, begins.issuing.trans issuing, frame⟩
  · rcases begins.mem_occurrences inside with old | new
    · exact kept.unbegun o old unbegun
    · rw [new, begins.isBegun] at unbegun
      cases unbegun
  · rw [begins.started] at inside
    rcases List.mem_append.mp inside with blocked | drafted
    · exact kept.pending element loop looped fact (List.mem_append_left _ blocked) looping
    · rcases List.mem_append.mp drafted with old | new
      · exact kept.pending element loop looped fact (List.mem_append_right _ old) looping
      · rw [List.mem_singleton.mp new] at looping ⊢
        exact (fresh _ element loop looped rfl looping).1
  · rw [begins.started]
    exact MadeInOrder.append (kept.ordered element loop looped) fun looping earlier earlierIn earlierLooping =>
      (fresh _ element loop looped rfl looping).2 earlier (starts_mem (.inr earlierIn))
        (kept.pending element loop looped earlier (List.mem_append_right _ earlierIn) earlierLooping)
  · rw [begins.started]
    intro first firstIn second secondIn firstLooping secondLooping
    rcases List.mem_append.mp secondIn with old | new
    · exact kept.above element loop looped first firstIn second old firstLooping secondLooping
    · rw [List.mem_singleton.mp new] at secondLooping ⊢
      exact (fresh _ element loop looped rfl secondLooping).2 first
        (starts_mem (.inl (by rw [kept.transitions]; exact firstIn)))
        (kept.pending element loop looped first (List.mem_append_left _ firstIn) firstLooping)

/-! ## The completion pipeline's own phases -/

/-- Starting a reservation where it stands and closing its items keeps `BeginsKept`: the reservation is of an element
that does not loop, so its start fact is none of a looping element's. -/
theorem BeginsKept.startReserved {program : Program} {s : State} {occurrence : Occurrence} (sourceType : String)
    (member : occurrence ∈ s.occurrences) (held : BeginsKept program T log unit s) :
    BeginsKept program T log unit ((s.startReserved occurrence sourceType).1.closeOwnItems occurrence.id) := by
  rw [Laws.State.closeOwnItems_eq]
  cases begun : occurrence.begun
  · have starts := Laws.State.startReserved_starts s sourceType begun
    intro apart
    obtain ⟨kept, issuing, frame⟩ := held apart
    have unlooping : ∀ element loop, LoopOf program element loop → ∀ fact,
        fact.occurrence = Laws.State.key (s.startReserved occurrence sourceType).1 { occurrence with begun := true } →
        Looping element fact → False := fun element loop looped fact named looping => by
      have elementNamed := looping.1
      rw [named] at elementNamed
      simp only [Laws.State.key] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun occurrence member begun loop)
    refine ⟨⟨fun o inside unbegun => ?_, fun element named => kept.occurs element
      (pending_kept starts.queues (congrArg (·.compensation.runs) starts.slots) named),
      starts.transitions.trans kept.transitions, fun element loop looped fact inside looping => ?_,
      fun element loop looped => ?_, fun element loop looped => ?_⟩, starts.issuing.trans issuing, frame⟩
    · rcases starts.mem_occurrences inside with oldIn | made
      · exact kept.unbegun o oldIn unbegun
      · rw [made] at unbegun
        cases unbegun
    · rw [starts.started] at inside
      rcases List.mem_append.mp inside with blocked | drafted
      · exact kept.pending element loop looped fact (List.mem_append_left _ blocked) looping
      · rcases List.mem_append.mp drafted with old | new
        · exact kept.pending element loop looped fact (List.mem_append_right _ old) looping
        · exact (unlooping element loop looped fact (by rw [List.mem_singleton.mp new]; rfl) looping).elim
    · rw [starts.started]
      exact MadeInOrder.append (kept.ordered element loop looped) fun looping =>
        (unlooping element loop looped _ rfl looping).elim
    · rw [starts.started]
      intro first firstIn second secondIn firstLooping secondLooping
      rcases List.mem_append.mp secondIn with old | new
      · exact kept.above element loop looped first firstIn second old firstLooping secondLooping
      · exact (unlooping element loop looped second (by rw [List.mem_singleton.mp new]; rfl) secondLooping).elim
  · rw [Laws.State.startReserved_begun s sourceType begun]
    exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl

/-- Journalling an end keeps `BeginsKept`. -/
theorem BeginsKept.recordEnd {program : Program} {s : State} (key : OccurrenceKey) (terminal : Terminal)
    (held : BeginsKept program T log unit s) : BeginsKept program T log unit (s.recordEnd key terminal) := by
  rw [Laws.State.recordEnd_eq]
  exact held.draft _ rfl

/-! ## Subscriptions' reservations and queued occurrences -/

/-- A reservation or queued occurrence a subscription makes names a reservable element, a boundary's identifier or one
pending in a state that kept the relation, none of which loops under a program whose identifiers are unique. -/
theorem beginsKept_occursAlongside (program : Program) (T : TreeMap UnitKey Transition compare) (log : RunLog)
    (unit : UnitKey) :
    OccursAlongside program (BeginsKept program T log unit) where
  reserve s _ scope _ _ reservable _ held := held.reserve (fun apart => reservable_unlooped apart reservable) scope
  occur s element scope leave writes rule _ named _ held := held.signal _ fun apart other inside => by
    rw [List.mem_singleton.mp inside]
    exact named.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept apart).1.occurs)
  compensate s scope activity trigger leave element at_ resumed named _ _ held := held.signal _ fun apart other inside => by
    rw [List.mem_singleton.mp inside]
    exact named.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept apart).1.occurs)
  throwCompensate s _ _ _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  raise s _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  enterCalled _ call variables definition formed _ _ _ _ _ held :=
    held.enterCalled program call variables definition


/-! ## The frame records -/

/-- The state operations the hooks apply keep `BeginsKept`. -/
theorem beginsKept_alongside (program : Program) (T : TreeMap UnitKey Transition compare) (log : RunLog)
    (unit : UnitKey) :
    Alongside program (BeginsKept program T log unit) where
  frame _ _ moved held := held.frame (fun _ inside => moved.occurrences ▸ inside) moved.pending moved.transitions
    moved.issuing moved.started
  emit _ _ _ _ _ _ held := by
    rw [Laws.State.emit_eq]
    exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl
  complete _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  park _ _ _ _ held := held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl rfl
  arm _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  armGateway _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  raise _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  signalBegin _ request _ _ _ held := held.signalBegin request
  takeCompletion _ held := held.takeCompletion
  enterScope _ element parent locals owner _ _ _ held := held.enterScope element parent locals owner
  reserve _ _ scope _ _ pending _ held :=
    held.reserve (fun apart => PendingIn.unlooped (fun _ kept => (kept apart).1.occurs) pending) scope
  leaveScope le _ _ formed present _ held := held.leaveScope le formed present
  clearInside le _ _ keep formed present _ held := held.clearInside le formed present keep
  disarm _ host _ held := held.disarm host
  setVariable _ target name value _ held := held.setVariable target name value
  removeVariable _ target name _ held := held.removeVariable target name
  instanceBegin _ request _ _ held := held.signalBegin request
  defer _ requests _ _ held := held.defer requests
  leaveInstance le _ _ _ formed _ _ present held := held.leaveScope le formed present
  runs _ runs _ _ held := held.runs runs

/-- Storing compensation runs that resume only by pending reservations keeps `BeginsKept`. -/
theorem beginsKept_stores (program : Program) (T : TreeMap UnitKey Transition compare) (log : RunLog)
    (unit : UnitKey) :
    StoresAlongside program (BeginsKept program T log unit) :=
  { (beginsKept_alongside program T log unit).toFrameAlongside with
    storeRuns := fun _ compensation _ _ resumes _ held => held.storeRuns compensation resumes }

/-- The phases a micro-step's body runs keep `BeginsKept` of a snapshot of the transitions, which they journal nothing
to; cancelling is `FrameAlongside.cancelOccurrence`. -/
theorem beginsKept_bodyAlongside (program : Program) (T : TreeMap UnitKey Transition compare) (log : RunLog)
    (unit : UnitKey) :
    BodyAlongside program (BeginsKept program T log unit) where
  toFrameAlongside := (beginsKept_alongside program T log unit).toFrameAlongside
  dequeue _ _ _ fewer held := held.dequeue fewer
  unqueue _ unit _ held := held.unqueue unit
  untoken _ unit _ held := held.untoken unit
  begin _ _ role sourceType formed _ admitted _ _ held := held.begin formed admitted role sourceType
  cancel le _ _ formed held := (beginsKept_alongside program T log unit).toFrameAlongside.cancelOccurrence le
    (fun _ id _ kept => kept.withoutRecord id) (fun _ _ _ kept => kept.draft _ rfl) formed held

/-- The completion pipeline's own phases keep `BeginsKept` where they keep `WellFormed`. -/
theorem beginsKept_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) (T : TreeMap UnitKey Transition compare)
    (log : RunLog) (unit : UnitKey) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ BeginsKept program T log unit s where
  startReserved _ _ occurrence sourceType holds member unnamed :=
    ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, holds.2.startReserved sourceType member⟩
  removeOccurrence program le _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ le _ occurrence holds.1 member free
    ⟨⟨removed.1, (beginsKept_alongside program T log unit).toFrameAlongside.removeOccurrence le
      (fun _ id _ kept => kept.withoutRecord id) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, holds.2.recordEnd key terminal⟩

end Kernel.Proofs.MultiInstance
