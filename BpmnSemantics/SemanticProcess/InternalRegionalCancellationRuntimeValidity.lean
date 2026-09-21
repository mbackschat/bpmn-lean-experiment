import BpmnSemantics.SemanticProcess.InternalRegionalCancellationCompensationValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationAcceptance
import BpmnSemantics.SemanticProcess.InternalRegionalSequentialBinding
import BpmnSemantics.SemanticProcess.InternalRegionalParallelReverseBinding
import BpmnSemantics.SemanticProcess.InternalRegionalRemovalOrder

/-! Aggregate cancellation preservation composes the established collection proofs.
Position and Compensation depend on whether the selected occurrence is a child or the
hosting root; the public operation theorems discharge those cases from preparation. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem cancellation_runtime_components (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition)
    (running : before.control = .running hosting)
    (valid : runtimeStateWellFormed program hosting before = true)
    (owners : ∀ wait ∈ before.waits, wait.processInstanceId = wait.owner.processInstanceId)
    (closed : regionalOwnershipClosed before (cancellationReferenceRetention before root disposition) = true)
    (position : runtimePositionValid program hosting (cancelScopeSubtree before root disposition) = true)
    (retention : compensationActivityRetentionStateValid program (cancelScopeSubtree before root disposition) = true)
    (snapshots : compensationEventSubProcessSnapshotStateValid program (cancelScopeSubtree before root disposition) = true)
    (execution : compensationExecutionStateValid program (cancelScopeSubtree before root disposition) = true) :
    runtimeStateWellFormed program hosting (cancelScopeSubtree before root disposition) = true := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid ⊢
  obtain ⟨_, races, incidents, waitOwners, waitIds, identityBounds, waitDeclarations,
    hiddenDeclarations, order, activities, timers, messages, activityIds, controllers,
    sequential, parallel, controllerIds, exhaustion, _, bodyClaims, _, _, _⟩ := valid
  obtain ⟨nextWaitIds, nextActivityIds, nextControllerIds⟩ :=
    cancelScopeSubtree_preserves_identity_uniqueness before root disposition waitIds activityIds controllerIds
  obtain ⟨nextTimers, nextMessages, nextBodyClaims⟩ :=
    cancelScopeSubtree_preserves_activity_claim_uniqueness before root disposition timers messages bodyClaims
  exact ⟨position,
    regional_reference_retention_preserves_event_race_associations before _ _
      (cancellationReferenceRetention_matches_removal before root disposition) closed races,
    cancelScopeSubtree_preserves_incident_associations before root disposition incidents,
    cancelScopeSubtree_preserves_wait_owners before root disposition waitOwners,
    nextWaitIds,
    cancelScopeSubtree_preserves_identity_bound before root disposition identityBounds,
    cancelScopeSubtree_preserves_wait_declarations program before hosting root disposition waitDeclarations,
    cancelScopeSubtree_preserves_hidden_declarations program before root disposition hiddenDeclarations,
    cancelScopeSubtree_preserves_canonical_order before root disposition order,
    cancelScopeSubtree_preserves_activity_records before root disposition activities timers messages,
    nextTimers, nextMessages, nextActivityIds,
    cancelScopeSubtree_preserves_controller_owners before root disposition controllers,
    cancelScopeSubtree_preserves_sequential_program_bindings program before root disposition
      sequential activities timers messages controllerIds bodyClaims,
    cancelScopeSubtree_preserves_parallel_program_bindings program before root disposition
      parallel activities bodyClaims timers messages owners,
    nextControllerIds,
    cancelScopeSubtree_preserves_controller_exhaustion before root disposition exhaustion,
    by change (match before.control with | .notStarted => _ | _ => true) = true; rw [running],
    nextBodyClaims, retention, snapshots, execution⟩

theorem preparedTerminate_preserves_runtimeStateWellFormed (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (definition : DefinitionScopeId) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (found : prepareInternalRegional? program before (.terminateScope id origin input definition) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      runtimeStateWellFormed program hosting after = true := by
  have components := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  obtain ⟨position, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, retention, snapshotValid, execution⟩ := components
  obtain ⟨snapshots, declared, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨selected, kind⟩ := regionalSelection_terminate_owner program before id origin input definition prepared.selection selection
  obtain ⟨actual, running⟩ := regionalSelection_running program before _ prepared.selection selection
  have same := runtimePositionValid_running_instance program hosting actual before position running
  subst actual
  have rootMember := regionalSelection_root_member program before _ prepared.selection selection
  obtain ⟨_, _, current, _, _, _, _, _, opened, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have owners := (flowNodeOccurrenceProgramValidity_wait_owner_ids program before
    (projectOpenFlowNodeOccurrences_validities program before current hosting running opened).1).1
  have member : .terminateScope id origin input definition ∈ program.operations :=
    (List.mem_filter.mp (by rw [declared]; simp)).1
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : terminateScopeState? program before id origin input definition = some after := by
    simp only [fire?, snapshots] at fired
    exact fired
  have afterPosition := terminateScopeState_preserves_position program before after hosting id origin input definition position result
  have cancelledPosition : runtimePositionValid program hosting
      (cancelScopeSubtree before prepared.selection.root.id .retain) = true := by
    cases parent : prepared.selection.root.parent with
    | none =>
        exact cancelScopeSubtree_hosting_preserves_position program before hosting hosting position running
          prepared.selection.root rootMember parent
          (selectedTerminateOwner_hosting program before hosting id origin input definition _ running selected)
    | some owner =>
        exact cancelScopeSubtree_child_preserves_position program before hosting hosting position running
          prepared.selection.root rootMember (by simp [parent]) .retain
  obtain ⟨retentionAfter, snapshotsAfter, executionAfter⟩ :=
    cancelScopeSubtree_terminate_compensation_validity program before hosting prepared.selection.root.id .retain
      id origin input definition running member snapshots retention snapshotValid execution
  have cancelled := cancellation_runtime_components program before hosting prepared.selection.root.id .retain
    running valid owners (by simpa only [regionalSelectionReferenceRetention, kind] using closed)
    cancelledPosition retentionAfter snapshotsAfter executionAfter
  refine ⟨after, applied, ?_⟩
  unfold terminateScopeState? at result
  rw [selected] at result
  cases result
  change runtimeStateWellFormed program hosting
    { cancelScopeSubtree before prepared.selection.root.id .retain with endOccurrences := before.endOccurrences + 1 } = true
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at cancelled ⊢
  obtain ⟨_, races, incidents, waits, waitIds, bounds, declarations, hidden, order, activities,
    timers, messages, activityIds, controllers, sequential, parallel, controllerIds, exhaustion,
    _, bodies, retention, snapshotValid, execution⟩ := cancelled
  exact ⟨afterPosition, races, incidents, waits, waitIds, bounds, declarations, hidden, order, activities,
    timers, messages, activityIds, controllers, sequential, parallel, controllerIds, exhaustion,
    by change (match before.control with | .notStarted => _ | _ => true) = true; rw [running],
    bodies, retention, snapshotValid, execution⟩

theorem preparedError_preserves_runtimeStateWellFormed (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (error : ErrorReference) (handler : InterruptingErrorHandler)
    (prepared : PreparedInternalRegional) (valid : runtimeStateWellFormed program hosting before = true)
    (found : prepareInternalRegional? program before (.throwError id origin input error handler) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      runtimeStateWellFormed program hosting after = true := by
  have components := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  obtain ⟨position, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, retention, snapshotValid, execution⟩ := components
  obtain ⟨snapshots, declared, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨actual, running⟩ := regionalSelection_running program before _ prepared.selection selection
  have same := runtimePositionValid_running_instance program hosting actual before position running
  subst actual
  have rootMember := regionalSelection_root_member program before _ prepared.selection selection
  obtain ⟨_, _, current, _, _, _, _, _, opened, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have owners := (flowNodeOccurrenceProgramValidity_wait_owner_ids program before
    (projectOpenFlowNodeOccurrences_validities program before current hosting running opened).1).1
  have member : .throwError id origin input error handler ∈ program.operations :=
    (List.mem_filter.mp (by rw [declared]; simp)).1
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : throwErrorState? before input error handler = some after := by
    simp only [fire?, snapshots] at fired
    exact fired
  have afterPosition := declaredError_preserves_position program before after hosting hosting id origin input error handler
    position running member result
  obtain ⟨parent, kind, parentEq, afterEq⟩ := regionalSelection_error_execution program before after
    id origin input error handler prepared.selection selection result
  have child : prepared.selection.root.parent ≠ none := by simp [parentEq]
  have cancelledPosition := cancelScopeSubtree_child_preserves_position program before hosting hosting position running
    prepared.selection.root rootMember child .remove
  have retentionAfter := cancelScopeSubtree_child_compensation_retention program before hosting hosting
    prepared.selection.root .remove position running rootMember child retention
  have executionAfter := cancelScopeSubtree_child_compensation_execution program before hosting hosting
    prepared.selection.root .remove position running rootMember child execution
  have snapshotsAfter : compensationEventSubProcessSnapshotStateValid program
      (cancelScopeSubtree before prepared.selection.root.id .remove) = true := by
    have empty : before.compensationParentContextRetentions = [] := by
      have absent := (Bool.and_eq_true_iff.mp snapshotValid).2
      simpa only [snapshots, List.isEmpty_iff] using absent
    simpa only [compensationEventSubProcessSnapshotStateValid, snapshots, cancelScopeSubtree, empty, List.filter_nil]
      using snapshotValid
  have cancelled := cancellation_runtime_components program before hosting prepared.selection.root.id .remove
    running valid owners (by simpa only [regionalSelectionReferenceRetention, kind] using closed)
    cancelledPosition retentionAfter snapshotsAfter executionAfter
  refine ⟨after, applied, ?_⟩
  rw [afterEq] at afterPosition ⊢
  have order := runtimeStateWellFormed_canonicalCollectionOrder program hosting _ cancelled
  have afterOrder := canonicalCollectionOrder_tokens_update _ _ order
    (orderedBy_addToken _ handler.output parent (canonicalCollectionOrder_tokens _ order))
  have afterExecution := compensation_execution_running_retained_frame program
    (cancelScopeSubtree before prepared.selection.root.id .remove)
    (interruptScope before prepared.selection.root.id parent handler.output) hosting running rfl rfl rfl
    (fun _ => rfl) (fun _ member => member) (fun _ member => member) executionAfter
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at cancelled ⊢
  obtain ⟨_, races, incidents, waits, waitIds, bounds, declarations, hidden, _, activities,
    timers, messages, activityIds, controllers, sequential, parallel, controllerIds, exhaustion,
    _, bodies, retention, snapshotValid, execution⟩ := cancelled
  exact ⟨afterPosition, races, incidents, waits, waitIds, bounds, declarations, hidden, afterOrder, activities,
    timers, messages, activityIds, controllers, sequential, parallel, controllerIds, exhaustion,
    by change (match before.control with | .notStarted => _ | _ => true) = true; rw [running],
    bodies, retention, snapshotValid, afterExecution⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
