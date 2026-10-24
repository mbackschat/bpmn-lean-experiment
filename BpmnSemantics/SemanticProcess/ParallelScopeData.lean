module

public import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
public import BpmnSemantics.SemanticProcess.MultiInstanceScopeWrite
public import BpmnSemantics.SemanticProcess.EffectCompletion

/-! PMIS-DATA-01: occurrence-bound input evaluation for parallel repeated bodies. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The selected clean root population is the entry premise of PMIS-ENTER-01, independently of parent wait and token progress. -/
def ParallelScopeCleanEntry (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (state : RuntimeState) : Prop :=
  state.scopeOccurrences = [⟨parent, none⟩] ∧ entry.childScopeId ≠ parent.definitionScopeId ∧
    state.activityOccurrences = [] ∧ state.parallelScopeControllers = [] ∧
    state.variables.scopes = [] ∧ scopeActivationCount state entry.childScopeId = 0

theorem ParallelScopeCleanEntry.frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (clean : ParallelScopeCleanEntry entry parent before)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (activities : after.activityOccurrences = before.activityOccurrences)
    (controllers : after.parallelScopeControllers = before.parallelScopeControllers)
    (locals : after.variables.scopes = before.variables.scopes)
    (counters : after.scopeActivations = before.scopeActivations) : ParallelScopeCleanEntry entry parent after := by
  simpa only [ParallelScopeCleanEntry, scopes, activities, controllers, locals, scopeActivationCount, counters] using clean

/-- Actual Start initializes the clean selected root; a distinct child has no issued scope ordinal. -/
theorem runningProgramStartState_clean_parallel_entry (program : Program) (instanceId : SemanticId)
    (values : List VariableBinding) (state : RuntimeState) (root : DefinitionScope) (entry : ParallelScopeEntry)
    (selected : rootDefinitionScope? program = some root)
    (started : runningProgramStartState? program instanceId values = some state)
    (distinct : entry.childScopeId ≠ root.id) :
    ParallelScopeCleanEntry entry ⟨instanceId, root.id, 1⟩ state := by
  simp only [runningProgramStartState?, selected, bind, Option.bind_some, pure, Option.some.injEq] at started
  subst state
  simp [ParallelScopeCleanEntry, runningStartState, initialState, emptyScopedVariables,
    scopeActivationCount, distinct, Ne.symm distinct]

/-- Initiation only issues the parent token and retains every clean-entry population premise. -/
theorem initiateState_preserves_clean_parallel_entry (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (output : ControlPlaceId) (clean : ParallelScopeCleanEntry entry parent before)
    (initiated : initiateState? before output = some after) : ParallelScopeCleanEntry entry parent after := by
  unfold initiateState? at initiated
  obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
  split at initiated <;> try contradiction
  cases Option.some.inj initiated
  exact clean

def hasParallelScopeDefinition (program : Program) (owner : ScopeOccurrenceId) : Bool :=
  (program.operations.filterMap parallelScopeEntry?).any (·.childScopeId == owner.definitionScopeId)

/-- PMIS-DATA-01 binds the exact live body before resolving local presence, captured item and Process fallback. -/
def evaluateParallelScopeInputs? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping) : Option (List VariableBinding) := do
  let [entry] := (program.operations.filterMap parallelScopeEntry?).filter
    (·.childScopeId == owner.definitionScopeId) | none
  let binding ← parallelScopeBinding? entry state owner
  let [iteration] := binding.iterations.filter (·.scope == owner) | none
  let itemContext := { state.variables with process := { bindings :=
    ⟨entry.itemName, .string iteration.item⟩ :: state.variables.process.bindings.filter (·.name != entry.itemName) } }
  let handlers := program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ effect _ => some effect.descriptor.operation
    | _ => none
  evaluateInputMappings? (fun name => if handlers.contains name then none
    else readScopeVariable? itemContext owner name) mappings

/-- PMIS-DATA-01 validates the complete population before applying the shared nearest-scope write policy. -/
def writeParallelScopeValues? (program : Program) (state : RuntimeState) (owner : ScopeOccurrenceId)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind) : Option ScopedVariables := do
  let [entry] := (program.operations.filterMap parallelScopeEntry?).filter
    (·.childScopeId == owner.definitionScopeId) | none
  let _ ← parallelScopeBinding? entry state owner
  let handlers := program.operations.filterMap fun operation => match operation with
    | .awaitEffect _ _ _ _ effect _ => some effect.descriptor.operation
    | _ => none
  writeBoundMultiInstanceScopeValues? state.variables owner entry.collectionName entry.itemName
    entry.completionBooleanName handlers values kind

/-- PMIS-DATA-01 commits exact effect disposal, explicit result mapping and body continuation together. -/
def completeParallelScopeEffect? (program : Program) (state : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (effectIdNamesWait effectId) | none
  let .success patch := result | none
  if wait.processInstanceId != wait.owner.processInstanceId || wait.bpmnErrorRoute.isSome then none
  else
    let [_activity] := state.variables.activities.filter (activityScopeMatches effectId) | none
    let projected ← serialEffectPatch? (SerialBusinessTask.programHandlers program) wait.outputMappings [] patch
    let variables ← writeParallelScopeValues? program state wait.owner (mergeProcessVariableBindings [] projected) .serviceTask
    some { state with
      variables := { variables with activities := variables.activities.filter fun scope => !activityScopeMatches effectId scope }
      effectWaits := state.effectWaits.erase wait
      tokens := addToken state.tokens wait.output wait.owner }

/-- PMIS-DATA-01 binds human writes and continuation to one exact live wait and body. -/
def completeParallelScopeUserTask? (program : Program) (state : RuntimeState)
    (taskId : UserTaskInstanceId) (values : List VariableBinding) : Option RuntimeState := do
  let [wait] := state.waits.filter ((taskIdNamesWait taskId)) | none
  if wait.processInstanceId != wait.owner.processInstanceId then none
  else
    let variables ← writeParallelScopeValues? program state wait.owner values .userTask
    some { state with waits := state.waits.erase wait, variables, tokens := addToken state.tokens wait.output wait.owner }

/-- PMIS-DATA-01 extends sibling isolation to the actual population-bound write entry point. -/
theorem writeParallelScopeValues_preserves_other_scopes {program : Program} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (written : writeParallelScopeValues? program state owner values kind = some result) :
    result.scopes.filter (fun scope => decide (scope.owner ≠ owner)) =
      state.variables.scopes.filter (fun scope => decide (scope.owner ≠ owner)) := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_preserves_other_scopes written

/-- Population-bound writes retain every body's exact frame-owner multiplicity, including the selected body. -/
theorem writeParallelScopeValues_preserves_owner_census {program : Program} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (written : writeParallelScopeValues? program state owner values kind = some result) :
    result.scopes.map (·.owner) = state.variables.scopes.map (·.owner) := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_preserves_owner_census written

/-- Successful Human completion preserves frame eligibility for the selected body and its siblings. -/
theorem completeParallelScopeUserTask_preserves_owner_census
    {program : Program} {before after : RuntimeState} {id : UserTaskInstanceId}
    {values : List VariableBinding}
    (completed : completeParallelScopeUserTask? program before id values = some after) :
    after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner) := by
  unfold completeParallelScopeUserTask? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_preserves_owner_census (result := variables) written

/-- Service frame disposal removes an Activity frame while preserving all body-frame owners. -/
theorem completeParallelScopeEffect_preserves_owner_census
    {program : Program} {before after : RuntimeState} {id : EffectOccurrenceId}
    {result : EffectExecutionResult}
    (completed : completeParallelScopeEffect? program before id result = some after) :
    after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner) := by
  unfold completeParallelScopeEffect? at completed
  split at completed <;> try contradiction
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_preserves_owner_census (result := variables) written
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- PMIS binding selects a claiming Activity, so target membership follows from successful selection. -/
theorem parallelScopeBinding_member (entry : ParallelScopeEntry) (state : RuntimeState)
    (target : ScopeOccurrenceId) (binding : ParallelScopeBinding)
    (bound : parallelScopeBinding? entry state target = some binding) :
    ∃ iteration ∈ binding.iterations, iteration.scope = target := by
  unfold parallelScopeBinding? at bound
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  rename_i record selected
  have claiming : (activityBodyScopeClaims record.body).contains target = true := by
    have member : record ∈ state.activityOccurrences.filter (fun candidate =>
        (activityBodyScopeClaims candidate.body).contains target) := by
      rw [selected]
      simp
    exact (List.mem_filter.mp member).2
  split at bound <;> try contradiction
  rename_i first rest body
  split at bound <;> try contradiction
  split at bound <;> try contradiction
  dsimp only at bound
  split at bound <;> try contradiction
  cases Option.some.inj bound
  have member : target ∈ (first :: rest).map (·.scope) := by
    simpa [body, activityBodyScopeClaims] using claiming
  exact List.mem_map.mp member

private theorem scopeFrame_selection_census (before after : ScopedVariables) (owner : ScopeOccurrenceId)
    (owners : after.scopes.map (·.owner) = before.scopes.map (·.owner)) :
    (selectScopeVariables? after owner).isSome = (selectScopeVariables? before owner).isSome := by
  cases selected : selectScopeVariables? before owner with
  | none =>
    cases next : selectScopeVariables? after owner with
    | none => rfl
    | some frame =>
      obtain ⟨original, originalEq⟩ := selectScopeVariables_owner_census after before owner owners.symm ⟨frame, next⟩
      simp [selected] at originalEq
  | some frame =>
    obtain ⟨next, nextEq⟩ := selectScopeVariables_owner_census before after owner owners ⟨frame, selected⟩
    simp [nextEq]

/-- PMIS binding reads complete frame-owner multiplicity, independently of mutable values and wait disposal. -/
theorem parallelScopeBinding_state_frame (entry : ParallelScopeEntry) (before after : RuntimeState)
    (target : ScopeOccurrenceId)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (activities : after.activityOccurrences = before.activityOccurrences)
    (controllers : after.parallelScopeControllers = before.parallelScopeControllers)
    (owners : after.variables.scopes.map (·.owner) = before.variables.scopes.map (·.owner)) :
    parallelScopeBinding? entry after target = parallelScopeBinding? entry before target := by
  have bodyFrame : ∀ record owner, parallelScopeBodyBound entry after record owner =
      parallelScopeBodyBound entry before record owner := by
    intro record owner
    simp only [parallelScopeBodyBound, scopes, activities,
      scopeFrame_selection_census before.variables after.variables owner owners]
  simp only [parallelScopeBinding?, control, scopes, activities, controllers, bodyFrame]

/-- Actual Human completion retains every entry/target's population and exact frame eligibility. -/
theorem completeParallelScopeUserTask_preserves_binding
    {program : Program} {before after : RuntimeState} {id : UserTaskInstanceId}
    {values : List VariableBinding}
    (completed : completeParallelScopeUserTask? program before id values = some after)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) :
    parallelScopeBinding? entry after target = parallelScopeBinding? entry before target := by
  have owners := completeParallelScopeUserTask_preserves_owner_census completed
  unfold completeParallelScopeUserTask? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact parallelScopeBinding_state_frame entry before _ target rfl rfl rfl rfl owners

/-- Actual Service completion retains population binding while disposing its separate Activity data frame. -/
theorem completeParallelScopeEffect_preserves_binding
    {program : Program} {before after : RuntimeState} {id : EffectOccurrenceId}
    {result : EffectExecutionResult}
    (completed : completeParallelScopeEffect? program before id result = some after)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) :
    parallelScopeBinding? entry after target = parallelScopeBinding? entry before target := by
  have owners := completeParallelScopeEffect_preserves_owner_census completed
  unfold completeParallelScopeEffect? at completed
  split at completed <;> try contradiction
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact parallelScopeBinding_state_frame entry before _ target rfl rfl rfl rfl owners
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

theorem conditionMerge_untouched (existing patch : List VariableBinding)
    (name : String) (binding : VariableBinding)
    (unique : existing.filter (fun value => value.name == name) = [binding])
    (untouched : ∀ value ∈ patch, value.name ≠ name) :
    (mergeProcessVariableBindings existing patch).filter (fun value => value.name == name) = [binding] := by
  have absent : name ∉ patch.map (·.name) := by
    intro present
    obtain ⟨value, member, named⟩ := List.mem_map.mp present
    exact untouched value member named
  have noNew : patch.filter (fun value => value.name == name) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member
    simp [untouched value member]
  have kept : (existing.filter (fun value => !(patch.map (·.name)).contains value.name)).filter
      (fun value => value.name == name) = existing.filter (fun value => value.name == name) := by
    rw [List.filter_filter]
    apply List.filter_congr
    intro value _
    by_cases named : value.name = name <;> simp [named, absent]
  have preserved := (mergeProcessVariableBindings_perm existing patch).filter (fun value => value.name == name)
  rw [List.filter_append, noNew, List.nil_append, kept, unique] at preserved
  simpa using preserved

private theorem conditionMerge_singleton (existing : List VariableBinding) (name : String) (condition : Bool) :
    (mergeProcessVariableBindings existing [{ name, value := .boolean condition }]).filter
      (fun value => value.name == name) = [{ name, value := .boolean condition }] := by
  have removed : (existing.filter (fun value => !([{ name, value := .boolean condition }].map VariableBinding.name).contains value.name)).filter
      (fun value => value.name == name) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro value member matching
    have different : value.name ≠ name := by simpa using (List.mem_filter.mp member).2
    exact different (by simpa using matching)
  have exactMembers := (mergeProcessVariableBindings_perm existing [{ name, value := .boolean condition }]).filter
    (fun value => value.name == name)
  rw [List.filter_append, removed] at exactMembers
  simpa using exactMembers

theorem conditionScopedWrite_untouched (variables result : ScopedVariables)
    (owner : ScopeOccurrenceId) (patch : List VariableBinding) (name : String) (binding : VariableBinding)
    (unique : variables.process.bindings.filter (fun value => value.name == name) = [binding])
    (untouched : ∀ value ∈ patch, value.name ≠ name)
    (written : writeScopeVariables? variables owner patch = some result) :
    result.process.bindings.filter (fun value => value.name == name) = [binding] := by
  unfold writeScopeVariables? at written
  obtain ⟨scope, _, written⟩ := Option.bind_eq_some_iff.mp written
  split at written <;> try contradiction
  cases Option.some.inj written
  apply conditionMerge_untouched _ _ name binding unique
  intro value member
  exact untouched value (List.mem_filter.mp member).1

private theorem conditionPatch_shape (values : List VariableBinding) (name : String)
    (ordered : values.Pairwise (fun left right => left.name < right.name))
    (typed : ∀ value ∈ values, value.name = name → ∃ condition, value.value = .boolean condition) :
    values.filter (fun value => value.name == name) = [] ∨
      ∃ condition, values.filter (fun value => value.name == name) = [{ name, value := .boolean condition }] := by
  induction values with
  | nil => exact Or.inl rfl
  | cons head tail ih =>
    by_cases named : head.name = name
    · obtain ⟨condition, value⟩ := typed head (by simp) named
      have noTail : tail.filter (fun value => value.name == name) = [] := by
        apply List.filter_eq_nil_iff.mpr
        intro candidate member matching
        have less := (List.pairwise_cons.mp ordered).1 candidate member
        have same : candidate.name = name := by simpa using matching
        simp [named, same] at less
      have headEq : head = { name, value := .boolean condition } := by cases head; simp_all
      exact Or.inr ⟨condition, by simp [noTail, headEq]⟩
    · have rest := ih (List.pairwise_cons.mp ordered).2
        (fun value member => typed value (List.mem_cons_of_mem _ member))
      simpa [named] using rest

private theorem boundWrite_preserves_condition (variables result : ScopedVariables)
    (owner : ScopeOccurrenceId) (collection item name : String) (handlers : List String)
    (values : List VariableBinding) (kind : MultiInstanceScopeWriteKind) (original : Bool)
    (unique : variables.process.bindings.filter (fun value => value.name == name) =
      [{ name, value := .boolean original }])
    (written : writeBoundMultiInstanceScopeValues? variables owner collection item (some name) handlers values kind = some result) :
    ∃ condition, result.process.bindings.filter (fun value => value.name == name) = [{ name, value := .boolean condition }] := by
  unfold writeBoundMultiInstanceScopeValues? at written
  dsimp only at written
  split at written <;> try contradiction
  rename_i checks
  simp only [Bool.or_eq_true, not_or, Bool.not_eq_true', Bool.not_eq_false, decide_eq_true_eq] at checks
  have typed : ∀ value ∈ values, value.name = name → ∃ condition, value.value = .boolean condition := by
    intro value member named
    have permitted := List.all_eq_true.mp checks.1 value member
    simp only [named, beq_self_eq_true, ↓reduceIte, Bool.and_eq_true] at permitted
    cases resultValue : value.value <;>
      try (simp only [resultValue, Bool.false_eq_true, and_false] at permitted)
    all_goals exact ⟨_, rfl⟩
  have shape := conditionPatch_shape values name checks.2 typed
  obtain ⟨bodyVariables, bodyWrite, written⟩ := Option.bind_eq_some_iff.mp written
  have bodyTyped := conditionScopedWrite_untouched variables bodyVariables owner _ name _ unique
    (by
      intro value member same
      have different : (some name : Option String) ≠ some value.name := by
        simpa only [bne_iff_ne] using (List.mem_filter.mp member).2
      exact different (congrArg some same.symm)) bodyWrite
  cases Option.some.inj written
  have filtered : values.filter (fun value => (some name : Option String) == some value.name) =
      values.filter (fun value => value.name == name) := by
    apply List.filter_congr
    intro value _
    apply Bool.eq_iff_iff.mpr
    simp only [beq_iff_eq, Option.some.injEq]
    exact eq_comm
  rw [filtered]
  rcases shape with absent | ⟨condition, singleton⟩
  · exact ⟨original, conditionMerge_untouched _ _ name _ bodyTyped
      (by intro value member; rw [absent] at member; contradiction)⟩
  · rw [singleton]
    exact ⟨condition, conditionMerge_singleton _ name condition⟩

/-- The selected population-bound writer retains one Boolean Process completion binding after every permitted write. -/
theorem writeParallelScopeValues_preserves_condition
    {program : Program} {state : RuntimeState} {owner : ScopeOccurrenceId}
    {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (entry : ParallelScopeEntry) (name : String) (original : Bool)
    (selected : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == owner.definitionScopeId)) = [entry])
    (named : entry.completionBooleanName = some name)
    (unique : state.variables.process.bindings.filter (fun value => value.name == name) =
      [{ name, value := .boolean original }])
    (written : writeParallelScopeValues? program state owner values kind = some result) :
    ∃ condition, result.process.bindings.filter (fun value => value.name == name) = [{ name, value := .boolean condition }] := by
  unfold writeParallelScopeValues? at written
  simp only [selected] at written
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  rw [named] at written
  exact boundWrite_preserves_condition state.variables result owner entry.collectionName entry.itemName name _ values kind
    original unique written

/-- Actual Human completion preserves the selected Process Boolean condition; its guard permits Boolean updates only. -/
theorem completeParallelScopeUserTask_preserves_condition
    {program : Program} {before after : RuntimeState} {id : UserTaskInstanceId}
    {values : List VariableBinding} (wait : UserTaskWait) (entry : ParallelScopeEntry)
    (name : String) (original : Bool)
    (selectedWait : before.waits.filter ((taskIdNamesWait id)) = [wait])
    (selectedEntry : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == wait.owner.definitionScopeId)) = [entry])
    (named : entry.completionBooleanName = some name)
    (unique : before.variables.process.bindings.filter (fun value => value.name == name) =
      [{ name, value := .boolean original }])
    (completed : completeParallelScopeUserTask? program before id values = some after) :
    ∃ condition, after.variables.process.bindings.filter (fun value => value.name == name) =
      [{ name, value := .boolean condition }] := by
  simp only [completeParallelScopeUserTask?, selectedWait] at completed
  split at completed <;> try contradiction
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_preserves_condition (result := variables) entry name original selectedEntry named unique written

/-- Actual Service completion retains a Boolean condition through its condition-write refusal and mapped body writes. -/
theorem completeParallelScopeEffect_preserves_condition
    {program : Program} {before after : RuntimeState} {id : EffectOccurrenceId}
    {result : EffectExecutionResult} (wait : EffectWait) (entry : ParallelScopeEntry)
    (name : String) (original : Bool)
    (selectedWait : before.effectWaits.filter (effectIdNamesWait id) = [wait])
    (selectedEntry : ((program.operations.filterMap parallelScopeEntry?).filter
      (·.childScopeId == wait.owner.definitionScopeId)) = [entry])
    (named : entry.completionBooleanName = some name)
    (unique : before.variables.process.bindings.filter (fun value => value.name == name) =
      [{ name, value := .boolean original }])
    (completed : completeParallelScopeEffect? program before id result = some after) :
    ∃ condition, after.variables.process.bindings.filter (fun value => value.name == name) =
      [{ name, value := .boolean condition }] := by
  simp only [completeParallelScopeEffect?, selectedWait] at completed
  cases result <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
  cases Option.some.inj completed
  exact writeParallelScopeValues_preserves_condition (result := variables) entry name original selectedEntry named unique written
  case h_2 =>
    rename_i patch missingResult impossible
    exact False.elim (impossible patch rfl)

/-- Actual population-bound writes preserve the Activity-local frames checked by reservation validity. -/
theorem writeParallelScopeValues_preserves_activities {program : Program} {state : RuntimeState}
    {owner : ScopeOccurrenceId} {values : List VariableBinding} {kind : MultiInstanceScopeWriteKind} {result : ScopedVariables}
    (written : writeParallelScopeValues? program state owner values kind = some result) :
    result.activities = state.variables.activities := by
  unfold writeParallelScopeValues? at written
  split at written <;> try contradiction
  obtain ⟨binding, _, written⟩ := Option.bind_eq_some_iff.mp written
  exact writeBoundMultiInstanceScopeValues_preserves_activities written

end BpmnSemantics.SemanticProcess
