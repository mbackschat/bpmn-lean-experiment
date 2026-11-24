module

public import Kernel.State.Tree
public import Kernel.Laws.State.Items
public import Kernel.Laws.State.Occurrence
public import Kernel.Laws.State.History
public import Kernel.Laws.State.Map

/-! # Laws of the kernel state: the invariant

The invariant every reachable `State` keeps, stated over the state's fields and independent of the operations that
produce them: occurrence identity, ownership, the scope tree and the work a closure has queued. The invariant is relative
to the program the instance runs (`WellFormed program s`), since which kind of item an element opens only the program
says (`Typed`), which elements are Events, whose occurrences a raise names by their key (`EventRoles`,
`Raisable`), and which declare a Multi-Instance envelope, the only ones a body numbers under (`BodyRoles`); every
other clause reads the state's fields alone. No instance migrates between programs: `Population`
runs each under its deployment's. The transitions it permits are `Kernel.Laws.State.Transitions`'. Nothing executable
imports this module; the proof wave proves `Step` preserves `WellFormed`
([kernel architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#lean-assurance-lane)).

Besides the state's fields a law names only `Token.busyScope`, a total projection of one work-stack entry whose result
the `State` contract documents, since matching `Token` is `Step`'s
([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)).

Besides the laws, it holds what follows from them over the fields alone: that a well-formed state's scope occurrences
form a tree (`Depth`). The frames through which a change of the fields keeps `WellFormed` are
`Kernel.Laws.State.Frames`', `Kernel.Laws.State.Clear`'s and `Kernel.Laws.State.Begins`'s. Each law is followed by
its non-vacuity witness: a small state that satisfies it and, where the law could otherwise hold of everything, one that
violates it. Nothing here reads a `State` operation's body, so this module sees none; the lemmas about the operations
are `Kernel.Laws.State`'s, and the witnesses that read `State.root`'s value or the program, the sample instance's
well-formedness among them, `Kernel.Laws.State.Sample`'s.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

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
def occurrenceIds (s : State) : List OccurrenceId := s.occurrences.map (·.id)

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

/-- The start facts of the input in progress: a committed input's journal, the transitions of the closure in progress,
keyed by unit (DC4), and the draft. -/
def starts (s : State) : List StartedFact :=
  s.journal.flatMap (·.started) ++ (s.transitions.toList.map (·.2)).flatMap (·.started) ++ s.draft.started

/-- Every identifier the state holds was issued (`OccurrenceIssued`, `ScopeIssued`), so a counter names only fresh
identities: an occurrence's identity is never reused ([scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
structure IssuedBelow (s : State) : Prop where
  occurrences : ∀ occurrence ∈ s.occurrences, OccurrenceIssued s occurrence.id
  /-- An item's key was issued (`ItemIssued`): an item of a present occurrence has a committed ordinal below that
  occurrence's counter (KD1), a fresh one is in the issue table (DC12); a removed occurrence's counter goes with it, and
  its identity never recurs (`occurrences`). -/
  items : ∀ item ∈ itemList s.openItems, ItemIssued s item.id
  scopes : ∀ scope ∈ s.scopes, ScopeIssued s scope.id
  /-- A fresh order position of a scope occurrence is in the issue table (DC25), so the commit numbers it and a committed
  state holds committed positions only. -/
  positions : ∀ scope ∈ s.scopes, ∀ unit index, scope.position = .fresh unit index →
    s.issued[Issue.fresh unit index]? = some .position

/-- `IssuedBelow`'s position clause carries to a state whose scope occurrences are some of `s`'s and whose issue table
holds `s`'s. -/
theorem IssuedBelow.positionsKept {s t : State} (issued : IssuedBelow s) (scopes : ∀ scope ∈ t.scopes, scope ∈ s.scopes)
    (table : TableGrows s t) : ∀ scope ∈ t.scopes, ∀ unit index, scope.position = .fresh unit index →
      t.issued[Issue.fresh unit index]? = some .position :=
  fun scope member unit index fresh => table _ _ (issued.positions scope (scopes scope member) unit index fresh)

/-- The issue table and the issuer (DC12, `IssuerFresh`): the table holds fresh issues only, none of the running
unit's at or above its next index, so the next issue (`State.issue`) is not in the table, and only the issues of a
unit that ran or is running, so a unit that has not run yet, once it becomes the issuer and restarts at index 0, finds
none of its own in the table (`ran`). -/
structure IssuerFresh (s : State) : Prop where
  fresh : ∀ (issue : Issue) (slot : ClaimSlot), s.issued[issue]? = some slot → ∃ unit index, issue = Issue.fresh unit index
  below : ∀ (index : Nat) (slot : ClaimSlot), s.issued[Issue.fresh s.issuing index]? = some slot → index < s.issueNext
  ran : ∀ (unit : UnitKey) (index : Nat) (slot : ClaimSlot), s.issued[Issue.fresh unit index]? = some slot →
    s.transitions.contains unit = true ∨ unit = s.issuing

/-- A state with the issue table and the issuer of one that keeps `IssuerFresh`, and every transition key of it, keeps
`IssuerFresh`. -/
theorem IssuerFresh.grow {s t : State} (fresh : IssuerFresh s) (issued : t.issued = s.issued)
    (issuing : t.issuing = s.issuing) (issueNext : t.issueNext = s.issueNext)
    (ran : ∀ unit, s.transitions.contains unit = true → t.transitions.contains unit = true) : IssuerFresh t :=
  ⟨fun issue slot held => fresh.fresh issue slot (issued ▸ held),
    fun index slot held => issueNext ▸ fresh.below index slot (by rw [← issuing, ← issued]; exact held),
    fun unit index slot held => (fresh.ran unit index slot (issued ▸ held)).imp (ran unit) (·.trans issuing.symm)⟩

/-- A state with the issue table, the issuer and the transitions of one that keeps `IssuerFresh` keeps it. -/
theorem IssuerFresh.same {s t : State} (fresh : IssuerFresh s) (issued : t.issued = s.issued)
    (issuing : t.issuing = s.issuing) (issueNext : t.issueNext = s.issueNext) (transitions : t.transitions = s.transitions) :
    IssuerFresh t :=
  fresh.grow issued issuing issueNext fun _ => (transitions ▸ ·)

/-- A closure's starting counters bound the ones it settles with (DC12): inside a closure a counter changes only when it
is pruned with its owner (`State.clearInside`, `State.leaveScope`, `State.removeOccurrence`), so every counter of `s`
is at most `start`'s. The premise of each law that compares a renamed fresh issue, which `Step.compact start` numbers from
`start`'s counter, with a committed key below a counter of `s`. -/
structure CountersFrom (start s : State) : Prop where
  scopes : ∀ slot, s.scopeOrdinals.getD slot 0 ≤ start.scopeOrdinals.getD slot 0
  occurrences : ∀ slot, s.occurrenceOrdinals.getD slot 0 ≤ start.occurrenceOrdinals.getD slot 0
  items : ∀ occurrence, s.itemOrdinals.getD occurrence 0 ≤ start.itemOrdinals.getD occurrence 0
  /-- The issued positions' counter, which nothing inside a closure writes (DC13: positions are issued,
  `State.issuePosition`). -/
  positions : s.nextOrder ≤ start.nextOrder

theorem CountersFrom.refl (s : State) : CountersFrom s s :=
  ⟨fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, fun _ => Nat.le_refl _, Nat.le_refl _⟩

/-- No two occurrences, open items or scope occurrences share an identifier, and no two occurrences a key: each
activation numbers one occurrence. -/
structure Distinct (s : State) : Prop where
  occurrences : (occurrenceIds s).Nodup
  items : KeyedBy s.openItems
  /-- Every scope occurrence sits under its own key, so no two share one (`Distinct.scopes`). -/
  scopesKeyed : ScopesKeyed s.scopeMap
  keys : (s.occurrences.map (key s)).Nodup

theorem Distinct.scopes {s : State} (distinct : Distinct s) : (scopeIds s).Nodup := by
  rw [scopeIds, scopes_eq]; exact scopeList_nodup distinct.scopesKeyed

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
  itemScopes : ∀ item ∈ itemList s.openItems, item.scope ∈ scopeIds s
  itemOccurrences : ∀ item ∈ itemList s.openItems, ∃ occurrence ∈ s.occurrences,
    occurrence.id = item.id.occurrence ∧ occurrence.element = item.element ∧ occurrence.scope = item.scope
  attachments : ∀ item ∈ itemList s.openItems, ∀ host, item.attachedTo = some host → ∃ occurrence ∈ s.occurrences,
    occurrence.id = host ∧ occurrence.begun = true ∧ occurrence.scope = item.scope
  scopeOwners : ∀ scope ∈ s.scopes, ∀ owner, scope.occurrence = some owner → ∃ occurrence ∈ s.occurrences,
    occurrence.id = owner ∧ occurrence.begun = true
  variableScopes : ∀ scope ∈ s.variables, scope ∈ scopeIds s
  tokenScopes : ∀ token ∈ allQueuedTokens s, token.busyScope ∈ scopeIds s

/-- The scope occurrences form one tree rooted at `State.root`: it is present, it is the only one without a parent, and
every one reaches it, so no parent chain cycles. The root is named, not merely unique, because `State.initial` is the
only constructor of a parentless scope occurrence and gives it `State.root`; every later one is entered below a parent,
so an operation that falls back to `State.root` addresses a present scope occurrence. -/
def Rooted (s : State) : Prop :=
  State.root ∈ scopeIds s ∧ (∀ scope ∈ s.scopes, scope.parent = none ↔ scope.id = State.root) ∧
    ∀ scope ∈ s.scopes, Within s scope.id State.root

/-- Each variable set binds a name at most once: a scope occurrence owns its data, and a name declared again in a nested
scope shadows the outer one rather than repeating in it; that a scope occurrence has one set holds by construction, since
the sets are keyed by it (DC25)
([data, scope data](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#scope-data),
[CIB-EXT-0020](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes)). -/
structure VariablesKeyed (s : State) : Prop where
  names : ∀ (scope : ScopeOccurrenceId) (entries : List (String × Value)), s.variables[scope]? = some entries →
    (entries.map (·.1)).Nodup

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
  arm : ∀ host element scope, Signal.arm host element scope ∈ allSignals s → OccurrenceIssued s host ∧ ScopeIssued s scope ∧
    ∀ occurrence ∈ s.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope
  armScope : ∀ scope, Signal.armScope scope ∈ allSignals s → ScopeIssued s scope
  armGateway : ∀ occurrence gateway scope, Signal.armGateway occurrence gateway scope ∈ allSignals s →
    OccurrenceIssued s occurrence ∧ ScopeIssued s scope ∧
      ∀ found ∈ s.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope
  ends : ∀ status failure, Signal.endInstance status failure ∈ allSignals s → (failure.isSome = true ↔ status = .failed)
  completes : ∀ id leave writes rule, Signal.complete id leave writes rule ∈ allSignals s → OccurrenceIssued s id

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
def names (request : BeginRequest) : List OccurrenceId := request.reserved.toList ++ request.inner.toList

/-- A begin request is queued: as a `begin` signal or as a deferred begin, keyed by the closure or in the running
micro-step's batch. -/
def Queued (s : State) (request : BeginRequest) : Prop :=
  Signal.begin request ∈ allSignals s ∨ Token.begin request ∈ allQueuedTokens s

/-- A queued request of a state with fewer queued entries was queued before. -/
theorem Queued.shrink {before after : State} (signals : ∀ signal ∈ allSignals after, signal ∈ allSignals before)
    (tokens : ∀ token ∈ allQueuedTokens after, token ∈ allQueuedTokens before) {request : BeginRequest} (queued : Queued after request) :
    Queued before request := by
  rcases queued with signal | token
  · exact .inl (signals _ signal)
  · exact .inr (tokens _ token)

/-- The reservation `id` may begin in the scope occurrence `scope`: it was issued, and while it stands it is unbegun, no
item waits for it or hangs on it, and it lies in `scope`'s process instance, so its key is the one its begin journals
(`State.beginOccurrence` places a reservation in the request's scope occurrence). -/
def Beginnable (s : State) (scope : ScopeOccurrenceId) (id : OccurrenceId) : Prop :=
  OccurrenceIssued s id ∧ ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.begun = false ∧
    (∀ item ∈ itemList s.openItems, item.id.occurrence ≠ id ∧ item.attachedTo ≠ some id) ∧
    (scope ∈ scopeIds s → s.instanceOf scope = s.instanceOf occurrence.scope)

/-- A feature slot, a queued compensation or a queued raise will complete the occurrence `id`: a join parks it, a
Multi-Instance body runs on it, a compensation run resumes it once it ends, or it is the Activity a raise leaves once
its search has decided (`Feature.Propagation.hostLeaves`; what `SlotsSettled` reads). -/
def SlotCompletes (s : State) (id : OccurrenceId) : Prop :=
  (∃ waiting ∈ s.slots.parked, waiting.occurrence = id) ∨ (∃ run ∈ s.slots.multiInstances, run.occurrence = id) ∨
    (∃ run ∈ s.slots.compensation.runs, ∃ leave, run.resume = some (.complete id leave)) ∨
    (∃ scope activity trigger leave resume,
      Signal.compensate scope activity trigger leave (some (.complete id resume)) ∈ allSignals s) ∨
    ∃ raised origin, Signal.raise raised origin ∈ allSignals s ∧ origin.host = some id

/-- What a slot completes in a state with the same slots and fewer queued signals, it completes in the other. -/
theorem SlotCompletes.shrink {before after : State} (slots : after.slots = before.slots)
    (signals : ∀ signal ∈ allSignals after, signal ∈ allSignals before) {id : OccurrenceId}
    (completes : SlotCompletes after id) :
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
def Unclaimed (s : State) (id : OccurrenceId) : Prop :=
  (∀ request, Queued s request → id ∉ names request) ∧
    (∀ leave writes rule, Signal.complete id leave writes rule ∉ allSignals s) ∧ ¬ SlotCompletes s id

/-- The Event Sub-Process start reservation a begin request names (`BeginRequest.inner`) lies, while it stands, in the
scope occurrence the request begins in. -/
def InnerPlaced (s : State) (request : BeginRequest) : Prop :=
  ∀ id ∈ request.inner.toList, ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.scope = request.scope

/-- `first` occurs in `l` before `second`. -/
def Precedes {α : Type} (l : List α) (first second : α) : Prop := [first, second].Sublist l

/-- Begins apart in some order are apart in every order: apartness is symmetric, so it survives taking entries off a
queue view and reordering it (`Fewer`). -/
theorem apart_fewer {β : Type} {begin : BeginRequest → β} {l l' : List β} (fewer : Fewer l' l)
    (apart : ∀ first second, Precedes l (begin first) (begin second) → ∀ id ∈ names first, id ∉ names second) :
    ∀ first second, Precedes l' (begin first) (begin second) → ∀ id ∈ names first, id ∉ names second := by
  let R : β → β → Prop := fun x y => ∀ first second, x = begin first → y = begin second →
    ∀ id ∈ names first, id ∉ names second
  have symm : ∀ {x y}, R x y → R y x := fun r first second same same' id inFirst inSecond =>
    r second first same' same id inSecond inFirst
  have holds : l.Pairwise R := List.pairwise_iff_forall_sublist.mpr fun pair first second same same' => by
    subst same; subst same'; exact apart first second pair
  intro first second pair
  exact List.pairwise_iff_forall_sublist.mp (fewer.pairwise symm holds) pair first second rfl rfl

/-- Each reservation has one claimant, so it begins once: an item attached to a host holds its unbegun reservation
alone, as `State.openSubscription` reserves afresh for each subscription; a queued begin names distinct beginnable reservations,
which no other queued begin or completion names, as a firing that queues a begin closes the item that held its
reservation (`Subscriptions.fireBoundary`, `fireEventStart`). -/
structure ReservationsClaimed (s : State) : Prop where
  attached : ∀ item ∈ itemList s.openItems, item.attachedTo.isSome = true →
    (∃ occurrence ∈ s.occurrences, occurrence.id = item.id.occurrence ∧ occurrence.begun = false) → ∀ other ∈ itemList s.openItems,
      other.id.occurrence = item.id.occurrence → other = item
  named : ∀ request, Queued s request → (names request).Nodup ∧ ∀ id ∈ names request, Beginnable s request.scope id
  signalsApart : ∀ first second, Precedes (allSignals s) (.begin first) (.begin second) →
    ∀ id ∈ names first, id ∉ names second
  tokensApart : ∀ first second, Precedes (allQueuedTokens s) (.begin first) (.begin second) →
    ∀ id ∈ names first, id ∉ names second
  queuesApart : ∀ first second, Signal.begin first ∈ allSignals s → Token.begin second ∈ allQueuedTokens s →
    ∀ id ∈ names first, id ∉ names second
  uncompleted : ∀ request id leave writes rule, Queued s request → id ∈ names request →
    Signal.complete id leave writes rule ∉ allSignals s
  /-- A queued begin names an issued scope occurrence, so a scope occurrence entered later is never the one it
  begins in. -/
  scopesIssued : ∀ request, Queued s request → ScopeIssued s request.scope
  /-- A queued begin's Event Sub-Process start reservation lies in the scope occurrence it begins in, as the firing
  that queues the begin reads both off the item that held it (`Subscriptions.fireEventStart`), so the interrupting
  entry's clearing of that scope occurrence keeps it housed (`Scopes.arriveScope`). -/
  innerPlaced : ∀ request, Queued s request → InnerPlaced s request

/-! ## What the slots complete -/

/-- The occurrence `id` has begun: it was issued, it is begun while it stands, and no queued begin names it, so a
completion of it completes no reservation (`ReservationsClaimed.uncompleted`). -/
def Settled (s : State) (id : OccurrenceId) : Prop :=
  OccurrenceIssued s id ∧ (∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.begun = true) ∧
    ∀ request, Queued s request → id ∉ names request

/-- A Multi-Instance run's active instances were entered below its body's scope occurrence: each was issued, and while
it stands its parent is the body's (`MultiInstance.beginInstances`), so the instance a completion leaves is never the
root and leaving it keeps the body's scope occurrence standing. -/
def Placed (s : State) (run : MultiInstanceRun) : Prop :=
  ∀ scope, Iteration.active scope ∈ run.instances → ScopeIssued s scope ∧
    ∀ entry ∈ s.scopes, entry.id = scope → entry.parent = some run.scope

/-- A compensation run's handlers run in context scope occurrences entered below its scope occurrence: each was issued,
and while it stands its parent is the run's (`Compensation.beginHandler`), so releasing a context that stands advances
the run in a scope occurrence that stands (`Compensation.release`); a group's nested run resumes from its own context,
the one it runs in. -/
def RunPlaced (s : State) (run : CompensationRun) : Prop :=
  (∀ context, run.resume = some (.group context) → context = run.scope) ∧
    ∀ context ∈ run.running.map (·.1), ScopeIssued s context ∧
      ∀ entry ∈ s.scopes, entry.id = context → entry.parent = some run.scope

/-- A compensation run in `scope` may end with `resume`: the occurrence it completes has begun, and the group context it
releases is `scope` itself (`Compensation.advance`). -/
def Resumable (s : State) (scope : ScopeOccurrenceId) (resume : Resume) : Prop :=
  (∀ occurrence leave, resume = .complete occurrence leave → Settled s occurrence) ∧
    ∀ context, resume = .group context → context = scope

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
    Signal.compensate scope activity trigger leave (some (.complete occurrence resume)) ∈ allSignals s → Settled s occurrence
  placed : ∀ run ∈ s.slots.multiInstances, Placed s run
  runsPlaced : ∀ run ∈ s.slots.compensation.runs, RunPlaced s run
  /-- A queued compensation releases no group context but its own scope occurrence: `Propagation` queues none that
  resumes a group. -/
  grouped : ∀ scope activity trigger leave context,
    Signal.compensate scope activity trigger leave (some (.group context)) ∈ allSignals s → context = scope
  raised : ∀ raised origin host, Signal.raise raised origin ∈ allSignals s → origin.host = some host → Settled s host

/-- What a slot completes no queued begin names. -/
theorem SlotsSettled.free {s : State} (settled : SlotsSettled s) {request : BeginRequest} (queued : Queued s request)
    {id : OccurrenceId} (named : id ∈ names request) : ¬ SlotCompletes s id := by
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
def Unbegun (s : State) (id : OccurrenceId) : Prop :=
  ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.begun = false

/-- An item attached to a host holds an unbegun reservation: only `State.openSubscription` attaches an item, and it
reserves afresh for it, while `State.openItem` opens an unattached item for a begun occurrence; the reservation begins
only once its item has gone. So nothing attached waits on a begun occurrence, which a clearing that keeps one leaves
standing (`Throw.terminate`). -/
def AttachedReserved (s : State) : Prop :=
  ∀ item ∈ itemList s.openItems, item.attachedTo.isSome = true → Unbegun s item.id.occurrence

/-- What an item waits for is a trigger, not work: no effect result or incident command closes it. -/
def AwaitsTrigger (kind : OpenKind) : Prop := kind.view.effect = none ∧ kind.view.incident = none ∧ kind.view.job = none

/-- An item of an element the program declares a start Event, an Event Sub-Process start's, holds an unbegun
reservation alone, which no queued completion completes, and waits for a trigger: `Feature.Subscriptions.trigger`
reads the program to tell such an item from a boundary's or a catch Event's, and begins the Event Sub-Process with the
item's reservation (`ReservationsClaimed.named`), while an item for a begun occurrence (`State.openItem`) is opened only
for an Activity or an intermediate Event, which `Step.dispatch` tells from a start Event by the same query, and only
such an item is completed while it waits or given an effect or an incident (`Feature.Work`). -/
def Typed (program : Program) (s : State) : Prop :=
  ∀ item ∈ itemList s.openItems, ((program.element? item.element).bind (·.start?)).isSome = true →
    Unbegun s item.id.occurrence ∧ (∀ other ∈ itemList s.openItems, other.id.occurrence = item.id.occurrence → other = item) ∧
      (∀ leave writes rule, Signal.complete item.id.occurrence leave writes rule ∉ allSignals s) ∧ AwaitsTrigger item.kind

/-- An item that waits for work, an effect or an incident, waits on a begun occurrence: `State.openItem` opens it for
one and `Feature.Work` turns only such an item into another of them, while a subscription's item, the one that holds a
reservation (`State.openSubscription`), waits for a trigger. So the Activity whose effect failed, which its raise leaves
once the search has decided, has begun (`SlotsSettled.raised`). -/
def Worked (s : State) : Prop :=
  ∀ item ∈ itemList s.openItems, ¬ AwaitsTrigger item.kind → ∀ occurrence ∈ s.occurrences, occurrence.id = item.id.occurrence →
    occurrence.begun = true

/-- An occurrence of an element the program declares an Event numbers under the element's own counter: only a
Multi-Instance Activity's body numbers apart (`Step.roleOf`), and an Event has no envelope. So two occurrences of one
Event, scope occurrence and activation share a key (`Distinct.keys`). -/
def EventRoles (program : Program) (s : State) : Prop :=
  ∀ occurrence ∈ s.occurrences, ((program.element? occurrence.element).bind (·.event?)).isSome = true →
    occurrence.role = .element

/-- What a queued raise from an Event, a throw Event or a Message throw's effect, reads of the occurrence its origin
names: `Feature.Propagation.throwerLeaves` completes the standing occurrence keyed by the origin's thrower, so that
occurrence, while it stands, has begun. The thrower's key was issued, so a reservation made later never takes it. -/
def Raisable (program : Program) (s : State) (origin : Origin) : Prop :=
  ((program.element? origin.element).bind (·.event?)).isSome = true →
    ScopeIssued s origin.scope ∧ OccurrenceIssued s origin.thrower ∧
    ∀ occurrence ∈ s.occurrences, occurrence.id = origin.thrower → occurrence.begun = true

/-- Every queued raise is `Raisable`. -/
def RaisesSound (program : Program) (s : State) : Prop :=
  ∀ raised origin, Signal.raise raised origin ∈ allSignals s → Raisable program s origin

/-- An occurrence numbered as a Multi-Instance body is of an element the program declares a Multi-Instance envelope:
`Step.roleOf` numbers a body only for such an element, a reservation numbers under the element's own counter
(`State.reserve`), and an occurrence keeps its role. So `Step.dispatch` hands every body to
`Hooks.arriveMultiInstance` (`Step.bodyLoop?`), and every other hook an occurrence numbered under its element's
counter. -/
def BodyRoles (program : Program) (s : State) : Prop :=
  ∀ occurrence ∈ s.occurrences, occurrence.role = .multiInstanceBody →
    (((program.element? occurrence.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true

/-- Every open item waits for an occurrence numbered under its element's own counter, never a Multi-Instance body:
`State.openItem` opens an item only for the occurrence an Activity's or an intermediate Event's hook is handed, which
is no body (`BodyRoles`), and `State.openSubscription` for a fresh reservation. So an item's public identity is that
of an occurrence `Step.occurrenceOf?` finds, which takes only that role: a body and its first instance share their
element and activation, since each role numbers under its own counter (R8). -/
def ItemRoles (s : State) : Prop :=
  ∀ item ∈ itemList s.openItems, ∀ occurrence ∈ s.occurrences, occurrence.id = item.id.occurrence → occurrence.role = .element

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
  bodyRoles : BodyRoles program s
  itemRoles : ItemRoles s
  issuer : IssuerFresh s

/-- An open item of a well-formed state with a committed ordinal has it below its occurrence's counter: its occurrence
stands (`Owned.itemOccurrences`). -/
theorem WellFormed.itemBelow {program : Program} {s : State} (formed : WellFormed program s) {item : OpenItem}
    (member : item ∈ itemList s.openItems) {n : Nat} (committed : item.id.ordinal = .committed n) :
    n < s.itemOrdinals.getD item.id.occurrence 0 :=
  (formed.issued.items item member).2.1
    (let ⟨occurrence, present, same, _⟩ := formed.owned.itemOccurrences item member; ⟨occurrence, present, same⟩)
    n committed

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

/-- A property every step of a left fold keeps over the list's members holds of the fold. -/
theorem foldl_keeps {α β : Type} (P : α → Prop) (f : α → β → α) :
    ∀ (l : List β) (a : α), (∀ a b, b ∈ l → P a → P (f a b)) → P a → P (l.foldl f a)
  | [], _, _, holds => holds
  | b :: l, a, step, holds =>
    foldl_keeps P f l (f a b) (fun a' b' member => step a' b' (List.mem_cons_of_mem _ member)) (step a b (by simp) holds)

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

A process instance (the root scope occurrence) with a Sub-Process occurrence `subKey` whose scope occurrence `Sub#0`
holds a waiting occurrence `innerKey` and its item at position 4, beside a waiting occurrence `outerKey` of the root and
its item at position 6. The open-item kind is a parameter, so no witness
depends on what an item waits for. -/

def processRoot : ScopeOccurrenceId := .ofSegments []
def subScope : ScopeOccurrenceId := .ofSegments [{ element := ⟨"Sub"⟩, ordinal := 0 }]

/-- The witnesses' occurrence keys, each the first of its element in its scope occurrence; `ghostKey` names no
occurrence. They unfold under `simp`, so distinct keys read as distinct. -/
@[simp] def subKey : OccurrenceId := { scope := processRoot, element := ⟨"Sub"⟩, ordinal := 0 }
@[simp] def innerKey : OccurrenceId := { scope := subScope, element := ⟨"Inner"⟩, ordinal := 0 }
@[simp] def outerKey : OccurrenceId := { scope := processRoot, element := ⟨"Outer"⟩, ordinal := 0 }
@[simp] def timerKey : OccurrenceId := { scope := processRoot, element := ⟨"Timer"⟩, ordinal := 0 }
@[simp] def ghostKey : OccurrenceId := { scope := processRoot, element := ⟨"Ghost"⟩, ordinal := 0 }

def subProcess : Occurrence := { id := subKey, element := ⟨"Sub"⟩, scope := processRoot, activation := 1 }
def innerTask : Occurrence := { id := innerKey, element := ⟨"Inner"⟩, scope := subScope, activation := 1 }
def outerTask : Occurrence := { id := outerKey, element := ⟨"Outer"⟩, scope := processRoot, activation := 1 }

def rootScope : ScopeOccurrence := { id := processRoot, element := none, position := 0 }
def childScope : ScopeOccurrence := { id := subScope, element := some ⟨"Sub"⟩, position := 0, occurrence := some subKey }

def innerItem (kind : OpenKind) : OpenItem := { id := ⟨innerKey, .wait, 0⟩, position := 4, kind, element := ⟨"Inner"⟩, scope := subScope }
def outerItem (kind : OpenKind) : OpenItem := { id := ⟨outerKey, .wait, 0⟩, position := 6, kind, element := ⟨"Outer"⟩, scope := processRoot }

/-- The sample's occurrence counters: one `Sub` and one `Outer` issued in the root, one `Inner` in `Sub#0`. -/
def sampleCounters : TreeMap ScopeSlot Nat compare :=
  (((∅ : Std.ExtTreeMap ScopeSlot Nat compare).insert { parent := processRoot, element := ⟨"Sub"⟩ } 1).insert
    { parent := processRoot, element := ⟨"Outer"⟩ } 1).insert { parent := subScope, element := ⟨"Inner"⟩ } 1

/-- The sample's scope occurrences, read through the map's list view. -/
@[simp] theorem mem_rootChild {x : ScopeOccurrence} :
    x ∈ scopeList (ofScopes [rootScope, childScope]) ↔ x = rootScope ∨ x = childScope := by
  rw [mem_ofScopes (by simp [rootScope, childScope, processRoot, subScope])]; simp

/-- The sample's scope map, named so that a simp set unfolding `rootScope` or `childScope` leaves it whole. -/
def sampleScopes : ScopeMap := ofScopes [rootScope, childScope]

@[simp] theorem mem_sampleScopes {x : ScopeOccurrence} : x ∈ scopeList sampleScopes ↔ x = rootScope ∨ x = childScope :=
  mem_rootChild

/-- The scope map of the root alone. -/
def rootScopes : ScopeMap := ofScopes [rootScope]

@[simp] theorem mem_rootScopes {x : ScopeOccurrence} : x ∈ scopeList rootScopes ↔ x = rootScope := by
  rw [rootScopes, mem_ofScopes (by simp)]; simp

def sample (kind : OpenKind) : State :=
  { instanceId := "p", scopeMap := sampleScopes, occurrences := [subProcess, innerTask, outerTask]
    variables := ((∅ : TreeMap ScopeOccurrenceId (List (String × Value)) compare).insert processRoot [("a", .int 1)]).insert subScope []
    openItems := ofItems [innerItem kind, outerItem kind], nextCompletion := 7
    itemOrdinals := ((∅ : Std.ExtTreeMap OccurrenceId Nat compare).insert innerKey 1).insert outerKey 1
    occurrenceOrdinals := sampleCounters
    scopeOrdinals := (∅ : Std.ExtTreeMap ScopeSlot Nat compare).insert { parent := processRoot, element := ⟨"Sub"⟩ } 1
    activations := [{ processInstance := "p", element := ⟨"Sub"⟩, role := .element, count := 1 },
      { processInstance := "p", element := ⟨"Inner"⟩, role := .element, count := 1 },
      { processInstance := "p", element := ⟨"Outer"⟩, role := .element, count := 1 }] }

/-- The sample's standing keys are its history. -/
theorem sample_historic (kind : OpenKind) : Historic (sample kind) :=
  historic_of_standing
    (fun segment rest member => by
      simp [scopes_eq, sample, rootScope, childScope, processRoot, subScope] at member ⊢
      exact .inl member.2)
    (fun segment rest n member committed => by
      simp [scopes_eq, sample, rootScope, childScope, processRoot, subScope] at member
      obtain ⟨rfl, rfl⟩ := member
      cases committed
      simp [slotCount, sample, processRoot, Std.ExtTreeMap.getD_insert_self])
    (fun segment rest unit index member fresh => by
      simp [scopes_eq, sample, rootScope, childScope, processRoot, subScope] at member
      obtain ⟨rfl, rfl⟩ := member
      cases fresh)
    (fun x member => by
      simp [scopes_eq, sample, rootScope, childScope, processRoot, subScope] at member
      rcases member with rfl | rfl <;> simp [Layered])

/-- The sample's key `Sub#9` lies beyond its root's counter of `Sub`, so it was never issued. -/
theorem sample_unissued {kind : OpenKind} {s : State} (issued : ScopeIssued s (.ofSegments [{ element := ⟨"Sub"⟩, ordinal := 9 }]))
    (scopes : s.scopes = (sample kind).scopes) (ordinals : s.scopeOrdinals = (sample kind).scopeOrdinals) : False := by
  rw [show (.ofSegments [{ element := ⟨"Sub"⟩, ordinal := 9 }] : ScopeOccurrenceId) = processRoot.child ⟨"Sub"⟩ 9 by
    rw [child_eq, processRoot, ScopeOccurrenceId.ofSegments_segments]] at issued
  exact unissued_of_count (parent := processRoot) (by simp [scopes, scopes_eq, sample, rootScope, childScope, processRoot, subScope])
    (by simp [slotCount, ordinals, sample, processRoot, Std.ExtTreeMap.getD_insert_self]) issued

@[simp] theorem mem_sample_itemList {kind : OpenKind} {item : OpenItem} :
    item ∈ itemList (ofItems [innerItem kind, outerItem kind]) ↔ item = innerItem kind ∨ item = outerItem kind := by
  rw [mem_ofItems (by simp [innerItem, outerItem])]; simp

theorem mem_sample_items {kind : OpenKind} {item : OpenItem} :
    item ∈ itemList (sample kind).openItems ↔ item = innerItem kind ∨ item = outerItem kind := by
  rw [sample, mem_ofItems (by simp [innerItem, outerItem])]; simp

theorem root_parentless {s : State} (scopes : s.scopeMap = ofScopes [rootScope, childScope]) :
    ∀ scope ∈ s.scopes, scope.id = processRoot → scope.parent = none := by
  simp [scopes_eq, scopes, rootScope, childScope, processRoot, subScope]

theorem sub_within {kind : OpenKind} : Within (sample kind) subScope processRoot :=
  .parent childScope processRoot processRoot (by simp [scopes_eq, sample, rootScope, childScope, processRoot, subScope])
    (by simp [childScope, subScope, processRoot, ScopeOccurrenceId.parent?_cons]) (.refl _)

theorem root_outside {s : State} (scopes : s.scopeMap = ofScopes [rootScope, childScope]) : ¬ Within s processRoot subScope :=
  fun within => by
  have := Within.parentless (root_parentless scopes) within
  simp [processRoot, subScope] at this

end Kernel.Laws.State
