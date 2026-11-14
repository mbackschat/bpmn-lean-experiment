module

public import Kernel.State

/-! # Laws of the kernel state: the invariant

The invariant every reachable `State` keeps, stated over the state's fields and independent of the operations that
produce them: occurrence identity, ownership, the scope tree and the work a closure has queued. The invariant is relative
to the program the instance runs (`WellFormed program s`), since which kind of item an element opens only the program
says (`Typed`), and which elements are Events, whose occurrences a raise names by their key (`EventRoles`,
`Raisable`); every other clause reads the state's fields alone. No instance migrates between programs: `Population`
runs each under its deployment's. The transitions it permits are `Kernel.Laws.State.Transitions`'. Nothing executable
imports this module; the proof wave proves `Step` preserves `WellFormed`
([kernel architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#lean-assurance-lane)).

Besides the state's fields a law names only `Token.busyScope`, a total projection of one work-stack entry whose result
the `State` contract documents, since matching `Token` is `Step`'s
([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)).

Besides the laws, it holds what follows from them over the fields alone: that a well-formed state's scope occurrences
form a tree (`Depth`). The frames through which a change of the fields keeps `WellFormed` are
`Kernel.Laws.State.Frames`', `Kernel.Laws.State.Clear`'s and `Kernel.Laws.State.Issue`'s. Each law is followed by
its non-vacuity witness: a small state that satisfies it and, where the law could otherwise hold of everything, one that
violates it. Nothing here reads a `State` operation's body, so this module sees none; the lemmas about the operations,
and the witness that the sample instance is well-formed, which reads `State.root`'s value, are `Kernel.Laws.State`'s.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The scope tree -/

/-- `Within s inner outer`: the scope occurrence `inner` is `outer` or lies below it by parent links of `s`. A
called instance's root counts as inside its caller, since removing the caller region removes the called subtree
([scopes, PC-SCOPE-06](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#pc-scope-06-exceptional-call-return-and-propagated-cancellation)). -/
inductive Within (s : State) : ScopeOccurrenceId → ScopeOccurrenceId → Prop where
  | refl (scope : ScopeOccurrenceId) : Within s scope scope
  | parent (child : ScopeOccurrence) (parent outer : ScopeOccurrenceId) :
      child ∈ s.scopes → child.parent = some parent → Within s parent outer → Within s child.id outer

/-- A scope occurrence without a parent link contains only itself. -/
theorem Within.parentless {s : State} {inner outer : ScopeOccurrenceId}
    (orphan : ∀ scope ∈ s.scopes, scope.id = inner → scope.parent = none) (within : Within s inner outer) :
    inner = outer := by
  cases within with
  | refl => rfl
  | parent child parent _ member link _ => simp [orphan child member rfl] at link

/-- `inner` lies strictly below `outer`. -/
def StrictlyWithin (s : State) (inner outer : ScopeOccurrenceId) : Prop :=
  Within s inner outer ∧ inner ≠ outer

/-- The scope identifiers of `s`. -/
def scopeIds (s : State) : List ScopeOccurrenceId := s.scopes.map (·.id)

/-- The occurrence identifiers of `s`. -/
def occurrenceIds (s : State) : List Nat := s.occurrences.map (·.id)

/-- `Within` reads only the scope occurrences. -/
theorem Within.congr {s t : State} (scopes : t.scopes = s.scopes) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) : Within t inner outer := by
  induction within with
  | refl scope => exact .refl scope
  | parent child parent outer member link _ ih => exact .parent child parent outer (scopes ▸ member) link ih

/-! ## Identity -/

/-- The key an occurrence publishes: the process instance of its scope occurrence, its element, activation and role,
which `State.keyOf` computes (`Laws.State.keyOf_eq`) and the journal records. -/
def key (s : State) (occurrence : Occurrence) : OccurrenceKey :=
  { processInstanceId := s.instanceOf occurrence.scope, element := occurrence.element,
    activation := occurrence.activation, role := occurrence.role }

/-- The start facts of the input in progress. -/
def starts (s : State) : List StartedFact := s.journal.flatMap (·.started) ++ s.draft.started

/-- Every identifier the state holds was issued before `nextIssue`, so the counter names only fresh identities: an
occurrence's identity is never reused ([scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
structure IssuedBelow (s : State) : Prop where
  occurrences : ∀ occurrence ∈ s.occurrences, occurrence.id < s.nextIssue
  items : ∀ item ∈ s.openItems, item.id < s.nextIssue
  scopes : ∀ scope ∈ s.scopes, scope.id.value < s.nextIssue

/-- No two occurrences, open items or scope occurrences share an identifier, and no two occurrences a key: each
activation numbers one occurrence. -/
structure Distinct (s : State) : Prop where
  occurrences : (occurrenceIds s).Nodup
  items : (s.openItems.map (·.id)).Nodup
  scopes : (scopeIds s).Nodup
  keys : (s.occurrences.map (key s)).Nodup

/-- Within one input's journal no occurrence key starts twice: re-entry and repetition give a new activation, never a
reused one ([scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
def StartedOnce (s : State) : Prop :=
  ((starts s).map (·.occurrence)).Nodup

/-- One activation counter per process instance, element and role (R8), each at least 1 once recorded. -/
structure ActivationsKeyed (s : State) : Prop where
  keys : (s.activations.map fun count => (count.processInstance, count.element, count.role)).Nodup
  positive : ∀ count ∈ s.activations, 0 < count.count

/-- The activation of `key` was issued by its counter: the counter of its process instance, element and role has
reached it. -/
def Counted (s : State) (key : OccurrenceKey) : Prop :=
  ∃ count ∈ s.activations, count.processInstance = key.processInstanceId ∧ count.element = key.element ∧
    count.role = key.role ∧ key.activation ≤ count.count

/-- An unbegun reservation keeps no start fact: a subscription's flow node runs only when its trigger arrives
([scopes, Event Sub-Processes](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#event-sub-processes)). The
journal records an occurrence by its key (`State.keyOf`), so a fact names a reservation exactly when it carries the
reservation's key. -/
def ReservationsUnstarted (s : State) : Prop :=
  ∀ occurrence ∈ s.occurrences, occurrence.begun = false → ∀ fact ∈ starts s, fact.occurrence ≠ key s occurrence

/-! ## Ownership -/

/-- Every reference resolves inside the state: each occurrence, open item, variable set and work-stack entry belongs to
a present scope occurrence; each open item waits for a present occurrence of its own element in its own scope
occurrence, which makes the item's public identity that occurrence's (`State.openItem` and `State.openSubscription`
give the item its occurrence's scope); a subscription hangs on a present begun occurrence and lies in its scope
occurrence, as every arming opens it in its host's scope; a scope occurrence's owning occurrence is present and begun,
since only a begun occurrence enters a scope. -/
structure Owned (s : State) : Prop where
  occurrenceScopes : ∀ occurrence ∈ s.occurrences, occurrence.scope ∈ scopeIds s
  itemScopes : ∀ item ∈ s.openItems, item.scope ∈ scopeIds s
  itemOccurrences : ∀ item ∈ s.openItems, ∃ occurrence ∈ s.occurrences,
    occurrence.id = item.occurrence ∧ occurrence.element = item.element ∧ occurrence.scope = item.scope
  attachments : ∀ item ∈ s.openItems, ∀ host, item.attachedTo = some host → ∃ occurrence ∈ s.occurrences,
    occurrence.id = host ∧ occurrence.begun = true ∧ occurrence.scope = item.scope
  scopeOwners : ∀ scope ∈ s.scopes, ∀ owner, scope.occurrence = some owner → ∃ occurrence ∈ s.occurrences,
    occurrence.id = owner ∧ occurrence.begun = true
  variableScopes : ∀ variables ∈ s.variables, variables.scope ∈ scopeIds s
  tokenScopes : ∀ token ∈ s.tokens, token.busyScope ∈ scopeIds s

/-- The scope occurrences form one tree rooted at `State.root`: it is present, it is the only one without a parent, and
every one reaches it, so no parent chain cycles. The root is named, not merely unique, because `State.initial` is the
only constructor of a parentless scope occurrence and gives it `State.root`; every later one is entered below a parent,
so an operation that falls back to `State.root` addresses a present scope occurrence. -/
def Rooted (s : State) : Prop :=
  State.root ∈ scopeIds s ∧ (∀ scope ∈ s.scopes, scope.parent = none ↔ scope.id = State.root) ∧
    ∀ scope ∈ s.scopes, Within s scope.id State.root

/-- One variable set per scope occurrence, each binding a name at most once: a scope occurrence owns its data, and a
name declared again in a nested scope shadows the outer one rather than repeating in it
([data, scope data](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#scope-data),
[CIB-EXT-0020](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes)). -/
structure VariablesKeyed (s : State) : Prop where
  scopes : (s.variables.map (·.scope)).Nodup
  names : ∀ variables ∈ s.variables, (variables.entries.map (·.1)).Nodup

/-- A failure is recorded exactly when the instance failed. -/
def FailureRecorded (s : State) : Prop :=
  s.failure.isSome = true ↔ s.status = .failed

/-! ## Queued work and counters -/

/-- Every arming queued names an occurrence and a scope occurrence that were issued, so one that `Step.stale` lets run
finds them standing, and its host, while it stands, is begun and runs in the named scope occurrence, as every arming is
queued in its host's scope (`Scopes.enter`, `Work`, `Call.invoke`, `MultiInstance`, `Flow`'s Event-Based Gateway);
every queued instance end records a failure exactly when it fails (`FailureRecorded`). The other queued work checks
what it names itself (`Step.requireScope`, `Step.gone`) or does nothing to what is gone; a queued completion names an
issued identity, so a reservation made later is never one it completes (`Typed`). Queued work naming a scope
occurrence an interruption removed (`Kernel/Step/Stale.lean`) keeps this clause: what it names was issued. -/
structure QueueSound (s : State) : Prop where
  arm : ∀ host element scope, Signal.arm host element scope ∈ s.signals → host < s.nextIssue ∧ scope.value < s.nextIssue ∧
    ∀ occurrence ∈ s.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope
  armScope : ∀ scope, Signal.armScope scope ∈ s.signals → scope.value < s.nextIssue
  armGateway : ∀ occurrence gateway scope, Signal.armGateway occurrence gateway scope ∈ s.signals →
    occurrence < s.nextIssue ∧ scope.value < s.nextIssue ∧
      ∀ found ∈ s.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope
  ends : ∀ status failure, Signal.endInstance status failure ∈ s.signals → (failure.isSome = true ↔ status = .failed)
  completes : ∀ id leave writes rule, Signal.complete id leave writes rule ∈ s.signals → id < s.nextIssue

/-- Every start fact of the input in progress counts an activation its counter has issued, so a fresh activation never
repeats one (`StartedOnce`, R8). -/
def StartsCounted (s : State) : Prop :=
  ∀ fact ∈ starts s, Counted s fact.occurrence

/-- Every occurrence, a reservation included, counts an activation its counter has issued, so a fresh activation never
takes an occurrence's key (`Distinct.keys`, `ReservationsUnstarted`, R8). -/
def OccurrencesCounted (s : State) : Prop :=
  ∀ occurrence ∈ s.occurrences, Counted s (key s occurrence)

/-- A scope occurrence an occurrence owns lies directly below the scope occurrence that occurrence runs in, as every
caller of `State.enterScope` enters it, so removing an occurrence with what it owns leaves the scope occurrence it ran
in standing. -/
def OwnedBelow (s : State) : Prop :=
  ∀ scope ∈ s.scopes, ∀ occurrence ∈ s.occurrences, scope.occurrence = some occurrence.id →
    scope.parent = some occurrence.scope

/-! ## Reservations -/

/-- The reservations a begin request names: the one it begins (`reserved`) and an Event Sub-Process's start Event's
(`inner`). -/
def names (request : BeginRequest) : List Nat := request.reserved.toList ++ request.inner.toList

/-- A begin request is queued: as a `begin` signal or as a deferred begin on the work stack. -/
def Queued (s : State) (request : BeginRequest) : Prop :=
  Signal.begin request ∈ s.signals ∨ Token.begin request ∈ s.tokens

/-- A queued request of a state with fewer queued entries was queued before. -/
theorem Queued.shrink {before after : State} (signals : after.signals.Sublist before.signals)
    (tokens : after.tokens.Sublist before.tokens) {request : BeginRequest} (queued : Queued after request) :
    Queued before request := by
  rcases queued with signal | token
  · exact .inl (signals.subset signal)
  · exact .inr (tokens.subset token)

/-- The reservation `id` may begin in the scope occurrence `scope`: it was issued, and while it stands it is unbegun, no
item waits for it or hangs on it, and it lies in `scope`'s process instance, so its key is the one its begin journals
(`State.beginOccurrence` places a reservation in the request's scope occurrence). -/
def Beginnable (s : State) (scope : ScopeOccurrenceId) (id : Nat) : Prop :=
  id < s.nextIssue ∧ ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.begun = false ∧
    (∀ item ∈ s.openItems, item.occurrence ≠ id ∧ item.attachedTo ≠ some id) ∧
    (scope ∈ scopeIds s → s.instanceOf scope = s.instanceOf occurrence.scope)

/-- A feature slot, a queued compensation or a queued raise will complete the occurrence `id`: a join parks it, a
Multi-Instance body runs on it, a compensation run resumes it once it ends, or it is the Activity a raise leaves once
its search has decided (`Feature.Propagation.hostLeaves`; what `SlotsSettled` reads). -/
def SlotCompletes (s : State) (id : Nat) : Prop :=
  (∃ waiting ∈ s.slots.parked, waiting.occurrence = id) ∨ (∃ run ∈ s.slots.multiInstances, run.occurrence = id) ∨
    (∃ run ∈ s.slots.compensation.runs, ∃ leave, run.resume = some (.complete id leave)) ∨
    (∃ scope activity trigger leave resume,
      Signal.compensate scope activity trigger leave (some (.complete id resume)) ∈ s.signals) ∨
    ∃ raised origin, Signal.raise raised origin ∈ s.signals ∧ origin.host = some id

/-- What a slot completes in a state with the same slots and fewer queued signals, it completes in the other. -/
theorem SlotCompletes.shrink {before after : State} (slots : after.slots = before.slots)
    (signals : ∀ signal ∈ after.signals, signal ∈ before.signals) {id : Nat} (completes : SlotCompletes after id) :
    SlotCompletes before id := by
  rw [SlotCompletes, ← slots]
  rcases completes with parked | bodies | runs | ⟨scope, activity, trigger, rest⟩ | ⟨raised, origin, member, host⟩
  · exact .inl parked
  · exact .inr (.inl bodies)
  · exact .inr (.inr (.inl runs))
  · obtain ⟨leave, resume, member⟩ := rest
    exact .inr (.inr (.inr (.inl ⟨scope, activity, trigger, leave, resume, signals _ member⟩)))
  · exact .inr (.inr (.inr (.inr ⟨raised, origin, signals _ member, host⟩)))

/-- Nothing claims the reservation `id`: no queued begin names it, and no queued completion or feature slot completes
it. -/
def Unclaimed (s : State) (id : Nat) : Prop :=
  (∀ request, Queued s request → id ∉ names request) ∧
    (∀ leave writes rule, Signal.complete id leave writes rule ∉ s.signals) ∧ ¬ SlotCompletes s id

/-- The Event Sub-Process start reservation a begin request names (`BeginRequest.inner`) lies, while it stands, in the
scope occurrence the request begins in. -/
def InnerPlaced (s : State) (request : BeginRequest) : Prop :=
  ∀ id ∈ request.inner.toList, ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.scope = request.scope

/-- `first` occurs in `l` before `second`. -/
def Precedes {α : Type} (l : List α) (first second : α) : Prop := [first, second].Sublist l

/-- Each reservation has one claimant, so it begins once: an item attached to a host holds its unbegun reservation
alone, as `State.openSubscription` reserves afresh for each subscription; a queued begin names distinct beginnable reservations,
which no other queued begin or completion names, as a firing that queues a begin closes the item that held its
reservation (`Subscriptions.fireBoundary`, `fireEventStart`). -/
structure ReservationsClaimed (s : State) : Prop where
  attached : ∀ item ∈ s.openItems, item.attachedTo.isSome = true →
    (∃ occurrence ∈ s.occurrences, occurrence.id = item.occurrence ∧ occurrence.begun = false) → ∀ other ∈ s.openItems,
      other.occurrence = item.occurrence → other = item
  named : ∀ request, Queued s request → (names request).Nodup ∧ ∀ id ∈ names request, Beginnable s request.scope id
  signalsApart : ∀ first second, Precedes s.signals (.begin first) (.begin second) →
    ∀ id ∈ names first, id ∉ names second
  tokensApart : ∀ first second, Precedes s.tokens (.begin first) (.begin second) →
    ∀ id ∈ names first, id ∉ names second
  queuesApart : ∀ first second, Signal.begin first ∈ s.signals → Token.begin second ∈ s.tokens →
    ∀ id ∈ names first, id ∉ names second
  uncompleted : ∀ request id leave writes rule, Queued s request → id ∈ names request →
    Signal.complete id leave writes rule ∉ s.signals
  /-- A queued begin names an issued scope occurrence, so a scope occurrence entered later is never the one it
  begins in. -/
  scopesIssued : ∀ request, Queued s request → request.scope.value < s.nextIssue
  /-- A queued begin's Event Sub-Process start reservation lies in the scope occurrence it begins in, as the firing
  that queues the begin reads both off the item that held it (`Subscriptions.fireEventStart`), so the interrupting
  entry's clearing of that scope occurrence keeps it housed (`Scopes.arriveScope`). -/
  innerPlaced : ∀ request, Queued s request → InnerPlaced s request

/-! ## What the slots complete -/

/-- The occurrence `id` has begun: it was issued, it is begun while it stands, and no queued begin names it, so a
completion of it completes no reservation (`ReservationsClaimed.uncompleted`). -/
def Settled (s : State) (id : Nat) : Prop :=
  id < s.nextIssue ∧ (∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.begun = true) ∧
    ∀ request, Queued s request → id ∉ names request

/-- A Multi-Instance run's active instances were entered below its body's scope occurrence: each was issued, and while
it stands its parent is the body's (`MultiInstance.beginInstances`), so the instance a completion leaves is never the
root and leaving it keeps the body's scope occurrence standing. -/
def Placed (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ scope, Iteration.active scope ∈ run.instances → scope.value < s.nextIssue ∧
    ∀ entry ∈ s.scopes, entry.id = scope → entry.parent = some run.scope

/-- A compensation run's handlers run in context scope occurrences entered below its scope occurrence: each was issued,
and while it stands its parent is the run's (`Compensation.beginHandler`), so releasing a context that stands advances
the run in a scope occurrence that stands (`Compensation.release`); a group's nested run resumes from its own context,
the one it runs in. -/
def RunPlaced (s : State) (run : CompensationRun) : Prop :=
  (∀ outer context, run.resume = some (.group outer context) → context = run.scope) ∧
    ∀ context ∈ run.running.map (·.1), context.value < s.nextIssue ∧
      ∀ entry ∈ s.scopes, entry.id = context → entry.parent = some run.scope

/-- A compensation run in `scope` may end with `resume`: the occurrence it completes has begun, and the group context it
releases is `scope` itself (`Compensation.advance`). -/
def Resumable (s : State) (scope : ScopeOccurrenceId) (resume : Resume) : Prop :=
  (∀ occurrence leave, resume = .complete occurrence leave → Settled s occurrence) ∧
    ∀ outer context, resume = .group outer context → context = scope

/-- What the feature slots and a queued compensation will complete has begun: the occurrences parked at a join
(`Feature.Flow.join` completes them when it fires), a Multi-Instance body's occurrence (`MultiInstance.finish`), and
the occurrence a compensation run, or a queued one, completes once it ends (`Compensation.advance`), and the Activity a
queued raise leaves once its search has decided (`Propagation.hostLeaves`), whose effect failed while it waited for it
(`Worked`). Each arrived, entered, threw or worked while begun, and an identity is never issued again (`IssuedBelow`). A
body's instances are `Placed`, a compensation run's handler contexts `RunPlaced`. -/
structure SlotsSettled (s : State) : Prop where
  parked : ∀ waiting ∈ s.slots.parked, Settled s waiting.occurrence
  bodies : ∀ run ∈ s.slots.multiInstances, Settled s run.occurrence
  resumed : ∀ run ∈ s.slots.compensation.runs, ∀ occurrence leave, run.resume = some (.complete occurrence leave) →
    Settled s occurrence
  queued : ∀ scope activity trigger leave occurrence resume,
    Signal.compensate scope activity trigger leave (some (.complete occurrence resume)) ∈ s.signals → Settled s occurrence
  placed : ∀ run ∈ s.slots.multiInstances, Placed s run
  runsPlaced : ∀ run ∈ s.slots.compensation.runs, RunPlaced s run
  /-- A queued compensation releases no group context but its own scope occurrence: `Propagation` queues none that
  resumes a group. -/
  grouped : ∀ scope activity trigger leave outer context,
    Signal.compensate scope activity trigger leave (some (.group outer context)) ∈ s.signals → context = scope
  raised : ∀ raised origin host, Signal.raise raised origin ∈ s.signals → origin.host = some host → Settled s host

/-- What a slot completes no queued begin names. -/
theorem SlotsSettled.free {s : State} (settled : SlotsSettled s) {request : BeginRequest} (queued : Queued s request)
    {id : Nat} (named : id ∈ names request) : ¬ SlotCompletes s id := by
  rintro (⟨waiting, member, rfl⟩ | ⟨run, member, rfl⟩ | ⟨run, member, leave, resume⟩ |
    ⟨scope, activity, trigger, rest⟩ | ⟨raised, origin, member, host⟩)
  · exact (settled.parked waiting member).2.2 request queued named
  · exact (settled.bodies run member).2.2 request queued named
  · exact (settled.resumed run member id leave resume).2.2 request queued named
  · obtain ⟨leave, resume, member⟩ := rest
    exact (settled.queued scope activity trigger leave id resume member).2.2 request queued named
  · exact (settled.raised raised origin id member host).2.2 request queued named

/-! ## What an open item waits on -/

/-- No occurrence of `s` with the identity `id` has begun: it is an unbegun reservation, or it is absent. -/
def Unbegun (s : State) (id : Nat) : Prop :=
  ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.begun = false

/-- An item attached to a host holds an unbegun reservation: only `State.openSubscription` attaches an item, and it
reserves afresh for it, while `State.openItem` opens an unattached item for a begun occurrence; the reservation begins
only once its item has gone. So nothing attached waits on a begun occurrence, which a clearing that keeps one leaves
standing (`Throw.terminate`). -/
def AttachedReserved (s : State) : Prop :=
  ∀ item ∈ s.openItems, item.attachedTo.isSome = true → Unbegun s item.occurrence

/-- What an item waits for is a trigger, not work: no effect result or incident command closes it. -/
def AwaitsTrigger (kind : OpenKind) : Prop := kind.view.effect = none ∧ kind.view.incident = none

/-- An item of an element the program declares a start Event, an Event Sub-Process start's, holds an unbegun
reservation alone, which no queued completion completes, and waits for a trigger: `Feature.Subscriptions.trigger`
reads the program to tell such an item from a boundary's or a catch Event's, and begins the Event Sub-Process with the
item's reservation (`ReservationsClaimed.named`), while an item for a begun occurrence (`State.openItem`) is opened only
for an Activity or an intermediate Event, which `Step.dispatch` tells from a start Event by the same query, and only
such an item is completed while it waits or given an effect or an incident (`Feature.Work`). -/
def Typed (program : Program) (s : State) : Prop :=
  ∀ item ∈ s.openItems, ((program.element? item.element).bind (·.start?)).isSome = true →
    Unbegun s item.occurrence ∧ (∀ other ∈ s.openItems, other.occurrence = item.occurrence → other = item) ∧
      (∀ leave writes rule, Signal.complete item.occurrence leave writes rule ∉ s.signals) ∧ AwaitsTrigger item.kind

/-- An item that waits for work, an effect or an incident, waits on a begun occurrence: `State.openItem` opens it for
one and `Feature.Work` turns only such an item into another of them, while a subscription's item, the one that holds a
reservation (`State.openSubscription`), waits for a trigger. So the Activity whose effect failed, which its raise leaves
once the search has decided, has begun (`SlotsSettled.raised`). -/
def Worked (s : State) : Prop :=
  ∀ item ∈ s.openItems, ¬ AwaitsTrigger item.kind → ∀ occurrence ∈ s.occurrences, occurrence.id = item.occurrence →
    occurrence.begun = true

/-- An occurrence of an element the program declares an Event numbers under the element's own counter: only a
Multi-Instance Activity's body numbers apart (`Step.roleOf`), and an Event has no envelope. So two occurrences of one
Event, scope occurrence and activation share a key (`Distinct.keys`). -/
def EventRoles (program : Program) (s : State) : Prop :=
  ∀ occurrence ∈ s.occurrences, ((program.element? occurrence.element).bind (·.event?)).isSome = true →
    occurrence.role = .element

/-- What a queued raise from an Event, a throw Event or a Message throw's effect, reads of the occurrences its origin
names: `Feature.Propagation.throwerLeaves` completes the first standing occurrence of the origin's element, scope
occurrence and activation, so every such occurrence has begun. A reservation numbered later never takes the origin's
activation: the origin was issued in an issued scope occurrence, and while that stands the Event's counter there has
reached the origin's activation (`Counted`), so a fresh reservation is numbered above it. -/
def Raisable (program : Program) (s : State) (origin : Origin) : Prop :=
  ((program.element? origin.element).bind (·.event?)).isSome = true →
    origin.scope.value < s.nextIssue ∧
    (origin.scope ∈ scopeIds s → Counted s
      { processInstanceId := s.instanceOf origin.scope, element := origin.element, activation := origin.activation }) ∧
    ∀ occurrence ∈ s.occurrences, occurrence.element = origin.element → occurrence.scope = origin.scope →
      occurrence.activation = origin.activation → occurrence.begun = true

/-- Every queued raise is `Raisable`. -/
def RaisesSound (program : Program) (s : State) : Prop :=
  ∀ raised origin, Signal.raise raised origin ∈ s.signals → Raisable program s origin

/-- The state invariants together: what holds of every committed state and between any two micro-steps of a closure,
relative to the program the instance runs. -/
structure WellFormed (program : Program) (s : State) : Prop where
  issued : IssuedBelow s
  distinct : Distinct s
  startedOnce : StartedOnce s
  activations : ActivationsKeyed s
  reservations : ReservationsUnstarted s
  owned : Owned s
  rooted : Rooted s
  variables : VariablesKeyed s
  failure : FailureRecorded s
  queue : QueueSound s
  counted : StartsCounted s
  occurrencesCounted : OccurrencesCounted s
  ownedBelow : OwnedBelow s
  claimed : ReservationsClaimed s
  settled : SlotsSettled s
  attachedReserved : AttachedReserved s
  typed : Typed program s
  worked : Worked s
  roles : EventRoles program s
  raises : RaisesSound program s

/-! ## The scope tree of a well-formed state

`Rooted` and `Distinct` make the scope occurrences a tree: each has one record, so one parent, and a depth below
`State.root`, which grows by one from parent to child, so no parent chain returns to where it started. -/

/-- `Depth s scope n`: `scope` lies `n` parent links below `State.root`. -/
inductive Depth (s : State) : ScopeOccurrenceId → Nat → Prop where
  | root : Depth s State.root 0
  | child (child : ScopeOccurrence) (parent : ScopeOccurrenceId) (depth : Nat) :
      child ∈ s.scopes → child.parent = some parent → Depth s parent depth → Depth s child.id (depth + 1)

/-- A scope occurrence within `State.root` has a depth. -/
theorem Within.depth {s : State} {scope : ScopeOccurrenceId} (within : Within s scope State.root) : ∃ n, Depth s scope n := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => exact ⟨0, rooted ▸ .root⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨n, depth⟩ := ih rooted
    exact ⟨n + 1, .child child parent n member link depth⟩

/-- Members of a list whose images are distinct are equal when their images are. -/
theorem nodup_map_eq {α β : Type} {f : α → β} : ∀ {l : List α}, (l.map f).Nodup → ∀ {a b : α}, a ∈ l → b ∈ l →
    f a = f b → a = b
  | [], _, _, _, member, _, _ => by simp at member
  | x :: l, nodup, a, b, first, second, same => by
    simp only [List.map_cons, List.nodup_cons, List.mem_map, not_exists, not_and] at nodup
    obtain ⟨fresh, nodup⟩ := nodup
    rcases List.mem_cons.mp first with rfl | inFirst <;> rcases List.mem_cons.mp second with rfl | inSecond
    · rfl
    · exact absurd same.symm (fresh b inSecond)
    · exact absurd same (fresh a inFirst)
    · exact nodup_map_eq nodup inFirst inSecond same

/-- Two scope occurrences of a state whose identifiers are distinct and which share an identifier are one. -/
theorem scope_unique {s : State} (distinct : Distinct s) {first second : ScopeOccurrence} (one : first ∈ s.scopes)
    (two : second ∈ s.scopes) (same : first.id = second.id) : first = second :=
  nodup_map_eq distinct.scopes one two same

/-- A scope occurrence's depth is one more than its parent's. -/
theorem Depth.parent {s : State} (formed : WellFormed program s) {child : ScopeOccurrence} {parent : ScopeOccurrenceId}
    {n : Nat} (member : child ∈ s.scopes) (link : child.parent = some parent) (depth : Depth s child.id n) :
    ∃ m, n = m + 1 ∧ Depth s parent m := by
  generalize named : child.id = id at depth
  cases depth with
  | root =>
    have := (formed.rooted.2.1 child member).mpr named
    simp [this] at link
  | child other parent' m inside link' depth' =>
    have same := scope_unique formed.distinct member inside named
    subst same
    rw [link] at link'
    cases link'
    exact ⟨m, rfl, depth'⟩

/-- Depths are unique. -/
theorem Depth.unique {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} {n m : Nat}
    (first : Depth s scope n) (second : Depth s scope m) : n = m := by
  induction first generalizing m with
  | root =>
    generalize named : State.root = id at second
    cases second with
    | root => rfl
    | child child _ _ member link _ =>
      have := (formed.rooted.2.1 child member).mpr named.symm
      simp [this] at link
  | child child parent n member link _ ih =>
    obtain ⟨k, rfl, depth⟩ := Depth.parent formed member link second
    rw [ih depth]

/-- A scope occurrence lies no higher than one it is within, and strictly lower when it is another. -/
theorem Within.deeper {s : State} (formed : WellFormed program s) {inner outer : ScopeOccurrenceId} (within : Within s inner outer)
    {n m : Nat} (innerDepth : Depth s inner n) (outerDepth : Depth s outer m) : m ≤ n ∧ (inner ≠ outer → m < n) := by
  induction within generalizing n with
  | refl => exact ⟨Nat.le_of_eq (Depth.unique formed outerDepth innerDepth), fun distinct => absurd rfl distinct⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨k, rfl, depth⟩ := Depth.parent formed member link innerDepth
    have := (ih depth outerDepth).1
    exact ⟨by omega, fun _ => by omega⟩

/-- No scope occurrence's parent lies within it. -/
theorem parent_not_within {s : State} (formed : WellFormed program s) {child : ScopeOccurrence} {parent : ScopeOccurrenceId}
    (member : child ∈ s.scopes) (link : child.parent = some parent) : ¬ Within s parent child.id := fun within => by
  obtain ⟨n, depth⟩ := (formed.rooted.2.2 child member).depth
  obtain ⟨m, rfl, parentDepth⟩ := Depth.parent formed member link depth
  have := (within.deeper formed parentDepth depth).1
  omega

/-- What a scope occurrence with a depth lies within has a depth. -/
theorem Within.depthUp {s : State} (formed : WellFormed program s) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) {n : Nat} (depth : Depth s inner n) : ∃ m, Depth s outer m := by
  induction within generalizing n with
  | refl => exact ⟨n, depth⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨k, _, parentDepth⟩ := Depth.parent formed member link depth
    exact ih parentDepth

/-- Two scope occurrences within each other are one. -/
theorem Within.antisymm {s : State} (formed : WellFormed program s) {first second : ScopeOccurrenceId}
    (present : first ∈ scopeIds s) (down : Within s first second) (up : Within s second first) : first = second := by
  obtain ⟨entry, member, same⟩ := List.mem_map.mp present
  obtain ⟨n, firstDepth⟩ := (same ▸ formed.rooted.2.2 entry member).depth
  obtain ⟨m, secondDepth⟩ := down.depthUp formed firstDepth
  by_cases same : first = second
  · exact same
  · have := (down.deeper formed firstDepth secondDepth).2 same
    have := (up.deeper formed secondDepth firstDepth).1
    omega

/-! ## Non-vacuity

A process instance (scope 0) with a Sub-Process occurrence 1 whose scope occurrence 2 holds a waiting occurrence 3 and
its item 4, beside a waiting occurrence 5 of the root and its item 6. The open-item kind is a parameter, so no witness
depends on what an item waits for. -/

def processRoot : ScopeOccurrenceId := ⟨0⟩
def subScope : ScopeOccurrenceId := ⟨2⟩

def subProcess : Occurrence := { id := 1, element := ⟨"Sub"⟩, scope := processRoot, activation := 1 }
def innerTask : Occurrence := { id := 3, element := ⟨"Inner"⟩, scope := subScope, activation := 1 }
def outerTask : Occurrence := { id := 5, element := ⟨"Outer"⟩, scope := processRoot, activation := 1 }

def rootScope : ScopeOccurrence := { id := processRoot, element := none, parent := none }
def childScope : ScopeOccurrence := { id := subScope, element := some ⟨"Sub"⟩, parent := some processRoot, occurrence := some 1 }

def innerItem (kind : OpenKind) : OpenItem := { id := 4, kind, element := ⟨"Inner"⟩, scope := subScope, occurrence := 3 }
def outerItem (kind : OpenKind) : OpenItem := { id := 6, kind, element := ⟨"Outer"⟩, scope := processRoot, occurrence := 5 }

def sample (kind : OpenKind) : State :=
  { instanceId := "p", scopes := [rootScope, childScope], occurrences := [subProcess, innerTask, outerTask]
    variables := [{ scope := processRoot, entries := [("a", .int 1)] }, { scope := subScope, entries := [] }]
    openItems := [innerItem kind, outerItem kind], nextIssue := 7
    activations := [{ processInstance := "p", element := ⟨"Sub"⟩, role := .element, count := 1 },
      { processInstance := "p", element := ⟨"Inner"⟩, role := .element, count := 1 },
      { processInstance := "p", element := ⟨"Outer"⟩, role := .element, count := 1 }] }

theorem root_parentless {s : State} (scopes : s.scopes = [rootScope, childScope]) :
    ∀ scope ∈ s.scopes, scope.id = processRoot → scope.parent = none := by
  simp [scopes, rootScope, childScope, processRoot, subScope]

theorem sub_within {kind : OpenKind} : Within (sample kind) subScope processRoot :=
  .parent childScope processRoot processRoot (by simp [sample]) rfl (.refl _)

theorem root_outside {s : State} (scopes : s.scopes = [rootScope, childScope]) : ¬ Within s processRoot subScope :=
  fun within => by
  have := Within.parentless (root_parentless scopes) within
  simp [processRoot, subScope] at this

/-- An identifier at or above the counter violates `IssuedBelow`, so the law excludes states. -/
theorem stale_counter_rejected (kind : OpenKind) : ¬ IssuedBelow { sample kind with nextIssue := 5 } := fun issued => by
  have := issued.occurrences outerTask (by simp [sample])
  simp [outerTask] at this

/-- A root wait with an armed reservation 7 beside it, and the start facts of the begun waits in the draft. -/
def reservation : Occurrence :=
  { id := 7, element := ⟨"Timer"⟩, scope := processRoot, activation := 1, begun := false }

def startFact (occurrence : Occurrence) : StartedFact :=
  { occurrence := { processInstanceId := "p", element := occurrence.element, activation := occurrence.activation }
    owner := occurrence.scope, sourceType := "task" }

def armedState (kind : OpenKind) : State :=
  { sample kind with
    occurrences := [subProcess, innerTask, outerTask, reservation], nextIssue := 8,
    draft := { started := [startFact innerTask, startFact outerTask] } }

theorem armed_unstarted (kind : OpenKind) : ReservationsUnstarted (armedState kind) := by
  simp [ReservationsUnstarted, starts, key, armedState, sample, subProcess, innerTask, outerTask, reservation, startFact]

theorem armed_started_once (kind : OpenKind) : StartedOnce (armedState kind) := by
  simp [StartedOnce, starts, armedState, sample, startFact, innerTask, outerTask]

theorem restart_rejected (kind : OpenKind) :
    ¬ StartedOnce { armedState kind with draft := { started := [startFact innerTask, startFact innerTask] } } := by
  simp [StartedOnce, starts, armedState, sample]

/-- An item waiting for an occurrence that is gone breaks `Owned`. -/
theorem dangling_item_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := [{ innerItem kind with occurrence := 9 }] } := fun owned => by
  obtain ⟨occurrence, member, same, _⟩ := owned.itemOccurrences { innerItem kind with occurrence := 9 } (by simp)
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask] at same

/-- An item filed in another scope occurrence than its occurrence's breaks `Owned`. -/
theorem misfiled_item_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := [{ innerItem kind with scope := processRoot }] } := fun owned => by
  obtain ⟨occurrence, member, same, facts⟩ := owned.itemOccurrences { innerItem kind with scope := processRoot } (by simp)
  obtain ⟨_, scope⟩ := facts
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, innerItem, processRoot, subScope] at same scope

/-- A name bound twice in one variable set breaks `VariablesKeyed`. -/
theorem repeated_name_rejected (kind : OpenKind) :
    ¬ VariablesKeyed { sample kind with variables := [{ scope := processRoot, entries := [("a", .int 1), ("a", .int 2)] }] } :=
  fun keyed => by
    have := keyed.names { scope := processRoot, entries := [("a", .int 1), ("a", .int 2)] } (by simp)
    simp at this

/-- A start fact pending without its counter breaks `StartsCounted`. -/
theorem uncounted_start_rejected (kind : OpenKind) :
    ¬ StartsCounted { sample kind with draft := { started := [startFact innerTask] }, activations := [] } :=
  fun counted => by
    obtain ⟨_, member, _⟩ := counted (startFact innerTask) (by simp [starts])
    simp at member

/-- A Sub-Process scope owned by an occurrence of another scope occurrence breaks `OwnedBelow`. -/
theorem misplaced_owner_rejected (kind : OpenKind) :
    ¬ OwnedBelow { sample kind with occurrences := [{ subProcess with scope := subScope }, innerTask, outerTask] } :=
  fun owned => by
    have := owned childScope (by simp [sample]) { subProcess with scope := subScope } (by simp) (by simp [childScope, subProcess])
    simp [childScope, subScope, processRoot] at this

/-- An arming of a scope occurrence never issued breaks `QueueSound`, and so `WellFormed`: queued work may name a scope
occurrence that is gone, never one that was never issued. -/
theorem unissued_arming (kind : OpenKind) : ¬ WellFormed program { sample kind with signals := [.armScope ⟨9⟩] } := fun formed => by
  have := formed.queue.armScope ⟨9⟩ (by simp)
  simp [sample] at this

/-- So does a completion of an identity never issued: a reservation made later would be completed. -/
theorem unissued_completion (kind : OpenKind) :
    ¬ WellFormed program { sample kind with signals := [.complete 9 .outgoing [] .outward] } := fun formed => by
  have := formed.queue.completes 9 .outgoing [] .outward (by simp)
  simp [sample] at this

/-- A boundary item filed in the Sub-Process scope but attached to the root's task 5 breaks `Owned`: an arming opens
its items in its host's scope occurrence. -/
theorem misattached_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := [{ innerItem kind with attachedTo := some 5 }] } := fun owned => by
  obtain ⟨occurrence, member, named, rest⟩ := owned.attachments { innerItem kind with attachedTo := some 5 } (by simp) 5 rfl
  have placed := rest.2
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, innerItem, processRoot, subScope] at named placed

/-- A scope occurrence owned by the unbegun reservation 7 breaks `Owned`: only a begun occurrence enters a scope. -/
theorem reservation_owner_rejected (kind : OpenKind) :
    ¬ Owned { armedState kind with scopes := [rootScope, { childScope with occurrence := some 7 }] } := fun owned => by
  obtain ⟨occurrence, member, named, begun⟩ := owned.scopeOwners { childScope with occurrence := some 7 } (by simp) 7 rfl
  simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, reservation] at named begun

/-- An occurrence the counters never numbered breaks `OccurrencesCounted`, so a fresh activation could repeat it. -/
theorem uncounted_occurrence_rejected (kind : OpenKind) :
    ¬ OccurrencesCounted { sample kind with activations := [] } := fun counted => by
  obtain ⟨_, member, _⟩ := counted subProcess (by simp [sample])
  simp at member

/-- Two occurrences of one key break `Distinct`. -/
theorem rekeyed_rejected (kind : OpenKind) :
    ¬ Distinct { sample kind with occurrences := [subProcess, { subProcess with id := 9 }] } := fun distinct => by
  have := distinct.keys
  simp [key] at this

/-- A queued begin naming the begun occurrence 5 breaks `ReservationsClaimed`: it would start it twice. -/
theorem rebegin_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { sample kind with signals := [.begin { element := ⟨"Outer"⟩, scope := processRoot, reserved := some 5 }] } :=
  fun claimed => by
    obtain ⟨_, beginnable⟩ := claimed.named _ (.inl (List.mem_singleton.mpr rfl))
    have := (beginnable 5 (by simp [names, Option.toList])).2 outerTask (by simp [sample]) rfl
    simp [outerTask] at this

/-- Two queued begins naming the reservation 7 break `ReservationsClaimed`. -/
theorem claimed_twice_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with signals :=
      [.begin { element := ⟨"Timer"⟩, scope := processRoot, reserved := some 7 },
        .begin { element := ⟨"Timer"⟩, scope := processRoot, reserved := some 7 }] } := fun claimed => by
  have := claimed.signalsApart _ _ (List.Sublist.refl _) 7 (by simp [names])
  simp [names] at this

/-- A second item holding the reservation 7 an attached item holds breaks `ReservationsClaimed`: disarming the host
would remove the reservation under it. -/
theorem shared_reservation_rejected (kind : OpenKind) :
    ¬ ReservationsClaimed { armedState kind with openItems :=
      [{ id := 8, kind, element := ⟨"Timer"⟩, scope := processRoot, occurrence := 7, attachedTo := some 5 },
        { id := 9, kind, element := ⟨"Timer"⟩, scope := processRoot, occurrence := 7 }] } := fun claimed => by
  have := claimed.attached { id := 8, kind, element := ⟨"Timer"⟩, scope := processRoot, occurrence := 7, attachedTo := some 5 }
    (List.mem_cons_self ..) rfl ⟨reservation, by simp [armedState], rfl, rfl⟩
    { id := 9, kind, element := ⟨"Timer"⟩, scope := processRoot, occurrence := 7 }
    (List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl)) rfl
  simp at this

/-- An unbegun reservation parked at a join breaks `SlotsSettled`: the join's firing would complete it. -/
theorem parked_reservation_rejected (kind : OpenKind) :
    ¬ SlotsSettled { armedState kind with slots := { parked := [{ occurrence := 7, flow := ⟨"F"⟩, scope := processRoot }] } } :=
  fun settled => by
    have := (settled.parked _ (List.mem_singleton.mpr rfl)).2.1 reservation (by simp [armedState]) rfl
    simp [reservation] at this

/-- A parked begun occurrence settles. -/
theorem parked_begun_settled (kind : OpenKind) :
    SlotsSettled { armedState kind with slots := { parked := [{ occurrence := 5, flow := ⟨"F"⟩, scope := processRoot }] } } where
  parked := by
    simp only [List.mem_singleton]
    rintro _ rfl
    refine ⟨by simp [armedState], fun occurrence member same => ?_, fun request queued => ?_⟩
    · simp only [armedState, List.mem_cons, List.not_mem_nil, or_false] at member
      rcases member with rfl | rfl | rfl | rfl <;> simp_all [subProcess, innerTask, outerTask, reservation]
    · simp [Queued, armedState, sample] at queued
  bodies := by simp
  resumed := by simp
  queued := by simp [armedState, sample]
  placed := by simp
  runsPlaced := by simp
  grouped := by simp [armedState, sample]
  raised := by simp [armedState, sample]

/-- A body's run, in `body`, whose one instance is active in `subScope`. -/
def instanceRun (body : ScopeOccurrenceId) : MultiInstanceRun :=
  { scope := body, element := ⟨"Sub"⟩, occurrence := 1, collection := .null, instances := [.active subScope] }

/-- An instance entered below the body's scope occurrence is placed. -/
theorem nested_instance_placed (kind : OpenKind) : Placed (sample kind) (instanceRun processRoot) := by
  intro scope active
  simp only [instanceRun, List.mem_singleton, Iteration.active.injEq] at active
  subst active
  refine ⟨by simp [sample, subScope], fun entry member named => ?_⟩
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp_all [rootScope, childScope, processRoot, subScope, instanceRun]

/-- An instance standing below another scope occurrence than the body's breaks `Placed`. -/
theorem misplaced_instance_rejected (kind : OpenKind) : ¬ Placed (sample kind) (instanceRun subScope) := fun placed => by
  have := (placed subScope (by simp [instanceRun])).2 childScope (by simp [sample]) rfl
  simp [childScope, processRoot, subScope, instanceRun] at this

end Kernel.Laws.State
