import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalCommutationPublication
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Internal commutation conformance locks -/

namespace BpmnSemantics.InternalCommutationConformance

open BpmnSemantics.SemanticProcess

private def instanceId : SemanticId := ⟨"Instance_InternalCommutation"⟩

private def owner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"Process_InternalCommutation"⟩
    activation := 1 }

private def operationScope (operationId : OperationId) : OperationScopeOwnership :=
  { operationId, scopeId := owner.definitionScopeId }

private def inputPlace (id : ControlPlaceId) : ControlPlace :=
  { id, origin := ⟨⟨s!"Flow_{id.value}"⟩⟩ }

private def inputScope (controlPlaceId : ControlPlaceId) :
    ControlPlaceScopeOwnership :=
  { controlPlaceId, scopeId := owner.definitionScopeId }

private def userTask : SemanticOperation :=
  .awaitUserTask ⟨"operation:A_UserTask"⟩ { elementId := ⟨"A_UserTask"⟩ }
    ⟨"place:user-input"⟩ ⟨"place:user-output"⟩
    { id := ⟨"A_UserTask"⟩, name := some "A" }

private def timer : SemanticOperation :=
  .awaitTimer ⟨"operation:B_Timer"⟩ { elementId := ⟨"B_Timer"⟩ }
    ⟨"place:timer-input"⟩ ⟨"place:timer-output"⟩
    { elementId := ⟨"B_Timer"⟩, durationMs := 1000 }

private def userTaskB : SemanticOperation :=
  .awaitUserTask ⟨"operation:B_UserTask"⟩ { elementId := ⟨"B_UserTask"⟩ }
    ⟨"place:user-b-input"⟩ ⟨"place:user-b-output"⟩
    { id := ⟨"B_UserTask"⟩, name := some "B" }

private def userTaskC : SemanticOperation :=
  .awaitUserTask ⟨"operation:C_UserTask"⟩ { elementId := ⟨"C_UserTask"⟩ }
    ⟨"place:user-c-input"⟩ ⟨"place:user-c-output"⟩
    { id := ⟨"C_UserTask"⟩, name := some "C" }

private def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"internal-commutation-checkpoint"⟩
        sourceId := ⟨"internal-commutation-checkpoint"⟩
        sourceSha256 := "internal-commutation-checkpoint" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_InternalCommutation"⟩
    definitionScopes := []
    operationScopes :=
      [operationScope userTask.id, operationScope timer.id]
    controlPlaceScopes :=
      [inputScope ⟨"place:user-input"⟩, inputScope ⟨"place:timer-input"⟩]
    controlPlaces :=
      [inputPlace ⟨"place:user-input"⟩, inputPlace ⟨"place:timer-input"⟩]
    operations := [userTask, timer] }

private def state : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    tokens :=
      [{ placeId := ⟨"place:user-input"⟩, owner }
      , { placeId := ⟨"place:timer-input"⟩, owner }] }

private def userTaskPairProgram : Program :=
  { program with
    operations := [userTask, userTaskB]
    operationScopes := [operationScope userTask.id, operationScope userTaskB.id]
    controlPlaceScopes :=
      [inputScope ⟨"place:user-input"⟩, inputScope ⟨"place:user-b-input"⟩]
    controlPlaces :=
      [inputPlace ⟨"place:user-input"⟩, inputPlace ⟨"place:user-b-input"⟩] }

private def userTaskPairState : RuntimeState :=
  { state with
    tokens :=
      [{ placeId := ⟨"place:user-input"⟩, owner }
      , { placeId := ⟨"place:user-b-input"⟩, owner }] }

private def userTaskTripleProgram : Program :=
  { program with
    operations := [userTask, userTaskB, userTaskC]
    operationScopes :=
      [operationScope userTask.id, operationScope userTaskB.id,
        operationScope userTaskC.id]
    controlPlaceScopes :=
      [inputScope ⟨"place:user-input"⟩, inputScope ⟨"place:user-b-input"⟩,
        inputScope ⟨"place:user-c-input"⟩]
    controlPlaces :=
      [inputPlace ⟨"place:user-input"⟩, inputPlace ⟨"place:user-b-input"⟩,
        inputPlace ⟨"place:user-c-input"⟩] }

private def userTaskTripleState : RuntimeState :=
  { state with
    tokens :=
      [{ placeId := ⟨"place:user-input"⟩, owner }
      , { placeId := ⟨"place:user-b-input"⟩, owner }
      , { placeId := ⟨"place:user-c-input"⟩, owner }] }

private def fireTwo (candidate : Program) (before : RuntimeState)
    (first second : SemanticOperation) : Option RuntimeState := do
  let intermediate ← fire? candidate first before
  fire? candidate second intermediate

private def fireThree (candidate : Program) (before : RuntimeState)
    (first second third : SemanticOperation) : Option RuntimeState := do
  let intermediate ← fire? candidate first before
  let penultimate ← fire? candidate second intermediate
  fire? candidate third penultimate

/-- Both arms are independently enabled, so the closed two-operation footprint classifier must accept them. -/
theorem mixed_pair_is_enabled_and_independent :
    (fire? program userTask state).isSome = true ∧
      (fire? program timer state).isSome = true ∧
      internalOperationPairIndependent? program state [userTask, timer] = true := by
  decide +kernel

theorem ordinary_user_task_pair_has_footprints :
    (internalTransitionFootprint? userTaskPairProgram userTaskPairState userTask).isSome = true ∧
      (internalTransitionFootprint? userTaskPairProgram userTaskPairState userTaskB).isSome = true ∧
      internalOperationPairIndependent? userTaskPairProgram userTaskPairState
        [userTask, userTaskB] = true := by
  decide +kernel

/-- The first final-closure Red: all six permutations of three ordinary User Tasks reach one exact raw state, and the complete frontier classifier admits the batch. -/
theorem ordinary_user_task_triple_commutes_under_all_permutations :
    internalOperationFrontierPairwiseIndependent? userTaskTripleProgram
        userTaskTripleState [userTask, userTaskB, userTaskC] = true ∧
      fireThree userTaskTripleProgram userTaskTripleState userTask userTaskB userTaskC =
        fireThree userTaskTripleProgram userTaskTripleState userTask userTaskC userTaskB ∧
      fireThree userTaskTripleProgram userTaskTripleState userTask userTaskB userTaskC =
        fireThree userTaskTripleProgram userTaskTripleState userTaskB userTask userTaskC ∧
      fireThree userTaskTripleProgram userTaskTripleState userTask userTaskB userTaskC =
        fireThree userTaskTripleProgram userTaskTripleState userTaskB userTaskC userTask ∧
      fireThree userTaskTripleProgram userTaskTripleState userTask userTaskB userTaskC =
        fireThree userTaskTripleProgram userTaskTripleState userTaskC userTask userTaskB ∧
      fireThree userTaskTripleProgram userTaskTripleState userTask userTaskB userTaskC =
        fireThree userTaskTripleProgram userTaskTripleState userTaskC userTaskB userTask := by
  decide +kernel

private def selectiveConflictTaskC : SemanticOperation :=
  .awaitUserTask ⟨"operation:C_UserTask"⟩ { elementId := ⟨"C_UserTask"⟩ }
    ⟨"place:user-input"⟩ ⟨"place:user-c-output"⟩
    { id := ⟨"C_UserTask"⟩, name := some "C" }

private def selectiveConflictProgram : Program :=
  { program with
    operations := [userTask, userTaskB, selectiveConflictTaskC]
    operationScopes :=
      [operationScope userTask.id, operationScope userTaskB.id,
        operationScope selectiveConflictTaskC.id]
    controlPlaceScopes :=
      [inputScope ⟨"place:user-input"⟩, inputScope ⟨"place:user-b-input"⟩]
    controlPlaces :=
      [inputPlace ⟨"place:user-input"⟩, inputPlace ⟨"place:user-b-input"⟩] }

private def selectiveConflictState : RuntimeState :=
  { state with
    tokens :=
      [{ placeId := ⟨"place:user-input"⟩, owner }
      , { placeId := ⟨"place:user-b-input"⟩, owner }] }

/-- The canonical first two operations commute, but the third competes for the first operation's exact input token, so a first-two-only classifier is unsound. -/
theorem selective_later_pair_conflict_is_refused :
    (fire? selectiveConflictProgram userTask selectiveConflictState).isSome = true ∧
      (fire? selectiveConflictProgram userTaskB selectiveConflictState).isSome = true ∧
      (fire? selectiveConflictProgram selectiveConflictTaskC selectiveConflictState).isSome =
        true ∧
      internalOperationFrontierPairwiseIndependent? selectiveConflictProgram
        selectiveConflictState [userTask, userTaskB] = true ∧
      internalOperationFrontierPairwiseIndependent? selectiveConflictProgram
        selectiveConflictState [userTask, userTaskB, selectiveConflictTaskC] = false := by
  decide +kernel

private def selectiveConflictStart : SemanticOperation :=
  .initiate ⟨"operation:0_SelectiveStart"⟩ { elementId := ⟨"SelectiveStart"⟩ }
    ⟨"place:selective-start-to-fork"⟩

private def selectiveConflictFork : SemanticOperation :=
  .duplicate ⟨"operation:1_SelectiveFork"⟩ { elementId := ⟨"SelectiveFork"⟩ }
    ⟨"place:selective-start-to-fork"⟩
    [⟨"place:user-input"⟩, ⟨"place:user-b-input"⟩]

private def selectiveConflictTraceProgram : Program :=
  { selectiveConflictProgram with
    definitionScopes :=
      [ { id := owner.definitionScopeId, parentScopeId := none
          originElementId := ⟨"Process_InternalCommutation"⟩ } ]
    operations :=
      [selectiveConflictStart, selectiveConflictFork, userTask, userTaskB,
        selectiveConflictTaskC]
    operationScopes :=
      [operationScope selectiveConflictStart.id, operationScope selectiveConflictFork.id,
        operationScope userTask.id, operationScope userTaskB.id,
        operationScope selectiveConflictTaskC.id]
    controlPlaceScopes :=
      [inputScope ⟨"place:selective-start-to-fork"⟩,
        inputScope ⟨"place:user-input"⟩, inputScope ⟨"place:user-b-input"⟩]
    controlPlaces :=
      [inputPlace ⟨"place:selective-start-to-fork"⟩,
        inputPlace ⟨"place:user-input"⟩, inputPlace ⟨"place:user-b-input"⟩] }

private def selectiveConflictTraceStart : Stimulus :=
  .startProcess ⟨"start-selective-conflict"⟩
    ⟨selectiveConflictTraceProgram.processId.value⟩ instanceId []

private def selectiveConflictPreBatchState : RuntimeState :=
  let started :=
    (runningProgramStartState? selectiveConflictTraceProgram instanceId []).getD initialState
  (runChoices selectiveConflictTraceProgram started
    [selectiveConflictStart.id, selectiveConflictFork.id]).getD initialState

private def selectiveConflictTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit selectiveConflictTraceProgram initialState
    selectiveConflictTraceStart

/-- Refusal preserves the exact state at the conflicting frontier and publishes none of the command's prior internal selections. -/
theorem selective_later_pair_conflict_preserves_batch_start_and_selects_nothing :
    selectiveConflictTrace.result.state = selectiveConflictPreBatchState ∧
      selectiveConflictTrace.result.ambiguousInternalChoice = true ∧
      selectiveConflictTrace.result.internalStepBoundExceeded = false ∧
      selectiveConflictTrace.committedTransitions = [] ∧
      selectiveConflictTrace.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

private def calledInstanceId : SemanticId := ⟨"Instance_CalledMessage"⟩

private def calledOwner : ScopeOccurrenceId :=
  { processInstanceId := calledInstanceId
    definitionScopeId := owner.definitionScopeId
    activation := 2 }

private def calledMessage : SemanticOperation :=
  .awaitMessage ⟨"operation:CalledMessage"⟩ { elementId := ⟨"CalledMessage"⟩ }
    ⟨"place:called-message-input"⟩ ⟨"place:called-message-output"⟩
    { elementId := ⟨"CalledMessage"⟩
      channel := .directMessage ⟨"Message_Called"⟩ }

private def calledMessageProgram : Program :=
  { program with
    definitionScopes :=
      [{ id := owner.definitionScopeId, parentScopeId := none,
         originElementId := ⟨"Process_InternalCommutation"⟩ }]
    operations := [calledMessage]
    operationScopes := [operationScope calledMessage.id]
    controlPlaceScopes := [inputScope ⟨"place:called-message-input"⟩]
    controlPlaces := [inputPlace ⟨"place:called-message-input"⟩] }

private def calledMessageState : RuntimeState :=
  { state with
    scopeOccurrences :=
      [{ id := owner, parent := none }, { id := calledOwner, parent := some owner }]
    tokens := [{ placeId := ⟨"place:called-message-input"⟩, owner := calledOwner }] }

private def calledMessageAfter : RuntimeState :=
  (fire? calledMessageProgram calledMessage calledMessageState).getD initialState

private def calledMessageOccurrence : OccurrenceId :=
  { processInstanceId := calledInstanceId, elementId := ⟨"CalledMessage"⟩, activation := 1 }

/-- Ordinary waits under a called owner use that owner's instance in state, footprint, and lifecycle. -/
theorem called_message_uses_owner_instance_everywhere :
    calledMessageAfter.messageWaits.map (·.processInstanceId) = [calledInstanceId] ∧
      (internalTransitionFootprint? calledMessageProgram calledMessageState calledMessage).map
        (·.occurrence) = some calledMessageOccurrence ∧
      (candidateFlowNodeOccurrenceDeltaForOperation? calledMessageProgram calledMessageState
          calledMessageAfter calledMessage ⟨"command:CalledMessage"⟩ 0).map
        (fun delta => delta.started.map (·.anchor)) =
          some [.wait calledMessageOccurrence] := by
  decide +kernel

private def duplicateCompositeDeclarer : SemanticOperation :=
  .awaitBoundedUserTask ⟨"operation:CompositeUserTask"⟩
    { elementId := ⟨"CompositeUserTask"⟩ } ⟨"place:composite-input"⟩
    { id := ⟨"A_UserTask"⟩, name := some "composite",
      output := ⟨"place:composite-output"⟩ }
    { elementId := ⟨"CompositeBoundary"⟩, durationMs := 1000,
      output := ⟨"place:composite-boundary-output"⟩,
      origin := ⟨⟨"Flow_CompositeBoundary"⟩⟩ }

private def compositeDeclarerProgram : Program :=
  { program with
    operations := [userTask, duplicateCompositeDeclarer]
    operationScopes :=
      [operationScope userTask.id, operationScope duplicateCompositeDeclarer.id] }

/-- A non-footprint composite producer participates in the complete User Task declarer census. -/
theorem composite_duplicate_declarer_refuses_ordinary_footprint :
    internalTransitionFootprint? compositeDeclarerProgram state userTask = none := by
  decide +kernel

/-- Canonical inserts make both explicit execution orders the same raw runtime value. -/
theorem mixed_pair_two_step_state_is_exactly_equal :
    fireTwo program state userTask timer = fireTwo program state timer userTask := by
  decide +kernel

theorem mixed_pair_result_is_canonically_stored :
    canonicalCollectionOrder
      ((fireTwo program state userTask timer).getD initialState) = true := by
  decide +kernel

private def collidingTimer : SemanticOperation :=
  .awaitTimer ⟨"operation:B_CollidingTimer"⟩ { elementId := ⟨"A_UserTask"⟩ }
    ⟨"place:timer-input"⟩ ⟨"place:timer-output"⟩
    { elementId := ⟨"A_UserTask"⟩, durationMs := 1000 }

private def collidingAnchorProgram : Program :=
  { program with
    operations := [userTask, collidingTimer]
    operationScopes := [operationScope userTask.id, operationScope collidingTimer.id] }

/-- Private wait-family tags do not distinguish the actual public wait anchor. -/
theorem cross_family_untagged_anchor_collision_is_refused :
    internalOperationPairIndependent? collidingAnchorProgram state
      [userTask, collidingTimer] = false := by
  decide +kernel

theorem canonical_operation_order_ignores_program_storage :
    canonicalInternalOperations [timer, userTask] =
      canonicalInternalOperations [userTask, timer] := by
  decide +kernel

private def sharedEffectDefinition : EffectDefinition :=
  { elementId := ⟨"SharedEffect"⟩
    descriptor :=
      { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
        operation := "urn:bpmn-lean:effect-operation:shared-v1" }
    inputMappings := []
    outputMappings := [] }

private def incidentAnchorTask : SemanticOperation :=
  .awaitUserTask ⟨"operation:IncidentAnchorTask"⟩ { elementId := ⟨"IncidentAnchor"⟩ }
    ⟨"place:incident-anchor-input"⟩ ⟨"place:incident-anchor-output"⟩
    { id := ⟨"IncidentAnchor"⟩, name := some "incident anchor" }

private def incidentAnchorProgram : Program :=
  { program with
    operations := [incidentAnchorTask]
    operationScopes := [operationScope incidentAnchorTask.id]
    controlPlaceScopes := [inputScope ⟨"place:incident-anchor-input"⟩]
    controlPlaces := [inputPlace ⟨"place:incident-anchor-input"⟩] }

private def incidentAnchorOccurrence : EffectOccurrenceId :=
  { processInstanceId := instanceId, elementId := ⟨"IncidentAnchor"⟩, activation := 1 }

private def incidentAnchorWait : EffectWait :=
  { processInstanceId := instanceId
    owner
    elementId := ⟨"IncidentAnchor"⟩
    activation := 1
    descriptor := sharedEffectDefinition.descriptor
    arguments := []
    outputMappings := []
    output := ⟨"place:incident-anchor-effect-output"⟩
    bpmnErrorRoute := none }

private def incidentAnchorState : RuntimeState :=
  { state with
    tokens := [{ placeId := ⟨"place:incident-anchor-input"⟩, owner }]
    effectIncidents :=
      [{ id := { effectId := incidentAnchorOccurrence, generation := 1 },
         wait := incidentAnchorWait }]
    variables :=
      { state.variables with
        activities := [{ owner := incidentAnchorOccurrence, bindings := [] }] } }

/-- Incident-retained waits occupy the same untagged public anchor domain as ordinary arms. -/
theorem incident_anchor_refuses_ordinary_footprint :
    effectIncidentAssociationsValid incidentAnchorState = true ∧
      internalTransitionFootprint? incidentAnchorProgram incidentAnchorState incidentAnchorTask = none := by
  decide +kernel

private def leftEffect : SemanticOperation :=
  .awaitEffect ⟨"operation:A_Effect"⟩ { elementId := ⟨"SharedEffect"⟩ }
    ⟨"place:effect-a-input"⟩ ⟨"place:effect-a-output"⟩ sharedEffectDefinition none

private def rightEffect : SemanticOperation :=
  .awaitEffect ⟨"operation:B_Effect"⟩ { elementId := ⟨"SharedEffect"⟩ }
    ⟨"place:effect-b-input"⟩ ⟨"place:effect-b-output"⟩ sharedEffectDefinition none

private def sharedEffectProgram : Program :=
  { program with
    operations := [leftEffect, rightEffect]
    operationScopes := [operationScope leftEffect.id, operationScope rightEffect.id]
    controlPlaceScopes :=
      [inputScope ⟨"place:effect-a-input"⟩, inputScope ⟨"place:effect-b-input"⟩]
    controlPlaces :=
      [inputPlace ⟨"place:effect-a-input"⟩, inputPlace ⟨"place:effect-b-input"⟩] }

private def sharedEffectState : RuntimeState :=
  { state with
    tokens :=
      [{ placeId := ⟨"place:effect-a-input"⟩, owner }
      , { placeId := ⟨"place:effect-b-input"⟩, owner }] }

/-- Distinct operation, input, and output identifiers do not hide the shared counter, occurrence, and Activity scope. -/
theorem same_effect_write_write_is_refused :
    (fire? sharedEffectProgram leftEffect sharedEffectState).isSome = true ∧
      (fire? sharedEffectProgram rightEffect sharedEffectState).isSome = true ∧
      internalOperationPairIndependent? sharedEffectProgram sharedEffectState
        [leftEffect, rightEffect] = false := by
  decide +kernel

private def sameEffectLeftFootprint : InternalTransitionFootprint :=
  { operationId := leftEffect.id
    kind := .effect
    occurrence :=
      { processInstanceId := instanceId, elementId := ⟨"SharedEffect"⟩, activation := 1 }
    reads := []
    writes :=
      [.activation .effect ⟨"SharedEffect"⟩,
       .wait .effect
        { processInstanceId := instanceId, elementId := ⟨"SharedEffect"⟩, activation := 1 },
       .activityVariableScope
        { processInstanceId := instanceId, elementId := ⟨"SharedEffect"⟩, activation := 1 }]
    publications :=
      [.publicationPair leftEffect.id
        { processInstanceId := instanceId, elementId := ⟨"SharedEffect"⟩, activation := 1 }] }

private def sameEffectRightFootprint : InternalTransitionFootprint :=
  { sameEffectLeftFootprint with
    operationId := rightEffect.id
    publications :=
      [.publicationPair rightEffect.id
        { processInstanceId := instanceId, elementId := ⟨"SharedEffect"⟩,
          activation := 1 }] }

theorem same_effect_footprints_are_write_write_conflicting :
    footprintsNonInterfering sameEffectLeftFootprint sameEffectRightFootprint = false := by
  decide +kernel

private def distinctEffectDefinition : EffectDefinition :=
  { sharedEffectDefinition with elementId := ⟨"DistinctEffect"⟩ }

private def distinctRightEffect : SemanticOperation :=
  .awaitEffect ⟨"operation:B_DistinctEffect"⟩ { elementId := ⟨"DistinctEffect"⟩ }
    ⟨"place:effect-b-input"⟩ ⟨"place:effect-b-output"⟩ distinctEffectDefinition none

private def distinctEffectProgram : Program :=
  { sharedEffectProgram with
    operations := [leftEffect, distinctRightEffect]
    operationScopes := [operationScope leftEffect.id, operationScope distinctRightEffect.id] }

/-- Distinct effect occurrences commute while their waits, counters, and Activity scopes stay canonical. -/
theorem distinct_effect_pair_commutes_exactly :
    internalOperationPairIndependent? distinctEffectProgram sharedEffectState
        [leftEffect, distinctRightEffect] = true ∧
      fireTwo distinctEffectProgram sharedEffectState leftEffect distinctRightEffect =
        fireTwo distinctEffectProgram sharedEffectState distinctRightEffect leftEffect ∧
      canonicalCollectionOrder
        ((fireTwo distinctEffectProgram sharedEffectState leftEffect distinctRightEffect).getD
          initialState) = true := by
  decide +kernel

private def sharedActivationAtom : InternalStateAtom :=
  .activation .userTask ⟨"Shared"⟩

private def abstractLeftFootprint : InternalTransitionFootprint :=
  { operationId := ⟨"operation:AbstractLeft"⟩
    kind := .userTask
    occurrence :=
      { processInstanceId := instanceId, elementId := ⟨"AbstractLeft"⟩, activation := 1 }
    reads := []
    writes := [sharedActivationAtom]
    publications :=
      [.publicationPair ⟨"operation:AbstractLeft"⟩
        { processInstanceId := instanceId, elementId := ⟨"AbstractLeft"⟩, activation := 1 }] }

private def abstractRightFootprint : InternalTransitionFootprint :=
  { operationId := ⟨"operation:AbstractRight"⟩
    kind := .timer
    occurrence :=
      { processInstanceId := instanceId, elementId := ⟨"AbstractRight"⟩, activation := 1 }
    reads := [sharedActivationAtom]
    writes := [.wait .timer
      { processInstanceId := instanceId, elementId := ⟨"AbstractRight"⟩, activation := 1 }]
    publications :=
      [.publicationPair ⟨"operation:AbstractRight"⟩
        { processInstanceId := instanceId, elementId := ⟨"AbstractRight"⟩, activation := 1 }] }

/-- The write/read direction rejects even when write/write and publication comparisons are disjoint. -/
theorem abstract_write_read_is_refused :
    footprintsNonInterfering abstractLeftFootprint abstractRightFootprint = false := by
  decide +kernel

private def unsupported : SemanticOperation :=
  .duplicate ⟨"operation:Unsupported"⟩ { elementId := ⟨"Unsupported"⟩ }
    ⟨"place:unsupported-input"⟩ [⟨"place:unsupported-output"⟩]

theorem unsupported_and_non_pair_frontiers_fail_closed :
    internalTransitionFootprint? { program with operations := [unsupported] }
        state unsupported = none ∧
      internalOperationPairIndependent? program state [] = false ∧
      internalOperationPairIndependent? program state [userTask] = false ∧
      internalOperationPairIndependent? { program with operations := [userTask, timer, unsupported] }
        state [userTask, timer, unsupported] = false := by
  decide +kernel

private def parallelStart : Stimulus :=
  .startProcess ⟨"start-internal-commutation"⟩
    ⟨"Process_ParallelForkJoin"⟩ ⟨"Instance_InternalCommutationTrace"⟩ []

private def parallelTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit parallelProgram initialState parallelStart

private def parallelArmedA : RuntimeState :=
  (runChoices parallelProgram parallelAfterFork [parallelTaskAOperation]).getD initialState

private def parallelArmedB : RuntimeState :=
  (runChoices parallelProgram parallelAfterFork [parallelTaskBOperation]).getD initialState

private def parallelArmedAThenB : RuntimeState :=
  (runChoices parallelProgram parallelArmedA [parallelTaskBOperation]).getD initialState

private def parallelArmedBThenA : RuntimeState :=
  (runChoices parallelProgram parallelArmedB [parallelTaskAOperation]).getD initialState

private def pairedTransitionIds : List OperationId :=
  (parallelTrace.committedTransitions.drop 3).filterMap fun
    | .internalOperation record => some record.operationId
    | .externalStimulus _ => none

private def pairedLifecycleElements : List NodeId :=
  (parallelTrace.flowNodeOccurrenceLifecycles.drop 3).flatMap fun delta =>
    delta.started.map (·.elementId)

/-- The canonical pair keeps each transition record aligned with its own lifecycle start. -/
theorem paired_publication_is_canonical_and_aligned :
    pairedTransitionIds =
        [⟨"operation:UserTask_A"⟩, ⟨"operation:UserTask_B"⟩] ∧
      pairedLifecycleElements = [⟨"UserTask_A"⟩, ⟨"UserTask_B"⟩] ∧
      parallelTrace.result.state =
        parallelWaitingStateFor ⟨"Instance_InternalCommutationTrace"⟩ := by
  decide +kernel

/-- The admitted pre-state and both intermediates remain well formed before reaching one exact raw state. -/
theorem admitted_pair_preserves_enabledness_well_formedness_and_exact_state :
    programWellFormed parallelProgram = true ∧
      runtimeStateWellFormed parallelProgram parallelInstanceId parallelAfterFork = true ∧
      runtimeStateWellFormed parallelProgram parallelInstanceId parallelArmedA = true ∧
      runtimeStateWellFormed parallelProgram parallelInstanceId parallelArmedB = true ∧
      (projectOpenFlowNodeOccurrences? parallelProgram parallelArmedA).isSome = true ∧
      (projectOpenFlowNodeOccurrences? parallelProgram parallelArmedB).isSome = true ∧
      parallelArmedAThenB = parallelArmedBThenA := by
  decide +kernel

private def parallelTaskASemanticOperation : SemanticOperation :=
  (parallelProgram.operations.find? fun operation =>
    decide (operation.id = parallelTaskAOperation)).getD userTask

private def parallelTaskBSemanticOperation : SemanticOperation :=
  (parallelProgram.operations.find? fun operation =>
    decide (operation.id = parallelTaskBOperation)).getD userTaskB

theorem complete_pair_publication_is_order_independent :
    let leftFirst := acceptedInternalPairPublication? parallelProgram parallelInstanceId
      parallelAfterFork parallelTaskASemanticOperation parallelTaskBSemanticOperation
      ⟨"command:InternalCommutationPublication"⟩ 3
    let rightFirst := acceptedInternalPairPublication? parallelProgram parallelInstanceId
      parallelAfterFork parallelTaskBSemanticOperation parallelTaskASemanticOperation
      ⟨"command:InternalCommutationPublication"⟩ 3
    leftFirst.isSome = true ∧ leftFirst = rightFirst := by
  dsimp only
  have admitted : programWellFormed parallelProgram = true ∧
      runtimeStateWellFormed parallelProgram parallelInstanceId parallelAfterFork = true ∧
      (projectOpenFlowNodeOccurrences? parallelProgram parallelAfterFork).isSome = true ∧
      internalOperationPairIndependent? parallelProgram parallelAfterFork
        [parallelTaskASemanticOperation, parallelTaskBSemanticOperation] = true := by
    decide +kernel
  obtain ⟨publication, leftEq, rightEq⟩ :=
    classified_internal_pair_publication_commutes parallelProgram parallelAfterFork
      parallelTaskASemanticOperation parallelTaskBSemanticOperation parallelInstanceId
      ⟨"command:InternalCommutationPublication"⟩ 3 admitted.1 admitted.2.1
      admitted.2.2.1 admitted.2.2.2
  constructor
  · rw [leftEq]
    rfl
  · rw [leftEq, rightEq]

/-- Zero fuel retains bound precedence and does not relabel the frontier as an ambiguous choice. -/
theorem zero_fuel_bound_precedence_is_unchanged :
    let result := applyStimulus 0 parallelProgram initialState parallelStart
    result.outcome = .committed ∧ result.internalStepBoundExceeded = true ∧
      result.ambiguousInternalChoice = false := by
  decide +kernel

end BpmnSemantics.InternalCommutationConformance
