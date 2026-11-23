module

public import Kernel.Laws.State.Reserve
public import Kernel.Laws.State.Transitions
public import Kernel.State.Removal
public import Kernel.State.Called
public import Kernel.State.Variables
public import Kernel.Laws.State.Slots
public import Kernel.Laws.State.Tree
public import Kernel.Laws.State.Subtree
import all Kernel.State
import all Kernel.State.Variables
import all Kernel.State.Raise
import all Kernel.State.Wait

/-! # Laws of the kernel state: the operations

The lemmas about `Kernel.State`'s operations that the proof wave composes: what each does to the fields the invariant
(`Kernel.Laws.State.Invariant`) reads, as the frames of `Kernel.Laws.State.Frames`, `Kernel.Laws.State.Clear` and
`Kernel.Laws.State.Begins` state it; `Kernel.Laws.State.Keeps` composes them into what each keeps of `WellFormed`. This is
the one module that sees their bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape))
except `Kernel.State.Removal`'s, `Kernel.State.Slots`', `Kernel.State.Tree`'s and `Kernel.State.Called`'s, which
`Kernel.Laws.State.Removal`, `Kernel.Laws.State.Slots`, `Kernel.Laws.State.Tree` and `Kernel.Laws.State.Called` open, so `State.root`'s value is stated here (`root_eq`), and `Kernel.Laws.State.Sample`'s witness that the sample instance
is well-formed reads it through that lemma. What follows from its equations without a body is proved outside it, in
`Kernel.Laws.State.Derived` or, for the scope chain's searches, `Kernel.Laws.State.Chain`. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-! ## Operations

What `Kernel.State`'s operations do to the fields the laws read. -/

/-- A begin without a reservation issues an occurrence of the requested element, in the requested scope occurrence, on
the requested flow, numbered under `role`. -/
theorem beginOccurrence_fresh {state : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    (fresh : request.reserved = none) :
    (state.beginOccurrence request role sourceType).2.element = request.element ∧
      (state.beginOccurrence request role sourceType).2.scope = request.scope ∧
      (state.beginOccurrence request role sourceType).2.incoming = request.incoming ∧
      (state.beginOccurrence request role sourceType).2.role = role := by
  simp [State.beginOccurrence, fresh]

/-- A begin, of a reservation or fresh, arrives on the requested flow. -/
theorem beginOccurrence_incoming (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).2.incoming = request.incoming := by
  simp only [State.beginOccurrence]

/-- A reservation arrives on no flow. -/
theorem reserve_incoming (state : State) (element : ElementId) (scope : ScopeOccurrenceId) :
    (state.reserve element scope).2.incoming = none := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]

/-- `beginOccurrence` keeps the scope occurrences, the variable sets and the logical time. -/
theorem beginOccurrence_keeps (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).1.scopes = state.scopes ∧
      (state.beginOccurrence request role sourceType).1.variables = state.variables ∧
      (state.beginOccurrence request role sourceType).1.logicalTimeMs = state.logicalTimeMs := by
  simp only [State.beginOccurrence, State.recordStart]
  (split <;> try split) <;> simp [State.activate, State.issueOccurrence, State.issue]

/-- An Error raise is no Cancel raise (`Raised.isCancel`), so it queues no trigger. -/
theorem isCancel_error (code : String) (message : Option String) : (Raised.error code message).isCancel = false := by
  simp [Raised.isCancel]

/-- A Cancel raise is one (`Raised.isCancel`), so it queues its origin as a trigger. -/
theorem isCancel_cancel : Raised.cancel.isCancel = true := by
  simp [Raised.isCancel]

/-- `State.instanceOf` reads only the scope occurrences and the instance identifier. -/
theorem instanceOf_congr {s t : State} (scopes : t.scopes = s.scopes) (named : t.instanceId = s.instanceId)
    (x : ScopeOccurrenceId) : t.instanceOf x = s.instanceOf x := by
  have called : t.calledRoot = s.calledRoot := by funext id; simp [State.calledRoot, scopes]
  have go : ∀ segments, State.instanceRoot.go t segments = State.instanceRoot.go s segments := by
    intro segments
    induction segments with
    | nil => simp [State.instanceRoot.go]
    | cons segment rest ih => simp [State.instanceRoot.go, called, State.stands, scopes, ih]
  simp [State.instanceOf, State.instanceRoot, go, scopes, named]

/-- `setVariable` changes only the variable sets and the write log. -/
theorem setVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    SameButVariables state (state.setVariable target name value) := by
  unfold State.setVariable
  dsimp only
  split <;> split <;> exact {
      scopes := rfl, scopeOrdinals := rfl, occurrences := rfl, items := rfl, ordinals := rfl, tokens := rfl, activations := rfl,
      occurrenceOrdinals := rfl, journal := rfl, transitions := rfl, draft := rfl, status := rfl, failure := rfl, signals := rfl,
      queues := .of_eq rfl rfl rfl rfl, instances := fun _ => by apply instanceOf_congr <;> rfl, instanceId := rfl,
      slots := rfl, issued := rfl, issuing := rfl, issueNext := rfl }

/-- The variable sets after `setVariable`: the target's set rebinds or appends the name, or a new set holds it. -/
theorem setVariable_variables (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    (state.setVariable target name value).variables =
      if state.variables.any (·.scope == target) then
        state.variables.map fun vars => if vars.scope == target then
          { vars with entries := if vars.entries.any (·.1 == name) then
              vars.entries.map fun entry => if entry.1 == name then (name, value) else entry
            else vars.entries ++ [(name, value)] } else vars
      else state.variables ++ [{ scope := target, entries := [(name, value)] }] := by
  unfold State.setVariable
  dsimp only
  split <;> split <;> rfl

/-- `removeVariable` changes only the variable sets and the write log. -/
theorem removeVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) :
    SameButVariables state (state.removeVariable target name) :=
  {
      scopes := rfl, scopeOrdinals := rfl, occurrences := rfl, items := rfl, ordinals := rfl, tokens := rfl, activations := rfl,
      occurrenceOrdinals := rfl, journal := rfl, transitions := rfl, draft := rfl, status := rfl, failure := rfl, signals := rfl,
      queues := .of_eq rfl rfl rfl rfl, instances := fun _ => by apply instanceOf_congr <;> rfl, instanceId := rfl,
      slots := rfl, issued := rfl, issuing := rfl, issueNext := rfl }

/-- `keyed` keeps the last binding of each name: a binding enters unless a binding after it has its name. -/
theorem keyed_eq : keyed [] = [] ∧ ∀ (binding : String × Value) (rest : List (String × Value)),
    keyed (binding :: rest) = if (keyed rest).any (·.1 == binding.1) then keyed rest else binding :: keyed rest :=
  ⟨rfl, fun _ _ => rfl⟩

/-! ### What `Step` reads of the operations it applies -/

theorem occurrence?_some {state : State} {id : OccurrenceId} {occurrence : Occurrence}
    (found : state.occurrence? id = some occurrence) : occurrence ∈ state.occurrences ∧ occurrence.id = id := by
  unfold State.occurrence? at found
  exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

theorem occurrence?_none {state : State} {id : OccurrenceId} (absent : state.occurrence? id = none) :
    ∀ occurrence ∈ state.occurrences, occurrence.id ≠ id := fun occurrence member same => by
  unfold State.occurrence? at absent
  simpa [same] using List.find?_eq_none.mp absent occurrence member

/-- `beginOccurrence` holds the occurrence it begins, begun. -/
theorem beginOccurrence_mem (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).2 ∈ (state.beginOccurrence request role sourceType).1.occurrences ∧
      (state.beginOccurrence request role sourceType).2.begun = true := by
  simp only [State.beginOccurrence, State.recordStart]
  (split <;> try split) <;> simp [State.activate, State.issueOccurrence, State.issue]

/-- `startReserved` holds the occurrence it starts, begun, under its identity and in its scope occurrence, and keeps
the scope occurrences. -/
theorem startReserved_facts {state : State} {occurrence : Occurrence} (sourceType : String)
    (member : occurrence ∈ state.occurrences) :
    (state.startReserved occurrence sourceType).2 ∈ (state.startReserved occurrence sourceType).1.occurrences ∧
      (state.startReserved occurrence sourceType).2.begun = true ∧
      (state.startReserved occurrence sourceType).2.id = occurrence.id ∧
      (state.startReserved occurrence sourceType).2.scope = occurrence.scope ∧
      (state.startReserved occurrence sourceType).1.scopes = state.scopes ∧
      (state.startReserved occurrence sourceType).2.element = occurrence.element ∧
      (state.startReserved occurrence sourceType).1.slots = state.slots := by
  unfold State.startReserved
  split
  · rename_i begun
    exact ⟨member, begun, rfl, rfl, rfl, rfl, rfl⟩
  · refine ⟨?_, by simp, by simp, by simp, by simp [State.recordStart], by simp, by simp [State.recordStart]⟩
    simp only [State.recordStart]
    exact List.mem_map.mpr ⟨occurrence, member, by simp⟩

theorem recordEnd_scopes (state : State) (key : OccurrenceKey) (terminal : Terminal) :
    (state.recordEnd key terminal).scopes = state.scopes := by
  simp only [State.recordEnd]

/-- The operations that only append to or filter one field. -/
theorem root_eq : State.root = .ofSegments [] := by
  simp only [State.root]

theorem signal_eq (state : State) (signal : Signal) : state.signal signal = { state with batchSignals := state.batchSignals ++ [signal] } := by
  simp only [State.signal]

theorem takePosition_eq (state : State) :
    state.takePosition = ({ state with nextPosition := state.nextPosition + 1 }, state.nextPosition) := by
  simp only [State.takePosition]

theorem issue_eq (state : State) (slot : ClaimSlot) : state.issue slot =
    ({ state with issueNext := state.issueNext + 1
                  issued := state.issued.insert (.fresh state.issuing state.issueNext) slot },
      .fresh state.issuing state.issueNext) := by
  simp only [State.issue]

theorem issuePosition_eq (state : State) : state.issuePosition =
    ({ state with issueNext := state.issueNext + 1
                  issued := state.issued.insert (.fresh state.issuing state.issueNext) .position },
      .fresh state.issuing state.issueNext) := by
  simp only [State.issuePosition, State.issue]

/-- An item takes its position, the running unit's next issue, then its key, the issue after it (DC13, DC12). -/
theorem openItem_eq (state : State) (kind : OpenKind) (occurrence : Occurrence) : state.openItem kind occurrence =
    { state with
        issueNext := state.issueNext + 2
        issued := (state.issued.insert (.fresh state.issuing state.issueNext) .position).insert
          (.fresh state.issuing (state.issueNext + 1)) (.item occurrence.id)
        openItems := state.openItems.insert ⟨occurrence.id, .wait, .fresh state.issuing (state.issueNext + 1)⟩
          { id := ⟨occurrence.id, .wait, .fresh state.issuing (state.issueNext + 1)⟩,
            position := .fresh state.issuing state.issueNext, kind, element := occurrence.element,
            scope := occurrence.scope } } := by
  simp only [State.openItem, State.openItemKey, State.issuePosition, State.issueItem, State.issue, State.putItem]

/-- `State.openItemKey`'s state is `State.openItem`'s. -/
theorem openItemKey_fst (state : State) (kind : OpenKind) (occurrence : Occurrence) :
    (state.openItemKey kind occurrence).1 = state.openItem kind occurrence := by
  simp only [State.openItem]

/-- A subscription reserves its occurrence, then issues its item's position and then its key. -/
theorem openSubscription_eq (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option OccurrenceId) (passive : Bool) :
    (state.openSubscription kind element scope host passive).1 =
      { (state.reserve element scope).1 with
          issueNext := (state.reserve element scope).1.issueNext + 2
          issued := ((state.reserve element scope).1.issued.insert
            (.fresh (state.reserve element scope).1.issuing (state.reserve element scope).1.issueNext) .position).insert
            (.fresh (state.reserve element scope).1.issuing ((state.reserve element scope).1.issueNext + 1))
            (.item (state.reserve element scope).2.id)
          openItems := (state.reserve element scope).1.openItems.insert
            ⟨(state.reserve element scope).2.id, .subscription,
              .fresh (state.reserve element scope).1.issuing ((state.reserve element scope).1.issueNext + 1)⟩
            { id := ⟨(state.reserve element scope).2.id, .subscription,
                .fresh (state.reserve element scope).1.issuing ((state.reserve element scope).1.issueNext + 1)⟩,
              position := .fresh (state.reserve element scope).1.issuing (state.reserve element scope).1.issueNext, kind,
              element, scope, attachedTo := host, passive } } := by
  simp only [State.openSubscription, State.issuePosition, State.issueItem, State.issue, State.putItem]

/-- A scope occurrence is entered below its parent as the running unit's next issue, which the issue table records
under its slot, with its locals keyed. -/
theorem enterScope_eq (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option OccurrenceId) :
    state.enterScope element parent locals occurrence =
      ({ state with
          issueNext := state.issueNext + 1
          issued := state.issued.insert (.fresh state.issuing state.issueNext) (.scope { parent, element })
          scopes := state.scopes ++
            [{ id := parent.child element (.fresh state.issuing state.issueNext), element := some element, occurrence }]
          variables := state.variables ++
            [{ scope := parent.child element (.fresh state.issuing state.issueNext), entries := keyed locals }] },
        parent.child element (.fresh state.issuing state.issueNext)) := by
  simp only [State.enterScope, State.issue]

theorem recordEnd_eq (state : State) (key : OccurrenceKey) (terminal : Terminal) :
    state.recordEnd key terminal = { state with draft := { state.draft with ended := state.draft.ended ++ [(key, terminal)] } } := by
  simp only [State.recordEnd]

/-- A flow token keeps its own scope occurrence busy. -/
theorem busyScope_flow (flow : FlowId) (scope : ScopeOccurrenceId) : (Token.flow flow scope).busyScope = scope := by
  simp only [Token.busyScope]

/-- A deferred begin keeps the scope occurrence it begins in busy. -/
theorem busyScope_begin (request : BeginRequest) : (Token.begin request).busyScope = request.scope := by
  simp only [Token.busyScope]

/-- Every queued token: the closure's queued content and the running micro-step's batch, a membership view (DC4). -/
theorem allTokens_eq (state : State) : state.allTokens = allQueuedTokens state := by
  simp only [State.allTokens, allQueuedTokens]

/-- A micro-step's batches move under its unit key, each entry keyed by its index in the batch (DC4). -/
theorem queueBatch_eq (state : State) (unit : UnitKey) : state.queueBatch unit = { state with
    queuedSignals := state.batchSignals.zipIdx.foldl (fun queued (signal, index) => queued.insert (unit.signalUnit index) signal)
      state.queuedSignals
    queuedTokens := state.batchTokens.zipIdx.foldl (fun queued (token, index) => queued.insert (unit.tokenUnit index) token)
      state.queuedTokens
    outboxes := if state.batchIntents.isEmpty then state.outboxes else state.outboxes.insert unit state.batchIntents
    batchSignals := [], batchTokens := [], batchIntents := [] } := by
  simp only [State.queueBatch]

/-- `State.queueBatch` leaves no running batch (`Laws.Step.Unbatched`). -/
theorem queueBatch_unbatched (state : State) (unit : UnitKey) :
    (state.queueBatch unit).batchSignals = [] ∧ (state.queueBatch unit).batchTokens = [] ∧
      (state.queueBatch unit).batchIntents = [] := by
  simp [queueBatch_eq]

/-- `State.queueBatch` keeps the transitions and the issuer (`Laws.Step.Framing.queueBatch`). -/
theorem queueBatch_issuer (state : State) (unit : UnitKey) :
    (state.queueBatch unit).transitions = state.transitions ∧ (state.queueBatch unit).issuing = state.issuing := by
  simp [queueBatch_eq]

/-- The busy scope occurrences: each queued token's, each live open item's, each begun occurrence's, each parent and
each one a feature slot keeps alive. -/
theorem busyScopes_eq (state : State) : state.busyScopes = (allQueuedTokens state).map (·.busyScope) ++
    ((itemList state.openItems).filter fun item => !item.passive).map (·.scope) ++ (state.occurrences.filter (·.begun)).map (·.scope) ++
      state.scopes.filterMap (·.parent) ++ state.slots.keptAlive := by
  simp only [State.busyScopes, State.allTokens, allQueuedTokens]

theorem deferBegins_eq (state : State) (requests : List BeginRequest) :
    state.deferBegins requests = { state with batchTokens := state.batchTokens ++ (requests.map Token.begin).reverse } := by
  simp only [State.deferBegins]

theorem emit_eq (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) :
    state.emit flows scope = { state with batchTokens := state.batchTokens ++ flows.map (Token.flow · scope) } := by
  simp only [State.emit]

theorem closeItem_eq (state : State) (id : ItemKey) :
    state.closeItem id = { state with openItems := state.openItems.erase id } := by simp only [State.closeItem]

/-- A subscription's item waits for a trigger: no effect result or incident command closes it. -/
theorem triggers_await : (∀ detail, AwaitsTrigger (.timer detail)) ∧ (∀ detail, AwaitsTrigger (.message detail)) ∧
    (∀ detail, AwaitsTrigger (.signal detail)) ∧ ∀ detail, AwaitsTrigger (.conditional detail) :=
  ⟨fun _ => ⟨rfl, rfl, rfl⟩, fun _ => ⟨rfl, rfl, rfl⟩, fun _ => ⟨rfl, rfl, rfl⟩, fun _ => ⟨rfl, rfl, rfl⟩⟩

theorem closeOwnItems_eq (state : State) (id : OccurrenceId) :
    state.closeOwnItems id = { state with openItems := state.openItems.filter fun _ item => item.id.occurrence != id } := by
  simp only [State.closeOwnItems]

theorem removeVariable_variables (state : State) (target : ScopeOccurrenceId) (name : String) :
    (state.removeVariable target name).variables = state.variables.map fun vars =>
      if vars.scope == target then { vars with entries := vars.entries.filter (·.1 != name) } else vars := by
  simp only [State.removeVariable]

/-! ### What the hooks read of the operations they apply

`State.visible`, `State.owner?`, `State.declaring?` and `State.instanceRoot` search the scope chain by auxiliary
functions of the key that only this module can name. Each equation states its search as some function of fuel, run
from one step per segment of the key and one more, and given one step at a time, so `Kernel.Laws.State.Chain` derives
what they find without opening a body. -/

/-- Whether a scope occurrence is a called instance's root reads its own record alone. -/
theorem calledRoot_eq (state : State) (scope : ScopeOccurrenceId) :
    state.calledRoot scope = ((state.scopes.find? (·.id == scope)).bind (·.calledInstance)).isSome := by
  simp only [State.calledRoot]

/-- The scope occurrence an occurrence owns stands. -/
theorem localScope?_stands {state : State} {host : OccurrenceId} {scope : ScopeOccurrenceId}
    (found : state.localScope? host = some scope) : ∃ entry ∈ state.scopes, entry.id = scope := by
  obtain ⟨entry, member, same⟩ := Option.map_eq_some_iff.mp (by simpa only [State.localScope?] using found)
  exact ⟨entry, List.mem_of_find?_eq_some member, same⟩

/-- A frame shows every name but an item of a Scope other than its own element. -/
theorem shows_eq (state : State) (program : Program) (scope : ScopeOccurrenceId) (name : String) :
    state.shows program scope name =
      (program.itemScope? name).all fun declaring => ((state.scopes.find? (·.id == scope)).bind (·.element)) == some declaring := by
  unfold State.shows
  cases program.itemScope? name <;> rfl

/-- A search's parent step: the parent of the record it finds, which is its key's parent when the record stands. -/
theorem find_parent (state : State) (x : ScopeOccurrenceId) :
    (state.scopes.find? (·.id == x)).bind (·.parent) = if state.stands x then x.parent? else none := by
  cases found : state.scopes.find? (·.id == x) with
  | none =>
    have : state.stands x = false := by
      simp only [State.stands, List.any_eq_false]
      intro entry member same
      have := List.find?_eq_none.mp found entry member
      simp_all
    simp [this]
  | some entry =>
    have same : entry.id = x := by simpa using List.find?_some found
    have : state.stands x = true := List.any_eq_true.mpr ⟨entry, List.mem_of_find?_eq_some found, by simp [same]⟩
    simp [this, ScopeOccurrence.parent, same]

/-- A search by key, given fuel one step at a time: the shape `Kernel.Laws.State.Chain` reasons over. The executable
searches climb the key itself, so each needs exactly one step per segment and one more; a run with that much fuel is
the search (`visible_go`, `owner?_go`, `declaring?_go`, `instanceRoot_go`). -/
private def visibleWalk (state : State) (program : Program) : Nat → Option ScopeOccurrenceId → List (String × Value)
  | 0, _ => []
  | _ + 1, none => []
  | fuel + 1, some id => state.frame program id ++
      if state.calledRoot id then [] else visibleWalk state program fuel ((state.scopes.find? (·.id == id)).bind (·.parent))

private def ownerWalk (state : State) (name : String) : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId
  | 0, _ => none
  | fuel + 1, current =>
    if state.bindsOwn current name then some current
    else if state.calledRoot current then none
    else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (ownerWalk state name fuel)

private def declaringWalk (state : State) (element : ElementId) : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId
  | 0, _ => none
  | fuel + 1, current =>
    if ((state.scopes.find? (·.id == current)).bind (·.element)) == some element then some current
    else if state.calledRoot current then none
    else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (declaringWalk state element fuel)

private def rootWalk (state : State) : Nat → ScopeOccurrenceId → ScopeOccurrenceId
  | 0, _ => State.root
  | fuel + 1, current =>
    if state.calledRoot current then current
    else ((state.scopes.find? (·.id == current)).bind (·.parent)).elim State.root (rootWalk state fuel)

private theorem visibleWalk_none (state : State) (program : Program) (fuel : Nat) : visibleWalk state program fuel none = [] := by
  cases fuel <;> simp [visibleWalk]

/-- A search's step at a key with no segment: the key is the root, which has no parent. -/
private theorem root_of_nil {scope : ScopeOccurrenceId} (same : scope.segments = []) : scope = State.root :=
  ScopeOccurrenceId.ext (by simp [same, State.root, ScopeOccurrenceId.ofSegments_segments])

private theorem visible_walk (state : State) (program : Program) :
    ∀ segments (scope : ScopeOccurrenceId) (same : scope.segments = segments) fuel, segments.length < fuel →
      State.visible.go state program segments scope same = visibleWalk state program fuel (some scope)
  | [], scope, same, fuel + 1, _ => by
    cases root_of_nil same
    simp [State.visible.go, visibleWalk, find_parent, visibleWalk_none, State.root]
  | segment :: rest, scope, same, fuel + 1, enough => by
    simp only [State.visible.go, visibleWalk, find_parent, ScopeOccurrenceId.parent?_up same]
    by_cases stands : state.stands scope <;>
      simp [stands, visible_walk state program rest (.ofSegments rest) (ScopeOccurrenceId.ofSegments_segments rest) fuel (by simp at enough; omega), visibleWalk_none]

private theorem owner_walk (state : State) (name : String) :
    ∀ segments (scope : ScopeOccurrenceId) (same : scope.segments = segments) fuel, segments.length < fuel →
      State.owner?.go state name segments scope same = ownerWalk state name fuel scope
  | [], scope, same, fuel + 1, _ => by
    cases root_of_nil same
    simp only [State.owner?.go, ownerWalk, find_parent, State.root, ScopeOccurrenceId.parent?_nil]
    by_cases d : state.bindsOwn (.ofSegments []) name <;> by_cases c : state.calledRoot (.ofSegments []) <;> simp [d, c]
  | segment :: rest, scope, same, fuel + 1, enough => by
    simp only [State.owner?.go, ownerWalk, find_parent, ScopeOccurrenceId.parent?_up same]
    by_cases stands : state.stands scope <;>
      simp [stands, owner_walk state name rest (.ofSegments rest) (ScopeOccurrenceId.ofSegments_segments rest) fuel (by simp at enough; omega)]

private theorem declaring_walk (state : State) (element : ElementId) :
    ∀ segments (scope : ScopeOccurrenceId) (same : scope.segments = segments) fuel, segments.length < fuel →
      State.declaring?.go state element segments scope same = declaringWalk state element fuel scope
  | [], scope, same, fuel + 1, _ => by
    cases root_of_nil same
    simp only [State.declaring?.go, declaringWalk, find_parent, State.root, ScopeOccurrenceId.parent?_nil]
    by_cases c : state.calledRoot (.ofSegments []) <;> simp [c]
  | segment :: rest, scope, same, fuel + 1, enough => by
    simp only [State.declaring?.go, declaringWalk, find_parent, ScopeOccurrenceId.parent?_up same]
    by_cases stands : state.stands scope <;>
      simp [stands, declaring_walk state element rest (.ofSegments rest) (ScopeOccurrenceId.ofSegments_segments rest) fuel (by simp at enough; omega)]

private theorem root_walk (state : State) :
    ∀ segments (scope : ScopeOccurrenceId) (same : scope.segments = segments) fuel, segments.length < fuel →
      State.instanceRoot.go state segments scope same = rootWalk state fuel scope
  | [], scope, same, fuel + 1, _ => by
    cases root_of_nil same
    simp only [State.instanceRoot.go, rootWalk, find_parent, State.root, ScopeOccurrenceId.parent?_nil]
    cases fuel <;> by_cases stands : state.stands (.ofSegments []) <;> simp [stands, rootWalk]
  | segment :: rest, scope, same, fuel + 1, enough => by
    simp only [State.instanceRoot.go, rootWalk, find_parent, ScopeOccurrenceId.parent?_up same]
    by_cases stands : state.stands scope <;>
      simp [stands, root_walk state rest (.ofSegments rest) (ScopeOccurrenceId.ofSegments_segments rest) fuel (by simp at enough; omega)]

/-- `State.visible`: each frame's shown bindings, innermost first, up to and including a called root. -/
theorem visible_go (state : State) (program : Program) :
    ∃ go : Nat → Option ScopeOccurrenceId → List (String × Value),
      (∀ scope, state.visible program scope = go (scope.segments.length + 1) (some scope)) ∧ (∀ current, go 0 current = []) ∧
      (∀ fuel, go (fuel + 1) none = []) ∧ ∀ fuel id, go (fuel + 1) (some id) =
        (((state.variables.find? (·.scope == id)).map (·.entries)).getD []).filter (state.shows program id ·.1) ++
          if state.calledRoot id then [] else go fuel ((state.scopes.find? (·.id == id)).bind (·.parent)) :=
  ⟨visibleWalk state program, fun scope => visible_walk state program scope.segments scope rfl _ (by omega),
    fun _ => by simp [visibleWalk], fun _ => rfl, fun _ _ => by simp only [visibleWalk, State.frame]⟩

/-- `State.owner?`: the first scope occurrence whose frame binds the name, up to and including a called root. -/
theorem owner?_go (state : State) (name : String) :
    ∃ go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId,
      (∀ scope, state.owner? scope name = go (scope.segments.length + 1) scope) ∧ (∀ current, go 0 current = none) ∧
      ∀ fuel current, go (fuel + 1) current =
        if ((state.variables.find? (·.scope == current)).map (·.entries.any (·.1 == name))).getD false then some current
        else if state.calledRoot current then none
        else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (go fuel) :=
  ⟨ownerWalk state name, fun scope => owner_walk state name scope.segments scope rfl _ (by omega), fun _ => rfl,
    fun _ _ => rfl⟩

/-- `State.declaring?`: the first occurrence of the element, up to and including a called root. -/
theorem declaring?_go (state : State) (element : ElementId) :
    ∃ go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId,
      (∀ scope, state.declaring? scope element = go (scope.segments.length + 1) scope) ∧ (∀ current, go 0 current = none) ∧
      ∀ fuel current, go (fuel + 1) current =
        if ((state.scopes.find? (·.id == current)).bind (·.element)) == some element then some current
        else if state.calledRoot current then none
        else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (go fuel) :=
  ⟨declaringWalk state element, fun scope => declaring_walk state element scope.segments scope rfl _ (by omega), fun _ => rfl,
    fun _ _ => rfl⟩

/-- `State.instanceOf`: the identifier its instance root's record calls, else the instance's own. -/
theorem instanceOf_root (state : State) (scope : ScopeOccurrenceId) : state.instanceOf scope =
    ((state.scopes.find? (·.id == state.instanceRoot scope)).bind (·.calledInstance)).getD state.instanceId := by
  simp only [State.instanceOf]

/-- `State.instanceRoot`: the first called root, else the process root. -/
theorem instanceRoot_go (state : State) :
    ∃ go : Nat → ScopeOccurrenceId → ScopeOccurrenceId,
      (∀ scope, state.instanceRoot scope = go (scope.segments.length + 1) scope) ∧ (∀ current, go 0 current = State.root) ∧
      ∀ fuel current, go (fuel + 1) current =
        if state.calledRoot current then current
        else ((state.scopes.find? (·.id == current)).bind (·.parent)).elim State.root (go fuel) :=
  ⟨rootWalk state, fun scope => root_walk state scope.segments scope rfl _ (by omega), fun _ => rfl, fun _ _ => rfl⟩

/-- A start's fresh instance, which `Kernel.Laws.State.Keeps` reads through this lemma alone. -/
theorem initial_eq (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    State.initial instanceId variables businessKey =
      { instanceId
        scopes := [{ id := State.root, element := none }]
        variables := [{ scope := State.root, entries := keyed variables }]
        slots := { instances := [{ root := State.root, businessKey }] } } := by
  simp only [State.initial]

/-! ## Process instances -/

/-- `State.keyOf` is the key the laws read. -/
theorem keyOf_eq (state : State) (occurrence : Occurrence) : state.keyOf occurrence = key state occurrence := by
  simp only [State.keyOf, key]

private theorem find_entry {s : State} (nodup : (scopeIds s).Nodup) {entry : ScopeOccurrence} (member : entry ∈ s.scopes) :
    s.scopes.find? (·.id == entry.id) = some entry := by
  cases found : s.scopes.find? (·.id == entry.id) with
  | none => have := List.find?_eq_none.mp found entry member; simp at this
  | some other =>
    have same : other.id = entry.id := by simpa using List.find?_some found
    exact congrArg some (nodup_map_eq nodup (List.mem_of_find?_eq_some found) member same)

/-- `State.instanceOf` reads the process instance `InstanceIn` states, in a state whose scope identifiers are distinct
and whose parentless scope occurrences are the root: its search takes one step per segment of the key and one more, and
the chain climbs one segment per step. -/
theorem instanceOf_eq {s : State} (nodup : (scopeIds s).Nodup)
    (parentless : ∀ entry ∈ s.scopes, entry.parent = none → entry.id = State.root) {x : ScopeOccurrenceId}
    {name : String} {chain : List ScopeOccurrence} (reading : InstanceIn s x name chain)
    (_distinct : (chain.map (·.id)).Nodup) : s.instanceOf x = name := by
  have bound : ∀ {x name chain}, InstanceIn s x name chain → chain.length ≤ x.segments.length + 1 := by
    intro x name chain reading
    induction reading with
    | called => simp
    | up entry parent _ _ _ _ link _ ih =>
      obtain ⟨_, keyed⟩ := ScopeOccurrenceId.parent?_eq_some.mp (by simpa only [ScopeOccurrence.parent] using link)
      simp [keyed]; omega
    | root => simp
  have go : ∀ fuel, chain.length ≤ fuel →
      ((s.scopes.find? (·.id == rootWalk s fuel x)).bind (·.calledInstance)).getD s.instanceId = name := by
    clear _distinct
    induction reading with
    | called entry name member called =>
      intro fuel enough
      obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
      simp [rootWalk, State.calledRoot, find_entry nodup member, called]
    | up entry parent name chain member uncalled link _ ih =>
      intro fuel enough
      obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
      simp only [rootWalk, State.calledRoot, find_entry nodup member, Option.bind_some, uncalled,
        Option.isSome_none, Bool.false_eq_true, ite_false, link]
      exact ih fuel (by simp at enough; omega)
    | root entry member uncalled orphan =>
      intro fuel enough
      obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
      have named := parentless entry member orphan
      simp only [rootWalk, State.calledRoot, find_entry nodup member, Option.bind_some, uncalled,
        Option.isSome_none, Bool.false_eq_true, ite_false, orphan, ← named]
      simp [find_entry nodup member, uncalled]
  simp only [State.instanceOf]
  rw [show State.instanceRoot s x = rootWalk s (x.segments.length + 1) x from root_walk s x.segments x rfl _ (by omega)]
  exact go _ (bound reading)

/-- A scope occurrence keeps its process instance through a change that keeps the instance identifier and the scope
occurrences it lies within, into a state whose scope identifiers are distinct and whose parentless scope occurrences
are the root. -/
theorem instanceOf_kept {s t : State} (formed : WellFormed program s) (nodup : (scopeIds t).Nodup)
    (parentless : ∀ entry ∈ t.scopes, entry.parent = none → entry.id = State.root) (same : t.instanceId = s.instanceId)
    {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) (above : ∀ entry ∈ s.scopes, Within s x entry.id → entry ∈ t.scopes) :
    t.instanceOf x = s.instanceOf x := by
  obtain ⟨name, chain, reading, rest⟩ := instanceIn_exists formed present
  obtain ⟨distinct, within⟩ := rest
  have parentlessBefore : ∀ entry ∈ s.scopes, entry.parent = none → entry.id = State.root := fun entry member orphan =>
    (formed.rooted.2.1 entry member).mp orphan
  rw [instanceOf_eq formed.distinct.scopes parentlessBefore reading distinct,
    instanceOf_eq nodup parentless (reading.transport (fun entry inside => above entry (reading.mem entry inside)
      (within entry inside)) same) distinct]

/-! ## Issuing and beginning occurrences -/

/-- `State.activate` steps the counter of its key above every count that counter had. -/
theorem activate_activated {state : State} (keyed : ActivationsKeyed state) (inst : String) (element : ElementId)
    (role : ActivationRole) :
    Activated state (state.activate inst element role).1 inst element role (state.activate inst element role).2 := by
  refine ⟨by simp [State.activate], fun count member named same roled => ?_, by simp [State.activate]⟩
  have found : state.activations.find?
      (fun entry => entry.processInstance == inst && entry.element == element && entry.role == role) = some count := by
    cases lookup : state.activations.find?
        (fun entry => entry.processInstance == inst && entry.element == element && entry.role == role) with
    | none =>
      have := List.find?_eq_none.mp lookup count member
      simp [named, same, roled] at this
    | some other =>
      have hit := List.find?_some lookup
      simp only [Bool.and_eq_true, beq_iff_eq] at hit
      refine congrArg some (nodup_map_eq keyed.keys (List.mem_of_find?_eq_some lookup) member ?_)
      simp [hit.1.1, hit.1.2, hit.2, named, same, roled]
  simp [State.activate, found]

/-- A reservation keeps the feature slots. -/
theorem reserve_slots (state : State) (element : ElementId) (scope : ScopeOccurrenceId) :
    (state.reserve element scope).1.slots = state.slots := by
  simp [State.reserve, State.activate, State.issueOccurrence, State.issue]

/-- `State.reserve`. -/
theorem reserve_reserves (state : State) (element : ElementId) (scope : ScopeOccurrenceId) :
    Reserves state (state.reserve element scope).1 element scope (state.reserve element scope).2 := by
  have instances : ∀ x, (state.reserve element scope).1.instanceOf x = state.instanceOf x :=
    instanceOf_congr (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue])
      (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue])
  have id : (state.reserve element scope).2.id = { scope, element, ordinal := .fresh state.issuing state.issueNext } := by
    simp [State.reserve, State.activate, State.issueOccurrence, State.issue]
  have issued : (state.reserve element scope).1.issued =
      state.issued.insert (.fresh state.issuing state.issueNext) (.occurrence { parent := scope, element }) := by
    simp [State.reserve, State.activate, State.issueOccurrence, State.issue]
  have next := occurrence_next (before := state) (after := (state.reserve element scope).1) (scope := scope)
    (element := element) (by simp [standingKeys, State.reserve, State.activate, State.issueOccurrence, State.issue])
    (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]) (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]) issued
  refine {
      occurrences := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      fresh := fun fresh _ => id ▸ next.1 fresh,
      issued := fun fresh within => id ▸ next.2.1 fresh (by simpa [State.reserve] using within),
      occurrenceGrows := next.2.2, table := fun fresh => .insert fresh.next issued,
      issuer := fun fresh => fresh.issue issued (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]) (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]) (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]),
      scopeOrdinals := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue], kind := by simp [State.reserve],
      occurrenceOrdinals := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      placed := by simp [State.reserve], role := by simp [State.reserve], unbegun := by simp [State.reserve],
      activated := fun keyed => ?_, scopes := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      instances := instances, instanceId := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      itemMap := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      tokens := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue, allQueuedTokens],
      signals := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue, allSignals],
      queues := .of_eq (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue])
        (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue])
        (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue])
        (by simp [State.reserve, State.activate, State.issueOccurrence, State.issue]),
      variables := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      journal := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue], transitions := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      issuing := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      draft := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      status := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      failure := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue],
      slots := by simp [State.reserve, State.activate, State.issueOccurrence, State.issue], continued := rfl, keyed := by rw [id] }
  obtain ⟨activations, above, positive⟩ := activate_activated keyed (state.instanceOf scope) element .element
  exact ⟨by simpa [State.reserve, State.issueOccurrence, State.issue] using activations, by simpa [State.reserve, State.issueOccurrence, State.issue] using above,
    by simpa [State.reserve] using positive⟩

/-- `State.recordStart` journals the start under the key its result reads. -/
private theorem recordStart_started (state : State) (occurrence : Occurrence) (sourceType : String) :
    (State.recordStart state occurrence sourceType).draft.started = state.draft.started ++ [{
      occurrence := key (State.recordStart state occurrence sourceType) occurrence, owner := occurrence.scope, sourceType }] := by
  have same : key (State.recordStart state occurrence sourceType) occurrence = key state occurrence :=
    key_congr (instanceOf_congr (by simp [State.recordStart]) (by simp [State.recordStart]) _)
  rw [same]
  simp only [State.recordStart, keyOf_eq]

/-- `State.startReserved` of an unbegun occurrence. -/
theorem startReserved_starts (state : State) {occurrence : Occurrence} (sourceType : String)
    (unbegun : occurrence.begun = false) :
    StartsReserved state (state.startReserved occurrence sourceType).1 occurrence sourceType := by
  have instances : ∀ x, (state.startReserved occurrence sourceType).1.instanceOf x = state.instanceOf x :=
    instanceOf_congr (by simp [State.startReserved, unbegun, State.recordStart])
      (by simp [State.startReserved, unbegun, State.recordStart])
  revert instances
  simp only [State.startReserved, unbegun, Bool.false_eq_true, ite_false]
  intro instances
  refine {
      occurrences := by simp [State.recordStart], started := ?_,
      scopes := by simp [State.recordStart], instances := instances, scopeOrdinals := by simp [State.recordStart],
      instanceId := by simp [State.recordStart], activations := by simp [State.recordStart],
      occurrenceOrdinals := by simp [State.recordStart], itemMap := by simp [State.recordStart],
      tokens := by simp [State.recordStart, allQueuedTokens], signals := by simp [State.recordStart, allSignals],
      queues := .of_eq (by simp [State.recordStart]) (by simp [State.recordStart]) (by simp [State.recordStart])
        (by simp [State.recordStart]),
      variables := by simp [State.recordStart], journal := by simp [State.recordStart], transitions := by simp [State.recordStart],
      ended := by simp [State.recordStart], status := by simp [State.recordStart],
      failure := by simp [State.recordStart], slots := by simp [State.recordStart],
      issued := by simp [State.recordStart], issuing := by simp [State.recordStart],
      issueNext := by simp [State.recordStart] }
  rw [recordStart_started]
  simp [key]

/-- `State.startReserved` of a begun occurrence changes nothing. -/
theorem startReserved_begun (state : State) {occurrence : Occurrence} (sourceType : String)
    (begun : occurrence.begun = true) : state.startReserved occurrence sourceType = (state, occurrence) := by
  simp [State.startReserved, begun]

/-- `State.beginOccurrence` in a state whose counters are keyed. -/
theorem beginOccurrence_begins {state : State} (keyed : ActivationsKeyed state) (request : BeginRequest)
    (role : ActivationRole) (sourceType : String) :
    Begins state (state.beginOccurrence request role sourceType).1 request role sourceType
      (state.beginOccurrence request role sourceType).2 := by
  have activated := activate_activated keyed (state.instanceOf request.scope) request.element role
  have instances : ∀ x, (state.beginOccurrence request role sourceType).1.instanceOf x = state.instanceOf x :=
    instanceOf_congr (beginOccurrence_keeps state request role sourceType).1 (by
      simp only [State.beginOccurrence, State.recordStart]
      (split <;> try split) <;> simp [State.activate, State.issueOccurrence, State.issue])
  have keeps := beginOccurrence_keeps state request role sourceType
  revert instances keeps
  simp only [State.beginOccurrence]
  split
  · rename_i reserved found
    obtain ⟨id, named, lookup⟩ := Option.bind_eq_some_iff.mp found
    obtain ⟨member, same⟩ := occurrence?_some lookup
    subst same
    split
    · rename_i placed
      have placed : reserved.id.scope = request.scope := beq_iff_eq.mp placed
      intro instances keeps
      refine {
          occurrences := by
            simp only [State.recordStart]
            congr 1
            refine List.filter_congr fun o _ => ?_
            by_cases h : o.id = reserved.id
            · simp [h]
            · simp [h, named, Ne.symm h],
          started := by rw [recordStart_started], scope := rfl, isBegun := rfl,
          source := .inl ⟨reserved, member, named, placed, rfl, rfl, rfl, rfl, by simp [State.recordStart],
            by simp [State.recordStart]⟩,
          scopes := keeps.1, instances := instances, instanceId := by simp [State.recordStart],
          scopeOrdinals := by simp [State.recordStart], occurrenceOrdinals := by simp [State.recordStart],
          itemMap := ⟨by simp [State.recordStart], .inl (by simp [State.recordStart])⟩,
          tokens := by simp [State.recordStart, allQueuedTokens],
          signals := by simp [State.recordStart, allSignals], variables := keeps.2.1,
          queues := .of_eq (by simp [State.recordStart]) (by simp [State.recordStart]) (by simp [State.recordStart])
            (by simp [State.recordStart]),
          journal := by simp [State.recordStart], transitions := by simp [State.recordStart],
          issuing := by simp [State.recordStart], ended := by simp [State.recordStart],
          status := by simp [State.recordStart], failure := by simp [State.recordStart],
          slots := by simp [State.recordStart], continued := rfl,
          table := fun _ => .of_eq (by simp [State.recordStart]),
          issuer := fun fresh => fresh.same (by simp [State.recordStart]) (by simp [State.recordStart])
            (by simp [State.recordStart]) (by simp [State.recordStart]),
          keyed := placed }
    · rename_i moved
      have moved : reserved.id.scope ≠ request.scope := fun same => moved (beq_iff_eq.mpr same)
      intro instances keeps
      refine {
          occurrences := by
            simp only [State.recordStart, State.issueOccurrence, State.issue, List.filter_filter]
            congr 1
            refine List.filter_congr fun o _ => ?_
            rw [named, Bool.eq_iff_iff]
            by_cases h : o.id = reserved.id
            · simp [h]
            · simp [h, Ne.symm h],
          started := by rw [recordStart_started]; simp [State.recordStart, State.issueOccurrence, State.issue],
          scope := rfl, isBegun := rfl, scopes := keeps.1, instances := instances, variables := keeps.2.1,
          continued := rfl, keyed := rfl,
          source := .inr (.inl ⟨reserved, member, named, moved, fun fresh _ => ?unissued, fun fresh within => ?reissued,
            ?grown, rfl, rfl, rfl, ?_, ?_⟩),
          itemMap := ⟨?_, .inr ⟨reserved.id, named, fun same => moved (congrArg OccurrenceId.scope same), ?_⟩⟩,
          queues := .of_eq ?_ ?_ ?_ ?_,
          table := fun fresh => .insert (slot := .occurrence { parent := request.scope, element := reserved.element })
            fresh.next ?_,
          issuer := fun fresh => fresh.issue (slot := .occurrence { parent := request.scope, element := reserved.element })
            ?_ ?_ ?_ ?_, scopeOrdinals := ?_,
          occurrenceOrdinals := ?_, instanceId := ?_, tokens := ?_, signals := ?_, journal := ?_, transitions := ?_,
          issuing := ?_, ended := ?_, status := ?_, failure := ?_, slots := ?_ }
      case unissued =>
        simpa [State.issueOccurrence, State.issue] using
          occurrence_unissued (scope := request.scope) (element := reserved.element) fresh.next
      case reissued =>
        exact (occurrence_next (before := state) (scope := request.scope) (element := reserved.element)
          (by simp [standingKeys, State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue])).2.1 fresh within
      case grown =>
        exact fun fresh => (occurrence_next (before := state) (scope := request.scope) (element := reserved.element)
          (by simp [standingKeys, State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue])).2.2 fresh
      all_goals simp [State.recordStart, State.issueOccurrence, State.issue, allQueuedTokens, allSignals]
  · rename_i found
    have shape : (state.activate (state.instanceOf request.scope) request.element role).1 =
        { state with activations := (state.activate (state.instanceOf request.scope) request.element role).1.activations } := by
      simp [State.activate]
    generalize state.activate (state.instanceOf request.scope) request.element role = counted at activated shape ⊢
    obtain ⟨counter, activation⟩ := counted
    simp only at shape activated
    rw [shape]
    intro instances keeps
    have absent : ∀ id, request.reserved = some id → ∀ occurrence ∈ state.occurrences, occurrence.id ≠ id :=
      fun id named occurrence member same => by
        have := Option.bind_eq_none_iff.mp found id named
        have := List.find?_eq_none.mp this occurrence member
        simp [same] at this
    refine {
        occurrences := by
          simp only [State.recordStart, State.issueOccurrence, State.issue]
          congr 1
          refine List.filter_congr fun o member => ?_
          cases named : request.reserved with
          | none => simp
          | some id => rw [Bool.eq_iff_iff]; simp [Ne.symm (absent id named o member)],
        started := by rw [recordStart_started]; simp [State.recordStart, State.issueOccurrence, State.issue], scope := rfl, isBegun := rfl,
        source := .inr (.inr ⟨absent, fun fresh _ => ?fresh, fun fresh within => ?issued, ?grows, rfl, rfl, ?_⟩),
        scopes := keeps.1, instances := instances, instanceId := by simp [State.recordStart, State.issueOccurrence, State.issue],
        scopeOrdinals := by simp [State.recordStart, State.issueOccurrence, State.issue],
        occurrenceOrdinals := by simp [State.recordStart, State.issueOccurrence, State.issue],
        itemMap := by simp [State.recordStart, State.issueOccurrence, State.issue],
        tokens := by simp [State.recordStart, State.issueOccurrence, State.issue, allQueuedTokens],
        signals := by simp [State.recordStart, State.issueOccurrence, State.issue, allSignals], variables := keeps.2.1,
        queues := .of_eq (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue]),
        journal := by simp [State.recordStart, State.issueOccurrence, State.issue], transitions := by simp [State.recordStart, State.issueOccurrence, State.issue],
        issuing := by simp [State.recordStart, State.issueOccurrence, State.issue],
        ended := by simp [State.recordStart, State.issueOccurrence, State.issue],
        status := by simp [State.recordStart, State.issueOccurrence, State.issue],
        failure := by simp [State.recordStart, State.issueOccurrence, State.issue],
        slots := by simp [State.recordStart, State.issueOccurrence, State.issue], continued := rfl,
        table := fun fresh => .insert (slot := .occurrence { parent := request.scope, element := request.element }) fresh.next (by simp [State.recordStart, State.issueOccurrence, State.issue]),
        issuer := fun fresh => fresh.issue (slot := .occurrence { parent := request.scope, element := request.element }) (by simp [State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue])
          (by simp [State.recordStart, State.issueOccurrence, State.issue]), keyed := rfl }
    case fresh =>
      simpa [State.issueOccurrence, State.issue] using
        occurrence_unissued (scope := request.scope) (element := request.element) fresh.next
    case issued => exact (occurrence_next (before := state) (scope := request.scope) (element := request.element)
        (by simp [standingKeys, State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue])
        (by simp [State.recordStart, State.issueOccurrence, State.issue])).2.1 fresh within
    case grows => exact (occurrence_next (before := state) (scope := request.scope) (element := request.element)
        (by simp [standingKeys, State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue]) (by simp [State.recordStart, State.issueOccurrence, State.issue])
        (by simp [State.recordStart, State.issueOccurrence, State.issue])).2.2
    exact ⟨by simpa [State.recordStart, State.issueOccurrence, State.issue] using activated.activations, activated.above, activated.positive⟩

/-- The operations that take no position leave the position counter where it was: only `State.takePosition` advances it
(items issue their positions, DC13). The one law of the run-order counter the compensation proofs read beside it. -/
theorem positions_kept (state : State) :
    (∀ element scope, (state.reserve element scope).1.nextPosition = state.nextPosition) ∧
    (∀ request role sourceType, (state.beginOccurrence request role sourceType).1.nextPosition = state.nextPosition) ∧
    (∀ occurrence sourceType, (state.startReserved occurrence sourceType).1.nextPosition = state.nextPosition) ∧
    (∀ target name value, (state.setVariable target name value).nextPosition = state.nextPosition) ∧
    ∀ target name, (state.removeVariable target name).nextPosition = state.nextPosition := by
  refine ⟨fun _ _ => by simp [State.reserve, State.activate, State.issueOccurrence, State.issue], fun request role sourceType => ?_,
    fun occurrence _ => ?_, fun target name value => ?_, fun _ _ => rfl⟩
  · simp only [State.beginOccurrence, State.recordStart]
    (split <;> try split) <;> simp [State.activate, State.issueOccurrence, State.issue]
  · unfold State.startReserved
    split <;> simp [State.recordStart]
  · unfold State.setVariable
    dsimp only
    split <;> split <;> rfl

/-- The same operations leave the issued positions' counter where it was: inside a closure only the commit raises it
(`Step.advanceCounters`), which `CountersFrom.positions` reads. -/
theorem orders_kept (state : State) :
    (∀ element scope, (state.reserve element scope).1.nextOrder = state.nextOrder) ∧
    (∀ request role sourceType, (state.beginOccurrence request role sourceType).1.nextOrder = state.nextOrder) ∧
    (∀ occurrence sourceType, (state.startReserved occurrence sourceType).1.nextOrder = state.nextOrder) ∧
    (∀ target name value, (state.setVariable target name value).nextOrder = state.nextOrder) ∧
    ∀ target name, (state.removeVariable target name).nextOrder = state.nextOrder := by
  refine ⟨fun _ _ => by simp [State.reserve, State.activate, State.issueOccurrence, State.issue], fun request role sourceType => ?_,
    fun occurrence _ => ?_, fun target name value => ?_, fun _ _ => rfl⟩
  · simp only [State.beginOccurrence, State.recordStart]
    (split <;> try split) <;> simp [State.activate, State.issueOccurrence, State.issue]
  · unfold State.startReserved
    split <;> simp [State.recordStart]
  · unfold State.setVariable
    dsimp only
    split <;> split <;> rfl

/-! ## Removing occurrences -/

/-- `State.childrenOf` restated: a called root that binds a definition declares that definition's first process's top
level, any other scope occurrence the children of its element. -/
theorem childrenOf_eq (s : State) (program : Program) (scope : ScopeOccurrenceId) : s.childrenOf program scope =
    match (s.scopes.find? (·.id == scope)).bind (·.calledInstance),
        (s.slots.instances.find? (·.root == scope)).bind (·.definition) with
    | some _, some definition => ((program.processes.find? (·.definition == definition)).map program.processChildren).getD []
    | _, _ => program.children ((s.scopes.find? (·.id == scope)).bind (·.element)) := by
  unfold State.childrenOf; rfl

end Kernel.Laws.State
