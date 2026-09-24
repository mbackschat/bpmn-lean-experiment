import BpmnSemantics.SemanticProcess.InternalRegionalSelection

/-! ADINPUT-SCOPE-01 and ADIO-SCOPE-01 require retained Activity-local data to keep its exact
live Activity owner. This private preparation condition leaves the global Effect-only predicate
and the raw regional cleanup operations unchanged. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

def regionalLocalScopeNamesActivity (scope : ActivityVariableScope)
    (record : ActivityOccurrence) : Bool :=
  activityOccurrenceScopeMatches
    { processInstanceId := record.processInstanceId
      activityElementId := ⟨record.activityElementId.value⟩
      activation := record.activation } scope

def regionalRetainedLocalDataClosed (state : RuntimeState)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool) : Bool :=
  state.variables.activities.all fun scope =>
    if !keepLocal scope then true
    else match scope.owner with
      | .effectOccurrence _ => true
      | .activityOccurrence _ =>
          match state.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) with
          | [record] => keepActivity record
          | _ => false

def regionalSelectionLocalDataRetention (state : RuntimeState)
    (selected : InternalRegionalSelection) : ActivityVariableScope → Bool :=
  match selected.kind with
  | .returning record =>
      let removed := processInstanceClosureWithin state.calledProcessOccurrences
        [record.calledRoot.processInstanceId] (state.calledProcessOccurrences.length + 1)
      fun scope => !removed.contains scope.owner.processInstanceId
  | .completing _ => fun _ => true
  | .interrupting _ | .terminating =>
      let called := calledInstanceClosure state selected.root.id
      let cancelled := fun owner => occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
        called.contains owner.processInstanceId
      let disposition := match selected.kind with | .terminating => SelectedScopeDisposition.retain | _ => .remove
      let withdrawn := withdrawnByRegion cancelled state.activityOccurrences
        (retainedCancellationRoot selected.root.id disposition)
      let effects := state.effectWaits.filter fun wait => cancelled wait.owner
      let incidents := state.effectIncidents.filter fun incident => cancelled incident.wait.owner
      fun scope => !called.contains scope.owner.processInstanceId &&
        !(withdrawn.any (regionalLocalScopeNamesActivity scope)) &&
        !(effects.any fun wait => activityScopeMatches
          { processInstanceId := wait.processInstanceId
            elementId := ⟨wait.elementId.value⟩, activation := wait.activation } scope) &&
        !(incidents.any fun incident => activityScopeMatches incident.id.effectId scope)

/-- The local mask is independent of the Activity mask: bounded Complete retains local scopes
even though it withdraws an Activity, which is the second separating counterexample. -/
theorem regionalLocalData_complete_retains (state : RuntimeState)
    (operation : SemanticOperation) (root : RuntimeScopeOccurrence)
    (withdrawal : InternalCompletionWithdrawal) (scope : ActivityVariableScope) :
    regionalSelectionLocalDataRetention state
      { operation, root, kind := .completing withdrawal } scope = true := rfl

theorem regionalLocalData_call_fields (state : RuntimeState) (operation : SemanticOperation)
    (root : RuntimeScopeOccurrence) (record : CalledProcessOccurrence) :
    (removeCalledProcessTree state record).variables.activities = state.variables.activities.filter
      (regionalSelectionLocalDataRetention state { operation, root, kind := .returning record }) := rfl

theorem regionalLocalData_cancellation_fields (state : RuntimeState) (operation : SemanticOperation)
    (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId) :
    (cancelScopeSubtree state root.id .remove).variables.activities = state.variables.activities.filter
      (regionalSelectionLocalDataRetention state { operation, root, kind := .interrupting parent }) ∧
    (cancelScopeSubtree state root.id .retain).variables.activities = state.variables.activities.filter
      (regionalSelectionLocalDataRetention state { operation, root, kind := .terminating }) := ⟨rfl, rfl⟩

/-- A surviving local scope resolves to exactly one predecessor owner, and that owner survives. -/
theorem regionalRetainedLocalDataClosed_owner (state : RuntimeState)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (closed : regionalRetainedLocalDataClosed state keepActivity keepLocal = true)
    (scope : ActivityVariableScope) (member : scope ∈ state.variables.activities)
    (retained : keepLocal scope = true) (id : ActivityOccurrenceId)
    (tagged : scope.owner = .activityOccurrence id) :
    ∃ record, state.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) = [record] ∧
      keepActivity record = true := by
  have checked := List.all_eq_true.mp closed scope member
  simp only [retained, Bool.not_true, Bool.false_eq_true, ↓reduceIte, tagged] at checked
  split at checked
  · exact ⟨_, by assumption, checked⟩
  · contradiction

/-- Field agreement transports the predecessor census; no successor-validity premise is used. -/
theorem regionalRetainedLocalDataClosed_preserves_owners (before after : RuntimeState)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (closed : regionalRetainedLocalDataClosed before keepActivity keepLocal = true)
    (activities : after.activityOccurrences = before.activityOccurrences.filter keepActivity)
    (locals : after.variables.activities = before.variables.activities.filter keepLocal) :
    regionalRetainedLocalDataClosed after (fun _ => true) (fun _ => true) = true := by
  apply List.all_eq_true.mpr
  intro scope member
  rw [locals] at member
  obtain ⟨member, retained⟩ := List.mem_filter.mp member
  cases tagged : scope.owner with
  | effectOccurrence id => simp
  | activityOccurrence id =>
      obtain ⟨record, census, survives⟩ := regionalRetainedLocalDataClosed_owner before
        keepActivity keepLocal closed scope member retained id tagged
      have censusAfter : after.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) = [record] := by
        rw [activities]
        calc
          _ = (before.activityOccurrences.filter (regionalLocalScopeNamesActivity scope)).filter keepActivity := by
            simp only [List.filter_filter, Bool.and_comm]
          _ = [record] := by simp [census, survives]
      simp [censusAfter]

/-- Both reported failures are instances of one missing retained-owner census. -/
theorem regionalRetainedLocalDataClosed_refuses_stranded (state : RuntimeState)
    (keepActivity : ActivityOccurrence → Bool) (keepLocal : ActivityVariableScope → Bool)
    (scope : ActivityVariableScope) (member : scope ∈ state.variables.activities)
    (retained : keepLocal scope = true) (id : ActivityOccurrenceId)
    (tagged : scope.owner = .activityOccurrence id)
    (stranded : ∀ record, state.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) = [record] →
      keepActivity record = false) :
    regionalRetainedLocalDataClosed state keepActivity keepLocal = false := by
  apply Bool.eq_false_iff.mpr
  intro closed
  obtain ⟨record, census, survives⟩ := regionalRetainedLocalDataClosed_owner state
    keepActivity keepLocal closed scope member retained id tagged
  rw [stranded record census] at survives
  contradiction

/-- For fixed predecessor masks, a second closed removal preserves the selected local-owner
condition. Re-derived masks and insertions still require their own preparation frames. -/
theorem regionalRetainedLocalDataClosed_after_filter (before after : RuntimeState)
    (selectedActivity otherActivity : ActivityOccurrence → Bool)
    (selectedLocal otherLocal : ActivityVariableScope → Bool)
    (selectedClosed : regionalRetainedLocalDataClosed before selectedActivity selectedLocal = true)
    (otherClosed : regionalRetainedLocalDataClosed before otherActivity otherLocal = true)
    (activities : after.activityOccurrences = before.activityOccurrences.filter otherActivity)
    (locals : after.variables.activities = before.variables.activities.filter otherLocal) :
    regionalRetainedLocalDataClosed after selectedActivity selectedLocal = true := by
  apply List.all_eq_true.mpr
  intro scope member
  rw [locals] at member
  obtain ⟨member, otherRetains⟩ := List.mem_filter.mp member
  cases selectedRetains : selectedLocal scope with
  | false => simp
  | true =>
      cases tagged : scope.owner with
      | effectOccurrence id => simp
      | activityOccurrence id =>
          obtain ⟨record, census, selectedKeeps⟩ := regionalRetainedLocalDataClosed_owner before
            selectedActivity selectedLocal selectedClosed scope member selectedRetains id tagged
          obtain ⟨other, otherCensus, otherKeeps⟩ := regionalRetainedLocalDataClosed_owner before
            otherActivity otherLocal otherClosed scope member otherRetains id tagged
          have same : other = record := by simpa [census] using otherCensus.symm
          subst other
          have censusAfter : after.activityOccurrences.filter (regionalLocalScopeNamesActivity scope) = [record] := by
            rw [activities]
            calc
              _ = (before.activityOccurrences.filter (regionalLocalScopeNamesActivity scope)).filter otherActivity := by
                simp only [List.filter_filter, Bool.and_comm]
              _ = [record] := by simp [census, otherKeeps]
          simp [censusAfter, selectedKeeps]

theorem regionalLocalData_completion_variables (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (result : completeBoundedScope? program before scopeId parentOutput = some after) :
    after.variables = before.variables := by
  have ordinaryVariables (completed : RuntimeState)
      (ordinary : completeScopeState? before scopeId parentOutput = some completed) :
      completed.variables = before.variables := by
    unfold completeScopeState? at ordinary
    split at ordinary
    · split at ordinary
      · simp at ordinary
      · unfold completeQuiescentScope? at ordinary
        repeat' split at ordinary
        all_goals first
          | (simp at ordinary; done)
          | (simp only [Option.some.injEq] at ordinary; subst completed; rfl)
    · simp at ordinary
  unfold completeBoundedScope? at result
  cases ordinary : completeScopeState? before scopeId parentOutput with
  | none => simp [ordinary] at result
  | some completed =>
      simp only [ordinary] at result
      repeat' split at result
      all_goals first
        | (simp at result; done)
        | (simp only [Option.some.injEq] at result; subst after; exact ordinaryVariables completed ordinary)

/-- ESL-CLOSE removes monitored ownership records, while primitive completion preserves
Activity-local values exactly; preparation separately checks retained local owners. -/
theorem regionalLocalData_selected_completion_variables (program : Program) (before after : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (result : completeSelectedScope? program before scopeId parentOutput = some after) :
    after.variables = before.variables := by
  unfold completeSelectedScope? at result
  split at result
  · have step := completeMonitoredScope_sound program before after scopeId parentOutput result
    cases step
    rfl
  · exact regionalLocalData_completion_variables program before after scopeId parentOutput result

end BpmnSemantics.SemanticProcess.InternalCommutation
