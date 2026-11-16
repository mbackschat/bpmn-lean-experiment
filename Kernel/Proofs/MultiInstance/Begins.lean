module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.State.Removal
public import Kernel.Proofs.MultiInstance.Occurs
public import Kernel.Proofs.Frame

/-! # Proofs: the reservations of looping elements and the order instances begin in

What an input keeps, under a program whose identifiers are unique (`IdsUnique`), of the reservations and begins of
looping elements (`BeginsKept`): no reservation names a looping element (`UnbegunUnlooped`), none is still to be made
(`OccurPending`), and the start facts the input has made of a looping element under the element role carry increasing
activations in the order they were made (`startsInOrder`). Every reservation names a `Laws.IL.Reservable` element, a
boundary's identifier (`Laws.IL.BoundaryOf`) or one pending in a state that kept the relation, so none names a looping
element; a begin either begins a reservation, of an element that does not loop, or numbers a fresh activation above
every one its counter has issued, which every start fact of the input counts (`Laws.State.StartsCounted`).

The order is a fact of the settled state before `Step.orderJournal` turns the journal round, so it is carried by the
closure's phases alone (`Laws.Step.ClosurePhases`, `Laws.Step.running_settles`). The state operations' lemmas here
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
open Kernel.Proofs.Frame (OccursAlongside ResumesPending Alongside StoresAlongside ClosureAlongside)

/-! ## The relation -/

/-- The start facts of the input in progress in the order they were made: `Step.conclude` journals each draft at the
journal's head, which `Step.orderJournal` turns round once the closure settles. -/
def startsInOrder (s : State) : List StartedFact := s.journal.reverse.flatMap (·.started) ++ s.draft.started

/-- No reservation, made or still to be made, names a looping element, and the input's start facts of each looping
element under the element role carry increasing activations in the order they were made. -/
structure Unlooped (program : Program) (s : State) : Prop where
  unbegun : UnbegunUnlooped program s
  occurs : ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop
  ordered : ∀ element loop processInstance, LoopOf program element loop →
    BeginsInOrder (startsInOrder s) processInstance element

/-- `Unlooped` under a program whose identifiers are unique: the relation the frame and phase records carry. -/
def BeginsKept (program : Program) (s : State) : Prop := IdsUnique program → Unlooped program s

/-- What `t` keeps of what `Unlooped` reads of `s`: each reservation of `t` is one of `s` or of an element that does not
loop, so is each reservation still to be made, and the start facts in order are `s`'s. -/
structure Keeps (program : Program) (s t : State) : Prop where
  unbegun : ∀ o ∈ t.occurrences, o.begun = false → o ∈ s.occurrences ∨ ∀ loop, ¬ LoopOf program o.element loop
  pending : ∀ element, OccurPending t element → OccurPending s element ∨ ∀ loop, ¬ LoopOf program element loop
  starts : startsInOrder t = startsInOrder s

theorem Unlooped.carry {program : Program} {s t : State} (held : Unlooped program s) (keeps : Keeps program s t) :
    Unlooped program t :=
  ⟨fun o inside unbegun => (keeps.unbegun o inside unbegun).elim (fun old => held.unbegun o old unbegun) id,
    fun element pending => (keeps.pending element pending).elim (held.occurs element) id,
    fun element loop processInstance looped => keeps.starts ▸ held.ordered element loop processInstance looped⟩

theorem BeginsKept.carry {program : Program} {s t : State} (held : BeginsKept program s)
    (keeps : IdsUnique program → Keeps program s t) : BeginsKept program t :=
  fun apart => (held apart).carry (keeps apart)

/-- A change that adds no occurrence, no reservation still to be made and no start fact keeps `BeginsKept`. -/
theorem BeginsKept.frame {program : Program} {s t : State} (held : BeginsKept program s)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences)
    (pending : ∀ element, OccurPending t element → OccurPending s element) (journal : t.journal = s.journal)
    (started : t.draft.started = s.draft.started) : BeginsKept program t :=
  held.carry fun _ => ⟨fun o inside _ => .inl (occurrences o inside), fun element named => .inl (pending element named),
    by rw [startsInOrder, startsInOrder, journal, started]⟩

/-- A change that moves no queued signal and no compensation run leaves the reservations still to be made. -/
theorem pending_same {s t : State} (signals : t.signals = s.signals)
    (runs : t.slots.compensation.runs = s.slots.compensation.runs) (element : ElementId)
    (pending : OccurPending t element) : OccurPending s element :=
  Laws.Step.occurPending_of (fun _ inside => signals ▸ inside) (fun _ member => runs ▸ member) pending

/-! ## The state operations the hooks apply -/

/-- Queuing a signal whose reservations name no looping element keeps `BeginsKept`. -/
theorem BeginsKept.signal {program : Program} {s : State} (held : BeginsKept program s) (signal : Signal)
    (unlooped : IdsUnique program → ∀ element ∈ Laws.Step.occursOf [signal], ∀ loop, ¬ LoopOf program element loop) :
    BeginsKept program (s.signal signal) := by
  rw [Laws.State.signal_eq]
  refine held.carry fun apart => ⟨fun o inside _ => .inl inside, fun element named => ?_, rfl⟩
  have queued : element ∈ Laws.Step.occursOf (s.signals ++ [signal]) → OccurPending s element ∨
      ∀ loop, ¬ LoopOf program element loop := fun inside => by
    rcases List.mem_append.mp (Laws.Step.occursOf_append s.signals [signal] ▸ inside) with old | new
    · exact .inl ((Laws.Step.mem_occursOf.mp old).elim .inl (.inr ∘ .inl))
    · exact .inr (unlooped apart element new)
  rcases named with occur | compensate | resumed
  · exact queued (Laws.Step.mem_occursOf.mpr (.inl occur))
  · exact queued (Laws.Step.mem_occursOf.mpr (.inr compensate))
  · exact .inl (.inr (.inr resumed))

/-- Queuing a begin keeps `BeginsKept`. -/
theorem BeginsKept.signalBegin {program : Program} {s : State} (held : BeginsKept program s) (request : BeginRequest) :
    BeginsKept program (s.signal (.begin request)) :=
  held.signal _ fun _ _ inside => absurd inside List.not_mem_nil

theorem BeginsKept.issue {program : Program} {s : State} (held : BeginsKept program s) : BeginsKept program s.issue.1 := by
  rw [Laws.State.issue_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

theorem BeginsKept.enterScope {program : Program} {s : State} (held : BeginsKept program s) (element : ElementId)
    (parent : ScopeOccurrenceId) (locals : List (String × Value)) (owner : Option Nat) :
    BeginsKept program (s.enterScope element parent locals owner).1 := by
  rw [Laws.State.enterScope_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

theorem BeginsKept.enterCalled {program other : Program} {s : State} (formed : WellFormed other s)
    (held : BeginsKept program s) (called : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) : BeginsKept program (s.enterCalled called call variables definition).1 := by
  have fresh : ∀ entry ∈ s.scopes, entry.id ≠ ⟨s.nextIssue⟩ := fun entry inside same => by
    have below := formed.issued.scopes entry inside
    rw [same] at below
    exact Nat.lt_irrefl _ below
  rw [Laws.State.enterCalled_eq _ _ _ _ _ fresh]
  exact held.frame (fun _ inside => inside) (fun element named => pending_same rfl rfl element named) rfl rfl

/-- A reservation of an element that does not loop under a program whose identifiers are unique keeps `BeginsKept`. -/
theorem BeginsKept.reserve {program : Program} {s : State} {element : ElementId} (held : BeginsKept program s)
    (unlooped : IdsUnique program → ∀ loop, ¬ LoopOf program element loop) (scope : ScopeOccurrenceId) :
    BeginsKept program (s.reserve element scope).1 :=
  have reserves := Laws.State.reserve_reserves s element scope
  held.carry fun apart => ⟨fun o inside _ => by
      rw [reserves.occurrences] at inside
      rcases List.mem_append.mp inside with old | new
      · exact .inl old
      · rw [List.mem_singleton.mp new, reserves.kind]
        exact .inr (unlooped apart),
    fun element named => .inl (pending_same reserves.signals (congrArg (·.compensation.runs) reserves.slots) element named),
    by rw [startsInOrder, startsInOrder, reserves.journal, reserves.draft]⟩

/-- Leaving a scope occurrence that stands keeps `BeginsKept`: it only takes away. -/
theorem BeginsKept.leaveScope {program other : Program} {s : State} (formed : WellFormed other s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (held : BeginsKept program s) :
    BeginsKept program (s.leaveScope scope) :=
  have left := Laws.State.leaveScope_left formed present
  held.frame (fun o inside => ((left.occurrences o).mp inside).1)
    (fun _ named => Laws.Step.occurPending_of (fun _ inside => left.signals ▸ inside) left.slots.runs named)
    left.journal left.started

/-- Clearing a scope occurrence that stands keeps `BeginsKept`: it only takes away. -/
theorem BeginsKept.clearInside {program other : Program} {s : State} (formed : WellFormed other s)
    {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s) (keep : List Nat) (held : BeginsKept program s) :
    BeginsKept program (s.clearInside scope keep) :=
  have cleared := Laws.State.clearInside_cleared formed present keep
  held.frame (fun o inside => ((cleared.occurrences o).mp inside).1)
    (fun _ named => Laws.Step.occurPending_of (fun _ inside => cleared.signals ▸ inside) cleared.slots.runs named)
    cleared.journal cleared.started

theorem BeginsKept.disarm {program : Program} {s : State} (host : Nat) (held : BeginsKept program s) :
    BeginsKept program (s.disarm host) := by
  rw [Laws.State.disarm_eq]
  exact held.frame (fun _ inside => (List.mem_filter.mp inside).1) (fun _ named => named) rfl rfl

theorem BeginsKept.setVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (value : Value) (held : BeginsKept program s) : BeginsKept program (s.setVariable target name value) :=
  have same := Laws.State.setVariable_same s target name value
  held.frame (fun _ inside => same.occurrences ▸ inside)
    (pending_same same.signals (congrArg (·.compensation.runs) same.slots)) same.journal
    (congrArg (·.started) same.draft)

theorem BeginsKept.removeVariable {program : Program} {s : State} (target : ScopeOccurrenceId) (name : String)
    (held : BeginsKept program s) : BeginsKept program (s.removeVariable target name) :=
  have same := Laws.State.removeVariable_same s target name
  held.frame (fun _ inside => same.occurrences ▸ inside)
    (pending_same same.signals (congrArg (·.compensation.runs) same.slots)) same.journal
    (congrArg (·.started) same.draft)

/-- Storing compensation runs that resume only by reservations pending in `s` or in a state that kept the relation
keeps `BeginsKept`. -/
theorem BeginsKept.storeRuns {program : Program} {s : State} (compensation : Compensations)
    (resumes : ResumesPending (BeginsKept program) s compensation) (held : BeginsKept program s) :
    BeginsKept program { s with slots := { s.slots with compensation } } :=
  held.carry fun apart => ⟨fun o inside _ => .inl inside, fun element named => by
      rcases named with occur | compensate | resumed
      · exact .inl (.inl occur)
      · exact .inl (.inr (.inl compensate))
      · obtain ⟨run, member, rest⟩ := resumed
        obtain ⟨at_, leave, resume⟩ := rest
        exact (resumes run member element at_ leave resume).imp_right
          (PendingIn.unlooped fun _ kept => (kept apart).occurs),
    rfl⟩

theorem BeginsKept.defer {program : Program} {s : State} (requests : List BeginRequest) (held : BeginsKept program s) :
    BeginsKept program (s.deferBegins requests) := by
  rw [Laws.State.deferBegins_eq]
  exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

theorem BeginsKept.runs {program : Program} {s : State} (runs : List MultiInstanceRun) (held : BeginsKept program s) :
    BeginsKept program { s with slots := { s.slots with multiInstances := runs } } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

/-- Dropping an occurrence's record keeps `BeginsKept`. -/
theorem BeginsKept.withoutRecord {program : Program} {s : State} (id : Nat) (held : BeginsKept program s) :
    BeginsKept program (Laws.State.withoutRecord s id) :=
  held.frame (fun _ inside => (List.mem_filter.mp inside).1) (fun _ named => named) rfl rfl

/-- Replacing the draft by one with the same start facts keeps `BeginsKept`. -/
theorem BeginsKept.draft {program : Program} {s : State} (draft : Draft) (started : draft.started = s.draft.started)
    (held : BeginsKept program s) : BeginsKept program { s with draft } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl started

/-! ## The phases a closure runs -/

/-- A start fact of the input in progress, in the order the facts were made, is one of its start facts. -/
theorem startsInOrder_mem {s : State} {fact : StartedFact} (inside : fact ∈ startsInOrder s) :
    fact ∈ Laws.State.starts s := by
  rw [startsInOrder] at inside
  rw [Laws.State.starts]
  rcases List.mem_append.mp inside with journalled | drafted
  · obtain ⟨transition, member, has⟩ := List.mem_flatMap.mp journalled
    exact List.mem_append_left _ (List.mem_flatMap.mpr ⟨transition, List.mem_reverse.mp member, has⟩)
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

/-- Journalling the draft keeps `BeginsKept`: the facts keep the order they were made in. -/
theorem BeginsKept.journal {program : Program} {s : State} (transition : Transition)
    (started : transition.started = s.draft.started) (held : BeginsKept program s) :
    BeginsKept program { s with journal := transition :: s.journal, draft := {}, writes := [] } :=
  held.carry fun _ => ⟨fun o inside _ => .inl inside, fun _ named => .inl named, by
    simp only [startsInOrder, List.reverse_cons, List.flatMap_append, List.flatMap_singleton, started]
    exact List.append_nil _⟩

/-- Taking signals off the queue keeps `BeginsKept`. -/
theorem BeginsKept.dequeue {program : Program} {s : State} {signals : List Signal} (fewer : signals.Sublist s.signals)
    (held : BeginsKept program s) : BeginsKept program { s with signals } :=
  held.frame (fun _ inside => inside) (fun _ named => by
    rcases named with occur | compensate | resumed
    · obtain ⟨scope, leave, writes, rest⟩ := occur
      obtain ⟨rule, member⟩ := rest
      exact .inl ⟨scope, leave, writes, rule, fewer.subset member⟩
    · obtain ⟨scope, activity, trigger, rest⟩ := compensate
      obtain ⟨leave, at_, resumed, member⟩ := rest
      exact .inr (.inl ⟨scope, activity, trigger, leave, at_, resumed, fewer.subset member⟩)
    · exact .inr (.inr resumed)) rfl rfl

/-- Taking tokens off the work stack keeps `BeginsKept`. -/
theorem BeginsKept.untoken {program : Program} {s : State} (tokens : List Token) (held : BeginsKept program s) :
    BeginsKept program { s with tokens } :=
  held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

/-- Beginning an admitted request keeps `BeginsKept`: a reservation it begins is of an element that does not loop, and
a fresh occurrence numbers an activation above every one its counter has issued, which every start fact of the input
counts. -/
theorem BeginsKept.begin {program other : Program} {s : State} {request : BeginRequest} (formed : WellFormed other s)
    (admitted : Laws.Step.Admitted s request) (role : ActivationRole) (sourceType : String)
    (held : BeginsKept program s) : BeginsKept program (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  intro apart
  have kept := held apart
  refine ⟨fun o inside unbegun => ?_, fun element named => kept.occurs element
    (pending_same begins.signals (congrArg (·.compensation.runs) begins.slots) element named),
    fun element loop processInstance looped => ?_⟩
  · rw [begins.occurrences] at inside
    rcases List.mem_append.mp inside with old | new
    · exact kept.unbegun o (List.mem_filter.mp old).1 unbegun
    · rw [List.mem_singleton.mp new, begins.isBegun] at unbegun
      cases unbegun
  · rw [startsInOrder, begins.journal, begins.started, ← List.append_assoc]
    refine BeginsInOrder.append (kept.ordered element loop processInstance looped)
      fun instanceNamed elementNamed roled earlier earlierIn earlierInstance earlierElement earlierRole => ?_
    simp only [Laws.State.key] at instanceNamed elementNamed roled
    rcases begins.source with ⟨reserved, reservation⟩ | fresh
    · have named : reserved.id ∈ Laws.State.names request := by
        simp [Laws.State.names, reservation.named]
      have unbegun := ((admitted.2.1 reserved.id named).1.2 reserved reservation.member rfl).1
      rw [reservation.element] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun reserved reservation.member unbegun loop)
    · obtain ⟨count, member, countInstance, rest⟩ := formed.counted earlier (startsInOrder_mem earlierIn)
      obtain ⟨countElement, countRole, below⟩ := rest
      have bound := fresh.activated.above count member
        (by rw [countInstance, earlierInstance, ← instanceNamed, begins.instances, begins.scope])
        (by rw [countElement, earlierElement, ← elementNamed, fresh.element])
        (by rw [countRole, earlierRole, ← roled, fresh.roled])
      exact Nat.lt_of_le_of_lt below bound

/-! ## The completion pipeline's own phases -/

/-- Starting a reservation where it stands and closing its items keeps `BeginsKept`: the reservation is of an element
that does not loop, so its start fact is none of a looping element's. -/
theorem BeginsKept.startReserved {program : Program} {s : State} {occurrence : Occurrence} (sourceType : String)
    (member : occurrence ∈ s.occurrences) (held : BeginsKept program s) :
    BeginsKept program ((s.startReserved occurrence sourceType).1.closeOwnItems occurrence.id) := by
  rw [Laws.State.closeOwnItems_eq]
  cases begun : occurrence.begun
  · have starts := Laws.State.startReserved_starts s sourceType begun
    intro apart
    have kept := held apart
    refine ⟨fun o inside unbegun => ?_, fun element named => kept.occurs element
      (pending_same starts.signals (congrArg (·.compensation.runs) starts.slots) element named),
      fun element loop processInstance looped => ?_⟩
    · rw [starts.occurrences] at inside
      obtain ⟨old, oldIn, made⟩ := List.mem_map.mp inside
      by_cases same : old.id = occurrence.id
      · simp only [same, ↓reduceIte] at made
        rw [← made] at unbegun
        cases unbegun
      · simp only [same, ↓reduceIte] at made
        exact made ▸ kept.unbegun old oldIn (made ▸ unbegun)
    · rw [startsInOrder, starts.journal, starts.started, ← List.append_assoc]
      refine BeginsInOrder.append (kept.ordered element loop processInstance looped) fun _ elementNamed _ => ?_
      simp only [Laws.State.key] at elementNamed
      exact absurd (elementNamed ▸ looped) (kept.unbegun occurrence member begun loop)
  · rw [Laws.State.startReserved_begun s sourceType begun]
    exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl

/-- Journalling an end keeps `BeginsKept`. -/
theorem BeginsKept.recordEnd {program : Program} {s : State} (key : OccurrenceKey) (terminal : Terminal)
    (held : BeginsKept program s) : BeginsKept program (s.recordEnd key terminal) := by
  rw [Laws.State.recordEnd_eq]
  exact held.draft _ rfl

/-! ## Subscriptions' reservations and queued occurrences -/

/-- A reservation or queued occurrence a subscription makes names a reservable element, a boundary's identifier or one
pending in a state that kept the relation, none of which loops under a program whose identifiers are unique. -/
theorem beginsKept_occursAlongside (program : Program) : OccursAlongside program (BeginsKept program) where
  reserve s _ scope _ reservable _ held := held.reserve (fun apart => reservable_unlooped apart reservable) scope
  occur s element scope leave writes rule named _ held := held.signal _ fun apart other inside => by
    rw [List.mem_singleton.mp inside]
    exact named.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept apart).occurs)
  compensate s scope activity trigger leave element at_ resumed named _ _ held := held.signal _ fun apart other inside => by
    rw [List.mem_singleton.mp inside]
    exact named.elim (boundaryOf_unlooped apart) (PendingIn.unlooped fun _ kept => (kept apart).occurs)
  throwCompensate s _ _ _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  raise s _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  enterCalled _ call variables definition formed _ _ _ _ _ held :=
    held.enterCalled formed program call variables definition

/-! ## Through an input -/

/-- An input's reset keeps every reservation and leaves no start fact. -/
theorem beginsKept_reset {program : Program} {s : State} (unbegun : IdsUnique program → UnbegunUnlooped program s)
    (occurs : IdsUnique program → ∀ element, OccurPending s element → ∀ loop, ¬ LoopOf program element loop) :
    BeginsKept program { s with journal := [], outbox := [], draft := {}, writes := [] } := fun apart =>
  ⟨unbegun apart, occurs apart, fun _ _ _ _ => by simp [startsInOrder, BeginsInOrder]⟩

/-- A start's fresh instance holds no occurrence and no reservation still to be made. -/
theorem beginsKept_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    BeginsKept program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  obtain ⟨occurrences, signals, _, runs⟩ := Laws.State.initial_empty instanceId variables businessKey
  have empty : BeginsKept program (State.initial instanceId variables businessKey) := fun _ =>
    ⟨fun o inside => by simp [occurrences] at inside, fun element named => by
      rcases named with occur | compensate | resumed
      · simp [signals] at occur
      · simp [signals] at compensate
      · simp [runs] at resumed,
      fun _ _ _ _ => by simp [startsInOrder, BeginsInOrder, Laws.State.initial_eq]⟩
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
  (contract : Laws.Step.HookContract hooks fun program s => WellFormed program s ∧ BeginsKept program s)
  (phases : Laws.Step.ClosurePhases fun program s => WellFormed program s ∧ BeginsKept program s)
  (pipeline : Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ BeginsKept program s)
  (facts : Laws.Step.StateFacts)

include contract phases pipeline facts in
/-- A committed input on a running instance settles in a state that keeps `BeginsKept`, whose journal reversed is the
committed state's (`Laws.Step.running_settles`), from a well-formed before-state whose reservations, made or still to
be made, name no looping element. -/
theorem beginsKept_running {program : Program} {before after : State} {input : Input}
    (formed : WellFormed program before) (unbegun : IdsUnique program → UnbegunUnlooped program before)
    (occurs : IdsUnique program → ∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop)
    (ran : Step.step hooks program (some before) input = .ok after) :
    ∃ settled, BeginsKept program settled ∧ after = { settled with journal := settled.journal.reverse } :=
  have settles := Laws.Step.running_settles contract phases facts (Laws.Step.complete_keeps contract phases pipeline facts)
    ⟨Laws.State.reset_wellFormed formed, beginsKept_reset unbegun occurs⟩ ran
  settles.imp fun _ kept => ⟨kept.1.2, kept.2⟩

include contract phases pipeline facts in
/-- A committed start settles in a state that keeps `BeginsKept`, whose journal reversed is the committed state's. -/
theorem beginsKept_start
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    {program : Program} {input : Input} {after : State} (ran : Step.step hooks program none input = .ok after) :
    ∃ settled, BeginsKept program settled ∧ after = { settled with journal := settled.journal.reverse } :=
  have settles := Laws.Step.step_settles contract phases facts (Laws.Step.complete_keeps contract phases pipeline facts)
    (fun _ _ held => ⟨Laws.State.reset_wellFormed held.1,
      beginsKept_reset (fun apart => (held.2 apart).unbegun) fun apart => (held.2 apart).occurs⟩)
    (fun instanceId variables businessKey =>
      ⟨initial program instanceId variables businessKey, beginsKept_initial program instanceId variables businessKey⟩)
    (fun _ given => by cases given) ran
  settles.imp fun _ kept => ⟨kept.1.2, kept.2⟩

include contract phases pipeline facts in
/-- Hooks that keep `BeginsKept` beside `WellFormed` keep the reservations of looping elements unmade. -/
theorem unbegunKept_of
    (initial : ∀ program instanceId variables businessKey,
      WellFormed program ((State.initial instanceId variables businessKey).signal (.armScope State.root))) :
    UnbegunKept hooks where
  step _ _ _ _ apart formed unbegun occurs ran := by
    obtain ⟨settled, kept, made⟩ := beginsKept_running contract phases pipeline facts formed (fun _ => unbegun)
      (fun _ => occurs) ran
    exact made ▸ (kept apart).unbegun
  start _ _ _ apart ran := by
    obtain ⟨settled, kept, made⟩ := beginsKept_start contract phases pipeline facts initial ran
    exact made ▸ (kept apart).unbegun

include contract phases pipeline facts in
/-- Under hooks that keep `BeginsKept` beside `WellFormed`, a committed input's start facts of a looping element under
the element role carry increasing activations in journal order, from a well-formed before-state whose reservations,
made or still to be made, name no looping element. -/
theorem beginsInOrder_of {program : Program} {before after : State} {input : Input} {element : ElementId}
    {loop : MultiInstance} (processInstance : String) (apart : IdsUnique program) (formed : WellFormed program before)
    (unbegun : UnbegunUnlooped program before)
    (occurs : ∀ element, OccurPending before element → ∀ loop, ¬ LoopOf program element loop)
    (ran : Step.step hooks program (some before) input = .ok after) (looped : LoopOf program element loop) :
    BeginsInOrder (after.journal.flatMap (·.started)) processInstance element := by
  obtain ⟨settled, kept, made⟩ := beginsKept_running contract phases pipeline facts formed (fun _ => unbegun)
    (fun _ => occurs) ran
  rw [made]
  exact BeginsInOrder.sublist ((kept apart).ordered element loop processInstance looped)
    (List.sublist_append_left (settled.journal.reverse.flatMap (·.started)) settled.draft.started)

end Walk

/-! ## The frame records -/

/-- The state operations the hooks apply keep `BeginsKept`. -/
theorem beginsKept_alongside (program : Program) : Alongside (BeginsKept program) where
  frame _ _ moved held := held.frame (fun _ inside => moved.occurrences ▸ inside) moved.pending moved.journal
    (congrArg (·.started) moved.draft)
  emit _ _ _ _ _ _ _ held := by
    rw [Laws.State.emit_eq]
    exact held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl
  complete _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  park _ _ _ _ _ held := held.frame (fun _ inside => inside) (fun _ named => named) rfl rfl
  arm _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  armGateway _ _ _ _ _ _ _ _ held := held.signal _ fun _ _ inside => absurd inside List.not_mem_nil
  signalBegin _ _ request _ _ _ held := held.signalBegin request
  issue _ held := held.issue
  enterScope _ _ element parent locals owner _ _ held := held.enterScope element parent locals owner
  reserve _ _ _ scope _ pending _ held :=
    held.reserve (fun apart => PendingIn.unlooped (fun _ kept => (kept apart).occurs) pending) scope
  leaveScope _ _ _ formed present _ held := held.leaveScope formed present
  clearInside _ _ _ keep formed present _ held := held.clearInside formed present keep
  disarm _ _ host _ held := held.disarm host
  setVariable _ _ target name value _ held := held.setVariable target name value
  removeVariable _ _ target name _ held := held.removeVariable target name
  instanceBegin _ _ request _ _ held := held.signalBegin request
  defer _ _ requests _ _ held := held.defer requests
  leaveInstance _ _ _ _ formed _ _ present held := held.leaveScope formed present
  runs _ _ runs _ _ held := held.runs runs

/-- Storing compensation runs that resume only by pending reservations keeps `BeginsKept`. -/
theorem beginsKept_stores (program : Program) : StoresAlongside (BeginsKept program) :=
  { (beginsKept_alongside program).toFrameAlongside with
    storeRuns := fun _ _ compensation _ _ resumes _ held => held.storeRuns compensation resumes }

/-- The phases a closure runs keep `BeginsKept`; cancelling is `FrameAlongside.cancelOccurrence`. -/
theorem beginsKept_closureAlongside (program : Program) : ClosureAlongside (BeginsKept program) where
  toFrameAlongside := (beginsKept_alongside program).toFrameAlongside
  journal _ _ transition _ held started _ := held.journal transition started
  dequeue _ _ _ _ fewer held := held.dequeue fewer
  untoken _ _ tokens _ _ held := held.untoken tokens
  begin _ _ _ role sourceType formed _ admitted _ _ held := held.begin formed admitted role sourceType
  cancel _ _ _ formed held := (beginsKept_alongside program).toFrameAlongside.cancelOccurrence
    (fun _ id _ kept => kept.withoutRecord id) (fun _ _ _ kept => kept.draft _ rfl) formed held

/-- The completion pipeline's own phases keep `BeginsKept` where they keep `WellFormed`. -/
theorem beginsKept_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ BeginsKept program s where
  startReserved _ _ occurrence sourceType holds member unnamed :=
    ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, holds.2.startReserved sourceType member⟩
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (beginsKept_alongside program).toFrameAlongside.removeOccurrence
      (fun _ id _ kept => kept.withoutRecord id) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, holds.2.recordEnd key terminal⟩

end Kernel.Proofs.MultiInstance
