import BpmnSemantics.SemanticProcess.ProfileCardinalities
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import BpmnSemantics.SemanticProcess.TransactionSourceAdmission
import BpmnSemantics.SemanticProcess.ValueDomain
import BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import BpmnSemantics.SemanticProcess.RepeatableSubscriptionAdmission
import BpmnSemantics.SemanticProcess.CallDataAdmission
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessProgramAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeProgramAdmission
import BpmnSemantics.SemanticProcess.SequentialScopeCheckedAdmission

/-! # Semantic profile shape catalog

This module selects profile capabilities and the closed graph policy shared by the two independently implemented graph validators. Cardinality calculations are owned by `ProfileCardinalities`.
-/

namespace BpmnSemantics.SemanticProcess

/-- Runtime-frozen profile identity used only by the owner-approved semantic checkpoint. Product registration remains outside this Lean lane. -/
def terminateEndCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-terminate-end-event-draft"⟩

/-- Runtime-frozen configured Task identity for the owner-approved Lean checkpoint only. -/
def configuredTaskCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-bpmn-lean-configured-task-effect-draft"⟩

/-- Runtime-frozen identity of the owner-approved Service Task incident checkpoint. -/
def serviceTaskIncidentCheckpointProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-service-task-incident-draft"⟩

/-- Runtime-frozen identity of the owner-approved Service Task incident cancellation checkpoint. -/
def serviceTaskIncidentCancellationCheckpointProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-service-task-incident-cancellation-draft"⟩

/-- Runtime-frozen identity of the Activity boundary Message checkpoint. -/
def activityBoundaryMessageProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-activity-boundary-message-draft"⟩

def checkedShape? (profile : String) : Option (Nat × ShapeCardinalities) :=
  if profile = sequentialMultiInstanceUserTaskProfileId.value then
    some (1,
      { starts := 1, userTasks := 1, sequentialMultiInstanceUserTasks := 1,
        ends := 2 })
  else if profile = parallelMultiInstanceUserTaskProfileId.value then
    some (1, { starts := 1, userTasks := 1, ends := 2 })
  else if profile = activityDataInputUserTaskProfileId.value then
    some (1, { starts := 1, dataInputUserTasks := 1, ends := 1 })
  else if profile = activityDataInputOutputUserTaskProfileId.value then
    some (1, { starts := 1, dataInputOutputUserTasks := 1, ends := 1 })
  else if profile = activityDataOutputUserTaskProfileId.value then
    some (1, { starts := 1, dataOutputUserTasks := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-message-start-event-draft" then
    some (1, { messageStarts := 1, userTasks := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-timer-start-event-draft" then
    some (1, { timerStarts := 1, userTasks := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-user-task-process-data-draft" ||
      profile = userTaskProcessDataPreservedNotationProfileId.value ||
      profile = booleanProcessDataCheckpointProfileId.value ||
      profile = userTaskAssignmentFormMetadataProfileId.value ||
      profile = "bpmn-2.0.2-user-task-preserved-notation-draft" then
    -- The preserve-enabled profile reaches this shape by construction: Lean receives only the
    -- executed partition, so a source carrying retained notation and its notation-free twin
    -- present the same checked graph here.
    some (1, { starts := 1, userTasks := 1, ends := 1 })
  else if profile = structuredHumanWorkProfileId.value then
    some (1, { starts := 1, userTasks := 1, choices := 1, ends := 3 })
  else if profile = "cibseven-2.2.0-intermediate-catch-timer-draft" then
    some (1, { starts := 1, timers := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-service-task-effect-draft" ||
      profile = serviceTaskIncidentCheckpointProfileId.value ||
      profile = serviceTaskIncidentCancellationCheckpointProfileId.value ||
      profile = "cibseven-2.0.0-mapped-success-service-task-draft" then
    some (1, { starts := 1, effects := 1, ends := 1 })
  else if profile =
      "cibseven-2.0.0-mapped-boundary-error-service-task-draft" then
    some (1,
      { starts := 1, userTasks := 1, effects := 1, ends := 2 })
  else if profile = "parallel-fork-join-draft" ||
      profile = parallelUserTaskMetadataCheckpointProfileId.value then
    some (1,
      { starts := 1, userTasks := 2, duplicates := 1,
        synchronizes := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" then
    some (1,
      { starts := 1, userTasks := 3, choices := 1, ends := 3 })
  else if profile = "bpmn-2.0.2-user-task-cycle-draft" then
    some (1,
      { starts := 1, userTasks := 1, exclusiveMerges := 1,
        choices := 1, ends := 1 })
  else if profile =
      "bpmn-2.0.2-inclusive-gateway-selected-branches-draft" then
    some (1,
      { starts := 1, userTasks := 3, inclusiveSplits := 1,
        inclusiveJoins := 1, ends := 1 })
  else if profile =
      "bpmn-2.0.2-event-based-gateway-message-timer-draft" then
    some (1,
      { starts := 1, userTasks := 2, messages := 1, timers := 1,
        eventGateways := 1, ends := 2 })
  else if profile = "bpmn-2.0.2-timer-user-task-composition-draft" then
    some (1,
      { starts := 1, userTasks := 1, timers := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-intermediate-catch-message-draft" then
    some (1,
      { starts := 1, userTasks := 1, messages := 1, ends := 1 })
  else if profile = messagePayloadCatchProfileId.value then
    some (1,
      { starts := 1, userTasks := 1, payloadMessages := 1, ends := 1 })
  else if profile = messageKeyCorrelationProfileId.value then
    some (1,
      { starts := 1, userTasks := 1, payloadMessages := 1,
        correlatedPayloadMessages := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-message-addressed-receive-task-draft" then
    some (1, { starts := 1, receiveTasks := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-embedded-subprocess-completion-draft" then
    some (2,
      { starts := 2, embeddedScopes := 1, userTasks := 3,
        duplicates := 1, ends := 3 })
  else if profile =
      "cibseven-2.2.0-subprocess-error-propagation-draft" then
    some (2,
      { starts := 2, embeddedScopes := 1, boundaryErrors := 1,
        userTasks := 3, duplicates := 1, errorEnds := 1, ends := 3 })
  else if profile =
      "bpmn-2.0.2-called-process-call-activity-draft" then
    some (2,
      { starts := 2, callActivities := 1, userTasks := 2, ends := 2 })
  else if profile = "bpmn-2.0.2-activity-boundary-timer-draft" then
    some (1,
      { starts := 1, boundaryTimers := 1, userTasks := 3, ends := 2 })
  else if profile = activityBoundaryMessageProfileId.value then
    some (1,
      { starts := 1, boundaryMessages := 1, userTasks := 3, ends := 2 })
  else if profile = "bpmn-2.0.2-non-interrupting-boundary-timer-draft" then
    some (1,
      { starts := 1, monitoredBoundaryTimers := 1, userTasks := 3, ends := 2 })
  else if profile = "bpmn-2.0.2-subprocess-boundary-timer-draft" then
    some (2,
      { starts := 2, embeddedScopes := 1, boundaryTimers := 1,
        userTasks := 3, ends := 3 })
  else if profile = terminateEndCheckpointProfileId.value then
    some (2,
      { starts := 2, embeddedScopes := 1, userTasks := 3,
        duplicates := 1, terminateEnds := 1, ends := 2 })
  else if profile = configuredTaskCheckpointProfileId.value then
    some (1,
      { starts := 1, configuredTasks := 1, userTasks := 1, ends := 1 })
  else if profile = compensationSourceCheckpointProfileId.value then
    some (3,
      { starts := 2, embeddedScopes := 1, userTasks := 3, duplicates := 1,
        synchronizes := 1, compensationThrows := 1, ends := 2 })
  else none

def programShape? (profile : String) : Option (Nat × ShapeCardinalities) :=
  if profile = sequentialMultiInstanceUserTaskProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, sequentialMultiInstanceUserTasks := 1,
        ends := 2 })
  else if profile = parallelMultiInstanceUserTaskProfileId.value then
    some (1, withScopeCompletions 1 { initiates := 1, userTasks := 1, ends := 2 })
  else if profile = activityDataInputUserTaskProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, dataInputUserTasks := 1, ends := 1 })
  else if profile = activityDataInputOutputUserTaskProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, dataInputOutputUserTasks := 1, ends := 1 })
  else if profile = activityDataOutputUserTaskProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, dataOutputUserTasks := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-message-start-event-draft" then
    some (1, withScopeCompletions 1
      { messageInitiates := 1, userTasks := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-timer-start-event-draft" then
    some (1, withScopeCompletions 1
      { timerInitiates := 1, userTasks := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-user-task-process-data-draft" ||
      profile = userTaskProcessDataPreservedNotationProfileId.value ||
      profile = booleanProcessDataCheckpointProfileId.value ||
      profile = userTaskAssignmentFormMetadataProfileId.value ||
      profile = "bpmn-2.0.2-user-task-preserved-notation-draft" then
    some (1, withScopeCompletions 1 { initiates := 1, userTasks := 1, ends := 1 })
  else if profile = structuredHumanWorkProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, choices := 1, ends := 3 })
  else if profile = "cibseven-2.2.0-intermediate-catch-timer-draft" then
    some (1, withScopeCompletions 1 { initiates := 1, timers := 1, ends := 1 })
  else if profile = "cibseven-2.2.0-service-task-effect-draft" ||
      profile = serviceTaskIncidentCheckpointProfileId.value ||
      profile = serviceTaskIncidentCancellationCheckpointProfileId.value ||
      profile = "cibseven-2.0.0-mapped-success-service-task-draft" then
    some (1, withScopeCompletions 1 { initiates := 1, effects := 1, ends := 1 })
  else if profile =
      "cibseven-2.0.0-mapped-boundary-error-service-task-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, effects := 1, ends := 2 })
  else if profile = "parallel-fork-join-draft" ||
      profile = parallelUserTaskMetadataCheckpointProfileId.value then
    some (1,
      withScopeCompletions 1
        { initiates := 1, userTasks := 2, duplicates := 1,
          synchronizes := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 3, choices := 1, ends := 3 })
  else if profile = "bpmn-2.0.2-user-task-cycle-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, exclusiveMerges := 1,
        choices := 1, ends := 1 })
  else if profile =
      "bpmn-2.0.2-inclusive-gateway-selected-branches-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 3, selectMany := 1,
        synchronizeSelected := 1, ends := 1 })
  else if profile =
      "bpmn-2.0.2-event-based-gateway-message-timer-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 2, eventRaces := 1, ends := 2 })
  else if profile = "bpmn-2.0.2-timer-user-task-composition-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, timers := 1, ends := 1 })
  else if profile = "bpmn-2.0.2-intermediate-catch-message-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, messages := 1, ends := 1 })
  else if profile = messagePayloadCatchProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, payloadMessages := 1, ends := 1 })
  else if profile = messageKeyCorrelationProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, payloadMessages := 1,
        correlatedPayloadMessages := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-message-addressed-receive-task-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, messages := 1, ends := 1 })
  else if profile =
      "cibseven-2.2.0-embedded-subprocess-completion-draft" then
    some (2,
      withScopeCompletions 2
        { initiates := 1, scopeEntries := 1, userTasks := 3,
          duplicates := 1, ends := 3 })
  else if profile =
      "cibseven-2.2.0-subprocess-error-propagation-draft" then
    some (2,
      withScopeCompletions 2
        { initiates := 1, scopeEntries := 1, userTasks := 3,
          duplicates := 1, errorThrows := 1, ends := 3 })
  else if profile =
      "bpmn-2.0.2-called-process-call-activity-draft" then
    some (2, withScopeCompletions 1
      { initiates := 1, processInvokes := 1, processReturns := 1,
        userTasks := 2, ends := 2 })
  else if profile = "bpmn-2.0.2-activity-boundary-timer-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, boundedUserTasks := 1, userTasks := 2, ends := 2 })
  else if profile = activityBoundaryMessageProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, messageBoundedUserTasks := 1, userTasks := 2, ends := 2 })
  else if profile = "bpmn-2.0.2-non-interrupting-boundary-timer-draft" then
    some (1, withScopeCompletions 1
      { initiates := 1, monitoredUserTasks := 1, userTasks := 2, ends := 2 })
  else if profile = "bpmn-2.0.2-subprocess-boundary-timer-draft" then
    some (2, withScopeCompletions 2
      { initiates := 1, boundedScopeEntries := 1, userTasks := 3, ends := 3 })
  else if profile = terminateEndCheckpointProfileId.value then
    some (2, withScopeCompletions 2
      { initiates := 1, scopeEntries := 1, userTasks := 3,
        duplicates := 1, scopeTerminations := 1, ends := 2 })
  else if profile = configuredTaskCheckpointProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, effects := 1, userTasks := 1, ends := 1 })
  else if profile = compensationSourceCheckpointProfileId.value then
    some (3, withScopeCompletions 2
      { initiates := 1, scopeEntries := 1, userTasks := 3, duplicates := 1,
        synchronizes := 1, compensationTriggers := 1, ends := 2 })
  else none

private def configuredTaskDescriptorValid (descriptor : EffectDescriptor) : Bool :=
  descriptor.protocol = "urn:bpmn-lean:effect-protocol:activity-v1" &&
    descriptor.operation = "urn:bpmn-lean:effect-operation:probe-v1"

private def checkedUserTaskMetadataValid (profile : ProfileId)
    (nodes : List CheckedNode) : Bool :=
  nodes.all fun
    | .userTask _ _ metadata =>
        if profile = parallelUserTaskMetadataCheckpointProfileId then
          match metadata with
          | some metadata => UserTaskMetadata.assignmentFormWellFormed metadata
          | none => false
        else if profile = userTaskAssignmentFormMetadataProfileId then
          match metadata with
          | some metadata => UserTaskMetadata.assignmentFormWellFormed metadata
          | none => false
        else if profile = structuredHumanWorkProfileId then
          match metadata with
          | some metadata => UserTaskMetadata.assignmentOnlyWellFormed metadata
          | none => false
        else
          metadata.isNone
    | _ => true

private def programUserTaskMetadataValid (profile : ProfileId)
    (operations : List SemanticOperation) : Bool :=
  operations.all fun
    | .awaitUserTask _ _ _ _ task =>
        if profile = parallelUserTaskMetadataCheckpointProfileId then
          match task.metadata with
          | some metadata => UserTaskMetadata.assignmentFormWellFormed metadata
          | none => false
        else if profile = userTaskAssignmentFormMetadataProfileId then
          match task.metadata with
          | some metadata => UserTaskMetadata.assignmentFormWellFormed metadata
          | none => false
        else if profile = structuredHumanWorkProfileId then
          match task.metadata with
          | some metadata => UserTaskMetadata.assignmentOnlyWellFormed metadata
          | none => false
        else
          task.metadata.isNone
    | _ => true

private def exactPortSet [DecidableEq α] (actual expected : List α) : Bool :=
  actual.length = expected.length &&
    expected.all (fun port => decide (port ∈ actual)) &&
    decide expected.Nodup

private def exactBalancedTwoBranchTopology [DecidableEq α]
    [DecidableEq β] (connectors : List β)
    (start split leftTask rightTask join finish : α)
    (startOutputs splitInputs splitOutputs leftInputs leftOutputs
      rightInputs rightOutputs joinInputs joinOutputs finishInputs : List β) : Bool :=
  match startOutputs, splitInputs, leftInputs, leftOutputs, rightInputs,
      rightOutputs, joinOutputs, finishInputs with
  | [startOutput], [splitInput], [leftInput], [leftOutput], [rightInput],
      [rightOutput], [joinOutput], [finishInput] =>
      decide (List.Nodup [start, split, leftTask, rightTask, join, finish]) &&
        decide (startOutput = splitInput) &&
        exactPortSet splitOutputs [leftInput, rightInput] &&
        exactPortSet joinInputs [leftOutput, rightOutput] &&
        decide (joinOutput = finishInput) &&
        exactPortSet connectors
          [startOutput, leftInput, rightInput, leftOutput, rightOutput, joinOutput]
  | _, _, _, _, _, _, _, _ => false

private def checkedIncomingPorts (source : CheckedProcess) (nodeId : NodeId) : List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then some flow.id else none

private def checkedOutgoingPorts (source : CheckedProcess) (nodeId : NodeId) : List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.sourceId = nodeId then some flow.id else none

private def checkedOnlyOutgoingFlow? (source : CheckedProcess) (nodeId : NodeId) :
    Option CheckedSequenceFlow :=
  match source.sequenceFlows.filter fun flow => decide (flow.sourceId = nodeId) with
  | [flow] => if flow.condition.isNone then some flow else none
  | _ => none

private def checkedActivityBoundaryMessageTopologyValid (source : CheckedProcess) : Bool :=
  if source.identity.semanticProfile = activityBoundaryMessageProfileId then
    match source.nodes.filterMap (fun | .noneStartEvent id => some id | _ => none),
        source.nodes.filterMap (fun
          | .messageBoundaryEvent id host _ _ output => some (id, host, output)
          | _ => none),
        source.nodes.filterMap (fun | .userTask id _ _ => some id | _ => none),
        source.nodes.filterMap (fun | .noneEndEvent id => some id | _ => none) with
    | [start], [(boundary, host, handlerOutput)], tasks, [endA, endB] =>
        match tasks.filter (fun id => decide (id ≠ host)) with
        | [left, right] =>
            match checkedOnlyOutgoingFlow? source start,
                checkedOnlyOutgoingFlow? source host,
                checkedOnlyOutgoingFlow? source boundary,
                checkedOnlyOutgoingFlow? source left,
                checkedOnlyOutgoingFlow? source right with
            | some startFlow, some hostFlow, some boundaryFlow, some leftFlow,
                some rightFlow =>
                let distinctEnds :=
                  (leftFlow.targetId = endA && rightFlow.targetId = endB) ||
                  (leftFlow.targetId = endB && rightFlow.targetId = endA)
                source.sequenceFlows.length = 5 && startFlow.targetId = host &&
                  boundaryFlow.id = handlerOutput && distinctEnds &&
                  ((hostFlow.targetId = left && boundaryFlow.targetId = right) ||
                    (hostFlow.targetId = right && boundaryFlow.targetId = left))
            | _, _, _, _, _ => false
        | _ => false
    | _, _, _, _ => false
  else true

private def parallelTopologyProfile (profile : ProfileId) : Bool :=
  profile.value = "parallel-fork-join-draft" ||
    profile = parallelUserTaskMetadataCheckpointProfileId

private def checkedParallelTopologyValid (source : CheckedProcess) : Bool :=
  if parallelTopologyProfile source.identity.semanticProfile then
    match source.nodes.filterMap fun
        | .noneStartEvent id => some id
        | _ => none,
      source.nodes.filterMap fun
        | .parallelGateway id .diverging => some id
        | _ => none,
      source.nodes.filterMap fun
        | .userTask id _ _ => some id
        | _ => none,
      source.nodes.filterMap fun
        | .parallelGateway id .converging => some id
        | _ => none,
      source.nodes.filterMap fun
        | .noneEndEvent id => some id
        | _ => none with
    | [start], [split], [leftTask, rightTask], [join], [finish] =>
        source.sequenceFlows.all (fun flow => flow.condition.isNone) &&
          exactBalancedTwoBranchTopology
            (source.sequenceFlows.map fun flow => flow.id)
            start split leftTask rightTask join finish
            (checkedOutgoingPorts source start) (checkedIncomingPorts source split)
            (checkedOutgoingPorts source split) (checkedIncomingPorts source leftTask)
            (checkedOutgoingPorts source leftTask) (checkedIncomingPorts source rightTask)
            (checkedOutgoingPorts source rightTask) (checkedIncomingPorts source join)
            (checkedOutgoingPorts source join) (checkedIncomingPorts source finish)
    | _, _, _, _, _ => false
  else true

private def programParallelTopologyValid (program : Program) : Bool :=
  if parallelTopologyProfile program.identity.semanticProfile then
    match program.operations.filterMap fun
        | .initiate id origin output => some (id, origin.elementId, output)
        | _ => none,
      program.operations.filterMap fun
        | .duplicate id origin input outputs => some (id, origin.elementId, input, outputs)
        | _ => none,
      program.operations.filterMap fun
        | .awaitUserTask id origin input output _ =>
            some (id, origin.elementId, input, output)
        | _ => none,
      program.operations.filterMap fun
        | .synchronize id origin inputs output => some (id, origin.elementId, inputs, output)
        | _ => none,
      program.operations.filterMap fun
        | .reachNoneEnd id origin input => some (id, origin.elementId, input)
        | _ => none with
    | [(startId, start, startOutput)], [(splitId, split, splitInput, splitOutputs)],
        [(leftId, leftTask, leftInput, leftOutput),
          (rightId, rightTask, rightInput, rightOutput)],
        [(joinId, join, joinInputs, joinOutput)], [(finishId, finish, finishInput)] =>
        decide (List.Nodup [startId, splitId, leftId, rightId, joinId, finishId]) &&
          exactBalancedTwoBranchTopology
            (program.controlPlaces.map fun place => place.id)
            start split leftTask rightTask join finish
            [startOutput] [splitInput] splitOutputs [leftInput] [leftOutput]
            [rightInput] [rightOutput] joinInputs [joinOutput] [finishInput]
    | _, _, _, _, _ => false
  else true

private def programActivityBoundaryMessageTopologyValid (program : Program) : Bool :=
  if program.identity.semanticProfile = activityBoundaryMessageProfileId then
    match program.operations.filterMap (fun | .initiate _ _ output => some output | _ => none),
        program.operations.filterMap (fun
          | .awaitMessageBoundedUserTask _ _ input task handler =>
              some (input, task.output, handler.output)
          | _ => none),
        program.operations.filterMap (fun
          | .awaitUserTask _ _ input output _ => some (input, output)
          | _ => none),
        program.operations.filterMap (fun | .reachNoneEnd _ _ input => some input | _ => none) with
    | [startOutput], [(hostInput, normalOutput, boundaryOutput)],
        [(leftInput, leftOutput), (rightInput, rightOutput)], [endAInput, endBInput] =>
        startOutput = hostInput &&
          exactPortSet (program.controlPlaces.map fun place => place.id)
            [startOutput, normalOutput, boundaryOutput, leftOutput, rightOutput] &&
          ((normalOutput = leftInput && boundaryOutput = rightInput) ||
            (normalOutput = rightInput && boundaryOutput = leftInput)) &&
          ((leftOutput = endAInput && rightOutput = endBInput) ||
            (leftOutput = endBInput && rightOutput = endAInput))
    | _, _, _, _ => false
  else true

private def exactUncheckedEdge (source : CheckedProcess)
    (sourceId targetId : NodeId) : Bool :=
  source.sequenceFlows.any fun flow =>
    decide (flow.sourceId = sourceId && flow.targetId = targetId) &&
      flow.condition.isNone

private def configuredTaskCheckedPayloadValid (source : CheckedProcess) : Bool :=
  if source.identity.semanticProfile = configuredTaskCheckpointProfileId then
    match source.nodes.filterMap fun
        | .noneStartEvent id => some id
        | _ => none,
      source.nodes.filterMap fun
        | .configuredTask id descriptor => some (id, descriptor)
        | _ => none,
      source.nodes.filterMap fun
        | .userTask id _ _ => some id
        | _ => none,
      source.nodes.filterMap fun
        | .noneEndEvent id => some id
        | _ => none with
    | [startId], [(configuredId, descriptor)], [userId], [endId] =>
        configuredTaskDescriptorValid descriptor &&
          source.sequenceFlows.length = 3 &&
          exactUncheckedEdge source startId configuredId &&
          exactUncheckedEdge source configuredId userId &&
          exactUncheckedEdge source userId endId
    | _, _, _, _ => false
  else true

/-- Profile-owned cycle cuts preserve the older User-only boundary and the MTCF User/Service boundary separately. -/
inductive ProfileGraphPolicy where
  | acyclic
  | resumptionBounded
  | mixedTaskResumptionBounded
  deriving Repr, DecidableEq

def profileGraphPolicy? (profile : String) : Option ProfileGraphPolicy :=
  if profile = mixedTaskControlFlowProfileId.value || profile = mixedTaskBusinessErrorProfileId.value then some .mixedTaskResumptionBounded
  else if profile = "bpmn-2.0.2-user-task-cycle-draft" then
    some .resumptionBounded
  else if profile = transactionCancellationCheckpointProfileId.value ||
      profile = structuredCompositionCheckpointProfileId.value ||
      profile = serialBusinessTaskProfileId.value ||
      profile = "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" ||
      profile = callDataCheckpointProfileId.value ||
      profile = interruptingMessageEventSubProcessProfileId.value ||
      profile = repeatableSubscriptionCheckpointProfileId.value ||
      ((checkedShape? profile).isSome && (programShape? profile).isSome) then
    some .acyclic
  else none

private def propertyInput (input : DirectActivityDataInput) : Bool :=
  match input.source with | .property _ => true | .processDataInput _ => false

private def propertyOutput (output : DirectActivityDataOutput) : Bool :=
  match output.target with | .property _ => true | .processDataOutput _ => false

private def checkedPropertyEndpoints : CheckedNode → Bool
  | .callActivity _ _ data => decide (data = .empty)
  | .dataInputUserTask _ _ input => propertyInput input
  | .dataOutputUserTask _ _ output => propertyOutput output
  | .dataInputOutputUserTask _ _ input output => propertyInput input && propertyOutput output
  | _ => true

private def operationPropertyEndpoints : SemanticOperation → Bool
  | .invokeProcess _ _ _ _ _ _ _ data | .returnProcess _ _ _ _ _ data => decide (data = .empty)
  | .awaitDataInputUserTask _ _ _ _ _ _ input => propertyInput input
  | .awaitDataOutputUserTask _ _ _ _ _ _ output => propertyOutput output
  | .awaitDataInputOutputUserTask _ _ _ _ _ _ input output => propertyInput input && propertyOutput output
  | _ => true

/-- Exact checked node and definition-scope cardinalities selected by the profile. -/
def checkedProfileCapabilitiesValid (source : CheckedProcess) : Bool :=
  if source.identity.semanticProfile.value == "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" then
    (SequentialScopeChecked.analyze source).isSome
  else if source.identity.semanticProfile == interruptingMessageEventSubProcessProfileId then
    interruptingMessageEventSubProcessCheckedGraph source
  else source.interruptingMessageEventSubProcesses.isEmpty &&
  if source.identity.semanticProfile == callDataCheckpointProfileId then
    callDataCheckedGraph source
  else if source.identity.semanticProfile == mixedTaskControlFlowProfileId || source.identity.semanticProfile == mixedTaskBusinessErrorProfileId then
    (MixedTaskControlFlow.checkedAnalysis source).isSome
  else if source.identity.semanticProfile == serialBusinessTaskProfileId then
    (SerialBusinessTask.checkedAnalysis source).isSome
  else if source.identity.semanticProfile == structuredCompositionCheckpointProfileId then
    structuredCompositionCheckedGraph source
  else if source.identity.semanticProfile == transactionCancellationCheckpointProfileId then
    transactionCancellationCheckedGraph source
  else transactionSourceAbsent source &&
  if source.identity.semanticProfile = repeatableSubscriptionCheckpointProfileId then
    repeatableSubscriptionCheckedGraph source
  else
  checkedSequentialMultiInstanceProfileMatches source &&
    checkedParallelMultiInstanceProfileMatches source &&
    match checkedShape? source.identity.semanticProfile.value with
    | some (scopeCount, shape) =>
        source.definitionScopes.length = scopeCount &&
          nodeCardinalities source.nodes = shape &&
          source.nodes.all checkedPropertyEndpoints &&
          checkedUserTaskMetadataValid source.identity.semanticProfile source.nodes &&
          checkedParallelTopologyValid source &&
          checkedActivityBoundaryMessageTopologyValid source &&
          structuredHumanWorkCheckedTopologyValid source &&
          configuredTaskCheckedPayloadValid source
          && messageKeyCorrelationCheckedPayloadValid source &&
          compensationSourceCheckedProfileValid source
    | none => false

private def operationPayloadCapabilitiesValid (profile : String)
    (operations : List SemanticOperation) : Bool :=
  if profile = "bpmn-2.0.2-message-start-event-draft" then
    operations.all fun
      | .initiateMessage _ _ (.operationMessage ..) outputs =>
          outputs.length = 1
      | .initiateMessage .. => false
      | _ => true
  else if profile = messagePayloadCatchProfileId.value then
    operations.all fun
      | .awaitPayloadMessage _ origin _ _ message directOutput =>
          origin.elementId = message.elementId &&
            match message.channel with
            | .operationMessage interfaceId operationId messageId =>
                let identities :=
                  [ message.elementId.value, interfaceId.value, operationId.value, messageId.value
                  , directOutput.associationId, directOutput.sourceDataOutputId
                  , directOutput.targetPropertyId ]
                message.channel.identifiersNonempty && identities.all (fun id => !id.isEmpty) &&
                  identities.eraseDups.length = identities.length &&
                  decide (directOutput.sourceDataOutputName ≠ some "")
            | .directMessage .. => false
      | _ => true
  else if profile = activityBoundaryMessageProfileId.value then
    operations.all fun
      | .awaitMessageBoundedUserTask _ origin _ task boundaryMessage =>
          origin.elementId.value = task.id.value &&
            boundaryMessage.channel.identifiersNonempty &&
            match boundaryMessage.channel with
            | .operationMessage .. => true
            | .directMessage .. => false
      | _ => true
  else if profile = "bpmn-2.0.2-timer-start-event-draft" then
    operations.all fun
      | .initiateTimer _ _ durationMs outputs =>
          durationMs = 1000 && outputs.length = 1
      | _ => true
  else if profile = "bpmn-2.0.2-user-task-cycle-draft" then
    operations.all fun
      | .mergeExclusive _ _ inputs _ => inputs.length = 3
      | _ => true
  else if profile = configuredTaskCheckpointProfileId.value then
    operations.all fun
      | .awaitEffect _ origin _ _ effect route =>
          origin.elementId = effect.elementId &&
            configuredTaskDescriptorValid effect.descriptor &&
            effect.inputMappings.isEmpty && effect.outputMappings.isEmpty &&
            route.isNone
      | _ => true
  else if profile = serviceTaskIncidentCheckpointProfileId.value ||
      profile = serviceTaskIncidentCancellationCheckpointProfileId.value then
    operations.all fun
      | .awaitEffect _ origin _ _ effect route =>
          origin.elementId = effect.elementId &&
            configuredTaskDescriptorValid effect.descriptor &&
            effect.inputMappings.isEmpty && effect.outputMappings.isEmpty &&
            route.isNone
      | _ => true
  else true

/-- Exact operation and definition-scope cardinalities selected by the profile. -/
def programProfileCapabilitiesValid (program : Program) : Bool :=
  if program.identity.semanticProfile.value == "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" then
    SequentialScopeProgram.admitted program
  else if program.identity.semanticProfile == interruptingMessageEventSubProcessProfileId then
    interruptingMessageEventSubProcessProgramGraph program
  else program.interruptingMessageEventSubProcesses.isEmpty &&
  if program.identity.semanticProfile == callDataCheckpointProfileId then
    callDataProgramGraph program
  else if program.identity.semanticProfile == transactionCancellationCheckpointProfileId then
    transactionCancellationProgramGraph program
  else if program.identity.semanticProfile = repeatableSubscriptionCheckpointProfileId then
    repeatableSubscriptionProgramGraph program
  else
  programSequentialMultiInstanceProfileMatches program &&
    programParallelMultiInstanceProfileMatches program &&
    match programShape? program.identity.semanticProfile.value with
    | some (scopeCount, shape) =>
        program.definitionScopes.length = scopeCount &&
          operationCardinalities program.operations = shape &&
          program.operations.all operationPropertyEndpoints &&
          programUserTaskMetadataValid program.identity.semanticProfile
            program.operations &&
          programParallelTopologyValid program &&
          programActivityBoundaryMessageTopologyValid program &&
          structuredHumanWorkProgramTopologyValid program &&
          operationPayloadCapabilitiesValid
            program.identity.semanticProfile.value program.operations
          && messageKeyCorrelationProgramPayloadValid program &&
          compensationSourceProgramProfileValid program
    | none => if program.identity.semanticProfile == mixedTaskControlFlowProfileId || program.identity.semanticProfile == mixedTaskBusinessErrorProfileId then
        (MixedTaskControlFlow.programAnalysis program).isSome
      else if program.identity.semanticProfile == serialBusinessTaskProfileId then
        (SerialBusinessTask.programAnalysis program).isSome
      else program.identity.semanticProfile == structuredCompositionCheckpointProfileId &&
        structuredCompositionProgramGraph program

end BpmnSemantics.SemanticProcess
