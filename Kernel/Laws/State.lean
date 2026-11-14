module

public import Kernel.Laws.State.Invariant
public import Kernel.State.Removal
import all Kernel.State
import all Kernel.State.Removal

/-! # Laws of the kernel state: the operations

The lemmas about `Kernel.State`'s operations that the proof wave composes: what each does to the fields the invariant
(`Kernel.Laws.State.Invariant`) reads, and that each keeps `WellFormed` under the conditions its callers establish. This
is the one module that sees their bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)),
so the witness that the sample instance is well-formed, which reads `State.root`'s value, is here too. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Witnesses that read `State.root` -/

/-- The sample instance is well-formed. -/
theorem sample_wellFormed (kind : OpenKind) : WellFormed (sample kind) where
  issued := ⟨by simp [sample, subProcess, innerTask, outerTask], by simp [sample, innerItem, outerItem],
    by simp [sample, rootScope, childScope, processRoot, subScope]⟩
  distinct := ⟨by simp [occurrenceIds, sample, subProcess, innerTask, outerTask], by simp [sample, innerItem, outerItem],
    by simp [scopeIds, sample, rootScope, childScope, processRoot, subScope]⟩
  startedOnce := by simp [StartedOnce, sample]
  activations := ⟨by simp [sample], by simp [sample]⟩
  reservations := by simp [ReservationsUnstarted, sample, subProcess, innerTask, outerTask]
  owned := {
    occurrenceScopes := by simp [sample, scopeIds, subProcess, innerTask, outerTask, rootScope, childScope]
    itemScopes := by simp [sample, scopeIds, innerItem, outerItem, rootScope, childScope]
    itemOccurrences := by simp [sample, innerItem, outerItem, subProcess, innerTask, outerTask]
    attachments := by simp [sample, innerItem, outerItem]
    scopeOwners := by simp [sample, occurrenceIds, rootScope, childScope, subProcess, innerTask, outerTask]
    variableScopes := by simp [sample, scopeIds, rootScope, childScope]
    tokenScopes := by simp [sample] }
  rooted := ⟨by simp [scopeIds, sample, rootScope, processRoot, State.root],
    by simp [sample, rootScope, childScope, processRoot, subScope, State.root], by
      simp only [sample, List.mem_cons, List.not_mem_nil, or_false]
      rintro scope (rfl | rfl)
      · exact .refl _
      · exact sub_within⟩
  variables := ⟨by simp [sample, processRoot, subScope], by simp [sample]⟩
  failure := by simp [FailureRecorded, sample]

  queue := ⟨by simp [sample], by simp [sample], by simp [sample], by simp [sample]⟩
  counted := by simp [StartsCounted, sample]
  ownedBelow := by
    simp only [OwnedBelow, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro scope (rfl | rfl) occurrence (rfl | rfl | rfl) owner <;>
      simp_all [rootScope, childScope, subProcess, innerTask, outerTask]

/-- A second parentless scope breaks `Rooted`. -/
theorem forest_rejected (kind : OpenKind) :
    ¬ Rooted { sample kind with scopes := [rootScope, { childScope with parent := none }] } := by
  rintro ⟨_, parentless, _⟩
  have second := (parentless { childScope with parent := none } (by simp)).mp rfl
  simp [childScope, subScope, State.root] at second

/-- A lone parentless scope occurrence other than `State.root` breaks `Rooted`. -/
theorem foreign_root_rejected (kind : OpenKind) : ¬ Rooted { sample kind with scopes := [{ rootScope with id := ⟨7⟩ }] } := by
  rintro ⟨present, _, _⟩
  simp [scopeIds, State.root] at present


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

/-- What `WellFormed` reads besides the variable sets: `setVariable` and `removeVariable` keep all of it. -/
structure SameButVariables (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  journal : after.journal = before.journal
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure
  signals : after.signals = before.signals

/-- `setVariable` changes only the variable sets and the write log. -/
private theorem setVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    SameButVariables state (state.setVariable target name value) := by
  unfold State.setVariable
  dsimp only
  split <;> split <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- The variable sets after `setVariable`: the target's set rebinds or appends the name, or a new set holds it. -/
private theorem setVariable_variables (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
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

/-- Rebinding or appending a name keeps a set's names distinct. -/
private theorem names_after_set (entries : List (String × Value)) (name : String) (value : Value)
    (nodup : (entries.map (·.1)).Nodup) :
    ((if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
      else entries ++ [(name, value)]).map (·.1)).Nodup := by
  split
  · rename_i present
    have same : ((entries.map fun entry => if entry.1 == name then (name, value) else entry).map (·.1)) =
        entries.map (·.1) := by
      simp only [List.map_map]
      apply List.map_congr_left
      intro entry _
      by_cases targeted : entry.1 = name <;> simp [targeted]
    rw [same]; exact nodup
  · rename_i absent
    simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
    rw [List.map_append, List.nodup_append]
    refine ⟨nodup, by simp, ?_⟩
    intro first member second other
    simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    subst other; subst named
    exact fun targeted => absent entry inside targeted

/-- `setVariable` keeps the variable sets keyed, whichever scope occurrence it writes to. -/
theorem setVariable_variablesKeyed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (keyed : VariablesKeyed state) : VariablesKeyed (state.setVariable target name value) := by
  constructor
  · rw [setVariable_variables]
    split
    · rw [List.map_map]
      have same : ((·.scope) ∘ fun (vars : ScopeVariables) => if vars.scope == target then
          { vars with entries := if vars.entries.any (·.1 == name) then
              vars.entries.map fun entry => if entry.1 == name then (name, value) else entry
            else vars.entries ++ [(name, value)] } else vars) = (·.scope) := by
        funext vars
        by_cases targeted : vars.scope = target <;> simp [targeted]
      rw [same]; exact keyed.scopes
    · rename_i absent
      simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
      rw [List.map_append, List.nodup_append]
      refine ⟨keyed.scopes, by simp, ?_⟩
      intro first member second other
      simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
      obtain ⟨vars, inside, located⟩ := List.mem_map.mp member
      subst other; subst located
      exact fun targeted => absent vars inside targeted
  · intro vars member
    rw [setVariable_variables] at member
    split at member
    · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
      subst made
      by_cases targeted : old.scope = target
      · simp only [targeted, beq_self_eq_true, ite_true]
        exact names_after_set old.entries name value (keyed.names old inside)
      · simp only [beq_iff_eq, targeted, ite_false]
        exact keyed.names old inside
    · rcases List.mem_append.mp member with old | fresh
      · exact keyed.names vars old
      · simp only [List.mem_singleton] at fresh
        subst fresh
        simp

/-- A state that differs from a well-formed one only in its variable sets is well-formed when every set belongs to a
present scope occurrence and the sets stay keyed. -/
theorem WellFormed.ofVariables {before after : State} (formed : WellFormed before) (same : SameButVariables before after)
    (located : ∀ variables ∈ after.variables, variables.scope ∈ scopeIds after) (keyed : VariablesKeyed after) :
    WellFormed after where
  issued := ⟨by simpa [same.occurrences, same.nextIssue] using formed.issued.occurrences,
    by simpa [same.openItems, same.nextIssue] using formed.issued.items,
    by simpa [same.scopes, same.nextIssue] using formed.issued.scopes⟩
  distinct := ⟨by simpa [occurrenceIds, same.occurrences] using formed.distinct.occurrences,
    by simpa [same.openItems] using formed.distinct.items, by simpa [scopeIds, same.scopes] using formed.distinct.scopes⟩
  startedOnce := by simpa [StartedOnce, same.journal, same.draft] using formed.startedOnce
  activations := ⟨by simpa [same.activations] using formed.activations.keys,
    by simpa [same.activations] using formed.activations.positive⟩
  reservations := by simpa [ReservationsUnstarted, same.occurrences, same.journal, same.draft] using formed.reservations
  owned := {
    occurrenceScopes := by simpa [scopeIds, same.occurrences, same.scopes] using formed.owned.occurrenceScopes
    itemScopes := by simpa [scopeIds, same.openItems, same.scopes] using formed.owned.itemScopes
    itemOccurrences := by simpa [same.openItems, same.occurrences] using formed.owned.itemOccurrences
    attachments := by simpa [occurrenceIds, same.openItems, same.occurrences] using formed.owned.attachments
    scopeOwners := by simpa [occurrenceIds, same.scopes, same.occurrences] using formed.owned.scopeOwners
    variableScopes := located
    tokenScopes := by simpa [scopeIds, same.tokens, same.scopes] using formed.owned.tokenScopes }
  rooted := by
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, same.scopes] using present, by simpa [same.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr same.scopes (reach scope (same.scopes ▸ member))
  variables := keyed
  failure := by simpa [FailureRecorded, same.failure, same.status] using formed.failure
  queue := by
    obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    exact ⟨by simpa [same.signals, same.nextIssue] using arm, by simpa [same.signals, same.nextIssue] using armScope,
      by simpa [same.signals, same.nextIssue] using armGateway, by simpa [same.signals] using ends⟩
  counted := by simpa [StartsCounted, same.journal, same.draft, same.activations] using formed.counted
  ownedBelow := by simpa [OwnedBelow, same.scopes, same.occurrences] using formed.ownedBelow


/-- `setVariable` keeps a state well-formed when the scope occurrence it writes to is present. -/
theorem setVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (formed : WellFormed state) (present : target ∈ scopeIds state) :
    WellFormed (state.setVariable target name value) := by
  have same := setVariable_same state target name value
  refine formed.ofVariables same ?_ (setVariable_variablesKeyed formed.variables)
  intro vars member
  rw [scopeIds, same.scopes]
  rw [setVariable_variables] at member
  split at member
  · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    by_cases targeted : old.scope = target <;> simpa [targeted, scopeIds] using this
  · rcases List.mem_append.mp member with old | fresh
    · exact formed.owned.variableScopes vars old
    · simp only [List.mem_singleton] at fresh
      subst fresh
      exact present

/-- `removeVariable` changes only the variable sets and the write log. -/
private theorem removeVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) :
    SameButVariables state (state.removeVariable target name) :=
  ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- `removeVariable` keeps a state well-formed. -/
theorem removeVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String}
    (formed : WellFormed state) : WellFormed (state.removeVariable target name) := by
  refine formed.ofVariables (removeVariable_same state target name) ?_ ⟨?_, ?_⟩
  · intro vars member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    by_cases targeted : old.scope = target <;> simpa [State.removeVariable, targeted, scopeIds] using this
  · have same : ((state.removeVariable target name).variables.map (·.scope)) = state.variables.map (·.scope) := by
      simp only [State.removeVariable, List.map_map]
      apply List.map_congr_left
      intro vars _
      by_cases targeted : vars.scope = target <;> simp [targeted]
    rw [same]; exact formed.variables.scopes
  · intro vars member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have nodup := formed.variables.names old inside
    by_cases targeted : old.scope = target
    · simp only [targeted, beq_self_eq_true, ite_true]
      exact nodup.sublist ((List.filter_sublist).map _)
    · simp only [beq_iff_eq, targeted, ite_false]
      exact nodup

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

/-- `beginOccurrence` holds the occurrence it begins. -/
theorem beginOccurrence_mem (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).2 ∈ (state.beginOccurrence request role sourceType).1.occurrences := by
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

/-! ## The phases of `Step`

That each phase `Step` runs itself keeps `WellFormed` (`Laws.Step.Phases`, which `Kernel.Proofs.State` assembles). -/

/-- `Step.onRunning` starts an input from an empty journal and outbox. -/
theorem reset_wellFormed {s : State} (formed : WellFormed s) : WellFormed { s with journal := [], outbox := [] } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ => id, fun _ => id, fun fact member => by
      simp only [starts, List.flatMap_nil, List.nil_append] at member; exact List.mem_append_right _ member⟩
    (formed.startedOnce.sublist ((List.sublist_append_right _ _).map _))

/-- `Step.advanceClock` moves the logical time. -/
theorem clock_wellFormed {s : State} (formed : WellFormed s) (atMs : Nat) : WellFormed { s with logicalTimeMs := atMs } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ => id, fun _ => id, fun _ => id⟩ formed.startedOnce

/-- `Step.orderJournal` puts the journal in run order. -/
theorem runOrder_wellFormed {s : State} (formed : WellFormed s) : WellFormed { s with journal := s.journal.reverse } :=
  have perm : (starts { s with journal := s.journal.reverse }).Perm (starts s) :=
    ((List.reverse_perm _).flatMap_right _).append_right _
  formed.permuted ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ => id, fun _ => id, fun _ => perm.mem_iff.mp⟩ perm

/-- `Step.conclude` journals the draft, whose start facts the transition carries, and empties it and the write log. -/
theorem journal_wellFormed {s : State} (formed : WellFormed s) {transition : Transition}
    (started : transition.started = s.draft.started) :
    WellFormed { s with journal := transition :: s.journal, draft := {}, writes := [] } :=
  have perm : (starts { s with journal := transition :: s.journal, draft := {}, writes := [] }).Perm (starts s) := by
    simp only [starts, List.flatMap_cons, started, List.append_nil]
    exact List.perm_append_comm
  formed.permuted ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ => id, fun _ => id, fun _ => perm.mem_iff.mp⟩ perm

/-- `State.recordEnd` journals an end fact. -/
theorem recordEnd_wellFormed {s : State} (formed : WellFormed s) (key : OccurrenceKey) (terminal : Terminal) :
    WellFormed (s.recordEnd key terminal) :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ => id, fun _ => id, fun _ => id⟩ formed.startedOnce

/-- The closure takes queued signals off the queue. -/
theorem dequeue_wellFormed {s : State} (formed : WellFormed s) {signals : List Signal} (fewer : signals.Sublist s.signals) :
    WellFormed { s with signals } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ => id, fun _ member => fewer.subset member, fun _ => id⟩
    formed.startedOnce

/-- The closure takes its next token off the work stack. -/
theorem untoken_wellFormed {s : State} (formed : WellFormed s) {tokens : List Token} (fewer : tokens.Sublist s.tokens) :
    WellFormed { s with tokens } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, .refl _, fun _ member => fewer.subset member, fun _ => id, fun _ => id⟩
    formed.startedOnce

/-- `State.closeOwnItems` closes the items waiting for an occurrence. -/
theorem closeOwnItems_wellFormed {s : State} (formed : WellFormed s) (occurrence : Nat) :
    WellFormed (s.closeOwnItems occurrence) :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, List.filter_sublist, fun _ => id, fun _ => id, fun _ => id⟩
    formed.startedOnce

/-- Queuing a signal keeps a state well-formed when the queue stays sound. -/
theorem signal_wellFormed {s : State} {signal : Signal} (formed : WellFormed s) (queue : QueueSound (s.signal signal)) :
    WellFormed (s.signal signal) where
  issued := ⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member => Within.congr (s := s) (t := s.signal signal) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := queue
  counted := formed.counted
  ownedBelow := formed.ownedBelow

/-- A queued signal keeps the queue sound when, should it be an arming, what it names was issued, and, should it be an
instance end, it records a failure exactly when it fails. Which signal it is, `Kernel.Proofs.Step` tells, since only
`Signal`'s owners may tell its constructors apart. -/
theorem signal_queueSound {s : State} {signal : Signal} (formed : WellFormed s)
    (arm : ∀ host element scope, signal = .arm host element scope → host < s.nextIssue ∧ scope.value < s.nextIssue)
    (armScope : ∀ scope, signal = .armScope scope → scope.value < s.nextIssue)
    (armGateway : ∀ occurrence gateway scope, signal = .armGateway occurrence gateway scope →
      occurrence < s.nextIssue ∧ scope.value < s.nextIssue)
    (ends : ∀ status failure, signal = .endInstance status failure → (failure.isSome = true ↔ status = .failed)) :
    QueueSound (s.signal signal) where
  arm host element scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.arm host element scope old
    · exact arm host element scope (List.mem_singleton.mp new).symm
  armScope scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.armScope scope old
    · exact armScope scope (List.mem_singleton.mp new).symm
  armGateway occurrence gateway scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.armGateway occurrence gateway scope old
    · exact armGateway occurrence gateway scope (List.mem_singleton.mp new).symm
  ends status failure queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.ends status failure old
    · exact ends status failure (List.mem_singleton.mp new).symm

/-- A start's fresh instance; `Kernel.Proofs.Step` queues its root's arming (`signal_queueSound`). -/
theorem initial_wellFormed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    WellFormed (State.initial instanceId variables businessKey) where
  issued := ⟨by simp [State.initial], by simp [State.initial],
    by simp [State.initial, State.root]⟩
  distinct := ⟨by simp [occurrenceIds, State.initial], by simp [State.initial],
    by simp [scopeIds, State.initial]⟩
  startedOnce := by simp [StartedOnce, State.initial]
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
  queue := ⟨by simp [State.initial], by simp [State.initial], by simp [State.initial], by simp [State.initial]⟩
  counted := by simp [StartsCounted, State.initial]
  ownedBelow := by simp [OwnedBelow, State.initial]

/-- The fresh instance's root was issued. -/
theorem initial_rootIssued (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    State.root.value < (State.initial instanceId variables businessKey).nextIssue := by
  simp [State.initial, State.root]

/-- An occurrence's scope occurrence stands. -/
theorem housed_wellFormed {s : State} (formed : WellFormed s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) : ∃ entry ∈ s.scopes, entry.id = occurrence.scope :=
  List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)

/-! ## The subtree of a scope occurrence -/

/-- What `State.subtree`'s breadth-first search keeps, from `scope`: everything it met is a present scope occurrence
within `scope`, met once, `scope` itself or a child of one it expanded; every child of one it expanded was met. -/
private structure Search (s : State) (scope : ScopeOccurrenceId) (seen frontier : List ScopeOccurrenceId) : Prop where
  present : ∀ x ∈ seen ++ frontier, x ∈ scopeIds s
  nodup : (seen ++ frontier).Nodup
  within : ∀ x ∈ seen ++ frontier, Within s x scope
  closed : ∀ p ∈ seen, ∀ child ∈ s.scopes, child.parent = some p → child.id ∈ seen ++ frontier
  reached : ∀ x ∈ seen ++ frontier, x = scope ∨ ∃ p ∈ seen, ∃ child ∈ s.scopes, child.id = x ∧ child.parent = some p

private theorem search_step {s : State} (formed : WellFormed s) {scope next : ScopeOccurrenceId}
    {seen rest : List ScopeOccurrenceId} (search : Search s scope seen (next :: rest)) :
    Search s scope (seen ++ [next]) (rest ++ (s.scopes.filter (·.parent == some next)).map (·.id)) := by
  have perm : ((seen ++ [next]) ++ (rest ++ (s.scopes.filter (·.parent == some next)).map (·.id))).Perm
      ((seen ++ next :: rest) ++ (s.scopes.filter (·.parent == some next)).map (·.id)) := by
    simp only [List.append_assoc, List.singleton_append, List.cons_append]
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
private theorem search_go {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} :
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

/-- What lies within `scope` belongs to every set that holds `scope` and the children of its members. -/
theorem Within.closed_mem {s : State} {scope x : ScopeOccurrenceId} {set : List ScopeOccurrenceId} (inside : Within s x scope)
    (start : scope ∈ set) (closed : ∀ p ∈ set, ∀ child ∈ s.scopes, child.parent = some p → child.id ∈ set) : x ∈ set := by
  induction inside with
  | refl => exact start
  | parent child parent _ member link _ ih => exact closed parent (ih start) child member link

/-- In a well-formed state, the subtree of a present scope occurrence is exactly what lies within it. -/
theorem subtree_iff {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (x : ScopeOccurrenceId) : x ∈ s.subtree scope ↔ Within s x scope := by
  have initial : Search s scope [] [scope] :=
    ⟨by simpa using present, by simp, by simpa using Within.refl scope, by simp, by simp⟩
  obtain ⟨met, within, closed⟩ := search_go formed (s.scopes.length + 1) [] [scope] initial (by simp)
  exact ⟨within x, fun inside => inside.closed_mem (met scope (by simp)) closed⟩

/-! ## Clearing a scope occurrence -/

/-- `State.clearInside` of a present scope occurrence of a well-formed state is `Cleared`. -/
theorem clearInside_cleared {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (keep : List Nat) : Cleared s (s.clearInside scope keep) scope keep := by
  have mem := subtree_iff formed present
  refine ⟨fun entry => ?_, fun occurrence => ?_, fun item => ?_, fun token => ?_, fun variables => ?_,
    List.filter_sublist, List.filter_sublist, List.filter_sublist, List.filter_sublist, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩
  all_goals simp [State.clearInside, State.recordCancelled, mem, StrictlyWithin]

/-- Clearing a present scope occurrence keeps a state well-formed under `Cleared.wellFormed`'s conditions on what it
keeps and what it leaves hanging. -/
theorem clearInside_wellFormed {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} {keep : List Nat}
    (present : scope ∈ scopeIds s)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin s occurrence.scope scope)
    (attached : ∀ item ∈ s.openItems, (¬ Within s item.scope scope ∨ item.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ s.occurrences, occurrence.id = host →
        ¬ Within s occurrence.scope scope ∨ host ∈ keep) :
    WellFormed (s.clearInside scope keep) :=
  (clearInside_cleared formed present keep).wellFormed formed present kept attached

/-- `Step.endInstance`: the instance root cleared, with a failure exactly when the instance fails. Every scope
occurrence lies within the root, so nothing is kept and nothing is left hanging. -/
theorem endInstance_wellFormed {s : State} (formed : WellFormed s) {status : InstanceStatus}
    {failure : Option InstanceFailure} (recorded : failure.isSome = true ↔ status = .failed) :
    WellFormed { s.clearInside State.root with status, failure } := by
  obtain ⟨rootPresent, _, reach⟩ := formed.rooted
  refine (clearInside_wellFormed formed rootPresent (fun _ _ none => by simp at none) ?_).withStatus recorded
  intro item member left
  obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.itemScopes item member)
  rcases left with outside | none
  · exact absurd (named ▸ reach entry inside) outside
  · simp at none

end Kernel.Laws.State
