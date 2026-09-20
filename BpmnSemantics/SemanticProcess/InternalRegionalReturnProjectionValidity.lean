import BpmnSemantics.SemanticProcess.InternalRegionalReturnWaitProjection
import BpmnSemantics.SemanticProcess.InternalRegionalChildProjectionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalIncidentValidity

/-! Return's independent projection guards follow from predecessor validators and the
actual cleanup. Message-boundary record retention uses the existing nested Task witness;
it does not strengthen the empty-Task predicate or claim cross-target domain agreement. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

theorem regional_return_message_projection_validity (program : Program) (before after : RuntimeState)
    (root : ScopeOccurrenceId)
    (prior : messageBoundedProjectionValid program before = true)
    (quiet : scopeQuiescent before root = true)
    (tasks : after.waits = before.waits) (messages : after.messageWaits = before.messageWaits)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record => decide (record.owner ≠ root))) :
    messageBoundedProjectionValid program after = true := by
  simp only [messageBoundedProjectionValid, List.all_eq_true] at prior ⊢
  intro operation member
  have valid := prior operation member
  cases operation <;> try exact valid
  case awaitMessageBoundedUserTask id origin input task boundary =>
    cases selectedTasks : before.waits.filter (fun wait =>
      operationOwnedBy program (.awaitMessageBoundedUserTask id origin input task boundary) wait.owner &&
        decide (wait.task.id = task.id)) with
    | nil => simp only [messageBoundedOperationProjectionValid, tasks, selectedTasks, List.all_nil]
    | cons firstTask rest =>
      have firstTaskMember : firstTask ∈ before.waits.filter (fun wait =>
          operationOwnedBy program (.awaitMessageBoundedUserTask id origin input task boundary) wait.owner &&
            decide (wait.task.id = task.id)) := by rw [selectedTasks]; simp
      have census := regional_return_activity_filter_frame before after root
        (fun record => operationOwnedBy program (.awaitMessageBoundedUserTask id origin input task boundary) record.owner &&
          decide (record.activityElementId.value = task.id.value)) activities (by
        intro record member owner
        apply Bool.eq_false_iff.mpr
        intro selected
        obtain ⟨taskWait, taskMember, taskOwner, _⟩ := messageBoundedProjection_record_task_binding program before
          id origin input task boundary record valid firstTask firstTaskMember (List.mem_filter.mpr ⟨member, selected⟩)
        exact (regional_quiescent_wait_owners_differ before root quiet).1 taskWait taskMember (taskOwner.trans owner))
      simpa only [messageBoundedOperationProjectionValid, tasks, messages, census] using valid

theorem preparedReturn_message_projection_validity (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program expected before = true)
    (prior : messageBoundedProjectionValid program before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      messageBoundedProjectionValid program after = true := by
  obtain ⟨after, record, root, applied, _, _, _, _, quiet, _, _, tasks, messages, _, _, _, activities, _⟩ :=
    preparedReturn_quiescent_fields program before expected id origin process definition output prepared valid found
  exact ⟨after, applied, regional_return_message_projection_validity program before after root.id prior quiet tasks messages activities⟩

theorem removeCalledProcessTree_structural_program_validity (program : Program) (state : RuntimeState)
    (selected : CalledProcessOccurrence)
    (prior : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (associations : calledProcessAssociationsValid state = true)
    (selectedMember : selected ∈ state.calledProcessOccurrences) :
    flowNodeOccurrenceStructuralProgramValidity program (removeCalledProcessTree state selected) = true := by
  let removed := processInstanceClosureWithin state.calledProcessOccurrences [selected.calledRoot.processInstanceId]
    (state.calledProcessOccurrences.length + 1)
  have liveFrame (owner : ScopeOccurrenceId) (outside : owner.processInstanceId ∉ removed) :
      flowNodeOccurrenceOwnerLiveUnique (removeCalledProcessTree state selected) owner =
        flowNodeOccurrenceOwnerLiveUnique state owner := by
    have census := removeCalledProcessTree_preserves_scope_census state selected owner (fun _ => true) outside
    simp only [Bool.and_true] at census
    simp only [flowNodeOccurrenceOwnerLiveUnique, census]
  have callFrame (owner : ScopeOccurrenceId) (definition : DefinitionScope)
      (outside : owner.processInstanceId ∉ removed) :
      (removeCalledProcessTree state selected).calledProcessOccurrences.filter (fun record => decide
        (record.calledRoot = owner && record.calledProcessId.value = definition.originElementId.value)) =
      state.calledProcessOccurrences.filter (fun record => decide
        (record.calledRoot = owner && record.calledProcessId.value = definition.originElementId.value)) := by
    change (state.calledProcessOccurrences.filter _).filter _ = _
    rw [List.filter_filter]
    apply List.filter_congr
    intro record member
    by_cases same : record.calledRoot = owner
    · have targetOutside : record.calledRoot.processInstanceId ∉ removed := by simpa only [same] using outside
      obtain ⟨different, callerOutside⟩ := removeCalledProcessTree_keeps_outside_target state selected record
        associations selectedMember member targetOutside
      change record.caller.processInstanceId ∉ removed at callerOutside
      change (_ && (decide (record.id ≠ selected.id) && !removed.contains record.caller.processInstanceId &&
        !removed.contains record.calledRoot.processInstanceId)) = _
      simp [same, different, outside, callerOutside]
    · simp [same]
  simp only [flowNodeOccurrenceStructuralProgramValidity, Bool.and_eq_true, List.all_eq_true] at prior ⊢
  constructor
  · intro occurrence member
    obtain ⟨member, kept⟩ := List.mem_filter.mp member
    have outside : occurrence.id.processInstanceId ∉ removed := by
      simpa only [Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] using kept
    have valid := prior.1 occurrence member
    change (match program.definitionScopes.filter (fun scope => decide (scope.id = occurrence.id.definitionScopeId)) with
      | [definition] => _
      | _ => false) = true at valid ⊢
    split at valid
    · rename_i definition declared
      simp only [Bool.and_eq_true] at valid ⊢
      refine ⟨⟨⟨⟨⟨valid.1.1.1.1.1, valid.1.1.1.1.2⟩, valid.1.1.1.2⟩,
        (liveFrame occurrence.id outside).trans valid.1.1.2⟩, valid.1.2⟩, ?_⟩
      have binding := valid.2
      have control : (removeCalledProcessTree state selected).control = state.control := rfl
      rw [control]
      cases parentEq : occurrence.parent with
      | none =>
          have incoming := callFrame occurrence.id definition outside
          simp only [Bool.and_eq_true] at incoming
          cases definitionParent : definition.parentScopeId <;> cases lifecycle : state.control <;>
            simpa only [definitionParent, lifecycle, parentEq, incoming] using binding
      | some parent =>
          cases definitionParent : definition.parentScopeId <;> cases lifecycle : state.control <;>
            simp only [definitionParent, lifecycle, parentEq, Bool.and_eq_true, decide_eq_true_eq] at binding ⊢
          all_goals try contradiction
          have parentOutside : parent.processInstanceId ∉ removed := by rw [binding.1.1]; exact outside
          exact ⟨binding.1, (liveFrame parent parentOutside).trans binding.2⟩
    · contradiction
  · intro record member
    obtain ⟨member, kept⟩ := List.mem_filter.mp member
    simp only [Bool.and_eq_true, Bool.not_eq_true', Bool.eq_false_iff, ne_eq, List.contains_iff_mem] at kept
    have valid := prior.2 record member
    change (occurrenceOwnerValid (removeCalledProcessTree state selected) record.id.processInstanceId
      record.caller ⟨record.id.elementId.value⟩ record.id.activation && _) = true
    change (occurrenceOwnerValid state record.id.processInstanceId record.caller
      ⟨record.id.elementId.value⟩ record.id.activation && _) = true at valid
    simpa only [occurrenceOwnerValid, liveFrame record.caller kept.1.2] using valid

theorem preparedReturn_structural_program_validity (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (prior : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceStructuralProgramValidity program after = true := by
  have snapshots := (prepareInternalRegional_facts program before _ prepared found).1
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : returnProcessState? before id origin process definition output = some after := by
    simp only [fire?, snapshots] at fired
    change returnProcessState? before id origin process definition output = some after at fired
    exact fired
  cases returnProcessState_sound before after id origin process definition output result with
  | permitted record root associations uniqueReturn processMatches scopeMatches uniqueRoot
      parentless uniqueCaller uniqueProcessRoot quiet =>
      have selected : record ∈ before.calledProcessOccurrences := by
        have present := congrArg (fun values : List CalledProcessOccurrence => record ∈ values) uniqueReturn
        simp only [List.mem_singleton] at present
        exact (List.mem_filter.mp (Eq.mpr present trivial)).1
      exact ⟨_, applied, removeCalledProcessTree_structural_program_validity program before record prior associations selected⟩

theorem preparedReturn_program_validity (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (process : ProcessId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program expected before = true)
    (prior : flowNodeOccurrenceProgramValidity program before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceProgramValidity program after = true := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at prior
  obtain ⟨after, record, root, applied, _, _, _, _, quiet, _, scopes, _, _, _, _, _, _, branches, races, _⟩ :=
    preparedReturn_quiescent_fields program before expected id origin process definition output prepared valid found
  obtain ⟨structuralAfter, structuralApplied, structuralValid⟩ :=
    preparedReturn_structural_program_validity program before id origin process definition output prepared prior.1.1.1 found
  have sameStructural : structuralAfter = after := Option.some.inj (structuralApplied.symm.trans applied)
  obtain ⟨waitAfter, waitApplied, waitValid⟩ :=
    preparedReturn_wait_program_validity program before expected id origin process definition output prepared valid prior.1.1.2 found
  have sameWaits : waitAfter = after := Option.some.inj (waitApplied.symm.trans applied)
  have retained := regional_child_branch_and_race_validity before after root.id prior.1.2 prior.2 quiet scopes branches races
  refine ⟨after, applied, ?_⟩
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true]
  exact ⟨⟨⟨sameStructural ▸ structuralValid, sameWaits ▸ waitValid⟩, retained.1⟩, retained.2⟩

theorem preparedReturn_projection_associations (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (identities : waitIdentitiesUnique before = true)
    (priorIncidents : effectIncidentAssociationsValid before = true)
    (priorRaces : eventRaceAssociationsValid before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      calledProcessAssociationsValid after = true ∧ effectIncidentAssociationsValid after = true ∧
      eventRaceAssociationsValid after = true := by
  obtain ⟨snapshots, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨hosting, running⟩ := regionalSelection_running program before _ prepared.selection selection
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have fields := regionalSelection_reference_fields program before after _ prepared.selection snapshots identities selection fired
  have raceValid := regional_reference_retention_preserves_event_race_associations before after _ fields closed priorRaces
  have result : returnProcessState? before id origin process definition output = some after := by
    simp only [fire?, snapshots] at fired
    change returnProcessState? before id origin process definition output = some after at fired
    exact fired
  cases returnProcessState_sound before after id origin process definition output result with
  | permitted record root associations uniqueReturn processMatches scopeMatches uniqueRoot
      parentless uniqueCaller uniqueProcessRoot quiet =>
      have selected : record ∈ before.calledProcessOccurrences := by
        have present := congrArg (fun values : List CalledProcessOccurrence => record ∈ values) uniqueReturn
        simp only [List.mem_singleton] at present
        exact (List.mem_filter.mp (Eq.mpr present trivial)).1
      exact ⟨_, applied,
        removeCalledProcessTree_preserves_call_associations before hosting record running associations selected,
        removeCalledProcessTree_preserves_incident_associations before record priorIncidents, raceValid⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
