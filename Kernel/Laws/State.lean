module

public import Kernel.Laws.State.Reserve
public import Kernel.State.Removal
import all Kernel.State
import all Kernel.State.Removal
import all Kernel.State.Slots
import all Kernel.State.Wait

/-! # Laws of the kernel state: the operations

The lemmas about `Kernel.State`'s operations that the proof wave composes: what each does to the fields the invariant
(`Kernel.Laws.State.Invariant`) reads, as the frames of `Kernel.Laws.State.Frames` and `Kernel.Laws.State.Issue` state
it; `Kernel.Laws.State.Keeps` composes them into what each keeps of `WellFormed`. This is the one module that sees
their bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)), so the witness that the
sample instance is well-formed, which reads `State.root`'s value, is here too. Nothing executable imports this module.
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

/-- `beginOccurrence` keeps the scope occurrences, the variable sets and the logical time. -/
theorem beginOccurrence_keeps (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).1.scopes = state.scopes ∧
      (state.beginOccurrence request role sourceType).1.variables = state.variables ∧
      (state.beginOccurrence request role sourceType).1.logicalTimeMs = state.logicalTimeMs := by
  simp only [State.beginOccurrence, State.recordStart]
  split <;> simp [State.activate, State.issue]

/-- What a scope occurrence sees reads only the scope occurrences and the variable sets. -/
theorem visible_congr {s t : State} (scopes : t.scopes = s.scopes) (variables : t.variables = s.variables)
    (program : Program) (scope : ScopeOccurrenceId) : t.visible program scope = s.visible program scope := by
  have shows : t.shows program = s.shows program := by
    funext id name; simp [State.shows, scopes]
  have called : t.calledRoot = s.calledRoot := by
    funext id; simp [State.calledRoot, scopes]
  have go : ∀ (fuel : Nat) (current : Option ScopeOccurrenceId),
      State.visible.go t program fuel current = State.visible.go s program fuel current := by
    intro fuel
    induction fuel with
    | zero => intro current; simp [State.visible.go]
    | succ fuel ih =>
      intro current
      cases current with
      | none => simp [State.visible.go]
      | some id => simp [State.visible.go, shows, called, scopes, variables, ih]
  simp only [State.visible, go, scopes]

/-- `State.instanceOf` reads only the scope occurrences and the instance identifier. -/
theorem instanceOf_congr {s t : State} (scopes : t.scopes = s.scopes) (named : t.instanceId = s.instanceId)
    (x : ScopeOccurrenceId) : t.instanceOf x = s.instanceOf x := by
  have called : t.calledRoot = s.calledRoot := by funext id; simp [State.calledRoot, scopes]
  have go : ∀ fuel x, State.instanceRoot.go t fuel x = State.instanceRoot.go s fuel x := by
    intro fuel
    induction fuel with
    | zero => intro x; simp [State.instanceRoot.go]
    | succ fuel ih => intro x; simp [State.instanceRoot.go, called, scopes, ih]
  simp [State.instanceOf, State.instanceRoot, go, scopes, named]

/-- `setVariable` changes only the variable sets and the write log. -/
theorem setVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    SameButVariables state (state.setVariable target name value) := by
  unfold State.setVariable
  dsimp only
  split <;> split <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl,
    rfl⟩

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
  ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, rfl⟩

/-- `keyed` binds each name at most once, whatever bindings it was given. -/
theorem keyed_names (bindings : List (String × Value)) : ((keyed bindings).map (·.1)).Nodup := by
  induction bindings with
  | nil => simp [keyed]
  | cons binding rest held =>
    have step : keyed (binding :: rest) =
        if (keyed rest).any (·.1 == binding.1) then keyed rest else binding :: keyed rest := rfl
    rw [step]
    split
    · exact held
    · rename_i absent
      refine List.nodup_cons.mpr ⟨fun member => absent ?_, held⟩
      obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
      exact List.any_eq_true.mpr ⟨entry, inside, beq_iff_eq.mpr named⟩

/-- A fresh instance's variables are keyed, whatever bindings the start supplied (#147). -/
theorem initial_variablesKeyed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    VariablesKeyed (State.initial instanceId variables businessKey) where
  scopes := by simp [State.initial]
  names := by
    intro vars member
    simp only [State.initial, List.mem_singleton] at member
    subst member
    exact keyed_names variables

/-- The variable set a new scope occurrence installs binds each name at most once, whatever locals it was given (#147). -/
theorem enterScope_names (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option Nat)
    (names : ∀ vars ∈ state.variables, (vars.entries.map (·.1)).Nodup) :
    ∀ vars ∈ (state.enterScope element parent locals occurrence).1.variables, (vars.entries.map (·.1)).Nodup := by
  intro vars member
  simp only [State.enterScope, State.issue, List.mem_append, List.mem_singleton] at member
  rcases member with old | fresh
  · exact names vars old
  · subst fresh
    exact keyed_names locals

/-! ### Cancellation facts -/

private theorem CancelsWithEnds.trans {first second third : State} (one : CancelsWithEnds first second)
    (two : CancelsWithEnds second third) : CancelsWithEnds first third := by
  obtain ⟨begun, keys, facts⟩ := one
  obtain ⟨cancelled, ended, length, flagged⟩ := facts
  obtain ⟨begun', keys', facts'⟩ := two
  obtain ⟨cancelled', ended', length', flagged'⟩ := facts'
  refine ⟨begun ++ begun', keys ++ keys', by simp [cancelled', cancelled], by simp [ended', ended], by simp [length,
    length'], ?_⟩
  intro occurrence member
  rcases List.mem_append.mp member with old | new
  · exact flagged occurrence old
  · exact flagged' occurrence new

private theorem CancelsWithEnds.ofDraft {before after : State} (same : after.draft = before.draft) :
    CancelsWithEnds before after :=
  ⟨[], [], by simp [same], by simp [same], rfl, by simp⟩

private theorem recordCancelled_cancels (state : State) (occurrences : List Occurrence) :
    CancelsWithEnds state (State.recordCancelled state occurrences) := by
  refine ⟨occurrences.filter (·.begun), (occurrences.filter (·.begun)).map state.keyOf, ?_, ?_, by simp, ?_⟩
  · simp [State.recordCancelled]
  · simp [State.recordCancelled, List.map_map, Function.comp_def]
  · intro occurrence member
    simpa using (List.mem_filter.mp member).2

private theorem clearInside_cancels (state : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    CancelsWithEnds state (state.clearInside scope keep) := by
  obtain ⟨begun, keys, facts⟩ := recordCancelled_cancels state
    ((state.subtree scope).reverse.flatMap fun current =>
      state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id)
  obtain ⟨cancelled, ended, length, flagged⟩ := facts
  exact ⟨begun, keys, by simpa [State.clearInside] using cancelled, by simpa [State.clearInside] using ended, length,
    flagged⟩

private theorem removeOccurrence_cancels (state : State) (id : Nat) :
    CancelsWithEnds state (state.removeOccurrence id) := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), CancelsWithEnds state current →
      CancelsWithEnds state (scopes.foldl (fun state scope => state.leaveScope scope.id) current) := by
    intro scopes
    induction scopes with
    | nil => intro current reached; exact reached
    | cons scope rest ih =>
      intro current reached
      refine ih _ (reached.trans ?_)
      obtain ⟨begun, keys, facts⟩ := clearInside_cancels current scope.id []
      obtain ⟨cancelled, ended, length, flagged⟩ := facts
      exact ⟨begun, keys, by simpa [State.leaveScope] using cancelled, by simpa [State.leaveScope] using ended, length,
        flagged⟩
  exact fold _ _ (.ofDraft rfl)

private theorem withdrawOccurrence_draft (state : State) (id : Nat) :
    (state.withdrawOccurrence id).draft = state.draft := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), current.draft = state.draft →
      (scopes.foldl (fun state scope => state.withdrawInside scope.id) current).draft = state.draft := by
    intro scopes
    induction scopes with
    | nil => intro current same; exact same
    | cons scope rest ih => intro current same; exact ih _ (by simpa [State.withdrawInside] using same)
  exact fold _ _ (by simp [State.closeOwnItems, State.disarm])

/-- Clearing a scope occurrence and cancelling an occurrence journal their cancelled facts with their end facts
(`CancelsWithEnds`): `State.Removal`'s one cancelled-fact writer pairs every cancelled fact with its end, so P3's notice
is given exactly when the end is journalled. -/
theorem removal_cancels_with_ends (state : State) :
    (∀ scope keep, CancelsWithEnds state (state.clearInside scope keep)) ∧
      ∀ id, CancelsWithEnds state (state.cancelOccurrence id) := by
  refine ⟨clearInside_cancels state, fun id => ?_⟩
  unfold State.cancelOccurrence
  split
  · exact .ofDraft rfl
  · rename_i occurrence _
    exact ((CancelsWithEnds.ofDraft (withdrawOccurrence_draft state id)).trans
      (removeOccurrence_cancels _ id)).trans (recordCancelled_cancels _ [occurrence])

/-! ### What `Step` reads of the operations it applies -/

theorem occurrence?_some {state : State} {id : Nat} {occurrence : Occurrence}
    (found : state.occurrence? id = some occurrence) : occurrence ∈ state.occurrences ∧ occurrence.id = id := by
  unfold State.occurrence? at found
  exact ⟨List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

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
      (state.startReserved occurrence sourceType).1.scopes = state.scopes := by
  unfold State.startReserved
  split
  · rename_i begun
    exact ⟨member, begun, rfl, rfl, rfl⟩
  · refine ⟨?_, by simp, by simp, by simp, by simp [State.recordStart]⟩
    simp only [State.recordStart]
    exact List.mem_map.mpr ⟨occurrence, member, by simp⟩

/-- `closeOwnItems` keeps the scope occurrences and the occurrences, and leaves only items that wait for another
occurrence. -/
theorem closeOwnItems_facts (state : State) (id : Nat) :
    (state.closeOwnItems id).scopes = state.scopes ∧ (state.closeOwnItems id).occurrences = state.occurrences ∧
      (∀ item ∈ (state.closeOwnItems id).openItems, item ∈ state.openItems) ∧
      ∀ item ∈ (state.closeOwnItems id).openItems, item.occurrence ≠ id := by
  refine ⟨rfl, rfl, fun item member => (List.mem_filter.mp member).1, fun item member => ?_⟩
  simpa using (List.mem_filter.mp member).2

/-- A queued cancellation of an occurrence that is gone changes nothing. -/
theorem cancelOccurrence_absent {state : State} {id : Nat} (absent : state.occurrence? id = none) :
    state.cancelOccurrence id = state := by
  simp [State.cancelOccurrence, absent]

theorem recordEnd_scopes (state : State) (key : OccurrenceKey) (terminal : Terminal) :
    (state.recordEnd key terminal).scopes = state.scopes := by
  simp only [State.recordEnd]

/-- The operations that only append to or filter one field. -/
theorem root_eq : State.root = ⟨0⟩ := by
  simp only [State.root]

theorem signal_eq (state : State) (signal : Signal) : state.signal signal = { state with signals := state.signals ++ [signal] } := by
  simp only [State.signal]

theorem issue_eq (state : State) : state.issue = ({ state with nextIssue := state.nextIssue + 1 }, state.nextIssue) := by
  simp only [State.issue]

theorem openItem_eq (state : State) (kind : OpenKind) (occurrence : Occurrence) : state.openItem kind occurrence =
    { state with
        nextIssue := state.nextIssue + 1
        openItems := state.openItems ++
          [{ id := state.nextIssue, kind, element := occurrence.element, scope := occurrence.scope, occurrence := occurrence.id }] } := by
  simp only [State.openItem, State.issue]

/-- A subscription reserves its occurrence, then issues its item. -/
theorem openSubscription_eq (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId)
    (host : Option Nat) (passive : Bool) :
    (state.openSubscription kind element scope host passive).1 =
      { (state.reserve element scope).1 with
          nextIssue := (state.reserve element scope).1.nextIssue + 1
          openItems := (state.reserve element scope).1.openItems ++
            [{ id := (state.reserve element scope).1.nextIssue, kind, element, scope
               occurrence := (state.reserve element scope).2.id, attachedTo := host, passive }] } := by
  simp only [State.openSubscription, State.issue]

/-- A scope occurrence is entered at the counter, below its parent, with its locals keyed. -/
theorem enterScope_eq (state : State) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (occurrence : Option Nat) :
    state.enterScope element parent locals occurrence =
      ({ state with
          nextIssue := state.nextIssue + 1
          scopes := state.scopes ++ [{ id := ⟨state.nextIssue⟩, element := some element, parent := some parent, occurrence }]
          variables := state.variables ++ [{ scope := ⟨state.nextIssue⟩, entries := keyed locals }] }, ⟨state.nextIssue⟩) := by
  simp only [State.enterScope, State.issue]

/-- A Call enters its called root at the counter, below its own scope occurrence, recording the instance it names and
the definition it bound; the other scope occurrences, issued before, stay as they were. -/
theorem enterCalled_eq (state : State) (program : Program) (call : Occurrence) (variables : List (String × Value))
    (definition : DefinitionRef) (fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩) :
    state.enterCalled program call variables definition =
      ({ state with
          nextIssue := state.nextIssue + 1
          scopes := state.scopes ++ [{ id := ⟨state.nextIssue⟩, element := some call.element, parent := some call.scope
                                       occurrence := some call.id
                                       calledInstance := some (State.calledInstanceId (state.instanceOf call.scope)
                                         (program.publicId call.element) call.activation) }]
          variables := state.variables ++ [{ scope := ⟨state.nextIssue⟩, entries := keyed variables }]
          slots := { state.slots with
            instances := state.slots.instances ++ [{ root := ⟨state.nextIssue⟩, definition := some definition }] } },
        ⟨state.nextIssue⟩) := by
  simp only [State.enterCalled, State.enterScope, State.issue, List.map_append, List.map_cons, List.map_nil,
    beq_self_eq_true, ite_true]
  have same : ∀ named : ScopeOccurrence → ScopeOccurrence, (∀ entry ∈ state.scopes, named entry = entry) →
      state.scopes.map named = state.scopes := fun _ kept => (List.map_congr_left kept).trans (List.map_id _)
  rw [same]
  intro entry member
  simp [fresh entry member]

theorem recordEnd_eq (state : State) (key : OccurrenceKey) (terminal : Terminal) :
    state.recordEnd key terminal = { state with draft := { state.draft with ended := state.draft.ended ++ [(key, terminal)] } } := by
  simp only [State.recordEnd]

/-- A flow token keeps its own scope occurrence busy. -/
theorem busyScope_flow (flow : FlowId) (scope : ScopeOccurrenceId) : (Token.flow flow scope).busyScope = scope := by
  simp only [Token.busyScope]

/-- A deferred begin keeps the scope occurrence it begins in busy. -/
theorem busyScope_begin (request : BeginRequest) : (Token.begin request).busyScope = request.scope := by
  simp only [Token.busyScope]

theorem deferBegins_eq (state : State) (requests : List BeginRequest) :
    state.deferBegins requests = { state with tokens := state.tokens ++ (requests.map Token.begin).reverse } := by
  simp only [State.deferBegins]

theorem emit_eq (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) :
    state.emit flows scope = { state with tokens := state.tokens ++ flows.map (Token.flow · scope) } := by
  simp only [State.emit]

theorem closeItem_eq (state : State) (id : Nat) :
    state.closeItem id = { state with openItems := state.openItems.filter (·.id != id) } := by simp only [State.closeItem]

/-- A subscription's item waits for a trigger: no effect result or incident command closes it. -/
theorem triggers_await : (∀ detail, AwaitsTrigger (.timer detail)) ∧ (∀ detail, AwaitsTrigger (.message detail)) ∧
    (∀ detail, AwaitsTrigger (.signal detail)) ∧ ∀ detail, AwaitsTrigger (.conditional detail) :=
  ⟨fun _ => ⟨rfl, rfl⟩, fun _ => ⟨rfl, rfl⟩, fun _ => ⟨rfl, rfl⟩, fun _ => ⟨rfl, rfl⟩⟩

theorem closeOwnItems_eq (state : State) (id : Nat) :
    state.closeOwnItems id = { state with openItems := state.openItems.filter (·.occurrence != id) } := by
  simp only [State.closeOwnItems]

theorem removeVariable_variables (state : State) (target : ScopeOccurrenceId) (name : String) :
    (state.removeVariable target name).variables = state.variables.map fun vars =>
      if vars.scope == target then { vars with entries := vars.entries.filter (·.1 != name) } else vars := by
  simp only [State.removeVariable]

/-! ### What the hooks read of the operations they apply -/

/-- `setVariable` changes no scope occurrence, occurrence or open item. -/
theorem setVariable_frame (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    (state.setVariable target name value).scopes = state.scopes ∧
      (state.setVariable target name value).occurrences = state.occurrences ∧
      (state.setVariable target name value).openItems = state.openItems :=
  let same := setVariable_same state target name value
  ⟨same.scopes, same.occurrences, same.openItems⟩

theorem removeVariable_frame (state : State) (target : ScopeOccurrenceId) (name : String) :
    (state.removeVariable target name).scopes = state.scopes ∧
      (state.removeVariable target name).occurrences = state.occurrences ∧
      (state.removeVariable target name).openItems = state.openItems :=
  ⟨rfl, rfl, rfl⟩

private theorem find?_stands {state : State} {current : ScopeOccurrenceId} {entry : ScopeOccurrence}
    (found : state.scopes.find? (·.id == current) = some entry) : ∃ scope ∈ state.scopes, scope.id = current :=
  ⟨entry, List.mem_of_find?_eq_some found, by simpa using List.find?_some found⟩

/-- The declaring occurrence `State.declaring?` finds stands. -/
theorem declaring?_stands {state : State} {scope found : ScopeOccurrenceId} {element : ElementId}
    (ran : state.declaring? scope element = some found) : ∃ entry ∈ state.scopes, entry.id = found := by
  unfold State.declaring? at ran
  generalize state.scopes.length = fuel at ran
  induction fuel generalizing scope with
  | zero => simp [State.declaring?.go] at ran
  | succ fuel ih =>
    simp only [State.declaring?.go] at ran
    cases search : state.scopes.find? (·.id == scope) with
    | none => simp [search] at ran
    | some entry =>
      simp only [search, Option.bind_some] at ran
      split at ran
      · cases ran; exact find?_stands search
      · split at ran
        · simp at ran
        · obtain ⟨parent, _, recursed⟩ := Option.bind_eq_some_iff.mp ran
          exact ih recursed

/-- The owner `State.owner?` finds holds a variable set. -/
theorem owner?_holds {state : State} {scope found : ScopeOccurrenceId} {name : String}
    (ran : state.owner? scope name = some found) : ∃ variables ∈ state.variables, variables.scope = found := by
  unfold State.owner? at ran
  generalize state.scopes.length = fuel at ran
  induction fuel generalizing scope with
  | zero => simp [State.owner?.go] at ran
  | succ fuel ih =>
    simp only [State.owner?.go] at ran
    split at ran
    · rename_i declares
      cases search : state.variables.find? (·.scope == scope) with
      | none => simp [search] at declares
      | some variables =>
        cases ran
        exact ⟨variables, List.mem_of_find?_eq_some search, by simpa using List.find?_some search⟩
    · split at ran
      · simp at ran
      · obtain ⟨parent, _, recursed⟩ := Option.bind_eq_some_iff.mp ran
        exact ih recursed

/-- An instance root is the process root or a scope occurrence that stands. -/
theorem instanceRoot_stands (state : State) (scope : ScopeOccurrenceId) :
    state.instanceRoot scope = State.root ∨ ∃ entry ∈ state.scopes, entry.id = state.instanceRoot scope := by
  unfold State.instanceRoot
  generalize state.scopes.length = fuel
  induction fuel generalizing scope with
  | zero => exact .inl rfl
  | succ fuel ih =>
    simp only [State.instanceRoot.go]
    split
    · rename_i called
      right
      unfold State.calledRoot at called
      cases search : state.scopes.find? (·.id == scope) with
      | none => simp [search] at called
      | some entry => exact find?_stands search
    · split
      · exact ih _
      · exact .inl rfl

/-- A start's fresh instance; `Kernel.Proofs.Step` queues its root's arming (`signal_queueSound`). -/
theorem initial_wellFormed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    WellFormed program (State.initial instanceId variables businessKey) where
  issued := ⟨by simp [State.initial], by simp [State.initial],
    by simp [State.initial, State.root]⟩
  distinct := ⟨by simp [occurrenceIds, State.initial], by simp [State.initial],
    by simp [scopeIds, State.initial], by simp [State.initial]⟩
  startedOnce := by simp [StartedOnce, starts, State.initial]
  activations := ⟨by simp [State.initial], by simp [State.initial]⟩
  reservations := by simp [ReservationsUnstarted, State.initial]
  owned := {
    occurrenceScopes := by simp [State.initial]
    itemScopes := by simp [State.initial]
    itemOccurrences := by simp [State.initial]
    attachments := by simp [State.initial]
    scopeOwners := by simp [State.initial]
    variableScopes := by simp [scopeIds, State.initial]
    tokenScopes := by simp [State.initial] }
  rooted := ⟨by simp [scopeIds, State.initial], by simp [State.initial], by
    simp only [State.initial, List.mem_singleton]
    rintro scope rfl
    exact .refl _⟩
  variables := ⟨by simp [State.initial], fun vars member => by
    simp only [State.initial, List.mem_singleton] at member
    subst member
    exact keyed_names variables⟩
  failure := by simp [FailureRecorded, State.initial]
  queue := ⟨by simp [State.initial], by simp [State.initial], by simp [State.initial], by simp [State.initial],
    by simp [State.initial]⟩
  counted := by simp [StartsCounted, starts, State.initial]
  occurrencesCounted := by simp [OccurrencesCounted, State.initial]
  ownedBelow := by simp [OwnedBelow, State.initial]
  claimed := ⟨by simp [State.initial], by simp [Queued, State.initial], by simp [Precedes, State.initial],
    by simp [Precedes, State.initial], by simp [State.initial], by simp [Queued, State.initial],
    by simp [Queued, State.initial], by simp [Queued, State.initial]⟩
  settled := ⟨by simp [State.initial], by simp [State.initial], by simp [State.initial], by simp [State.initial],
    by simp [State.initial], by simp [State.initial], by simp [State.initial]⟩
  attachedReserved := by simp [AttachedReserved, State.initial]
  typed := by simp [Typed, State.initial]

/-- The fresh instance's root was issued. -/
theorem initial_rootIssued (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    State.root.value < (State.initial instanceId variables businessKey).nextIssue := by
  simp [State.initial, State.root]

/-! ## The subtree of a scope occurrence -/

/-- What `State.subtree`'s breadth-first search keeps, from `scope`: everything it met is a present scope occurrence
within `scope`, met once, `scope` itself or a child of one it expanded; every child of one it expanded was met. -/
private structure Search (s : State) (scope : ScopeOccurrenceId) (seen frontier : List ScopeOccurrenceId) : Prop where
  present : ∀ x ∈ seen ++ frontier, x ∈ scopeIds s
  nodup : (seen ++ frontier).Nodup
  within : ∀ x ∈ seen ++ frontier, Within s x scope
  closed : ∀ p ∈ seen, ∀ child ∈ s.scopes, child.parent = some p → child.id ∈ seen ++ frontier
  reached : ∀ x ∈ seen ++ frontier, x = scope ∨ ∃ p ∈ seen, ∃ child ∈ s.scopes, child.id = x ∧ child.parent = some p

private theorem search_step {s : State} (formed : WellFormed program s) {scope next : ScopeOccurrenceId}
    {seen rest : List ScopeOccurrenceId} (search : Search s scope seen (next :: rest)) :
    Search s scope (seen ++ [next]) (rest ++ (s.scopes.filter (·.parent == some next)).map (·.id)) := by
  have perm : ((seen ++ [next]) ++ (rest ++ (s.scopes.filter (·.parent == some next)).map (·.id))).Perm
      ((seen ++ next :: rest) ++ (s.scopes.filter (·.parent == some next)).map (·.id)) := by
    simp only [List.append_assoc, List.cons_append]
    exact List.Perm.refl _
  have nextWithin := search.within next (by simp)
  have child_mem : ∀ x, x ∈ (s.scopes.filter (·.parent == some next)).map (·.id) →
      ∃ child ∈ s.scopes, child.id = x ∧ child.parent = some next := fun x member => by
    obtain ⟨child, inside, same⟩ := List.mem_map.mp member
    obtain ⟨inside, linked⟩ := List.mem_filter.mp inside
    exact ⟨child, inside, same, by simpa using linked⟩
  constructor
  · intro x member
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · exact search.present x old
    · obtain ⟨child, inside, same, _⟩ := child_mem x new
      exact List.mem_map.mpr ⟨child, inside, same⟩
  · refine perm.nodup_iff.mpr (List.nodup_append.mpr ⟨search.nodup, ?_, ?_⟩)
    · exact (formed.distinct.scopes.sublist ((List.filter_sublist).map _))
    · intro x old y new same
      subst same
      obtain ⟨child, inside, named, linked⟩ := child_mem x new
      rcases search.reached x old with first | ⟨p, seenP, found⟩
      · subst first
        exact parent_not_within formed inside linked (named ▸ nextWithin)
      · obtain ⟨other, otherInside, otherNamed, otherLinked⟩ := found
        have := scope_unique formed.distinct otherInside inside (otherNamed.trans named.symm)
        subst this
        rw [linked] at otherLinked
        cases otherLinked
        exact (List.nodup_append.mp search.nodup).2.2 _ seenP _ (by simp) rfl
  · intro x member
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · exact search.within x old
    · obtain ⟨child, inside, same, linked⟩ := child_mem x new
      exact same ▸ .parent child next scope inside linked nextWithin
  · intro p seenP child inside linked
    refine perm.mem_iff.mpr ?_
    rcases List.mem_append.mp seenP with old | new
    · exact List.mem_append_left _ (search.closed p old child inside linked)
    · simp only [List.mem_singleton] at new
      subst new
      exact List.mem_append_right _ (List.mem_map.mpr ⟨child, List.mem_filter.mpr ⟨inside, by simp [linked]⟩, rfl⟩)
  · intro x member
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · rcases search.reached x old with first | ⟨p, seenP, rest⟩
      · exact .inl first
      · exact .inr ⟨p, List.mem_append_left _ seenP, rest⟩
    · obtain ⟨child, inside, same, linked⟩ := child_mem x new
      exact .inr ⟨next, by simp, child, inside, same, linked⟩

/-- The search ends with everything it met, closed under children: its fuel outlasts the scope occurrences, since it
meets each at most once. -/
private theorem search_go {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} :
    ∀ (fuel : Nat) (seen frontier : List ScopeOccurrenceId), Search s scope seen frontier →
      s.scopes.length < fuel + seen.length →
      (∀ x ∈ seen ++ frontier, x ∈ State.subtree.go s fuel frontier seen) ∧
      (∀ x ∈ State.subtree.go s fuel frontier seen, Within s x scope) ∧
      ∀ p ∈ State.subtree.go s fuel frontier seen, ∀ child ∈ s.scopes, child.parent = some p →
        child.id ∈ State.subtree.go s fuel frontier seen
  | 0, seen, frontier, search, bound => by
    have nodup : seen.Nodup := (List.nodup_append.mp search.nodup).1
    have : seen.length ≤ s.scopes.length := by
      simpa [scopeIds] using nodup.length_le_of_subset fun x member => search.present x (List.mem_append_left _ member)
    omega
  | fuel + 1, seen, [], search, _ => by
    simp only [State.subtree.go]
    refine ⟨fun x member => by simpa using member, fun x member => search.within x (by simpa using member), ?_⟩
    intro p member child inside linked
    simpa using search.closed p member child inside linked
  | fuel + 1, seen, next :: rest, search, bound => by
    simp only [State.subtree.go]
    obtain ⟨met, within, closed⟩ := search_go formed fuel _ _ (search_step formed search) (by simp; omega)
    refine ⟨fun x member => met x ?_, within, closed⟩
    rcases List.mem_append.mp member with old | here
    · exact List.mem_append_left _ (List.mem_append_left _ old)
    · rcases List.mem_cons.mp here with rfl | later
      · exact List.mem_append_left _ (List.mem_append_right _ (List.mem_singleton.mpr rfl))
      · exact List.mem_append_right _ (List.mem_append_left _ later)

/-- In a well-formed state, the subtree of a present scope occurrence is exactly what lies within it. -/
theorem subtree_iff {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (x : ScopeOccurrenceId) : x ∈ s.subtree scope ↔ Within s x scope := by
  have initial : Search s scope [] [scope] :=
    ⟨by simpa using present, by simp, by simpa using Within.refl scope, by simp, by simp⟩
  obtain ⟨met, within, closed⟩ := search_go formed (s.scopes.length + 1) [] [scope] initial (by simp)
  exact ⟨within x, fun inside => inside.closed_mem (met scope (by simp)) closed⟩

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
and whose parentless scope occurrences are the root: its search's fuel, one step per scope occurrence, outlasts the
chain. -/
theorem instanceOf_eq {s : State} (nodup : (scopeIds s).Nodup)
    (parentless : ∀ entry ∈ s.scopes, entry.parent = none → entry.id = State.root) {x : ScopeOccurrenceId}
    {name : String} {chain : List ScopeOccurrence} (reading : InstanceIn s x name chain)
    (distinct : (chain.map (·.id)).Nodup) : s.instanceOf x = name := by
  have bound : chain.length ≤ s.scopes.length := by
    have := distinct.length_le_of_subset (l₂ := scopeIds s) fun id member => by
      obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
      exact List.mem_map.mpr ⟨entry, reading.mem entry inside, named⟩
    simpa [scopeIds] using this
  have go : ∀ fuel, chain.length ≤ fuel →
      ((s.scopes.find? (·.id == State.instanceRoot.go s fuel x)).bind (·.calledInstance)).getD s.instanceId = name := by
    clear bound distinct
    induction reading with
    | called entry name member called =>
      intro fuel enough
      obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
      simp [State.instanceRoot.go, State.calledRoot, find_entry nodup member, called]
    | up entry parent name chain member uncalled link _ ih =>
      intro fuel enough
      obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
      simp only [State.instanceRoot.go, State.calledRoot, find_entry nodup member, Option.bind_some, uncalled,
        Option.isSome_none, Bool.false_eq_true, ite_false, link]
      exact ih fuel (by simp at enough; omega)
    | root entry member uncalled orphan =>
      intro fuel enough
      obtain ⟨fuel, rfl⟩ : ∃ k, fuel = k + 1 := ⟨fuel - 1, by simp at enough; omega⟩
      have named := parentless entry member orphan
      simp only [State.instanceRoot.go, State.calledRoot, find_entry nodup member, Option.bind_some, uncalled,
        Option.isSome_none, Bool.false_eq_true, ite_false, orphan, ← named]
      simp
  exact go _ bound

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

/-- `State.reserve` in a state whose counters are keyed. -/
theorem reserve_reserves {state : State} (keyed : ActivationsKeyed state) (element : ElementId)
    (scope : ScopeOccurrenceId) :
    Reserves state (state.reserve element scope).1 element scope (state.reserve element scope).2 := by
  have activated := activate_activated keyed (state.instanceOf scope) element .element
  have instances : ∀ x, (state.reserve element scope).1.instanceOf x = state.instanceOf x :=
    instanceOf_congr (by simp [State.reserve, State.activate, State.issue])
      (by simp [State.reserve, State.activate, State.issue])
  refine ⟨by simp [State.reserve, State.activate, State.issue], by simp [State.reserve, State.activate, State.issue],
    by simp [State.reserve, State.activate, State.issue], by simp [State.reserve], by simp [State.reserve],
    by simp [State.reserve], by simp [State.reserve], ?_, by simp [State.reserve, State.activate, State.issue],
    instances, by simp [State.reserve, State.activate, State.issue], by simp [State.reserve, State.activate, State.issue],
    by simp [State.reserve, State.activate, State.issue], by simp [State.reserve, State.activate, State.issue],
    by simp [State.reserve, State.activate, State.issue], by simp [State.reserve, State.activate, State.issue],
    by simp [State.reserve, State.activate, State.issue], by simp [State.reserve, State.activate, State.issue],
    by simp [State.reserve, State.activate, State.issue]⟩
  obtain ⟨activations, above, positive⟩ := activated
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
  refine ⟨by simp [State.recordStart], ?_, by simp [State.recordStart], instances, by simp [State.recordStart],
    by simp [State.recordStart], by simp [State.recordStart], by simp [State.recordStart], by simp [State.recordStart],
    by simp [State.recordStart], by simp [State.recordStart], by simp [State.recordStart], by simp [State.recordStart],
    by simp [State.recordStart]⟩
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
    refine ⟨by simp [State.recordStart], by rw [recordStart_started], rfl, rfl,
      .inl ⟨reserved, member, same ▸ named, rfl, rfl, rfl, rfl, by simp [State.recordStart], by simp [State.recordStart]⟩,
      keeps.1, instances, by simp [State.recordStart], by simp [State.recordStart], by simp [State.recordStart],
      keeps.2.1, by simp [State.recordStart], by simp [State.recordStart], by simp [State.recordStart],
      by simp [State.recordStart]⟩
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
    refine ⟨by simp [State.recordStart, State.issue], by rw [recordStart_started]; simp [State.recordStart, State.issue],
      rfl, rfl, .inr ⟨absent, by simp [State.issue], by simp [State.recordStart, State.issue], rfl, rfl, ?_⟩,
      keeps.1, instances, by simp [State.recordStart, State.issue], by simp [State.recordStart, State.issue],
      by simp [State.recordStart, State.issue], keeps.2.1, by simp [State.recordStart, State.issue],
      by simp [State.recordStart, State.issue], by simp [State.recordStart, State.issue],
      by simp [State.recordStart, State.issue]⟩
    exact ⟨by simpa [State.recordStart, State.issue] using activated.activations, activated.above, activated.positive⟩

/-! ## Clearing a scope occurrence -/

/-- `State.clearInside` of a present scope occurrence of a well-formed state is `Cleared`. -/
theorem clearInside_cleared {s : State} (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (keep : List Nat) : Cleared s (s.clearInside scope keep) scope keep := by
  have mem := subtree_iff formed present
  have scopes : ∀ entry, entry ∈ (s.clearInside scope keep).scopes ↔ entry ∈ s.scopes ∧ ¬ StrictlyWithin s entry.id scope := by
    intro entry
    simp [State.clearInside, State.recordCancelled, mem, StrictlyWithin]
  have fewer : (s.clearInside scope keep).scopes.Sublist s.scopes := List.filter_sublist
  refine ⟨scopes, fun occurrence => ?_, fun item => ?_, fun token => ?_, fun variables => ?_,
    fewer, List.filter_sublist, List.filter_sublist, List.filter_sublist, List.filter_sublist, fun x member => ?_,
    rfl, rfl, rfl, rfl, rfl, rfl, rfl, ⟨fun _ member => ?_, fun _ member => ?_, fun _ member => ?_⟩⟩
  rotate_left 4
  · obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    obtain ⟨old, outside⟩ := (scopes entry).mp inside
    refine named ▸ instanceOf_kept formed (formed.distinct.scopes.sublist (fewer.map _))
      (fun entry member orphan => (formed.rooted.2.1 entry (fewer.subset member)).mp orphan) rfl
      (List.mem_map.mpr ⟨entry, old, rfl⟩) fun above upper within => (scopes above).mpr ⟨upper, fun ⟨inner, other⟩ => ?_⟩
    have entryInside : Within s entry.id scope := within.trans inner
    refine outside ⟨entryInside, fun same => other ?_⟩
    rw [same] at within
    exact Within.antisymm formed (List.mem_map.mpr ⟨above, upper, rfl⟩) inner within
  iterate 3
    · simp only [State.clearInside, State.recordCancelled, FeatureSlots.clear] at member
      exact (List.mem_filter.mp member).1
  all_goals simp [State.clearInside, State.recordCancelled, mem, StrictlyWithin]

/-! ## Removing occurrences -/

/-- `State.subtree` reads only the scope occurrences. -/
theorem subtree_congr {s t : State} (scopes : t.scopes = s.scopes) (scope : ScopeOccurrenceId) :
    t.subtree scope = s.subtree scope := by
  have go : ∀ fuel frontier seen, State.subtree.go t fuel frontier seen = State.subtree.go s fuel frontier seen := by
    intro fuel
    induction fuel with
    | zero => intro frontier seen; simp [State.subtree.go]
    | succ fuel ih => intro frontier seen; cases frontier <;> simp [State.subtree.go, scopes, ih]
  simp [State.subtree, go, scopes]

/-- `State.leaveScope` clears the scope occurrence, then removes it and its variable set, and keeps the instance. -/
theorem leaveScope_eq (s : State) (scope : ScopeOccurrenceId) :
    s.leaveScope scope = { s.clearInside scope with
      scopes := (s.clearInside scope).scopes.filter (·.id != scope)
      variables := (s.clearInside scope).variables.filter (·.scope != scope)
      slots := (s.leaveScope scope).slots } ∧
    (s.leaveScope scope).instanceId = s.instanceId := by
  simp [State.leaveScope, State.clearInside, State.recordCancelled]

/-- Leaving a scope occurrence keeps the slots its clearing leaves but the retained compensation records. -/
theorem leaveScope_slots (s : State) (scope : ScopeOccurrenceId) :
    (s.leaveScope scope).slots.parked = (s.clearInside scope).slots.parked ∧
      (s.leaveScope scope).slots.multiInstances = (s.clearInside scope).slots.multiInstances ∧
      (s.leaveScope scope).slots.compensation.runs = (s.clearInside scope).slots.compensation.runs := by
  simp [State.leaveScope]

/-- `State.removeOccurrence` leaves the scope occurrences the occurrence owns after removing its record. -/
theorem removeOccurrence_eq (s : State) (id : Nat) :
    s.removeOccurrence id =
      (s.scopes.filter (·.occurrence == some id)).foldl (fun t entry => t.leaveScope entry.id) (withoutRecord s id) := by
  simp [State.removeOccurrence, withoutRecord]

/-- Leaving a scope occurrence that holds no record `id` commutes with removing the record. -/
theorem leaveScope_withoutRecord (s : State) (id : Nat) (scope : ScopeOccurrenceId)
    (apart : ∀ occurrence ∈ s.occurrences, occurrence.id = id → occurrence.scope ∉ s.subtree scope) :
    (withoutRecord s id).leaveScope scope = withoutRecord (s.leaveScope scope) id := by
  have tree : (withoutRecord s id).subtree scope = s.subtree scope := subtree_congr (s := s) (t := withoutRecord s id) rfl scope
  have same : ∀ current ∈ (s.subtree scope).reverse,
      ((s.occurrences.filter (·.id != id)).filter fun occurrence =>
        occurrence.scope == current && !([] : List Nat).contains occurrence.id) =
      s.occurrences.filter fun occurrence => occurrence.scope == current && !([] : List Nat).contains occurrence.id := by
    intro current inside
    rw [List.filter_filter]
    refine List.filter_congr fun occurrence member => ?_
    by_cases named : occurrence.id = id
    · have outside := apart occurrence member named
      have : occurrence.scope ≠ current := fun equal => outside (equal ▸ List.mem_reverse.mp inside)
      simp [this]
    · simp [named]
  have removed := congrArg List.flatten (List.map_congr_left same)
  simp only [← List.flatMap_def] at removed
  have keyOf : (withoutRecord s id).keyOf = s.keyOf := funext fun occurrence => by
    rw [keyOf_eq, keyOf_eq]
    exact key_congr (instanceOf_congr (s := s) (t := withoutRecord s id) rfl rfl _)
  simp only [State.leaveScope, State.clearInside, State.recordCancelled, tree, keyOf]
  simp only [withoutRecord]
  rw [removed]
  simp only [List.filter_filter, Bool.and_comm]

/-- `State.disarm` closes the items attached to `host` and drops the reservations they hold. -/
theorem disarm_eq (s : State) (host : Nat) : s.disarm host = { s with
    openItems := s.openItems.filter (·.attachedTo != some host)
    occurrences := s.occurrences.filter fun occurrence =>
      occurrence.begun || !(s.openItems.filter (·.attachedTo == some host)).any (·.occurrence == occurrence.id) } := by
  simp only [State.disarm]

theorem withdrawInside_eq (s : State) (scope : ScopeOccurrenceId) :
    s.withdrawInside scope = { s with openItems := s.openItems.filter (!(s.subtree scope).contains ·.scope) } := by
  simp only [State.withdrawInside]

theorem withdrawOccurrence_eq (s : State) (id : Nat) :
    s.withdrawOccurrence id = (((s.closeOwnItems id).disarm id).scopes.filter (·.occurrence == some id)).foldl
      (fun t entry => t.withdrawInside entry.id) ((s.closeOwnItems id).disarm id) := by
  simp only [State.withdrawOccurrence]

/-- `State.cancelOccurrence` of a standing occurrence withdraws its items, removes it and journals its end. -/
theorem cancelOccurrence_some {s : State} {id : Nat} {occurrence : Occurrence} (found : s.occurrence? id = some occurrence) :
    ∃ ended cancelled, s.cancelOccurrence id = { (s.withdrawOccurrence id).removeOccurrence id with
      draft := { ((s.withdrawOccurrence id).removeOccurrence id).draft with ended, cancelled } } := by
  simp only [State.cancelOccurrence, found, State.recordCancelled]
  exact ⟨_, _, rfl⟩

end Kernel.Laws.State
