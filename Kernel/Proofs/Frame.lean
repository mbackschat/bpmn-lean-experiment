module

public import Kernel.Laws.Step
public import Kernel.Laws.State.Fire

/-! # Proofs: the frame a property carried beside `WellFormed` passes through

What the state operations the hooks apply and `Step`'s own phases must keep of a property `rel` carried beside
`Laws.State.WellFormed` (`FrameAlongside`, `Alongside`, `ClosureAlongside`, `StepAlongside`), what the features'
records supply where they make or queue a reservation (`OccursAlongside`, `ResumesPending`), and the walks every such
property shares: queuing a quiet signal, holding, opening and closing items, removing, withdrawing and cancelling an
occurrence, and `Step`'s phases from those records (`closurePhases_alongside`, `phases_alongside`). Every proof lane
that carries a property beside `WellFormed` imports this module rather than another lane's; it reads no feature, so it
lies in no feature's rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Frame

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds occurrenceIds)
open Kernel.Laws.IL (BoundaryOf Reservable)
open Kernel.Laws.Step (OccurPending PendingIn)

/-- One link up: `inner` is `outer`, or a scope occurrence of `s` whose parent lies within `outer`. -/
theorem Within.up {s : State} {inner outer : ScopeOccurrenceId} (within : Within s inner outer) :
    inner = outer ∨ ∃ child ∈ s.scopes, child.id = inner ∧ ∃ parent, child.parent = some parent ∧ Within s parent outer := by
  cases within with
  | refl => exact .inl rfl
  | parent child parent _ member link above => exact .inr ⟨child, member, rfl, parent, link, above⟩

/-- What the features' records supply, for a property `rel` carried beside `WellFormed` under `program`, where they
make or queue a reservation or a trigger, or read the program: a subscription reserves a `Reservable` element; a queued
`Signal.occur` or compensation resume names a boundary or one pending in a state that kept `rel`; a caught Cancel's
compensation, queued once a well-formed state's standing scope occurrence is cleared, takes the trigger of the raise it
was taken off (`Laws.State.RollsBack`), and a throw's compensation and raise name an occurrence begun from a state that
kept `WellFormed` and `rel` (`Laws.State.BegunFrom`, `Laws.State.RaisesFrom`); a Call enters its called root under
`program`, which names the root by the Call's authored identifier, for a present begun Call of the element role, of an
Activity the program declares, that owns no called root yet (`Laws.Work.WorkOps.enterCalled`). -/
structure OccursAlongside (program : Program) (rel : State → Prop) : Prop where
  reserve : ∀ s element scope, WellFormed program s → Reservable program element → rel s →
    rel (s.reserve element scope).1
  occur : ∀ s element scope leave writes rule, (BoundaryOf program element ∨ PendingIn rel element) → rel s →
    rel (s.signal (.occur element scope leave writes rule))
  compensate : ∀ s scope activity trigger leave element at_ resumed,
    (BoundaryOf program element ∨ PendingIn rel element) →
    (∃ before, s = before.clearInside scope ∧ WellFormed program before ∧ scope ∈ scopeIds before ∧
      Laws.State.RollsBack (fun t => WellFormed program t ∧ rel t) trigger before) → rel s →
    rel (s.signal (.compensate scope activity trigger leave (some (.occur element at_ resumed))))
  throwCompensate : ∀ s occurrence scope activity trigger leave, WellFormed program s →
    Laws.State.BegunFrom (fun t => WellFormed program t ∧ rel t) s occurrence →
    trigger = { processInstanceId := s.instanceOf occurrence.scope, element := occurrence.element,
                activation := occurrence.activation } → rel s →
    rel (s.signal (.compensate scope activity trigger none (some (.complete occurrence.id leave))))
  raise : ∀ s raised occurrence, WellFormed program s →
    Laws.State.RaisesFrom (fun t => WellFormed program t ∧ rel t) occurrence s → rel s →
    rel (s.signal (.raise raised { element := occurrence.element, scope := occurrence.scope,
                                   activation := occurrence.activation }))
  enterCalled : ∀ s call variables definition, WellFormed program s → call ∈ s.occurrences → call.begun = true →
    call.role = .element → ((program.element? call.element).bind (·.activity?)).isSome →
    (∀ root ∈ s.scopes, root.calledInstance.isSome → root.occurrence ≠ some call.id) → rel s →
    rel (s.enterCalled program call variables definition).1

/-- The compensation runs `compensation` resume only reservations pending in `s` or in a state that kept `rel`: what
storing them needs (`StoresAlongside.storeRuns`). -/
def ResumesPending (rel : State → Prop) (s : State) (compensation : Compensations) : Prop :=
  ∀ run ∈ compensation.runs, ∀ element at_ leave, run.resume = some (.occur element at_ leave) →
    OccurPending s element ∨ PendingIn rel element

/-- `t` agrees with `s` on everything a property carried beside `WellFormed` may read: the scope occurrences, the
occurrences, the issue and activation counters, the journal, the draft, the instance identity, the Multi-Instance runs,
the compensation slot, the queued begins in queue order (`Laws.Step.beginsOf`, `Laws.Step.deferredOf`), the queued
triggers (`Laws.Step.triggersOf`) and the queued compensations' resumes (`Laws.Step.resumesOf`), and `t` has no
reservation pending that `s` lacks (`Laws.Step.OccurPending`). -/
structure Unmoved (s t : State) : Prop where
  scopes : t.scopes = s.scopes
  occurrences : t.occurrences = s.occurrences
  nextIssue : t.nextIssue = s.nextIssue
  activations : t.activations = s.activations
  journal : t.journal = s.journal
  draft : t.draft = s.draft
  instanceId : t.instanceId = s.instanceId
  multiInstances : t.slots.multiInstances = s.slots.multiInstances
  compensation : t.slots.compensation = s.slots.compensation
  begins : Laws.Step.beginsOf t.signals = Laws.Step.beginsOf s.signals
  triggers : Laws.Step.triggersOf t.signals = Laws.Step.triggersOf s.signals
  resumes : Laws.Step.resumesOf t.signals = Laws.Step.resumesOf s.signals
  deferred : Laws.Step.deferredOf t.tokens = Laws.Step.deferredOf s.tokens
  pending : ∀ element, Laws.Step.OccurPending t element → Laws.Step.OccurPending s element

/-- `Unmoved` stating only the fields a change moves: every other field holds by definition, so a field added to
`Unmoved` is one edit here. -/
theorem Unmoved.same {s t : State} (scopes : t.scopes = s.scopes := by exact rfl)
    (occurrences : t.occurrences = s.occurrences := by exact rfl) (nextIssue : t.nextIssue = s.nextIssue := by exact rfl)
    (activations : t.activations = s.activations := by exact rfl) (journal : t.journal = s.journal := by exact rfl)
    (draft : t.draft = s.draft := by exact rfl) (instanceId : t.instanceId = s.instanceId := by exact rfl)
    (multiInstances : t.slots.multiInstances = s.slots.multiInstances := by exact rfl)
    (compensation : t.slots.compensation = s.slots.compensation := by exact rfl)
    (begins : Laws.Step.beginsOf t.signals = Laws.Step.beginsOf s.signals := by exact rfl)
    (triggers : Laws.Step.triggersOf t.signals = Laws.Step.triggersOf s.signals := by exact rfl)
    (resumes : Laws.Step.resumesOf t.signals = Laws.Step.resumesOf s.signals := by exact rfl)
    (deferred : Laws.Step.deferredOf t.tokens = Laws.Step.deferredOf s.tokens := by exact rfl)
    (pending : ∀ element, Laws.Step.OccurPending t element → Laws.Step.OccurPending s element :=
      by exact fun _ held => held) : Unmoved s t :=
  ⟨scopes, occurrences, nextIssue, activations, journal, draft, instanceId, multiInstances, compensation, begins,
    triggers, resumes, deferred, pending⟩

/-- `scope` is the context of a handler or group a compensation run of `s` holds running. -/
def RunningContext (s : State) (scope : ScopeOccurrenceId) : Prop :=
  ∃ run ∈ s.slots.compensation.runs, scope ∈ run.running.map (·.1)

/-- `scope` is the scope occurrence of an active instance of a Multi-Instance run of `s`. -/
def ActiveInstance (s : State) (scope : ScopeOccurrenceId) : Prop :=
  ∃ run ∈ s.slots.multiInstances, Iteration.active scope ∈ run.instances

/-- The scope occurrence `scope` of `s` that an operation other than a Multi-Instance instance's completion leaves:
it is owned by an occurrence (`State.removeOccurrence` leaves only such, `removeOccurrence_leavesOwned`), or is a
running compensation context (`Feature.Compensation.release`). -/
def LeavesOwned (s : State) (scope : ScopeOccurrenceId) : Prop :=
  (∃ entry ∈ s.scopes, entry.id = scope ∧ ∃ owner, entry.occurrence = some owner) ∨ RunningContext s scope

/-- Each context the runs of `compensation`, stored in place of `s`'s, hold running was a running context of `s` or
is no active Multi-Instance instance scope occurrence of `s`. -/
def StoresHeldOrFresh (s : State) (compensation : Compensations) : Prop :=
  ∀ run ∈ compensation.runs, ∀ context ∈ run.running.map (·.1),
    RunningContext s context ∨ ¬ ActiveInstance s context

/-- A scope occurrence `State.removeOccurrence` leaves (one owned by the removed occurrence, of the state it removes
from) is, while it stands in a state whose scope occurrences are some of those, still owned: leaving keeps each
record it does not drop. -/
theorem removeOccurrence_leavesOwned {s t : State} {id : Nat} (distinct : (s.scopes.map (·.id)).Nodup)
    (fewer : t.scopes.Sublist s.scopes) {entry : ScopeOccurrence}
    (member : entry ∈ s.scopes.filter (·.occurrence == some id)) (stands : entry.id ∈ scopeIds t) :
    LeavesOwned t entry.id := by
  obtain ⟨held, inside, same⟩ := List.mem_map.mp stands
  obtain ⟨original, owned⟩ := List.mem_filter.mp member
  obtain rfl := Laws.State.nodup_map_eq distinct (fewer.subset inside) original same
  exact .inl ⟨held, inside, rfl, id, by simpa using owned⟩

/-- A begin queued by a feature other than Multi-Instance: it begins no instance, and the reservation it names, if any,
is begun in a scope occurrence that some occurrence owns, such as the one a Scope's entry opens (`Scopes.enter`), never
an instance's. -/
def BeginFits (s : State) (request : BeginRequest) : Prop :=
  (∀ body, request.continuation ≠ .multiInstance body) ∧
    ∀ id, request.reserved = some id → ∃ entry ∈ s.scopes, entry.id = request.scope ∧ entry.occurrence.isSome

/-- A begin that continues by its flows fits when the reservation it names, if any, is begun in an owned scope
occurrence. -/
theorem BeginFits.flows {s : State} {request : BeginRequest} (flows : request.continuation = .flow)
    (owned : ∀ id, request.reserved = some id → ∃ entry ∈ s.scopes, entry.id = request.scope ∧ entry.occurrence.isSome) :
    BeginFits s request :=
  ⟨fun body same => Laws.Step.flow_ne_multiInstance body (flows ▸ same), owned⟩

/-- A fresh begin that continues by its flows fits. -/
theorem BeginFits.fresh {s : State} {request : BeginRequest} (flows : request.continuation = .flow)
    (fresh : request.reserved = none) : BeginFits s request :=
  .flows flows fun _ named => by rw [fresh] at named; cases named

/-- A compensation handler's fresh begin fits. -/
theorem BeginFits.handler {s : State} {request : BeginRequest} {run : ScopeOccurrenceId}
    (handles : request.continuation = .compensation run) (fresh : request.reserved = none) : BeginFits s request :=
  ⟨fun body same => Laws.Step.compensation_ne_multiInstance run body (handles ▸ same),
    fun _ named => by rw [fresh] at named; cases named⟩

/-- What the state operations the hooks apply keep of a property `rel` carried beside `WellFormed`: an update of
nothing `rel` may read (`Unmoved`), queuing a begin that `BeginFits`, issuing an identity, entering a scope occurrence
(a Call's called root, which reads the program, is `OccursAlongside`'s), reserving an occurrence a `Signal.occur` queued
in a state that kept `rel` (`Laws.Step.PendingIn`; a subscription's reservation is `OccursAlongside`'s), leaving a scope occurrence that stands and is owned or a running
compensation context (`LeavesOwned`), clearing one that stands, keeping only occurrences that lie in no scope occurrence
strictly within it, disarming a host, and a variable write or removal. Every feature's operations record of `WellFormed`
and `rel` but `Laws.MultiInstance.MultiInstanceOps` and the compensation records follows from its record of `WellFormed`
and this one, with `OccursAlongside` where it reserves, queues a trigger or enters a called root; those two compensation
records also store runs (`StoresAlongside`). -/
structure FrameAlongside (rel : State → Prop) : Prop where
  frame : ∀ s t, Unmoved s t → rel s → rel t
  signalBegin : ∀ s request, BeginFits s request → rel s → rel (s.signal (.begin request))
  issue : ∀ s, rel s → rel s.issue.1
  enterScope : ∀ program s element parent locals owner, WellFormed program s → rel s →
    rel (s.enterScope element parent locals owner).1
  reserve : ∀ program s element scope, WellFormed program s → Laws.Step.PendingIn rel element → rel s →
    rel (s.reserve element scope).1
  leaveScope : ∀ program s scope, WellFormed program s → scope ∈ scopeIds s → LeavesOwned s scope → rel s →
    rel (s.leaveScope scope)
  clearInside : ∀ program s scope keep, WellFormed program s → scope ∈ scopeIds s →
    (∀ o ∈ s.occurrences, o.id ∈ keep → ¬ Laws.State.StrictlyWithin s o.scope scope) → rel s →
    rel (s.clearInside scope keep)
  disarm : ∀ program s host, WellFormed program s → rel s → rel (s.disarm host)
  setVariable : ∀ program s target name value, WellFormed program s → rel s → rel (s.setVariable target name value)
  removeVariable : ∀ program s target name, WellFormed program s → rel s → rel (s.removeVariable target name)

/-- `FrameAlongside` with storing compensation runs whose running contexts were held or are no active Multi-Instance
instance (`StoresHeldOrFresh`) and that resume only by reservations pending (`ResumesPending`): what the records of
`Laws.Compensation.CompensationOps` and `Laws.Compensation.RunsOps` beside `WellFormed` follow from. A property that
reads the runs themselves proves what the compensation hooks keep of it directly (`Proofs.Step.CompensationKeeps`). -/
structure StoresAlongside (rel : State → Prop) : Prop extends FrameAlongside rel where
  storeRuns : ∀ program s (compensation : Compensations), WellFormed program s →
    StoresHeldOrFresh s compensation → ResumesPending rel s compensation → rel s →
    rel { s with slots := { s.slots with compensation } }

/-- `FrameAlongside` with the operations of the record that carries none of its premises,
`Laws.MultiInstance.MultiInstanceOps`: queuing and deferring the begins of instances, leaving an active Multi-Instance
instance's scope occurrence and replacing the Multi-Instance runs. The scope occurrences kept and an input's end facts
read no queued begin and no runs. -/
structure Alongside (rel : State → Prop) : Prop extends FrameAlongside rel where
  instanceBegin : ∀ s request, rel s → rel (s.signal (.begin request))
  defer : ∀ s requests, rel s → rel (s.deferBegins requests)
  leaveInstance : ∀ program s run scope, WellFormed program s → run ∈ s.slots.multiInstances →
    Iteration.active scope ∈ run.instances → scope ∈ scopeIds s → rel s → rel (s.leaveScope scope)
  runs : ∀ s (runs : List MultiInstanceRun), rel s → rel { s with slots := { s.slots with multiInstances := runs } }

/-- A queued signal that queues no begin, makes no reservation and carries no trigger and no resume moves nothing `rel`
reads. -/
theorem FrameAlongside.signal {rel : State → Prop} (side : FrameAlongside rel) {s : State} (kept : rel s)
    (signal : Signal)
    (quiet : Laws.Step.beginsOf [signal] = [] ∧ Laws.Step.occursOf [signal] = [] ∧ Laws.Step.triggersOf [signal] = [] :=
      by exact ⟨rfl, rfl, rfl⟩) (unresumed : Laws.Step.resumesOf [signal] = [] := by exact rfl) :
    rel (s.signal signal) := by
  rw [Laws.State.signal_eq]
  have pending := fun pending => Laws.Step.occurPending_of (s := s) (t := { s with signals := s.signals ++ [signal] })
    (fun element inside => by rwa [Laws.Step.occursOf_append, quiet.2.1, List.append_nil] at inside)
    (fun _ member => member) (element := pending)
  exact side.frame s _ (.same (begins := by rw [Laws.Step.beginsOf_append, quiet.1, List.append_nil])
    (triggers := by rw [Laws.Step.triggersOf_append, quiet.2.2, List.append_nil])
    (resumes := by rw [Laws.Step.resumesOf_append, unresumed, List.append_nil]) (pending := pending)) kept

/-- Removing an occurrence of a well-formed state keeps what the state operations keep and dropping a record that owns
no scope occurrence keeps: `State.removeOccurrence` drops the record and then leaves the scope occurrences it owns,
which ends where leaving them first, each owned and from a well-formed state, and dropping the record last ends, since
the record lies outside each of them (`Laws.State.leaveScope_withoutRecord`); with no record, nothing owns one. -/
theorem FrameAlongside.removeOccurrence {rel : State → Prop} (side : FrameAlongside rel)
    (without : ∀ t id, (∀ entry ∈ t.scopes, entry.occurrence ≠ some id) → rel t → rel (Laws.State.withoutRecord t id))
    {program : Program} {s : State} {id : Nat} (formed : WellFormed program s) (kept : rel s) :
    rel (s.removeOccurrence id) := by
  by_cases absent : id ∉ occurrenceIds s
  · have unowned : ∀ entry ∈ s.scopes, entry.occurrence ≠ some id := fun entry inside owns => by
      obtain ⟨owner, present, named, _⟩ := formed.owned.scopeOwners entry inside id owns
      exact absent (List.mem_map.mpr ⟨owner, present, named⟩)
    rw [Laws.State.removeOccurrence_eq,
      List.filter_eq_nil_iff.mpr fun entry inside owns => unowned entry inside (by simpa using owns)]
    exact without s id unowned kept
  obtain ⟨record, member, rfl⟩ := List.mem_map.mp (Classical.not_not.mp absent)
  have leaves : ∀ (owned : List ScopeOccurrence) (t : State), WellFormed program t → record ∈ t.occurrences →
      owned.Nodup → (∀ entry ∈ owned, entry ∈ t.scopes ∧ entry.parent = some record.scope ∧
        entry.occurrence = some record.id) → (∀ entry ∈ t.scopes, entry.occurrence = some record.id → entry ∈ owned) →
      rel t → owned.foldl (fun state entry => state.leaveScope entry.id) (Laws.State.withoutRecord t record.id) =
        Laws.State.withoutRecord (owned.foldl (fun state entry => state.leaveScope entry.id) t) record.id ∧
        rel (owned.foldl (fun state entry => state.leaveScope entry.id) t) ∧
        ∀ entry ∈ (owned.foldl (fun state entry => state.leaveScope entry.id) t).scopes,
          entry.occurrence ≠ some record.id := by
    intro owned
    induction owned with
    | nil =>
      intro t _ _ _ _ unowned kept
      exact ⟨rfl, kept, fun entry inside owns => by simpa using unowned entry inside owns⟩
    | cons first rest ih =>
      intro t formed member nodup placed unowned kept
      obtain ⟨firstMember, firstLink, firstOwned⟩ := placed first (List.mem_cons_self ..)
      have present : first.id ∈ scopeIds t := List.mem_map.mpr ⟨first, firstMember, rfl⟩
      have notRoot : first.id ≠ State.root := fun same => by
        simp [(formed.rooted.2.1 first firstMember).mpr same] at firstLink
      have left := Laws.State.leaveScope_left formed present
      have outside : ¬ Within t record.scope first.id := Laws.State.parent_not_within formed firstMember firstLink
      have apart : ∀ occurrence ∈ t.occurrences, occurrence.id = record.id → occurrence.scope ∉ t.subtree first.id :=
        fun occurrence inside same within => by
          rw [Laws.State.nodup_map_eq formed.distinct.occurrences inside member same] at within
          exact outside ((Laws.State.subtree_iff formed present _).mp within)
      have restPlaced : ∀ entry ∈ rest, entry ∈ (t.leaveScope first.id).scopes ∧ entry.parent = some record.scope ∧
          entry.occurrence = some record.id := fun entry inside => by
        obtain ⟨entryMember, entryLink, entryOwned⟩ := placed entry (List.mem_cons_of_mem _ inside)
        have other : entry.id ≠ first.id := fun same =>
          (List.nodup_cons.mp nodup).1 (Laws.State.scope_unique formed.distinct entryMember firstMember same ▸ inside)
        exact ⟨(left.scopes entry).mpr ⟨entryMember,
          Laws.State.sibling_outside formed firstMember entryMember firstLink entryLink other⟩, entryLink, entryOwned⟩
      have restUnowned : ∀ entry ∈ (t.leaveScope first.id).scopes, entry.occurrence = some record.id → entry ∈ rest :=
        fun entry inside owns => by
          obtain ⟨old, away⟩ := (left.scopes entry).mp inside
          rcases List.mem_cons.mp (unowned entry old owns) with rfl | later
          · exact absurd (.refl _) away
          · exact later
      obtain ⟨commutes, kept, none⟩ := ih (t.leaveScope first.id) (left.wellFormed formed present notRoot)
        ((left.occurrences record).mpr ⟨member, outside⟩) (List.nodup_cons.mp nodup).2 restPlaced restUnowned
        (side.leaveScope _ t first.id formed present (.inl ⟨first, firstMember, rfl, record.id, firstOwned⟩) kept)
      simp only [List.foldl_cons]
      rw [Laws.State.leaveScope_withoutRecord t record.id first.id apart]
      exact ⟨commutes, kept, none⟩
  have scopesNodup : s.scopes.Nodup :=
    List.Pairwise.of_map (R := (· ≠ ·)) (S := (· ≠ ·)) (·.id) (fun _ _ apart same => apart (congrArg _ same))
      formed.distinct.scopes
  obtain ⟨commutes, kept, none⟩ := leaves (s.scopes.filter (·.occurrence == some record.id)) s formed member
    (scopesNodup.sublist List.filter_sublist) (fun entry inside => by
      obtain ⟨entryMember, owns⟩ := List.mem_filter.mp inside
      have owned : entry.occurrence = some record.id := by simpa using owns
      exact ⟨entryMember, formed.ownedBelow entry entryMember record member owned, owned⟩)
    (fun entry inside owns => List.mem_filter.mpr ⟨inside, by simpa using owns⟩) kept
  rw [Laws.State.removeOccurrence_eq, commutes]
  exact without _ _ none kept

/-- Withdrawing an occurrence's items closes its own, disarms it and withdraws the items inside the scope occurrences
it owns, which only the disarming may move anything `rel` reads of. -/
theorem FrameAlongside.withdrawOccurrence {rel : State → Prop} (side : FrameAlongside rel) {program : Program} {s : State}
    (formed : WellFormed program s) (kept : rel s) (id : Nat) : rel (s.withdrawOccurrence id) := by
  obtain ⟨items, frame⟩ := Laws.State.withdrawAll_frame
    (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) ((s.closeOwnItems id).disarm id)
  rw [Laws.State.withdrawOccurrence_eq, frame]
  refine side.frame ((s.closeOwnItems id).disarm id) _ .same
    (side.disarm program _ id (Laws.State.closeOwnItems_wellFormed formed id) ?_)
  rw [Laws.State.closeOwnItems_eq]
  exact side.frame s _ .same kept

/-- Cancelling an occurrence of a well-formed state withdraws its items (`FrameAlongside.withdrawOccurrence`), removes
it (`FrameAlongside.removeOccurrence`, given what dropping a record that owns no scope occurrence keeps) and journals
its end and cancellation, which `ends` keeps. -/
theorem FrameAlongside.cancelOccurrence {rel : State → Prop} (side : FrameAlongside rel)
    (without : ∀ t id, (∀ entry ∈ t.scopes, entry.occurrence ≠ some id) → rel t → rel (Laws.State.withoutRecord t id))
    (ends : ∀ t ended cancelled, rel t → rel { t with draft := { t.draft with ended, cancelled } })
    {program : Program} {s : State} {id : Nat} (formed : WellFormed program s) (kept : rel s) :
    rel (s.cancelOccurrence id) := by
  cases found : s.occurrence? id with
  | none =>
    rw [Laws.State.cancelOccurrence_absent found]
    exact kept
  | some occurrence =>
    obtain ⟨ended, cancelled, cancels⟩ := Laws.State.cancelOccurrence_some found
    have withdrawn := (Laws.State.withdrawAll
      (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)) _
      (Laws.State.disarm_wellFormed (Laws.State.closeOwnItems_wellFormed formed id) id)).1
    rw [← Laws.State.withdrawOccurrence_eq] at withdrawn
    rw [cancels]
    exact ends _ ended cancelled (side.removeOccurrence without withdrawn (side.withdrawOccurrence formed kept id))

/-- What the phases a closure runs keep of a property `rel` carried beside `WellFormed`, besides the hooks' state
operations (`FrameAlongside`): journalling the draft, beginning an admitted request in a scope occurrence that stands
and cancelling an occurrence; the others reserve, clear the root or move nothing `rel` may read. -/
structure ClosureAlongside (rel : State → Prop) : Prop extends FrameAlongside rel where
  journal : ∀ program s (transition : Transition), WellFormed program s → rel s → transition.started = s.draft.started →
    transition.ended = s.draft.ended → rel { s with journal := transition :: s.journal, draft := {}, writes := [] }
  /-- Signals leave the queue. -/
  dequeue : ∀ program s signals, WellFormed program s → signals.Sublist s.signals → rel s → rel { s with signals }
  /-- Tokens leave the work stack. -/
  untoken : ∀ program s tokens, WellFormed program s → tokens.Sublist s.tokens → rel s → rel { s with tokens }
  /-- A begin of the request's role, fresh or taken off a queue that kept `rel` (`Laws.Step.BeginOrigin`). -/
  begin : ∀ program s request role sourceType, WellFormed program s → Laws.Step.ScopeStands s request.scope →
    Laws.Step.Admitted s request → role = Step.roleOf program request →
    Laws.Step.BeginOrigin (fun program s => WellFormed program s ∧ rel s) program s request → rel s →
    rel (s.beginOccurrence request role sourceType).1
  cancel : ∀ program s id, WellFormed program s → rel s → rel (s.cancelOccurrence id)

/-- What `Step`'s own phases keep of `rel` (`ClosureAlongside`) and ordering the journal once the closure settles. -/
structure StepAlongside (rel : State → Prop) : Prop extends ClosureAlongside rel where
  runOrder : ∀ program s, WellFormed program s → rel s → rel { s with journal := s.journal.reverse }

/-- The phases a closure runs keep a property beside `WellFormed` that the state operations they apply keep: the
phases that read `WellFormed` alone read its first half, and the others keep the second by `ClosureAlongside` of the
step's program. -/
theorem closurePhases_alongside {rel : Program → State → Prop} (phases : Laws.Step.ClosurePhases WellFormed)
    (side : ∀ program, ClosureAlongside (rel program)) :
    Laws.Step.ClosurePhases fun program s => WellFormed program s ∧ rel program s where
  clock _ s atMs holds :=
    ⟨phases.clock _ _ atMs holds.1,
      (side _).frame s _ .same holds.2⟩
  journal _ s transition holds started ended :=
    ⟨phases.journal _ _ transition holds.1 started ended, (side _).journal _ s transition holds.1 holds.2 started ended⟩
  dequeue _ s signals holds fewer :=
    ⟨phases.dequeue _ _ signals holds.1 fewer, (side _).dequeue _ s signals holds.1 fewer holds.2⟩
  untoken _ s tokens holds fewer :=
    ⟨phases.untoken _ _ tokens holds.1 fewer, (side _).untoken _ s tokens holds.1 fewer holds.2⟩
  queueWrite _ _ scope writes rule holds :=
    ⟨phases.queueWrite _ _ scope writes rule holds.1, (side _).toFrameAlongside.signal holds.2 _⟩
  queueRemove _ _ scope names holds :=
    ⟨phases.queueRemove _ _ scope names holds.1, (side _).toFrameAlongside.signal holds.2 _⟩
  armIssued _ _ host element scope holds := phases.armIssued _ _ host element scope holds.1
  armScopeIssued _ _ scope holds := phases.armScopeIssued _ _ scope holds.1
  armGatewayIssued _ _ occurrence gateway scope holds :=
    phases.armGatewayIssued _ _ occurrence gateway scope holds.1
  endRecorded _ _ status failure holds := phases.endRecorded _ _ status failure holds.1
  admittedSignal _ _ request rest holds := phases.admittedSignal _ _ request rest holds.1
  admittedToken _ _ request rest holds := phases.admittedToken _ _ request rest holds.1
  completeQueued _ _ id leave writes rule holds := phases.completeQueued _ _ id leave writes rule holds.1
  resumable _ _ scope activity trigger leave resume rest holds :=
    phases.resumable _ _ scope activity trigger leave resume rest holds.1
  raisable _ _ raised origin rest holds := phases.raisable _ _ raised origin rest holds.1
  housed _ _ occurrence holds := phases.housed _ _ occurrence holds.1
  bodied _ _ occurrence holds := phases.bodied _ _ occurrence holds.1
  newest _ _ request role sourceType holds := phases.newest _ _ request role sourceType holds.1
  unrun _ _ request role sourceType holds := phases.unrun _ _ request role sourceType holds.1
  unowned _ _ request role sourceType holds := phases.unowned _ _ request role sourceType holds.1
  parkedBegun _ _ waiting occurrence holds := phases.parkedBegun _ _ waiting occurrence holds.1
  endInstance _ s status failure holds recorded := by
    refine ⟨phases.endInstance _ _ status failure holds.1 recorded, ?_⟩
    rw [Laws.Step.endInstance_eq]
    exact (side _).frame (s.clearInside State.root) _ .same
      ((side _).clearInside _ s State.root [] holds.1 holds.1.rooted.1 (fun _ _ none => by cases none) holds.2)
  begin _ s request role sourceType holds stands admitted roled bodied assigned origin :=
    have begun := phases.begin _ _ request role sourceType holds.1 stands admitted roled bodied assigned
      (origin.mono fun _ held => held.1)
    ⟨⟨begun.1, (side _).begin _ s request role sourceType holds.1 stands admitted assigned origin holds.2⟩, begun.2⟩
  reserve _ s element scope holds stands pending :=
    have reserved := phases.reserve _ _ element scope holds.1 stands (pending.imp fun _ => And.imp_left And.left)
    ⟨⟨reserved.1, (side _).reserve _ s element scope holds.1 (pending.imp fun _ => And.imp_left And.right) holds.2⟩,
      reserved.2⟩
  cancel _ s id holds := ⟨phases.cancel _ _ id holds.1, (side _).cancel _ s id holds.1 holds.2⟩

/-- `Step`'s phases keep a property beside `WellFormed` that the state operations they apply keep
(`closurePhases_alongside`), ordering the journal by `StepAlongside.runOrder`. -/
theorem phases_alongside {rel : Program → State → Prop} (phases : Laws.Step.Phases WellFormed)
    (side : ∀ program, StepAlongside (rel program)) :
    Laws.Step.Phases fun program s => WellFormed program s ∧ rel program s :=
  { closurePhases_alongside phases.toClosurePhases fun program => (side program).toClosureAlongside with
    runOrder := fun _ s holds => ⟨phases.runOrder _ _ holds.1, (side _).runOrder _ s holds.1 holds.2⟩ }

section Items

variable {rel : State → Prop}

/-- Holding an occurrence moves nothing `rel` reads. -/
theorem FrameAlongside.hold (side : FrameAlongside rel) {s : State} (kept : rel s) (held : Held) :
    rel (s.hold held) := by
  rw [Laws.Hooks.hold_eq]
  exact side.frame s _ .same kept

/-- An open item is an issue and an added item. -/
theorem FrameAlongside.openItem (side : FrameAlongside rel) {s : State} (kept : rel s) (kind : OpenKind)
    (occurrence : Occurrence) : rel (s.openItem kind occurrence) := by
  refine side.frame s.issue.1 _ ?_ (side.issue s kept)
  rw [Laws.State.openItem_eq, Laws.State.issue_eq]
  exact .same

/-- A subscription is a reservation of a reservable element, an issue and an added item. -/
theorem FrameAlongside.openSubscription (side : FrameAlongside rel) {program : Program}
    (occurs : OccursAlongside program rel) {s : State} (formed : WellFormed program s) (kept : rel s)
    (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId) (host : Option Nat) (passive : Bool)
    (reservable : Laws.IL.Reservable program element) : rel (s.openSubscription kind element scope host passive).1 := by
  refine side.frame (s.reserve element scope).1.issue.1 _ ?_
    (side.issue _ (occurs.reserve s element scope formed reservable kept))
  rw [Laws.State.openSubscription_eq, Laws.State.issue_eq]
  exact .same

/-- Closing an item moves nothing `rel` reads. -/
theorem FrameAlongside.closeItem (side : FrameAlongside rel) {s : State} (kept : rel s) (id : Nat) :
    rel (s.closeItem id) := by
  rw [Laws.State.closeItem_eq]
  exact side.frame s _ .same kept

/-- Withdrawing the items inside a scope occurrence moves nothing `rel` reads. -/
theorem FrameAlongside.withdrawInside (side : FrameAlongside rel) {s : State} (kept : rel s)
    (scope : ScopeOccurrenceId) : rel (s.withdrawInside scope) := by
  rw [Laws.State.withdrawInside_eq]
  exact side.frame s _ .same kept

end Items

end Kernel.Proofs.Frame
