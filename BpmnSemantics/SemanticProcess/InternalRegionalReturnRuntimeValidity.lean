import BpmnSemantics.SemanticProcess.InternalRegionalCallRemovalValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalRegionalReturnQuiescence

/-! Prepared Return preserves the complete runtime predicate by composing the existing
Call-removal laws. Its Compensation case follows from the declaration restrictions and
the preparation guard, rather than assuming the successor has empty retained state. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem return_excludes_retention (program : Program) (id : OperationId)
    (origin : BpmnElementOrigin) (process : ProcessId) (definition : DefinitionScopeId)
    (output : ControlPlaceId)
    (member : .returnProcess id origin process definition output ∈ program.operations)
    (valid : compensationActivityRetentionDeclarationValid program = true) :
    program.compensationActivityRetention = none := by
  cases declaration : program.compensationActivityRetention with
  | none => rfl
  | some declaration =>
      simp only [compensationActivityRetentionDeclarationValid, declaration, Bool.and_eq_true] at valid
      have excluded := valid.2
      simp only [Bool.not_eq_true', List.any_eq_false] at excluded
      have impossible := excluded _ member
      contradiction

private theorem return_compensation_validity (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (call : CalledProcessOccurrence) (tokens : List ControlToken)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId)
    (running : before.control = .running hosting)
    (member : .returnProcess id origin process definition output ∈ program.operations)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (retention : compensationActivityRetentionStateValid program before = true)
    (snapshotValid : compensationEventSubProcessSnapshotStateValid program before = true)
    (execution : compensationExecutionStateValid program before = true) :
    let after := { removeCalledProcessTree before call with tokens := tokens }
    compensationActivityRetentionStateValid program after = true ∧
      compensationEventSubProcessSnapshotStateValid program after = true ∧
      compensationExecutionStateValid program after = true := by
  have absent := return_excludes_retention program id origin process definition output member
    (Bool.and_eq_true_iff.mp retention).1
  have registers : before.compensationActivityRetentions = [] := by
    have fact := (Bool.and_eq_true_iff.mp retention).2
    simpa only [absent, List.isEmpty_iff] using fact
  have parents : before.compensationParentContextRetentions = [] := by
    have fact := (Bool.and_eq_true_iff.mp snapshotValid).2
    simpa only [snapshots, List.isEmpty_iff] using fact
  have empty : before.compensationTriggers = [] ∧ before.compensationHandlerEffectWaits = [] := by
    cases declared : program.compensationExecution with
    | none =>
        simpa only [compensationExecutionStateValid, declared, Bool.and_eq_true, List.isEmpty_iff]
          using (Bool.and_eq_true_iff.mp execution).2
    | some declaration =>
        exact compensation_execution_empty_without_subjects program before declaration declared
          (compensation_execution_without_subject_sources program declaration declared absent snapshots
            (Bool.and_eq_true_iff.mp execution).1) execution
  refine ⟨?_, ?_, ?_⟩
  · simpa only [compensationActivityRetentionStateValid, absent, removeCalledProcessTree, registers,
      List.filter_nil] using retention
  · simpa only [compensationEventSubProcessSnapshotStateValid, snapshots, removeCalledProcessTree, parents,
      List.filter_nil] using snapshotValid
  · exact compensationExecutionStateValid_empty program _ (Bool.and_eq_true_iff.mp execution).1
      (by simp only [removeCalledProcessTree, empty.1, List.filter_nil])
      (by simp only [removeCalledProcessTree, empty.2, List.filter_nil])
      (Or.inr ⟨hosting, running⟩)

theorem preparedReturn_preserves_runtimeStateWellFormed (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional) (valid : runtimeStateWellFormed program hosting before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      runtimeStateWellFormed program hosting after = true := by
  have components := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  obtain ⟨position, races, incidents, waitOwners, waitIds, bounds, declarations, hidden, order,
    activities, timers, messages, activityIds, controllers, sequential, parallel, controllerIds,
    exhaustion, _, bodyClaims, retention, snapshotValid, execution⟩ := components
  obtain ⟨snapshots, declared, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨actual, running⟩ := regionalSelection_running program before _ prepared.selection selection
  have same := runtimePositionValid_running_instance program hosting actual before position running
  subst actual
  obtain ⟨_, _, current, _, _, _, _, _, opened, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have programValid := (projectOpenFlowNodeOccurrences_validities program before current hosting running opened).1
  have owners := (flowNodeOccurrenceProgramValidity_wait_owner_ids program before programValid).1
  have structural : flowNodeOccurrenceStructuralProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at programValid
    exact programValid.1.1.1
  obtain ⟨checked, fired, afterPosition, afterActivities, afterRaces⟩ :=
    ownershipClosedSelection_preserves_position_and_references program before hosting _ prepared.selection
      snapshots position structural (List.mem_filter.mp (by rw [declared]; simp)).1
      waitIds activities races closedSelection
  obtain ⟨after, firedAgain, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have sameAfter : checked = after := Option.some.inj (fired.symm.trans firedAgain)
  subst checked
  obtain ⟨fieldAfter, call, root, fieldApplied, kind, _, _, _, _, actualFields, _⟩ :=
    preparedReturn_quiescent_fields program before hosting id origin process definition output prepared valid found
  have sameFields : fieldAfter = after := Option.some.inj (fieldApplied.symm.trans applied)
  rw [sameFields] at actualFields
  have callClosed : regionalOwnershipClosed before (callReferenceRetention before call) = true := by
    simpa only [regionalSelectionReferenceRetention, kind] using closed
  obtain ⟨nextWaitIds, nextActivityIds, nextControllerIds⟩ :=
    removeCalledProcessTree_preserves_identity_uniqueness before call waitIds activityIds controllerIds
  obtain ⟨nextTimers, nextMessages, nextBodyClaims⟩ :=
    removeCalledProcessTree_preserves_activity_claim_uniqueness before call timers messages bodyClaims
  have removedOrder := removeCalledProcessTree_preserves_canonical_order before call order
  have nextOrder := canonicalCollectionOrder_tokens_update _ _ removedOrder
    (orderedBy_addToken _ output call.caller (canonicalCollectionOrder_tokens before order))
  obtain ⟨nextRetention, nextSnapshots, nextExecution⟩ := return_compensation_validity program before hosting call
    (addToken before.tokens output call.caller) id origin process definition output running
    (List.mem_filter.mp (by rw [declared]; simp)).1 snapshots retention snapshotValid execution
  refine ⟨after, applied, ?_⟩
  rw [actualFields] at afterPosition afterActivities afterRaces ⊢
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc]
  exact ⟨afterPosition, afterRaces,
    removeCalledProcessTree_preserves_incident_associations before call incidents,
    removeCalledProcessTree_preserves_wait_owners before call waitOwners, nextWaitIds,
    removeCalledProcessTree_preserves_identity_bound before call bounds,
    removeCalledProcessTree_preserves_wait_declarations program before hosting call declarations,
    removeCalledProcessTree_preserves_hidden_declarations program before call hidden,
    nextOrder, afterActivities, nextTimers, nextMessages, nextActivityIds,
    removeCalledProcessTree_preserves_controller_owners program before call controllers
      (Bool.and_eq_true_iff.mp sequential).1,
    removeCalledProcessTree_preserves_sequential_program_bindings program before call
      sequential activities timers controllerIds bodyClaims callClosed,
    removeCalledProcessTree_preserves_parallel_program_bindings program before call
      parallel activities bodyClaims timers owners callClosed,
    nextControllerIds, removeCalledProcessTree_preserves_controller_exhaustion before call exhaustion,
    by change (match before.control with | .notStarted => _ | _ => true) = true; rw [running],
    nextBodyClaims, nextRetention, nextSnapshots, nextExecution⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
