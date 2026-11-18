module

public import Kernel.Laws.State.Reserve
public import Kernel.Laws.State.Transitions
public import Kernel.State.Removal
import all Kernel.State
import all Kernel.State.Tree
import all Kernel.State.Raise
import all Kernel.State.Slots
import all Kernel.State.Wait

/-! # Laws of the kernel state: the operations

The lemmas about `Kernel.State`'s operations that the proof wave composes: what each does to the fields the invariant
(`Kernel.Laws.State.Invariant`) reads, as the frames of `Kernel.Laws.State.Frames`, `Kernel.Laws.State.Clear` and
`Kernel.Laws.State.Issue` state it; `Kernel.Laws.State.Keeps` composes them into what each keeps of `WellFormed`. This is
the one module that sees their bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape))
except `Kernel.State.Removal`'s, which `Kernel.Laws.State.Removal` opens, so `State.root`'s value is stated here (`root_eq`), and `Kernel.Laws.State.Sample`'s witness that the sample instance
is well-formed reads it through that lemma. What follows from its equations without a body is proved outside it, in
`Kernel.Laws.State.Derived` or, for the scope chain's searches, `Kernel.Laws.State.Chain`. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Laws.State

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
    (state.reserve element scope).2.incoming = none := by simp [State.reserve, State.activate, State.issue]

/-- `beginOccurrence` keeps the scope occurrences, the variable sets and the logical time. -/
theorem beginOccurrence_keeps (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).1.scopes = state.scopes ∧
      (state.beginOccurrence request role sourceType).1.variables = state.variables ∧
      (state.beginOccurrence request role sourceType).1.logicalTimeMs = state.logicalTimeMs := by
  simp only [State.beginOccurrence, State.recordStart]
  split <;> simp [State.activate, State.issue]

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
      nextIssue := rfl, journal := rfl, draft := rfl, status := rfl, failure := rfl, signals := rfl,
      instances := fun _ => by apply instanceOf_congr <;> rfl, instanceId := rfl, slots := rfl }

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
      nextIssue := rfl, journal := rfl, draft := rfl, status := rfl, failure := rfl, signals := rfl,
      instances := fun _ => by apply instanceOf_congr <;> rfl, instanceId := rfl, slots := rfl }

/-- `keyed` keeps the last binding of each name: a binding enters unless a binding after it has its name. -/
theorem keyed_eq : keyed [] = [] ∧ ∀ (binding : String × Value) (rest : List (String × Value)),
    keyed (binding :: rest) = if (keyed rest).any (·.1 == binding.1) then keyed rest else binding :: keyed rest :=
  ⟨rfl, fun _ _ => rfl⟩

/-! ### What `Step` reads of the operations it applies -/

theorem occurrence?_some {state : State} {id : Nat} {occurrence : Occurrence}
    (found : state.occurrence? id = some occurrence) : occurrence ∈ state.occurrences ∧ occurrence.id = id := by
  unfold State.occurrence? at found
  exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

theorem occurrence?_none {state : State} {id : Nat} (absent : state.occurrence? id = none) :
    ∀ occurrence ∈ state.occurrences, occurrence.id ≠ id := fun occurrence member same => by
  unfold State.occurrence? at absent
  simpa [same] using List.find?_eq_none.mp absent occurrence member

/-- `beginOccurrence` holds the occurrence it begins, begun. -/
theorem beginOccurrence_mem (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).2 ∈ (state.beginOccurrence request role sourceType).1.occurrences ∧
      (state.beginOccurrence request role sourceType).2.begun = true := by
  simp only [State.beginOccurrence, State.recordStart]
  split <;> simp [State.activate, State.issue]

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
theorem root_eq : State.root = ⟨[]⟩ := by
  simp only [State.root]

theorem signal_eq (state : State) (signal : Signal) : state.signal signal = { state with signals := state.signals ++ [signal] } := by
  simp only [State.signal]

theorem issue_eq (state : State) : state.issue = ({ state with nextIssue := state.nextIssue + 1 }, state.nextIssue) := by
  simp only [State.issue]

theorem openItem_eq (state : State) (kind : OpenKind) (occurrence : Occurrence) : state.openItem kind occurrence =
    { state with
        nextIssue := state.nextIssue + 1
        itemOrdinals := state.itemOrdinals.insert occurrence.id (state.itemOrdinals.getD occurrence.id 0 + 1)
        openItems := state.openItems.insert ⟨occurrence.id, .wait, state.itemOrdinals.getD occurrence.id 0⟩
          { id := ⟨occurrence.id, .wait, state.itemOrdinals.getD occurrence.id 0⟩, position := state.nextIssue, kind,
            element := occurrence.element, scope := occurrence.scope } } := by
  simp only [State.openItem, State.issue, State.issueItem, State.putItem]

/-- A subscription reserves its occurrence, then issues its item's position and key. -/
theorem openSubscription_eq (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) (passive : Bool) :
    (state.openSubscription kind element scope host passive).1 =
      { (state.reserve element scope).1 with
          nextIssue := (state.reserve element scope).1.nextIssue + 1
          itemOrdinals := (state.reserve element scope).1.itemOrdinals.insert (state.reserve element scope).2.id
            ((state.reserve element scope).1.itemOrdinals.getD (state.reserve element scope).2.id 0 + 1)
          openItems := (state.reserve element scope).1.openItems.insert
            ⟨(state.reserve element scope).2.id, .subscription,
              (state.reserve element scope).1.itemOrdinals.getD (state.reserve element scope).2.id 0⟩
            { id := ⟨(state.reserve element scope).2.id, .subscription,
                (state.reserve element scope).1.itemOrdinals.getD (state.reserve element scope).2.id 0⟩,
              position := (state.reserve element scope).1.nextIssue, kind, element, scope, attachedTo := host,
              passive } } := by
  simp only [State.openSubscription, State.issue, State.issueItem, State.putItem]

/-- A scope occurrence is entered below its parent at its parent's counter for the element, which counts it, with its
locals keyed. -/
theorem enterScope_eq (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option Nat) :
    state.enterScope element parent locals occurrence =
      ({ state with
          scopeOrdinals := state.scopeOrdinals.insert { parent, element } (slotCount state parent element + 1)
          scopes := state.scopes ++
            [{ id := parent.child element (slotCount state parent element), element := some element, occurrence }]
          variables := state.variables ++
            [{ scope := parent.child element (slotCount state parent element), entries := keyed locals }] },
        parent.child element (slotCount state parent element)) := by
  simp only [State.enterScope, slotCount]

/-- A Call enters its called root at the counter, below its own scope occurrence, recording the instance it names and
the definition it bound; the other scope occurrences, issued before, stay as they were. -/
theorem enterCalled_eq (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef)
    (fresh : ∀ entry ∈ state.scopes, entry.id ≠ call.scope.child call.element (slotCount state call.scope call.element)) :
    state.enterCalled program call variables definition =
      ({ state with
          scopeOrdinals := state.scopeOrdinals.insert { parent := call.scope, element := call.element }
            (slotCount state call.scope call.element + 1)
          scopes := state.scopes ++ [{ id := call.scope.child call.element (slotCount state call.scope call.element)
                                       element := some call.element, occurrence := some call.id
                                       calledInstance := some (State.calledInstanceId (state.instanceOf call.scope)
                                         (program.publicId call.element) call.activation) }]
          variables := state.variables ++
            [{ scope := call.scope.child call.element (slotCount state call.scope call.element), entries := keyed variables }]
          slots := { state.slots with
            instances := state.slots.instances ++
              [{ root := call.scope.child call.element (slotCount state call.scope call.element), definition := some definition }] } },
        call.scope.child call.element (slotCount state call.scope call.element)) := by
  simp only [State.enterCalled, State.enterScope, slotCount, List.map_append, List.map_cons, List.map_nil,
    beq_self_eq_true, ite_true]
  have same : ∀ named : ScopeOccurrence → ScopeOccurrence, (∀ entry ∈ state.scopes, named entry = entry) →
      state.scopes.map named = state.scopes := fun _ kept => (List.map_congr_left kept).trans (List.map_id _)
  rw [same]
  intro entry member
  simp [fresh entry member]

/-- A Call's called root calls an instance and has the instance entry recording the definition the Call bound, whatever
identifiers stood before. -/
theorem enterCalled_root (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) :
    (∃ root ∈ (state.enterCalled program call variables definition).1.scopes,
      root.id = (state.enterCalled program call variables definition).2 ∧ root.calledInstance.isSome) ∧
    { root := (state.enterCalled program call variables definition).2, definition := some definition } ∈
      (state.enterCalled program call variables definition).1.slots.instances := by
  simp only [State.enterCalled, State.enterScope]
  refine ⟨⟨_, List.mem_map.mpr ⟨_, List.mem_append_right _ (List.mem_singleton_self _), rfl⟩, ?_, ?_⟩, by simp⟩ <;>
    simp

/-- A called instance's identifier spells its caller's instance, then the Call's authored identifier, each after its
UTF-8 byte length, then the activation. -/
theorem calledInstanceId_eq (caller : String) (call : ElementId) (activation : Nat) :
    State.calledInstanceId caller call activation =
      s!"call:{caller.utf8ByteSize}:{caller}:{call.value.utf8ByteSize}:{call.value}:{activation}" := by
  simp only [State.calledInstanceId]

theorem recordEnd_eq (state : State) (key : OccurrenceKey) (terminal : Terminal) :
    state.recordEnd key terminal = { state with draft := { state.draft with ended := state.draft.ended ++ [(key, terminal)] } } := by
  simp only [State.recordEnd]

/-- A flow token keeps its own scope occurrence busy. -/
theorem busyScope_flow (flow : FlowId) (scope : ScopeOccurrenceId) : (Token.flow flow scope).busyScope = scope := by
  simp only [Token.busyScope]

/-- A deferred begin keeps the scope occurrence it begins in busy. -/
theorem busyScope_begin (request : BeginRequest) : (Token.begin request).busyScope = request.scope := by
  simp only [Token.busyScope]

/-- The busy scope occurrences: each token's, each live open item's, each begun occurrence's, each parent and each one
a feature slot keeps alive. -/
theorem busyScopes_eq (state : State) : state.busyScopes = state.tokens.map (·.busyScope) ++
    ((itemList state.openItems).filter fun item => !item.passive).map (·.scope) ++ (state.occurrences.filter (·.begun)).map (·.scope) ++
      state.scopes.filterMap (·.parent) ++ state.slots.keptAlive := by
  simp only [State.busyScopes]

theorem deferBegins_eq (state : State) (requests : List BeginRequest) :
    state.deferBegins requests = { state with tokens := state.tokens ++ (requests.map Token.begin).reverse } := by
  simp only [State.deferBegins]

theorem emit_eq (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) :
    state.emit flows scope = { state with tokens := state.tokens ++ flows.map (Token.flow · scope) } := by
  simp only [State.emit]

theorem closeItem_eq (state : State) (id : ItemKey) :
    state.closeItem id = { state with openItems := state.openItems.erase id } := by simp only [State.closeItem]

/-- A subscription's item waits for a trigger: no effect result or incident command closes it. -/
theorem triggers_await : (∀ detail, AwaitsTrigger (.timer detail)) ∧ (∀ detail, AwaitsTrigger (.message detail)) ∧
    (∀ detail, AwaitsTrigger (.signal detail)) ∧ ∀ detail, AwaitsTrigger (.conditional detail) :=
  ⟨fun _ => ⟨rfl, rfl, rfl⟩, fun _ => ⟨rfl, rfl, rfl⟩, fun _ => ⟨rfl, rfl, rfl⟩, fun _ => ⟨rfl, rfl, rfl⟩⟩

theorem closeOwnItems_eq (state : State) (id : Nat) :
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
theorem localScope?_stands {state : State} {host : Nat} {scope : ScopeOccurrenceId}
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

private theorem visible_walk (state : State) (program : Program) :
    ∀ segments fuel, segments.length < fuel → State.visible.go state program segments = visibleWalk state program fuel (some ⟨segments⟩)
  | [], fuel + 1, _ => by
    simp [State.visible.go, visibleWalk, find_parent, visibleWalk_none, State.root]
  | segment :: rest, fuel + 1, enough => by
    simp only [State.visible.go, visibleWalk, find_parent]
    by_cases stands : state.stands ⟨segment :: rest⟩ <;>
      simp [stands, visible_walk state program rest fuel (by simp at enough; omega), visibleWalk_none]

private theorem owner_walk (state : State) (name : String) :
    ∀ segments fuel, segments.length < fuel → State.owner?.go state name segments = ownerWalk state name fuel ⟨segments⟩
  | [], fuel + 1, _ => by
    simp only [State.owner?.go, ownerWalk, find_parent, ScopeOccurrenceId.parent?]
    by_cases d : state.bindsOwn ⟨[]⟩ name <;> by_cases c : state.calledRoot ⟨[]⟩ <;> simp [d, c, State.root]
  | segment :: rest, fuel + 1, enough => by
    simp only [State.owner?.go, ownerWalk, find_parent]
    by_cases stands : state.stands ⟨segment :: rest⟩ <;>
      simp [stands, owner_walk state name rest fuel (by simp at enough; omega)]

private theorem declaring_walk (state : State) (element : ElementId) :
    ∀ segments fuel, segments.length < fuel →
      State.declaring?.go state element segments = declaringWalk state element fuel ⟨segments⟩
  | [], fuel + 1, _ => by
    simp only [State.declaring?.go, declaringWalk, find_parent, ScopeOccurrenceId.parent?]
    by_cases c : state.calledRoot ⟨[]⟩ <;> simp [c, State.root]
  | segment :: rest, fuel + 1, enough => by
    simp only [State.declaring?.go, declaringWalk, find_parent]
    by_cases stands : state.stands ⟨segment :: rest⟩ <;>
      simp [stands, declaring_walk state element rest fuel (by simp at enough; omega)]

private theorem root_walk (state : State) :
    ∀ segments fuel, segments.length < fuel → State.instanceRoot.go state segments = rootWalk state fuel ⟨segments⟩
  | [], fuel + 1, _ => by
    simp only [State.instanceRoot.go, rootWalk, find_parent]
    cases fuel <;> by_cases stands : state.stands ⟨[]⟩ <;> simp [stands, rootWalk, State.root]
  | segment :: rest, fuel + 1, enough => by
    simp only [State.instanceRoot.go, rootWalk, find_parent]
    by_cases stands : state.stands ⟨segment :: rest⟩ <;>
      simp [stands, root_walk state rest fuel (by simp at enough; omega)]

/-- `State.visible`: each frame's shown bindings, innermost first, up to and including a called root. -/
theorem visible_go (state : State) (program : Program) :
    ∃ go : Nat → Option ScopeOccurrenceId → List (String × Value),
      (∀ scope, state.visible program scope = go (scope.segments.length + 1) (some scope)) ∧ (∀ current, go 0 current = []) ∧
      (∀ fuel, go (fuel + 1) none = []) ∧ ∀ fuel id, go (fuel + 1) (some id) =
        (((state.variables.find? (·.scope == id)).map (·.entries)).getD []).filter (state.shows program id ·.1) ++
          if state.calledRoot id then [] else go fuel ((state.scopes.find? (·.id == id)).bind (·.parent)) :=
  ⟨visibleWalk state program, fun scope => visible_walk state program scope.segments _ (by omega),
    fun _ => by simp [visibleWalk], fun _ => rfl, fun _ _ => by simp only [visibleWalk, State.frame]⟩

/-- `State.owner?`: the first scope occurrence whose frame binds the name, up to and including a called root. -/
theorem owner?_go (state : State) (name : String) :
    ∃ go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId,
      (∀ scope, state.owner? scope name = go (scope.segments.length + 1) scope) ∧ (∀ current, go 0 current = none) ∧
      ∀ fuel current, go (fuel + 1) current =
        if ((state.variables.find? (·.scope == current)).map (·.entries.any (·.1 == name))).getD false then some current
        else if state.calledRoot current then none
        else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (go fuel) :=
  ⟨ownerWalk state name, fun scope => owner_walk state name scope.segments _ (by omega), fun _ => rfl,
    fun _ _ => rfl⟩

/-- `State.declaring?`: the first occurrence of the element, up to and including a called root. -/
theorem declaring?_go (state : State) (element : ElementId) :
    ∃ go : Nat → ScopeOccurrenceId → Option ScopeOccurrenceId,
      (∀ scope, state.declaring? scope element = go (scope.segments.length + 1) scope) ∧ (∀ current, go 0 current = none) ∧
      ∀ fuel current, go (fuel + 1) current =
        if ((state.scopes.find? (·.id == current)).bind (·.element)) == some element then some current
        else if state.calledRoot current then none
        else ((state.scopes.find? (·.id == current)).bind (·.parent)).bind (go fuel) :=
  ⟨declaringWalk state element, fun scope => declaring_walk state element scope.segments _ (by omega), fun _ => rfl,
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
  ⟨rootWalk state, fun scope => root_walk state scope.segments _ (by omega), fun _ => rfl, fun _ _ => rfl⟩

/-- A start's fresh instance, which `Kernel.Laws.State.Keeps` reads through this lemma alone. -/
theorem initial_eq (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    State.initial instanceId variables businessKey =
      { instanceId
        scopes := [{ id := State.root, element := none }]
        variables := [{ scope := State.root, entries := keyed variables }]
        slots := { instances := [{ root := State.root, businessKey }] } } := by
  simp only [State.initial]

/-! ## The subtree of a scope occurrence -/

/-- A key lies strictly below a proper tail of itself only. -/
theorem below_length {outer : List ScopeSegment} :
    ∀ {inner : List ScopeSegment}, State.below outer inner = true → outer.length < inner.length
  | [], below => by simp [State.below] at below
  | _ :: rest, below => by
    simp only [State.below, Bool.or_eq_true, beq_iff_eq] at below
    rcases below with rfl | deeper
    · simp
    · have := below_length deeper
      simp; omega

/-- A key lies strictly below its parent's key, and below whatever its parent's key lies below. -/
theorem below_cons (outer rest : List ScopeSegment) (segment : ScopeSegment) :
    State.below outer (segment :: rest) = (rest == outer || State.below outer rest) := by
  simp only [State.below]

/-- `State.subtree` holds `scope` and the standing scope occurrences whose keys lie below its key. -/
theorem mem_subtree (s : State) (scope x : ScopeOccurrenceId) : x ∈ s.subtree scope ↔
    x = scope ∨ ∃ entry ∈ s.scopes, entry.id = x ∧ State.below scope.segments x.segments = true := by
  simp only [State.subtree, List.mem_cons, List.mem_map, List.mem_mergeSort, List.mem_filter, Prod.exists]
  constructor
  · rintro (same | ⟨_, _, ⟨entry, ⟨member, below⟩, pair⟩, named⟩)
    · exact .inl same
    · simp only [Prod.mk.injEq] at pair
      obtain ⟨_, rfl⟩ := pair
      exact .inr ⟨entry, member, named, named ▸ below⟩
  · rintro (same | ⟨entry, member, rfl, below⟩)
    · exact .inl same
    · exact .inr ⟨_, entry.id, ⟨entry, ⟨member, below⟩, rfl⟩, rfl⟩

/-- What lies within the root is the root or stands. -/
private theorem within_root_stands {s : State} (formed : WellFormed program s) :
    ∀ {x outer : ScopeOccurrenceId}, Within s x outer → outer = State.root → x ∈ scopeIds s
  | _, _, .refl _, rfl => formed.rooted.1
  | _, _, .parent _ _ _ member _ _, _ => List.mem_map_of_mem (f := ScopeOccurrence.id) member

/-- A standing scope occurrence's parent stands, in a rooted state. -/
theorem parent_stands {s : State} (formed : WellFormed program s) {entry : ScopeOccurrence} (member : entry ∈ s.scopes)
    {segment : ScopeSegment} {rest : List ScopeSegment} (keyed : entry.id.segments = segment :: rest) :
    (⟨rest⟩ : ScopeOccurrenceId) ∈ scopeIds s := by
  suffices up : ∀ {x outer : ScopeOccurrenceId}, Within s x outer → outer = State.root → x = entry.id →
      (⟨rest⟩ : ScopeOccurrenceId) ∈ scopeIds s from up (formed.rooted.2.2 entry member) rfl rfl
  intro x outer within rooted named
  cases within with
  | refl => subst rooted; rw [root_eq] at named; rw [← named] at keyed; simp at keyed
  | parent child parent _ _ link above =>
    have same : parent = ⟨rest⟩ := by
      simp only [ScopeOccurrence.parent, ScopeOccurrenceId.parent?, named, keyed] at link
      exact (Option.some.inj link).symm
    exact same ▸ within_root_stands formed above rooted

/-- In a well-formed state, the subtree of a present scope occurrence is exactly what lies within it. -/
theorem subtree_iff {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (x : ScopeOccurrenceId) : x ∈ s.subtree scope ↔ Within s x scope := by
  rw [mem_subtree]
  constructor
  · rintro (rfl | ⟨entry, member, rfl, below⟩)
    · exact .refl _
    · suffices up : ∀ (segments : List ScopeSegment) (entry : ScopeOccurrence), entry ∈ s.scopes →
          entry.id.segments = segments → State.below scope.segments segments = true → Within s entry.id scope from
        up _ entry member rfl below
      intro segments
      induction segments with
      | nil => intro _ _ _ below; simp [State.below] at below
      | cons segment rest ih =>
        intro entry member keyed below
        have link : entry.parent = some ⟨rest⟩ := by simp [ScopeOccurrence.parent, ScopeOccurrenceId.parent?, keyed]
        rw [below_cons, Bool.or_eq_true, beq_iff_eq] at below
        rcases below with same | deeper
        · have top : (⟨rest⟩ : ScopeOccurrenceId) = scope := by cases scope; simp_all
          exact .parent entry _ scope member link (top ▸ .refl _)
        · obtain ⟨parentEntry, parentMember, named⟩ := List.mem_map.mp (parent_stands formed member keyed)
          exact .parent entry _ scope member link (named ▸ ih parentEntry parentMember (by rw [named]) deeper)
  · intro within
    induction within with
    | refl => exact .inl rfl
    | parent child parent outer member link _ ih =>
      have keyed : ∃ segment, child.id.segments = segment :: parent.segments := by
        simp only [ScopeOccurrence.parent, ScopeOccurrenceId.parent?] at link
        split at link
        · simp at link
        · rename_i segment rest same; simp at link; subst link; exact ⟨segment, same⟩
      obtain ⟨segment, keyed⟩ := keyed
      refine .inr ⟨child, member, rfl, ?_⟩
      rw [keyed, below_cons, Bool.or_eq_true, beq_iff_eq]
      rcases ih present with same | ⟨_, _, rfl, deeper⟩
      · exact .inl (by rw [same])
      · exact .inr deeper

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
      simp only [ScopeOccurrence.parent, ScopeOccurrenceId.parent?] at link
      split at link
      · simp at link
      · rename_i same; simp at link; subst link; simp [same]; omega
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
  rw [show State.instanceRoot s x = rootWalk s (x.segments.length + 1) x from root_walk s x.segments _ (by omega)]
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
  simp [State.reserve, State.activate, State.issue]

/-- `State.reserve`. -/
theorem reserve_reserves (state : State) (element : ElementId) (scope : ScopeOccurrenceId) :
    Reserves state (state.reserve element scope).1 element scope (state.reserve element scope).2 := by
  have instances : ∀ x, (state.reserve element scope).1.instanceOf x = state.instanceOf x :=
    instanceOf_congr (by simp [State.reserve, State.activate, State.issue])
      (by simp [State.reserve, State.activate, State.issue])
  refine {
      occurrences := by simp [State.reserve, State.activate, State.issue],
      id := by simp [State.reserve, State.activate, State.issue],
      scopeOrdinals := by simp [State.reserve, State.activate, State.issue],
      nextIssue := by simp [State.reserve, State.activate, State.issue], kind := by simp [State.reserve],
      placed := by simp [State.reserve], role := by simp [State.reserve], unbegun := by simp [State.reserve],
      activated := fun keyed => ?_, scopes := by simp [State.reserve, State.activate, State.issue],
      instances := instances, instanceId := by simp [State.reserve, State.activate, State.issue],
      itemMap := by simp [State.reserve, State.activate, State.issue],
      tokens := by simp [State.reserve, State.activate, State.issue],
      signals := by simp [State.reserve, State.activate, State.issue],
      variables := by simp [State.reserve, State.activate, State.issue],
      journal := by simp [State.reserve, State.activate, State.issue],
      draft := by simp [State.reserve, State.activate, State.issue],
      status := by simp [State.reserve, State.activate, State.issue],
      failure := by simp [State.reserve, State.activate, State.issue],
      slots := by simp [State.reserve, State.activate, State.issue], continued := rfl }
  obtain ⟨activations, above, positive⟩ := activate_activated keyed (state.instanceOf scope) element .element
  exact ⟨by simpa [State.reserve, State.issue] using activations, by simpa [State.reserve, State.issue] using above,
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
      nextIssue := by simp [State.recordStart], itemMap := by simp [State.recordStart],
      tokens := by simp [State.recordStart], signals := by simp [State.recordStart],
      variables := by simp [State.recordStart], journal := by simp [State.recordStart],
      ended := by simp [State.recordStart], status := by simp [State.recordStart],
      failure := by simp [State.recordStart], slots := by simp [State.recordStart] }
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
      split <;> simp [State.activate, State.issue])
  have keeps := beginOccurrence_keeps state request role sourceType
  revert instances keeps
  simp only [State.beginOccurrence]
  split
  · rename_i reserved found
    obtain ⟨id, named, lookup⟩ := Option.bind_eq_some_iff.mp found
    obtain ⟨member, same⟩ := occurrence?_some lookup
    intro instances keeps
    refine {
        occurrences := by simp [State.recordStart], started := by rw [recordStart_started], scope := rfl,
        isBegun := rfl,
        source := .inl ⟨reserved, member, same ▸ named, rfl, rfl, rfl, rfl, by simp [State.recordStart], by simp [State.recordStart]⟩,
        scopes := keeps.1, instances := instances, instanceId := by simp [State.recordStart],
        scopeOrdinals := by simp [State.recordStart],
        itemMap := by simp [State.recordStart], tokens := by simp [State.recordStart],
        signals := by simp [State.recordStart], variables := keeps.2.1,
        journal := by simp [State.recordStart], ended := by simp [State.recordStart],
        status := by simp [State.recordStart], failure := by simp [State.recordStart],
        slots := by simp [State.recordStart], continued := rfl }
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
        occurrences := by simp [State.recordStart, State.issue],
        started := by rw [recordStart_started]; simp [State.recordStart, State.issue], scope := rfl, isBegun := rfl,
        source := .inr ⟨absent, by simp [State.issue], by simp [State.recordStart, State.issue], rfl, rfl, ?_⟩,
        scopes := keeps.1, instances := instances, instanceId := by simp [State.recordStart, State.issue],
        scopeOrdinals := by simp [State.recordStart, State.issue],
        itemMap := by simp [State.recordStart, State.issue],
        tokens := by simp [State.recordStart, State.issue],
        signals := by simp [State.recordStart, State.issue], variables := keeps.2.1,
        journal := by simp [State.recordStart, State.issue],
        ended := by simp [State.recordStart, State.issue],
        status := by simp [State.recordStart, State.issue],
        failure := by simp [State.recordStart, State.issue],
        slots := by simp [State.recordStart, State.issue], continued := rfl }
    exact ⟨by simpa [State.recordStart, State.issue] using activated.activations, activated.above, activated.positive⟩

/-! ## Clearing a scope occurrence -/

/-- `State.subtree` meets each scope occurrence once. -/
theorem subtree_nodup {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId}
    (_present : scope ∈ scopeIds s) : (s.subtree scope).Nodup := by
  simp only [State.subtree]
  refine List.nodup_cons.mpr ⟨fun inside => ?_, ?_⟩
  · obtain ⟨_, member, named⟩ := List.mem_map.mp inside
    obtain ⟨entry, filtered, pair⟩ := List.mem_map.mp ((List.mem_mergeSort).mp member)
    have below := (List.mem_filter.mp filtered).2
    subst pair
    have := below_length below
    simp only at named
    rw [← named] at this
    omega
  · refine ((List.mergeSort_perm _ _).map Prod.snd).nodup_iff.mpr ?_
    rw [List.map_map]
    exact (formed.distinct.scopes.sublist ((List.filter_sublist).map _))

/-! ## Removing occurrences -/

/-- `State.subtree` reads only the scope occurrences. -/
theorem subtree_congr {s t : State} (scopes : t.scopes = s.scopes) (scope : ScopeOccurrenceId) :
    t.subtree scope = s.subtree scope := by
  have ranks : ∀ outer inner, t.ranks outer inner = s.ranks outer inner := by
    intro outer inner
    induction inner with
    | nil => simp [State.ranks]
    | cons segment rest ih => simp [State.ranks, ih, scopes]
  simp [State.subtree, ranks, scopes]

/-- `FeatureSlots.clear` filters each slot by the scope occurrences it removes: what `Kernel.Laws.State.Removal` reads
of the slots when it clears a scope occurrence. -/
theorem featureSlotsClear_eq (slots : FeatureSlots) (inside nested : List ScopeOccurrenceId) :
    slots.clear inside nested = {
      parked := slots.parked.filter (!inside.contains ·.scope)
      held := slots.held.filter (!inside.contains ·.scope)
      multiInstances := slots.multiInstances.filter (!inside.contains ·.scope)
      compensation := {
        retained := slots.compensation.retained.filter (!nested.contains ·.scope)
        runs := slots.compensation.runs.filter (!inside.contains ·.scope) }
      instances := slots.instances.filter (!nested.contains ·.root) } := by
  simp only [FeatureSlots.clear]

/-- `State.disarm` closes the items attached to `host` and drops the reservations they hold. -/
theorem disarm_eq (s : State) (host : Nat) : s.disarm host = { s with
    openItems := s.openItems.filter fun _ item => item.attachedTo != some host
    occurrences := s.occurrences.filter fun occurrence =>
      occurrence.begun || !((itemList s.openItems).filter (·.attachedTo == some host)).any (·.id.occurrence == occurrence.id)
    itemOrdinals := s.itemOrdinals.filter fun id _ => !s.occurrences.any fun occurrence =>
      occurrence.id == id && !occurrence.begun && ((itemList s.openItems).filter (·.attachedTo == some host)).any (·.id.occurrence == occurrence.id) } := by
  simp only [State.disarm, State.mk.injEq, and_true, true_and]
  congr 1
  funext id _
  simp only [List.contains_map, List.any_filter]
  congr 2
  funext occurrence
  cases occurrence.begun <;> simp only [Bool.not_true, Bool.not_false, Bool.false_and, Bool.true_and, Bool.and_false,
    Bool.and_true]
  rw [BEq.comm, Bool.and_comm]

/-- The elements a scope occurrence declares (`State.childrenOf`) are a called process's children or the children of
an element of the program. -/
theorem childrenOf_mem {s : State} {program : Program} {scope : ScopeOccurrenceId} {child : Element}
    (member : child ∈ s.childrenOf program scope) :
    (∃ process ∈ program.processes, child ∈ program.processChildren process) ∨ ∃ parent, child ∈ program.children parent := by
  unfold State.childrenOf at member
  dsimp only at member
  split at member
  · rename_i _ definition _ _
    cases found : program.processes.find? (·.definition == definition) with
    | none => simp [found] at member
    | some process =>
      rw [found] at member
      exact .inl ⟨process, List.mem_of_find?_eq_some found, member⟩
  · exact .inr ⟨_, member⟩

/-- The elements a scope occurrence declares (`State.childrenOf`): for a called root whose first instance entry binds a
definition, the top level of the first process of that definition, else the children of its first entry's element. -/
theorem childrenOf_cases {s : State} {program : Program} {scope : ScopeOccurrenceId} {child : Element}
    (member : child ∈ s.childrenOf program scope) :
    (∃ entry, s.scopes.find? (·.id == scope) = some entry ∧ entry.calledInstance.isSome ∧
      ∃ bound, s.slots.instances.find? (·.root == scope) = some bound ∧ ∃ definition, bound.definition = some definition ∧
        ∃ process, program.processes.find? (·.definition == definition) = some process ∧
          child ∈ program.processChildren process) ∨
      (∀ entry, s.scopes.find? (·.id == scope) = some entry → entry.calledInstance.isSome →
        ∀ bound, s.slots.instances.find? (·.root == scope) = some bound → bound.definition = none) ∧
      child ∈ program.children ((s.scopes.find? (·.id == scope)).bind (·.element)) := by
  unfold State.childrenOf at member
  dsimp only at member
  split at member
  · rename_i _ definition called defined
    obtain ⟨entry, found, named⟩ := Option.bind_eq_some_iff.mp called
    obtain ⟨bound, boundFound, binds⟩ := Option.bind_eq_some_iff.mp defined
    cases processOf : program.processes.find? (·.definition == definition) with
    | none => simp [processOf] at member
    | some process =>
      rw [processOf] at member
      exact .inl ⟨entry, found, by simp [named], bound, boundFound, definition, binds, process, processOf, member⟩
  · rename_i unbound
    refine .inr ⟨fun entry found called bound boundFound => ?_, member⟩
    obtain ⟨name, named⟩ := Option.isSome_iff_exists.mp called
    cases defined : bound.definition with
    | none => rfl
    | some definition => exact (unbound name definition (by simp [found, named]) (by simp [boundFound, defined])).elim

end Kernel.Laws.State
