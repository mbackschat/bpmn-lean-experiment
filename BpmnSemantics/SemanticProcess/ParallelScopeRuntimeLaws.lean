module

public import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
import BpmnSemantics.SemanticProcess.CollectionOrder

/-! # Parallel scope runtime laws

The preservation laws of Parallel Multi-Instance population entry and retirement, apart from the definitions in [`ParallelScopeRuntime`](ParallelScopeRuntime.lean): a proof edit here rebuilds only the proofs that consume these laws ([interface fanout](../../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract)).
-/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- PMIS-DATA-01: issuing siblings cannot make an earlier body's locals visible to later input mappings. -/
theorem issueParallelBodies_preserves_process {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.variables.process = state.variables.process := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; rfl
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact (ih generated).trans (initializeScopeVariables_preserves_other_data initialized).1

/-- PMIS-ENTER-01 preserves the collection's multiplicity and assigns consecutive immutable indices. -/
theorem issueParallelBodies_preserves_items_and_indices {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    iterations.map (·.item) = items ∧ iterations.map (·.loopCounter) = List.range' index items.length := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      obtain ⟨itemsEqual, indicesEqual⟩ := ih generated
      simp [itemsEqual, indicesEqual, List.range']

/-- PMIS-DATA-01 covers the complete atomic entry, including empty populations and the outer controller. -/
theorem enterParallelScope_preserves_process {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result) :
    result.variables.process = state.variables.process := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    rfl
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
        cases Option.some.inj installed
        have frame := issueParallelBodies_preserves_process generated
        exact frame

private theorem cancelParallelBody_preserves_process (state : RuntimeState) (scope : ScopeOccurrenceId) :
    (cancelScopeSubtree state scope .remove).variables.process = state.variables.process := rfl

private theorem cancelParallelBodies_preserves_process (iterations : List ParallelScopeIteration)
    (state : RuntimeState) :
    (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).variables.process =
      state.variables.process := by
  induction iterations generalizing state with
  | nil => rfl
  | cons iteration rest ih => exact ih (cancelScopeSubtree state iteration.scope .remove)

/-- PMIS-END-01/PMIS-CANCEL-01 dispose body-local data without rolling back committed Process writes. -/
theorem completeParallelScope_preserves_process {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result) :
    result.variables.process = state.variables.process := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have frame := removeScopeVariables_preserves_other_data removed
  cases retirement <;> cases Option.some.inj completed <;>
    simpa only [cancelParallelBodies_preserves_process, cancelParallelBody_preserves_process] using frame.1

private theorem scopeCounter_insert_missing (scopeId : DefinitionScopeId) (count : Nat)
    (values : List ScopeActivation) (absent : ∀ value ∈ values, value.scopeId ≠ scopeId) :
    (((canonicalInsertBy scopeActivationBefore ⟨scopeId, count⟩ values).find?
      fun value => decide (value.scopeId = scopeId)).map (·.count)).getD 0 = count := by
  induction values with
  | nil => simp [canonicalInsertBy]
  | cons current rest ih =>
      have different := absent current (by simp)
      have restAbsent : ∀ value ∈ rest, value.scopeId ≠ scopeId :=
        fun value member => absent value (by simp [member])
      simp only [canonicalInsertBy]
      split
      · simp
      · simpa [different] using ih restAbsent

private theorem scopeCounter_set (state : RuntimeState) (scopeId : DefinitionScopeId) (count : Nat) :
    scopeActivationCount { state with scopeActivations := setScopeActivationCount state.scopeActivations scopeId count }
      scopeId = count := by
  unfold scopeActivationCount setScopeActivationCount
  apply scopeCounter_insert_missing
  intro value member equal
  have different := (List.mem_filter.mp member).2
  simp [equal] at different

/-- PMIS-ENTER-01 allocates one fresh ordinal per body, independently of item equality. -/
theorem issueParallelBodies_scope_ordinals {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    iterations.map (·.scope.activation) = List.range' (scopeActivationCount state entry.childScopeId + 1) items.length ∧
    scopeActivationCount result entry.childScopeId = scopeActivationCount state entry.childScopeId + items.length := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      obtain ⟨ordinals, count⟩ := ih generated
      have updated := scopeCounter_set state entry.childScopeId (scopeActivationCount state entry.childScopeId + 1)
      simp only [scopeActivationCount] at updated
      simp only [scopeActivationCount] at ordinals count ⊢
      simp only [updated] at ordinals count
      constructor
      · simpa [List.range'] using congrArg
          (List.cons (scopeActivationCount state entry.childScopeId + 1)) ordinals
      · simpa [Nat.add_assoc, Nat.add_comm 1] using count

/-- PMIS-ENTER-01: equal item values cannot alias the generated body identities. -/
theorem issueParallelBodies_distinct_scopes {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    (iterations.map (·.scope)).Nodup := by
  have ordinals := (issueParallelBodies_scope_ordinals issued).1
  have unique : (iterations.map (·.scope.activation)).Nodup := by
    rw [ordinals]
    exact List.nodup_range'
  apply List.Pairwise.of_map (S := fun a b : Nat => a ≠ b) ScopeOccurrenceId.activation
    (fun _ _ different equal => different (congrArg ScopeOccurrenceId.activation equal))
  simpa only [List.map_map, Function.comp_def] using List.nodup_iff_pairwise_ne.mp unique

/-- PMIS-ENTER-01 adds exactly the generated bodies under their parent, preserving existing occurrences with multiplicity. -/
theorem issueParallelBodies_scope_population {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.scopeOccurrences.Perm
      (iterations.map (fun iteration => (⟨iteration.scope, some parent⟩ : RuntimeScopeOccurrence)) ++ state.scopeOccurrences) := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      let child : ScopeOccurrenceId := ⟨parent.processInstanceId, entry.childScopeId,
        scopeActivationCount state entry.childScopeId + 1⟩
      have inserted : (insertScopeOccurrence ⟨child, some parent⟩ state.scopeOccurrences).Perm
          (⟨child, some parent⟩ :: state.scopeOccurrences) := by
        have filterAll (values : List RuntimeScopeOccurrence) : values.filter (fun _ => true) = values :=
          List.filter_eq_self.mpr (by intros; rfl)
        simpa only [insertScopeOccurrence, filterAll] using filter_canonicalInsertBy_perm scopeOccurrenceBefore
          (fun _ => true) ⟨child, some parent⟩ state.scopeOccurrences rfl
      exact (ih generated).trans ((List.Perm.append_left _ inserted).trans List.perm_middle)

/-- PMIS-ENTER-01 keeps every generated body in the selected definition and Process instance. -/
theorem issueParallelBodies_scope_domain {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    ∀ iteration ∈ iterations, iteration.scope.processInstanceId = parent.processInstanceId ∧
      iteration.scope.definitionScopeId = entry.childScopeId := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      intro iteration member
      rcases List.mem_cons.mp member with equal | member
      · subst iteration; exact ⟨rfl, rfl⟩
      · exact ih generated iteration member

/-- PMIS-ENTER-01 produces a valid initial population when the admitted capacity and issued ordinals fit the wire bound. -/
theorem issueParallelBodies_initial_population_valid {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (id : ActivityOccurrenceId) (process : id.processInstanceId = parent.processInstanceId)
    (issued : issueParallelBodies? entry parent items 0 state = some (result, iterations))
    (nonempty : items ≠ []) (capacity : items.length ≤ 16)
    (ordinalsSafe : scopeActivationCount state entry.childScopeId + items.length ≤ SemanticProcessJson.maxSafeWireNat) :
    validParallelScopePopulation ⟨id, items.length, 0⟩ iterations = true := by
  obtain ⟨itemValues, indices⟩ := issueParallelBodies_preserves_items_and_indices issued
  have length : iterations.length = items.length := by
    have equal := congrArg List.length itemValues
    simpa using equal
  have positive : 0 < items.length := List.length_pos_iff.mpr nonempty
  have iterationNonempty : iterations ≠ [] := by
    intro empty
    simp [empty] at length
    omega
  have indexBound : ∀ iteration ∈ iterations, iteration.loopCounter < items.length := by
    intro iteration member
    have present : iteration.loopCounter ∈ List.range' 0 items.length := by
      rw [← indices]
      exact List.mem_map.mpr ⟨iteration, member, rfl⟩
    obtain ⟨index, bounded, equal⟩ := List.mem_range'.mp present
    omega
  have ordinalBound : ∀ iteration ∈ iterations, 0 < iteration.scope.activation ∧
      iteration.scope.activation ≤ SemanticProcessJson.maxSafeWireNat := by
    intro iteration member
    have present : iteration.scope.activation ∈
        List.range' (scopeActivationCount state entry.childScopeId + 1) items.length := by
      rw [← (issueParallelBodies_scope_ordinals issued).1]
      exact List.mem_map.mpr ⟨iteration, member, rfl⟩
    obtain ⟨index, bounded, equal⟩ := List.mem_range'.mp present
    simp only [Nat.one_mul] at equal
    omega
  have ordered : iterations.Pairwise (fun left right => left.loopCounter < right.loopCounter) := by
    apply List.Pairwise.of_map (S := fun a b : Nat => a < b) ParallelScopeIteration.loopCounter
      (fun _ _ ordered => ordered)
    rw [indices]
    exact List.pairwise_lt_range'
  have distinct := List.nodup_iff_pairwise_ne.mp (issueParallelBodies_distinct_scopes issued)
  have scopesDistinct : iterations.Pairwise (fun left right => left.scope ≠ right.scope) := by
    exact List.Pairwise.of_map (S := fun a b : ScopeOccurrenceId => a ≠ b)
      ParallelScopeIteration.scope (fun _ _ different => different) distinct
  have paired : iterations.Pairwise (fun left right => left.loopCounter < right.loopCounter ∧
      left.scope ≠ right.scope ∧ left.scope.definitionScopeId = right.scope.definitionScopeId) := by
    apply List.Pairwise.imp_of_mem _ (ordered.and scopesDistinct)
    intro left right leftMember rightMember facts
    exact ⟨facts.1, facts.2, (issueParallelBodies_scope_domain issued left leftMember).2.trans
      (issueParallelBodies_scope_domain issued right rightMember).2.symm⟩
  have totalSafe : items.length ≤ SemanticProcessJson.maxSafeWireNat := by
    unfold SemanticProcessJson.maxSafeWireNat
    omega
  have validIterations : validParallelScopeIterations id.processInstanceId iterations = true := by
    simp only [validParallelScopeIterations, SemanticProcessJson.isSafeWireNat,
      Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true]
    refine ⟨⟨?_, ?_⟩, paired⟩
    · cases iterations <;> simp_all
    · intro iteration member
      obtain ⟨aboveZero, safe⟩ := ordinalBound iteration member
      refine ⟨⟨⟨(issueParallelBodies_scope_domain issued iteration member).1.trans process.symm, aboveZero⟩, safe⟩, ?_⟩
      exact Nat.le_trans (Nat.le_of_lt (indexBound iteration member)) totalSafe
  simp only [validParallelScopePopulation, SemanticProcessJson.isSafeWireNat,
    Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true]
  exact ⟨⟨⟨⟨totalSafe, Nat.zero_le _⟩, ⟨positive, by simpa using length⟩⟩, validIterations⟩, indexBound⟩

private theorem issueParallelBodies_preserves_scope_uniqueness {entry : ParallelScopeEntry}
    {parent : ScopeOccurrenceId} {items : List String} {index : Nat}
    {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations))
    (distinct : (state.scopeOccurrences.map (·.id)).Nodup)
    (absent : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id.definitionScopeId ≠ entry.childScopeId) :
    (result.scopeOccurrences.map (·.id)).Nodup := by
  have population := (issueParallelBodies_scope_population issued).map RuntimeScopeOccurrence.id
  have combined : ((iterations.map (·.scope)) ++ state.scopeOccurrences.map (·.id)).Nodup := by
    apply List.nodup_append.mpr
    refine ⟨issueParallelBodies_distinct_scopes issued, distinct, ?_⟩
    intro scope member old oldMember equal
    obtain ⟨iteration, iterationMember, rfl⟩ := List.mem_map.mp member
    obtain ⟨occurrence, occurrenceMember, rfl⟩ := List.mem_map.mp oldMember
    have domain := (issueParallelBodies_scope_domain issued iteration iterationMember).2
    exact absent occurrence occurrenceMember (by rw [← equal]; exact domain)
  apply population.symm.nodup
  simpa only [List.map_append, List.map_map, Function.comp_def] using combined

/-- PMIS-ENTER-01 preserves global scope-identity uniqueness from the actual entry guard. -/
theorem enterParallelScope_preserves_scope_uniqueness {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result)
    (distinct : (state.scopeOccurrences.map (·.id)).Nodup) :
    (result.scopeOccurrences.map (·.id)).Nodup := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i admitted
  have absent : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id.definitionScopeId ≠ entry.childScopeId := by
    intro occurrence member equal
    have present : state.scopeOccurrences.any (fun value => value.id.definitionScopeId == entry.childScopeId) = true :=
      List.any_eq_true.mpr ⟨occurrence, member, by simp [equal]⟩
    simp [present] at admitted
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact distinct
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
        cases Option.some.inj installed
        have unique := issueParallelBodies_preserves_scope_uniqueness generated distinct absent
        exact unique

private theorem initializeParallelBody_frames {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {mappings : List VariableMapping} {bindings : List VariableBinding}
    (evaluated : evaluateEnclosingInputMappings variables.process.bindings mappings = some bindings)
    (initialized : initializeScopeVariables? variables owner mappings = some result) :
    result.scopes.Perm
      ((⟨owner, mergeProcessVariableBindings [] bindings⟩ : ScopeVariableScope) :: variables.scopes) := by
  unfold initializeScopeVariables? at initialized
  split at initialized
  · simp at initialized
  · simp [evaluated] at initialized
    rcases initialized with ⟨_, rfl⟩
    have filterAll (values : List ScopeVariableScope) : values.filter (fun _ => true) = values :=
      List.filter_eq_self.mpr (by intros; rfl)
    simpa only [filterAll] using filter_canonicalInsertBy_perm
      (fun left right : ScopeVariableScope => scopeOwnerBefore left.owner right.owner)
      (fun _ => true) ⟨owner, mergeProcessVariableBindings [] bindings⟩ variables.scopes rfl

/-- PMIS-DATA-01 gives each body the same pre-entry input snapshot and retains every existing local frame with multiplicity. -/
theorem issueParallelBodies_local_frames {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState}
    {iterations : List ParallelScopeIteration} {bindings : List VariableBinding}
    (evaluated : evaluateEnclosingInputMappings state.variables.process.bindings entry.bodyInputs = some bindings)
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.variables.scopes.Perm
      (iterations.map (fun iteration => (⟨iteration.scope, mergeProcessVariableBindings [] bindings⟩ : ScopeVariableScope)) ++ state.variables.scopes) := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; simp
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have processFrame := (initializeScopeVariables_preserves_other_data initialized).1
      have nextEvaluation : evaluateEnclosingInputMappings variables.process.bindings entry.bodyInputs = some bindings := by
        rw [processFrame]
        exact evaluated
      have insertion := initializeParallelBody_frames evaluated initialized
      exact (ih nextEvaluation generated).trans
        ((List.Perm.append_left _ insertion).trans List.perm_middle)

private theorem initializeParallelBody_frame_uniqueness {variables result : ScopedVariables}
    {owner : ScopeOccurrenceId} {mappings : List VariableMapping}
    (initialized : initializeScopeVariables? variables owner mappings = some result)
    (distinct : (variables.scopes.map (·.owner)).Nodup) :
    (result.scopes.map (·.owner)).Nodup := by
  have original := initialized
  unfold initializeScopeVariables? at initialized
  split at initialized
  · simp at initialized
  · rename_i absent
    obtain ⟨bindings, evaluated, _⟩ := Option.bind_eq_some_iff.mp initialized
    have fresh : owner ∉ variables.scopes.map (·.owner) := by
      intro member
      obtain ⟨frame, frameMember, identity⟩ := List.mem_map.mp member
      exact absent (List.any_eq_true.mpr ⟨frame, frameMember, by simp [identity]⟩)
    have population := (initializeParallelBody_frames evaluated original).map ScopeVariableScope.owner
    apply population.symm.nodup
    simpa only [List.map_cons] using List.nodup_cons.mpr ⟨fresh, distinct⟩

/-- PMIS-DATA-01 preserves unique local-frame ownership through arbitrary successful population issuance. -/
theorem issueParallelBodies_preserves_frame_uniqueness {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations))
    (distinct : (state.variables.scopes.map (·.owner)).Nodup) :
    (result.variables.scopes.map (·.owner)).Nodup := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; exact distinct
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, initialized, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      exact ih generated (initializeParallelBody_frame_uniqueness initialized distinct)

/-- PMIS-ENTER-01/PMIS-DATA-01 extend frame ownership to the actual entry operation, including zero-item entry. -/
theorem enterParallelScope_preserves_frame_uniqueness {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result)
    (distinct : (state.variables.scopes.map (·.owner)).Nodup) :
    (result.variables.scopes.map (·.owner)).Nodup := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact distinct
  · obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
        cases Option.some.inj installed
        have unique := issueParallelBodies_preserves_frame_uniqueness generated distinct
        exact unique

/-- Issuance creates body scopes and tokens without changing enclosing control, outer population or Call ownership. -/
theorem issueParallelBodies_structural_fields {entry : ParallelScopeEntry} {parent : ScopeOccurrenceId}
    {items : List String} {index : Nat} {state result : RuntimeState} {iterations : List ParallelScopeIteration}
    (issued : issueParallelBodies? entry parent items index state = some (result, iterations)) :
    result.control = state.control ∧ result.activityOccurrences = state.activityOccurrences ∧
      result.parallelScopeControllers = state.parallelScopeControllers ∧
      result.calledProcessOccurrences = state.calledProcessOccurrences := by
  induction items generalizing state index iterations with
  | nil => simp [issueParallelBodies?] at issued; rcases issued with ⟨rfl, rfl⟩; exact ⟨rfl, rfl, rfl, rfl⟩
  | cons item items ih =>
    unfold issueParallelBodies? at issued
    obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
    obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
    cases Option.some.inj issued
    have frame := ih generated
    exact frame

private theorem uniqueKeyFilter {α β : Type} [BEq β] [LawfulBEq β]
    (values : List α) (keyOf : α → β) (key : β)
    (unique : (values.map keyOf).Nodup) (present : key ∈ values.map keyOf) :
    ∃ value, values.filter (fun value => keyOf value == key) = [value] ∧ keyOf value = key := by
  induction values with
  | nil => simp at present
  | cons first rest ih =>
    obtain ⟨absent, unique⟩ := List.nodup_cons.mp unique
    by_cases same : keyOf first = key
    · have empty : rest.filter (fun value => keyOf value == key) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro value member equal
        have identity : keyOf value = key := by simpa using equal
        exact absent (List.mem_map.mpr ⟨value, member, identity.trans same.symm⟩)
      exact ⟨first, by simp [same, empty], same⟩
    · have tail : key ∈ rest.map keyOf := by simpa [same, Ne.symm same] using present
      obtain ⟨value, filtered, identity⟩ := ih unique tail
      exact ⟨value, by simp [same, filtered], identity⟩

/-- PMIS-ENTER-01 installs one exact binding for every child generated from an initially clean root population. -/
theorem enterParallelScope_clean_binding {entry : ParallelScopeEntry} {parent target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (entered : enterParallelScope? entry state parent = some result)
    (root : state.scopeOccurrences = [⟨parent, none⟩])
    (different : entry.childScopeId ≠ parent.definitionScopeId)
    (activities : state.activityOccurrences = []) (controllers : state.parallelScopeControllers = [])
    (locals : state.variables.scopes = []) (counter : scopeActivationCount state entry.childScopeId = 0)
    (present : ∃ occurrence ∈ result.scopeOccurrences, occurrence.id = target)
    (child : target.definitionScopeId = entry.childScopeId) :
    ∃ binding, parallelScopeBinding? entry result target = some binding := by
  have scopesUnique := enterParallelScope_preserves_scope_uniqueness entered (by simp [root])
  have framesUnique := enterParallelScope_preserves_frame_uniqueness entered (by simp [locals])
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  rename_i admitted
  have running : state.control = .running parent.processInstanceId := by
    cases control : state.control <;> simp_all
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  rename_i bounded
  split at entered
  · cases Option.some.inj entered
    obtain ⟨occurrence, member, identity⟩ := present
    have : target = parent := by
      have same := List.mem_singleton.mp (root ▸ member)
      cases same
      exact identity.symm
    exact False.elim (different (by simpa [this] using child.symm))
  · rename_i item items itemsEq
    obtain ⟨⟨issued, iterations⟩, generated, installed⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => simp at installed
    | cons first rest =>
      cases Option.some.inj installed
      obtain ⟨controlFrame, activityFrame, controllerFrame, _⟩ := issueParallelBodies_structural_fields generated
      have population := issueParallelBodies_scope_population generated
      have domain := issueParallelBodies_scope_domain generated
      have capacity : (item :: items).length ≤ 16 := by simp_all
      have safeOrdinals : scopeActivationCount state entry.childScopeId + (item :: items).length ≤ SemanticProcessJson.maxSafeWireNat := by
        rw [counter]; unfold SemanticProcessJson.maxSafeWireNat; omega
      have valid := issueParallelBodies_initial_population_valid
        (⟨parent.processInstanceId, ⟨entry.elementId.value⟩, activityActivationCount state ⟨entry.elementId.value⟩ + 1⟩)
        rfl generated (by simp) capacity safeOrdinals
      obtain ⟨occurrence, member, identity⟩ := present
      have targetMember : target ∈ (first :: rest).map (·.scope) := by
        have found := population.mem_iff.mp member
        simp only [root, List.mem_append, List.mem_map, List.mem_singleton] at found
        rcases found with ⟨iteration, found, same⟩ | same
        · exact List.mem_map.mpr ⟨iteration, found, by cases same; exact identity⟩
        · have : target = parent := by cases same; exact identity.symm
          exact False.elim (different (by simpa [this] using child.symm))
      have generatedOriginal := generated
      have bodyFrames : ∀ iteration ∈ first :: rest, (selectScopeVariables? issued.variables iteration.scope).isSome = true := by
        intro iteration found
        have frameMember : iteration.scope ∈ issued.variables.scopes.map (·.owner) := by
          unfold issueParallelBodies? at generated
          obtain ⟨variables, initialized, generated⟩ := Option.bind_eq_some_iff.mp generated
          unfold initializeScopeVariables? at initialized
          split at initialized <;> try contradiction
          obtain ⟨bindings, evaluated, _⟩ := Option.bind_eq_some_iff.mp initialized
          have framePopulation := issueParallelBodies_local_frames evaluated generatedOriginal
          have frames := framePopulation.map ScopeVariableScope.owner
          apply frames.mem_iff.mpr
          simpa only [List.map_append, List.map_map, Function.comp_def, locals, List.map_nil, List.append_nil]
            using (List.mem_map.mpr ⟨iteration, found, rfl⟩ : iteration.scope ∈ (first :: rest).map (·.scope))
        obtain ⟨frame, filtered, _⟩ := uniqueKeyFilter issued.variables.scopes ScopeVariableScope.owner iteration.scope framesUnique frameMember
        have predicates : (fun value : ScopeVariableScope => decide (value.owner = iteration.scope)) =
            (fun value => value.owner == iteration.scope) := by
          funext value
          apply Bool.eq_iff_iff.mpr
          simp
        have selected : selectScopeVariables? issued.variables iteration.scope = some frame := by
          unfold selectScopeVariables?
          rw [predicates, filtered]
        simp [selected]
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
          activation := activityActivationCount state ⟨entry.elementId.value⟩ + 1, owner := parent,
          body := .parallelChildScopes first rest, attachedHandlers := [] }
      have rootPresent : parent ∈ issued.scopeOccurrences.map (·.id) := by
        have mapped := population.map RuntimeScopeOccurrence.id
        apply mapped.mem_iff.mpr
        simp [root]
      obtain ⟨rootBody, rootFilter, _⟩ := uniqueKeyFilter issued.scopeOccurrences RuntimeScopeOccurrence.id parent scopesUnique rootPresent
      have bodiesBound : ∀ iteration ∈ first :: rest,
          parallelScopeBodyBound entry { issued with activityOccurrences := [record] } record iteration.scope = true := by
        intro iteration found
        have scopePresent : iteration.scope ∈ issued.scopeOccurrences.map (·.id) := by
          have mapped := population.map RuntimeScopeOccurrence.id
          apply mapped.mem_iff.mpr
          simp only [List.map_append, List.map_map, Function.comp_def, List.mem_append]
          exact Or.inl (List.mem_map.mpr ⟨iteration, found, rfl⟩)
        obtain ⟨body, filtered, identity⟩ := uniqueKeyFilter issued.scopeOccurrences RuntimeScopeOccurrence.id iteration.scope scopesUnique scopePresent
        have owned : body.parent = some parent := by
          have bodyMember := (List.mem_filter.mp (show body ∈ issued.scopeOccurrences.filter (fun value => value.id == iteration.scope) from by rw [filtered]; simp)).1
          have source := population.mem_iff.mp bodyMember
          simp only [root, List.mem_append, List.mem_map, List.mem_singleton] at source
          rcases source with ⟨selected, _, same⟩ | same
          · cases same; rfl
          · cases same
            have domainFact := (domain iteration found).2
            exact False.elim (different (domainFact.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId identity.symm)))
        have claimed : iteration.scope ∈ activityBodyScopeClaims record.body := by
          change iteration.scope ∈ (first :: rest).map (·.scope)
          exact List.mem_map.mpr ⟨iteration, found, rfl⟩
        simp [parallelScopeBodyBound, filtered, (domain iteration found).2, owned, record,
          bodyFrames iteration found, claimed]
      change ∃ binding, parallelScopeBinding? entry
        { issued with
          activityOccurrences := insertActivityOccurrence record issued.activityOccurrences
          activityActivations := setActivationCount issued.activityActivations ⟨entry.elementId.value⟩ record.activation
          parallelScopeControllers := issued.parallelScopeControllers ++
            [⟨⟨parent.processInstanceId, ⟨entry.elementId.value⟩, record.activation⟩, (item :: items).length, 0⟩] } target = some binding
      simp only [activityFrame, activities, controllerFrame, controllers, insertActivityOccurrence, List.nil_append]
      have targetClaimed : target ∈ activityBodyScopeClaims record.body := targetMember
      simp [parallelScopeBinding?, controlFrame, running, targetClaimed, rootFilter, parallelRuntimeActivityId, record]
      refine ⟨⟨by simp only [List.length_cons] at capacity; omega, by simpa using valid⟩, bodiesBound first (by simp), ?_⟩
      intro iteration found
      exact bodiesBound iteration (by simp [found])

private theorem cancelParallelBody_surviving_population (state : RuntimeState) (scope : ScopeOccurrenceId) :
    (cancelScopeSubtree state scope .remove).variables.scopes.Sublist state.variables.scopes ∧
    (cancelScopeSubtree state scope .remove).scopeOccurrences.Sublist state.scopeOccurrences :=
  ⟨List.filter_sublist, List.filter_sublist⟩

private theorem cancelParallelBodies_surviving_population (iterations : List ParallelScopeIteration)
    (state : RuntimeState) :
    ((iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).variables.scopes).Sublist state.variables.scopes ∧
    ((iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state).scopeOccurrences).Sublist state.scopeOccurrences := by
  induction iterations generalizing state with
  | nil => exact ⟨List.Sublist.refl _, List.Sublist.refl _⟩
  | cons iteration rest ih =>
      have tail := ih (cancelScopeSubtree state iteration.scope .remove)
      have head := cancelParallelBody_surviving_population state iteration.scope
      exact ⟨tail.1.trans head.1, tail.2.trans head.2⟩

/-- PMIS-END-01/PMIS-CANCEL-01 dispose the selected frame and never rewrite, reorder or duplicate survivors. This does not characterize all owners removed by cancellation. -/
theorem completeParallelScope_surviving_population {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result) :
    result.variables.scopes.Sublist (state.variables.scopes.filter fun frame => decide (frame.owner ≠ target)) ∧
    result.scopeOccurrences.Sublist state.scopeOccurrences := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have removedFrames : variables.scopes.Sublist
      (state.variables.scopes.filter fun frame => decide (frame.owner ≠ target)) := by
    obtain ⟨_, shape⟩ := removeScopeVariables_success_iff.mp removed
    rw [shape]
    exact List.Sublist.refl _
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;> cases Option.some.inj completed
  · exact ⟨List.filter_sublist.trans removedFrames, List.filter_sublist⟩
  · exact ⟨List.filter_sublist.trans removedFrames, List.filter_sublist⟩
  · exact ⟨(cancelParallelBodies_surviving_population (first :: rest) _).1.trans
        (List.filter_sublist.trans removedFrames),
      (cancelParallelBodies_surviving_population (first :: rest) _).2.trans
        List.filter_sublist⟩

/-- Retirement preserves both initially unique populations in all three retirement arms; cancellation cannot manufacture aliases. -/
theorem completeParallelScope_preserves_population_uniqueness {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result)
    (frames : (state.variables.scopes.map (·.owner)).Nodup)
    (scopes : (state.scopeOccurrences.map (·.id)).Nodup) :
    (result.variables.scopes.map (·.owner)).Nodup ∧ (result.scopeOccurrences.map (·.id)).Nodup := by
  have retained := completeParallelScope_surviving_population completed
  exact ⟨frames.sublist ((retained.1.trans List.filter_sublist).map _), scopes.sublist (retained.2.map _)⟩

/-- The selected body's local data cannot survive any successful retirement arm. -/
theorem completeParallelScope_disposes_target_frame {entry : ParallelScopeEntry} {target : ScopeOccurrenceId}
    {state result : RuntimeState}
    (completed : completeParallelScope? entry state target = some result) :
    ∀ frame ∈ result.variables.scopes, frame.owner ≠ target := by
  intro frame member
  have retained := (completeParallelScope_surviving_population completed).1.subset member
  exact of_decide_eq_true (List.mem_filter.mp retained).2

end BpmnSemantics.SemanticProcess
