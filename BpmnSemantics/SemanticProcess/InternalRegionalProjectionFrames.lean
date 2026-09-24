import BpmnSemantics.SemanticProcess.InternalRegionalCompletionPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalProjectionRemoval

/-! Child completion deletes one scope while retaining the Call graph and hosting control.
Quiescence protects every surviving projection lookup from the removed owner. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_other_owner_census (before after : RuntimeState)
    (removed owner : ScopeOccurrenceId)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed))) (different : owner ≠ removed) :
    flowNodeOccurrenceOwnerLiveUnique after owner = flowNodeOccurrenceOwnerLiveUnique before owner := by
  unfold flowNodeOccurrenceOwnerLiveUnique
  rw [scopes, List.filter_filter]
  congr 2
  apply congrArg List.length
  apply List.filter_congr
  intro scope member
  by_cases same : scope.id = owner <;> simp [same, different]

/-- Complete lookup equality includes prior failures; deleting a different owner cannot change
the exact owner or called-instance census used by this query. -/
theorem regional_child_process_lookup_frame (program : Program) (before after : RuntimeState)
    (removed owner : ScopeOccurrenceId)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (different : owner ≠ removed) :
    processIdForOwner? program after owner = processIdForOwner? program before owner := by
  simp only [processIdForOwner?, hostingInstanceId?, control, calls,
    regional_other_owner_census before after removed owner scopes different]

theorem regional_child_wait_start_frame (program : Program) (before after : RuntimeState)
    (removed owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (different : owner ≠ removed) :
    waitStart? program after owner element activation = waitStart? program before owner element activation := by
  simp only [waitStart?, regional_child_process_lookup_frame program before after removed owner
    scopes control calls different]

private theorem not_any_owner {α : Type} (values : List α) (owner : α → ScopeOccurrenceId)
    (removed : ScopeOccurrenceId) (quiet : (!(values.any fun value => owner value == removed)) = true) :
    ∀ value ∈ values, owner value ≠ removed := by
  intro value member same
  have present : (values.any fun value => owner value == removed) = true :=
    List.any_eq_true.mpr ⟨value, member, by simp [same]⟩
  simp [present] at quiet

theorem regional_quiescent_wait_owners_differ (state : RuntimeState) (removed : ScopeOccurrenceId)
    (quiet : scopeQuiescent state removed = true) :
    (∀ wait ∈ state.waits, wait.owner ≠ removed) ∧
    (∀ wait ∈ state.messageWaits, wait.owner ≠ removed) ∧
    (∀ wait ∈ state.timerWaits, wait.owner ≠ removed) ∧
    (∀ wait ∈ state.effectWaits, wait.owner ≠ removed) ∧
    (∀ incident ∈ state.effectIncidents, incident.wait.owner ≠ removed) ∧
    (∀ call ∈ state.calledProcessOccurrences, call.caller ≠ removed) := by
  simp only [scopeQuiescent, Bool.and_eq_true, and_assoc] at quiet
  exact ⟨not_any_owner state.waits (·.owner) _ quiet.2.1,
    not_any_owner state.messageWaits (·.owner) _ quiet.2.2.1,
    not_any_owner state.timerWaits (·.owner) _ quiet.2.2.2.1,
    not_any_owner state.effectWaits (·.owner) _ quiet.2.2.2.2.1,
    not_any_owner state.effectIncidents (·.wait.owner) _ quiet.2.2.2.2.2.1,
    not_any_owner state.calledProcessOccurrences (·.caller) _ quiet.2.2.2.2.2.2.2.2.1⟩

theorem regional_child_scope_start_frame (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (scope : RuntimeScopeOccurrence)
    (member : scope ∈ before.scopeOccurrences) (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    scopeStart? program after scope = scopeStart? program before scope := by
  unfold scopeStart?
  cases parentEq : scope.parent with
  | none => simp
  | some parent =>
      have different : parent ≠ removed := by
        intro same
        exact quiescent_scope_has_no_child before removed quiet scope member (by simpa [same] using parentEq)
      simp only [bind, Option.bind,
        regional_child_process_lookup_frame program before after removed parent scopes control calls different]

theorem regional_child_call_start_frame (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (record : CalledProcessOccurrence)
    (member : record ∈ before.calledProcessOccurrences) (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    callStart? program after record = callStart? program before record := by
  have different := (regional_quiescent_wait_owners_differ before removed quiet).2.2.2.2.2 record member
  simp only [callStart?, regional_child_process_lookup_frame program before after removed record.caller
    scopes control calls different]

private theorem completion_child_lookup_fields (before after ordinary : RuntimeState)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (completed : completeScopeState? before definition (some output) = some ordinary)
    (control : after.control = ordinary.control)
    (scopes : after.scopeOccurrences = ordinary.scopeOccurrences)
    (calls : after.calledProcessOccurrences = ordinary.calledProcessOccurrences) :
    scopeQuiescent before root.id = true ∧ after.control = before.control ∧
      after.calledProcessOccurrences = before.calledProcessOccurrences ∧
      after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)) := by
  obtain ⟨quiet, update⟩ := completeScopeState_selected_update before ordinary definition (some output) root census completed
  cases parentEq : root.parent with
  | none => simp [parentEq, running] at update
  | some parent =>
      simp only [parentEq, running] at update
      split at update
      · cases update
        exact ⟨quiet, control.trans running.symm, calls, scopes⟩
      · contradiction

/-- These fields come from the actual bounded evaluator, including its possible deadline withdrawal. -/
theorem completeBoundedScope_child_lookup_fields (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeBoundedScope? program before definition (some output) = some after) :
    scopeQuiescent before root.id = true ∧ after.control = before.control ∧
      after.calledProcessOccurrences = before.calledProcessOccurrences ∧
      after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root.id)) := by
  obtain ⟨ordinary, completed, control, scopes, calls, _⟩ :=
    completeBoundedScope_position_fields program before after definition (some output) result
  exact completion_child_lookup_fields before after ordinary hosting definition output root running census
    completed control scopes calls

/-- A complete prepared child step supplies the quiescence and field frame needed by every
retained wait, Scope, and Call projection. No intermediate validity is assumed. -/
theorem preparedChildComplete_projection_lookup_fields (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      scopeQuiescent before prepared.selection.root.id = true ∧ after.control = before.control ∧
      after.calledProcessOccurrences = before.calledProcessOccurrences ∧
      after.scopeOccurrences = before.scopeOccurrences.filter
        (fun scope => decide (scope.id ≠ prepared.selection.root.id)) := by
  obtain ⟨snapshots, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨hosting, running⟩ := regionalSelection_running program before _ prepared.selection selection
  obtain ⟨_, _, census⟩ := regionalSelection_complete_census program before id origin definition (some output)
    prepared.selection selection
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : completeSelectedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    exact fired
  obtain ⟨ordinary, completed, control, scopes, calls, _⟩ :=
    completeSelectedScope_position_fields program before after definition (some output) result
  exact ⟨after, applied, completion_child_lookup_fields before after ordinary hosting definition output
    prepared.selection.root running census completed control scopes calls⟩

/-- The actual structural validator survives removal of a quiescent child. Parent and Call
owner censuses are protected by quiescence, independently of any successor-validity claim. -/
theorem regional_child_structural_program_validity (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId)
    (prior : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    flowNodeOccurrenceStructuralProgramValidity program after = true := by
  simp only [flowNodeOccurrenceStructuralProgramValidity, Bool.and_eq_true, List.all_eq_true] at prior ⊢
  constructor
  · intro occurrence member
    rw [scopes] at member
    obtain ⟨member, kept⟩ := List.mem_filter.mp member
    have different : occurrence.id ≠ removed := of_decide_eq_true kept
    have valid := prior.1 occurrence member
    change (match program.definitionScopes.filter (fun scope => decide (scope.id = occurrence.id.definitionScopeId)) with
      | [definition] => _
      | _ => false) = true at valid ⊢
    split at valid
    · rename_i definition declared
      simp only [Bool.and_eq_true] at valid ⊢
      refine ⟨⟨⟨⟨⟨valid.1.1.1.1.1, valid.1.1.1.1.2⟩, valid.1.1.1.2⟩,
        ?_⟩, valid.1.2⟩, ?_⟩
      · rw [regional_other_owner_census before after removed occurrence.id scopes different]
        exact valid.1.1.2
      · rw [control]
        have binding := valid.2
        cases parentEq : occurrence.parent with
        | none =>
            cases definitionParent : definition.parentScopeId <;> cases lifecycle : before.control <;>
              simpa only [definitionParent, lifecycle, parentEq, calls] using binding
        | some parent =>
            have parentDifferent : parent ≠ removed := by
              intro same
              exact quiescent_scope_has_no_child before removed quiet occurrence member (by simpa [same] using parentEq)
            cases definitionParent : definition.parentScopeId <;> cases lifecycle : before.control <;>
              simpa only [definitionParent, lifecycle, parentEq,
                regional_other_owner_census before after removed parent scopes parentDifferent] using binding
    · contradiction
  · intro record member
    rw [calls] at member
    have valid := prior.2 record member
    have different := (regional_quiescent_wait_owners_differ before removed quiet).2.2.2.2.2 record member
    change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid after record.id.processInstanceId
      record.caller ⟨record.id.elementId.value⟩ record.id.activation && _) = true
    change (FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid before record.id.processInstanceId
      record.caller ⟨record.id.elementId.value⟩ record.id.activation && _) = true at valid
    simpa only [FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid,
      regional_other_owner_census before after removed record.caller scopes different] using valid

theorem regional_child_scope_projection (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (projected : List OpenSemanticFlowNodeOccurrence)
    (prior : (before.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
      (scopeStart? program before) = some projected)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    (after.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM (scopeStart? program after) =
      some (projected.filter fun entry => decide (entry.anchor ≠ .scope removed)) := by
  have mapped := mapM_filter_preserves_success (before.scopeOccurrences.filter fun scope => scope.parent.isSome)
    (scopeStart? program before) (scopeStart? program after)
    (fun scope => decide (scope.id ≠ removed)) (fun entry => decide (entry.anchor ≠ .scope removed))
    projected prior (by
      intro scope member entry found
      rw [scope_start_anchor program before scope entry found]
      simp) (by
      intro scope member entry found _
      rw [regional_child_scope_start_frame program before after removed scope (List.mem_filter.mp member).1
        quiet scopes control calls]
      exact found)
  have population : after.scopeOccurrences.filter (fun scope => scope.parent.isSome) =
      (before.scopeOccurrences.filter fun scope => scope.parent.isSome).filter (fun scope => decide (scope.id ≠ removed)) := by
    simp only [scopes, List.filter_filter, Bool.and_comm]
  rw [population]
  exact mapped

theorem regional_child_call_projection (program : Program) (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (projected : List OpenSemanticFlowNodeOccurrence)
    (prior : before.calledProcessOccurrences.mapM (callStart? program before) = some projected)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    after.calledProcessOccurrences.mapM (callStart? program after) =
      some (projected.filter fun entry => decide (entry.anchor ≠ .scope removed)) := by
  have mapped := mapM_filter_preserves_success before.calledProcessOccurrences
    (callStart? program before) (callStart? program after) (fun _ => true)
    (fun entry => decide (entry.anchor ≠ .scope removed)) projected prior (by
      intro record member entry found
      rw [call_start_anchor program before record entry found]
      rfl) (by
      intro record member entry found _
      rw [regional_child_call_start_frame program before after removed record member quiet scopes control calls]
      exact found)
  rw [(List.filter_eq_self (p := fun _ : CalledProcessOccurrence => true)).mpr (by intros; rfl)] at mapped
  simpa only [calls] using mapped

/-- Complete preparation determines the actual step; the original structural predicate and
successful component projections then yield exact surviving Scope and Call entries. -/
theorem preparedChildComplete_scope_and_call_projection (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (scopeEntries callEntries : List OpenSemanticFlowNodeOccurrence)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (scopeProjected : (before.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
      (scopeStart? program before) = some scopeEntries)
    (callProjected : before.calledProcessOccurrences.mapM (callStart? program before) = some callEntries)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceStructuralProgramValidity program after = true ∧
      (after.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM (scopeStart? program after) =
        some (scopeEntries.filter fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)) ∧
      after.calledProcessOccurrences.mapM (callStart? program after) =
        some (callEntries.filter fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)) := by
  obtain ⟨after, applied, quiet, control, calls, scopes⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  exact ⟨after, applied,
    regional_child_structural_program_validity program before after _ structural quiet scopes control calls,
    regional_child_scope_projection program before after _ scopeEntries scopeProjected quiet scopes control calls,
    regional_child_call_projection program before after _ callEntries callProjected quiet scopes control calls⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
