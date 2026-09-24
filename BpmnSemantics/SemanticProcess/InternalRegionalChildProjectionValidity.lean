import BpmnSemantics.SemanticProcess.InternalRegionalChildWaitPreservation

/-! Child completion's projection associations retain exact Call roots, incident owners,
and event-race member censuses. Each predicate is preserved from its predecessor account. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem completeBoundedScope_child_has_parent (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (root : RuntimeScopeOccurrence)
    (children : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeBoundedScope? program before definition (some output) = some after) :
    root.parent.isSome = true := by
  obtain ⟨ordinary, completed, _⟩ := completeBoundedScope_position_fields program before after definition (some output) result
  have update := (completeScopeState_selected_update before ordinary definition (some output) root children completed).2
  cases parent : root.parent with
  | none => cases control : before.control <;> simp [parent, control] at update
  | some owner => rfl

theorem completeSelectedScope_child_has_parent (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (root : RuntimeScopeOccurrence)
    (children : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeSelectedScope? program before definition (some output) = some after) :
    root.parent.isSome = true := by
  obtain ⟨ordinary, completed, _⟩ := completeSelectedScope_position_fields program before after definition (some output) result
  have update := (completeScopeState_selected_update before ordinary definition (some output) root children completed).2
  cases parent : root.parent with
  | none => cases control : before.control <;> simp [parent, control] at update
  | some owner => rfl

theorem regional_child_call_associations_frame (before after : RuntimeState)
    (root : RuntimeScopeOccurrence) (definition : DefinitionScopeId)
    (children : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (parent : root.parent.isSome = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ root.id)))
    (control : after.control = before.control)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    calledProcessAssociationsValid after = calledProcessAssociationsValid before := by
  apply calledProcessAssociationsValid_parentless_frame before after control _ calls
  apply regional_child_scope_filter_frame before after root definition _ children scopes
  cases shape : root.parent <;> simp_all

theorem regional_child_incident_associations_frame (before after : RuntimeState) (removed : ScopeOccurrenceId)
    (quiet : scopeQuiescent before removed = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun child => decide (child.id ≠ removed)))
    (control : after.control = before.control)
    (effects : after.effectWaits = before.effectWaits)
    (incidents : after.effectIncidents = before.effectIncidents)
    (locals : after.variables.activities = before.variables.activities) :
    effectIncidentAssociationsValid after = effectIncidentAssociationsValid before := by
  have binding (incident : SemanticEffectIncident) (member : incident ∈ before.effectIncidents) :
      effectIncidentAssociationValid after incident = effectIncidentAssociationValid before incident := by
    have different := (regional_quiescent_wait_owners_differ before removed quiet).2.2.2.2.1 incident member
    have census := regional_other_owner_census before after removed incident.wait.owner scopes different
    change decide ((after.scopeOccurrences.filter (fun scope => decide (scope.id = incident.wait.owner))).length = 1) =
      decide ((before.scopeOccurrences.filter (fun scope => decide (scope.id = incident.wait.owner))).length = 1) at census
    have names (scope : RuntimeScopeOccurrence) : (scope.id == incident.wait.owner) = decide (scope.id = incident.wait.owner) := by
      apply Bool.eq_iff_iff.mpr
      simp only [beq_iff_eq, decide_eq_true_eq]
    simp only [effectIncidentAssociationValid, effectWaitOwnerAssociationValid, control, effects, locals]
    cases before.control <;> simp only [names, census]
  simp only [effectIncidentAssociationsValid, incidents]
  cases shape : before.effectIncidents with
  | nil => rfl
  | cons incident rest =>
      cases rest with
      | nil => exact binding incident (by simp [shape])
      | cons next tail => rfl

theorem preparedChildComplete_projection_associations (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (identities : waitIdentitiesUnique before = true)
    (priorCalls : calledProcessAssociationsValid before = true)
    (priorIncidents : effectIncidentAssociationsValid before = true)
    (priorRaces : eventRaceAssociationsValid before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      calledProcessAssociationsValid after = true ∧ effectIncidentAssociationsValid after = true ∧
      eventRaceAssociationsValid after = true := by
  obtain ⟨snapshots, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨after, withdrawal, applied, fired, _, children, quiet, scopes, _, _, _, _⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  have fields := regionalSelection_reference_fields program before after _ prepared.selection snapshots identities selection fired
  have raceValid := regional_reference_retention_preserves_event_race_associations before after _ fields closed priorRaces
  obtain ⟨actual, appliedAgain, _, control, calls, _⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  have same : actual = after := Option.some.inj (appliedAgain.symm.trans applied)
  subst actual
  have result : completeSelectedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeSelectedScope? program before definition (some output) = some after at fired
    exact fired
  have parent := completeSelectedScope_child_has_parent program before after definition output prepared.selection.root children result
  have callFrame := regional_child_call_associations_frame before after prepared.selection.root definition children parent scopes control calls
  obtain ⟨effects, incidents, _⟩ := regionalSelectedCompletion_effect_and_branch_fields program before after definition (some output) result
  have locals := congrArg ScopedVariables.activities
    (regionalLocalData_selected_completion_variables program before after definition (some output) result)
  have incidentFrame := regional_child_incident_associations_frame before after prepared.selection.root.id quiet scopes control effects incidents locals
  exact ⟨after, applied, callFrame.trans priorCalls, incidentFrame.trans priorIncidents, raceValid⟩

/-- ABMSG-ARM-01 requires an atomic Task/Message/Activity population. Empty Tasks
cannot make either reverse population check vacuous (MBP-EMPTY-TASK-01). -/
theorem messageBoundedProjection_empty_tasks
    (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundary : BoundaryMessageArm)
    (empty : (state.waits.filter fun wait =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
        (.awaitMessageBoundedUserTask id origin input task boundary) wait.owner &&
          decide (wait.task.id = task.id)) = [])
    (valid : messageBoundedOperationProjectionValid program state
      (.awaitMessageBoundedUserTask id origin input task boundary) = true) :
    (state.messageWaits.filter fun wait =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
        (.awaitMessageBoundedUserTask id origin input task boundary) wait.owner &&
          decide (wait.elementId = boundary.elementId)) = [] ∧
    (state.activityOccurrences.filter fun record =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
        (.awaitMessageBoundedUserTask id origin input task boundary) record.owner &&
          decide (record.activityElementId.value = task.id.value)) = [] := by
  have drop (records : List ActivityOccurrence) : records.filter (fun _ => false) = [] := by
    induction records with
    | nil => rfl
    | cons head tail ih => exact ih
  simp only [messageBoundedOperationProjectionValid, empty, List.all_nil,
    List.filter_nil, List.length_nil, Nat.zero_ne_one, decide_false,
    Bool.true_and, Bool.and_eq_true] at valid
  constructor
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro wait member
    have impossible := List.all_eq_true.mp valid.1 wait member
    simp only [drop, List.length_nil, Nat.zero_ne_one, decide_false,
      Bool.false_eq_true] at impossible
  · apply List.eq_nil_iff_forall_not_mem.mpr
    intro record member
    have impossible := List.all_eq_true.mp valid.2 record member
    contradiction

/-- The reverse Activity census requires an actual Task body in both Message-host dispositions. -/
theorem messageHostProjection_record_task_binding (program : Program) (state : RuntimeState)
    (contract : InternalMessageTaskContract) (record : ActivityOccurrence)
    (prior : messageBoundedOperationProjectionValid program state contract.operation = true)
    (member : record ∈ state.activityOccurrences.filter (fun candidate =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program contract.operation candidate.owner &&
        decide (candidate.activityElementId.value = contract.task.id.value))) :
    ∃ taskWait ∈ state.waits, taskWait.owner = record.owner ∧
      record.body = .userTask
        { processInstanceId := taskWait.processInstanceId
          elementId := ⟨taskWait.task.id.value⟩
          activation := taskWait.activation } := by
  cases kind : contract.kind
  all_goals
    simp only [InternalMessageTaskContract.operation, kind, messageBoundedOperationProjectionValid, Bool.and_eq_true] at prior member
    have recordValid := List.all_eq_true.mp prior.2 record member
    obtain ⟨taskWait, taskCensus⟩ := List.length_eq_one_iff.mp (of_decide_eq_true recordValid)
    have taskIn := congrArg (fun values : List UserTaskWait => taskWait ∈ values) taskCensus
    simp only [List.mem_singleton] at taskIn
    have taskMember := List.mem_filter.mp (Eq.mpr taskIn trivial)
    obtain ⟨messageWait, messageCensus⟩ := List.length_eq_one_iff.mp (of_decide_eq_true taskMember.2)
    have messageIn := congrArg (fun values : List MessageWait => messageWait ∈ values) messageCensus
    simp only [List.mem_singleton] at messageIn
    have paired := (List.mem_filter.mp (Eq.mpr messageIn trivial)).2
    change (_ && decide _) = true at paired
    simp only [Bool.and_eq_true, decide_eq_true_eq, and_assoc] at paired
    exact ⟨taskWait, (List.mem_filter.mp taskMember.1).1, paired.2.2.2.2.1,
      paired.2.2.2.2.2.2.2.2.2.2.1⟩

/-- The independent reverse record census binds every selected Activity to an actual
Task body and owner, including when the selected Task population is empty. -/
theorem messageBoundedProjection_record_task_binding (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundary : BoundaryMessageArm)
    (record : ActivityOccurrence)
    (prior : messageBoundedOperationProjectionValid program state
      (.awaitMessageBoundedUserTask id origin input task boundary) = true)
    (member : record ∈ state.activityOccurrences.filter (fun candidate =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
        (.awaitMessageBoundedUserTask id origin input task boundary) candidate.owner &&
          decide (candidate.activityElementId.value = task.id.value))) :
    ∃ taskWait ∈ state.waits, taskWait.owner = record.owner ∧
      record.body = .userTask
        { processInstanceId := taskWait.processInstanceId
          elementId := ⟨taskWait.task.id.value⟩
          activation := taskWait.activation } := by
  exact messageHostProjection_record_task_binding program state
    { kind := .interrupting, operationId := id, origin, input, task, message := boundary } record prior member

theorem messageBoundedProjection_record_not_child (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundary : BoundaryMessageArm)
    (record : ActivityOccurrence) (removed : ScopeOccurrenceId)
    (prior : messageBoundedOperationProjectionValid program state
      (.awaitMessageBoundedUserTask id origin input task boundary) = true)
    (member : record ∈ state.activityOccurrences.filter (fun candidate =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program
        (.awaitMessageBoundedUserTask id origin input task boundary) candidate.owner &&
          decide (candidate.activityElementId.value = task.id.value))) :
    record.body ≠ .childScope removed := by
  obtain ⟨taskWait, _, _, body⟩ := messageBoundedProjection_record_task_binding program state id origin input
    task boundary record prior member
  simp [body]

theorem completionWithdrawal_message_projection_validity (program : Program) (before after : RuntimeState)
    (root : ScopeOccurrenceId) (withdrawal : InternalCompletionWithdrawal)
    (prior : messageBoundedProjectionValid program before = true)
    (tasks : after.waits = before.waits) (messages : after.messageWaits = before.messageWaits)
    (activities : after.activityOccurrences = before.activityOccurrences.filter (fun record =>
      match (generalizing := false) withdrawal with | .unbounded => true | .bounded .. | .monitored .. => !decide (record.body = .childScope root))) :
    messageBoundedProjectionValid program after = true := by
  have preserves (contract : InternalMessageTaskContract)
      (valid : messageBoundedOperationProjectionValid program before contract.operation = true) :
      messageBoundedOperationProjectionValid program after contract.operation = true := by
    have census := regional_child_activity_filter_frame before after root withdrawal
      (fun record => FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program contract.operation record.owner &&
        decide (record.activityElementId.value = contract.task.id.value)) activities (by
          intro record recordMember body
          apply Bool.eq_false_iff.mpr
          intro selected
          obtain ⟨_, _, _, taskBody⟩ := messageHostProjection_record_task_binding program before contract record valid
            (List.mem_filter.mpr ⟨recordMember, selected⟩)
          simp [taskBody] at body)
    cases kind : contract.kind
    all_goals
      simp only [InternalMessageTaskContract.operation, kind] at census valid ⊢
      simpa only [messageBoundedOperationProjectionValid, tasks, messages, census] using valid
  simp only [messageBoundedProjectionValid, List.all_eq_true] at prior ⊢
  intro operation member
  have valid := prior operation member
  cases operation <;> try exact valid
  case awaitMessageBoundedUserTask id origin input task boundary =>
    exact preserves { kind := .interrupting, operationId := id, origin, input, task, message := boundary } valid
  case awaitMessageMonitoredUserTask id origin input task boundary =>
    exact preserves { kind := .nonInterrupting, operationId := id, origin, input, task, message := boundary } valid

theorem preparedChildComplete_message_projection_validity (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (identities : waitIdentitiesUnique before = true)
    (prior : messageBoundedProjectionValid program before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      messageBoundedProjectionValid program after = true := by
  obtain ⟨after, withdrawal, applied, _, _, _, _, _, tasks, messages, _, activities, _⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  exact ⟨after, applied, completionWithdrawal_message_projection_validity program before after prepared.selection.root.id
    withdrawal prior tasks messages activities⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
