import BpmnSemantics.SemanticProcess.ValueDomain
import BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission

/-! # Semantic profile shape capabilities

This module owns exact checked-node and Semantic Process operation cardinalities plus the closed graph-policy choice shared by the two independently implemented graph validators.
-/

namespace BpmnSemantics.SemanticProcess

private structure ShapeCardinalities where
  starts : Nat := 0
  initiates : Nat := 0
  messageStarts : Nat := 0
  messageInitiates : Nat := 0
  timerStarts : Nat := 0
  timerInitiates : Nat := 0
  embeddedScopes : Nat := 0
  callActivities : Nat := 0
  boundaryErrors : Nat := 0
  boundaryTimers : Nat := 0
  monitoredBoundaryTimers : Nat := 0
  scopeEntries : Nat := 0
  processInvokes : Nat := 0
  processReturns : Nat := 0
  userTasks : Nat := 0
  messages : Nat := 0
  receiveTasks : Nat := 0
  timers : Nat := 0
  configuredTasks : Nat := 0
  effects : Nat := 0
  duplicates : Nat := 0
  synchronizes : Nat := 0
  exclusiveMerges : Nat := 0
  choices : Nat := 0
  inclusiveSplits : Nat := 0
  inclusiveJoins : Nat := 0
  eventGateways : Nat := 0
  selectMany : Nat := 0
  synchronizeSelected : Nat := 0
  eventRaces : Nat := 0
  boundedUserTasks : Nat := 0
  monitoredUserTasks : Nat := 0
  sequentialMultiInstanceUserTasks : Nat := 0
  boundedScopeEntries : Nat := 0
  errorEnds : Nat := 0
  terminateEnds : Nat := 0
  errorThrows : Nat := 0
  scopeTerminations : Nat := 0
  ends : Nat := 0
  scopeCompletions : Nat := 0
  deriving DecidableEq

private def nodeCardinalities (nodes : List CheckedNode) :
    ShapeCardinalities :=
  nodes.foldl (init := {}) fun counts node =>
    match node with
    | .noneStartEvent .. => { counts with starts := counts.starts + 1 }
    | .messageStartEvent .. =>
        { counts with messageStarts := counts.messageStarts + 1 }
    | .timerStartEvent .. =>
        { counts with timerStarts := counts.timerStarts + 1 }
    | .embeddedSubProcess .. =>
        { counts with embeddedScopes := counts.embeddedScopes + 1 }
    | .callActivity .. =>
        { counts with callActivities := counts.callActivities + 1 }
    | .boundaryErrorEvent .. =>
        { counts with boundaryErrors := counts.boundaryErrors + 1 }
    -- Counted per disposition, because the two boundary-Timer profiles pin the same node kinds and
    -- the disposition is the only thing separating them at checked-source admission.
    | .timerBoundaryEvent _ _ .interrupting _ _ =>
        { counts with boundaryTimers := counts.boundaryTimers + 1 }
    | .timerBoundaryEvent _ _ .nonInterrupting _ _ =>
        { counts with
          monitoredBoundaryTimers := counts.monitoredBoundaryTimers + 1 }
    | .userTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .sequentialMultiInstanceUserTask .. =>
        { counts with sequentialMultiInstanceUserTasks :=
            counts.sequentialMultiInstanceUserTasks + 1 }
    | .parallelMultiInstanceUserTask .. => counts
    | .intermediateCatchTimerEvent .. =>
        { counts with timers := counts.timers + 1 }
    | .intermediateCatchMessageEvent .. =>
        { counts with messages := counts.messages + 1 }
    | .receiveTask .. =>
        { counts with receiveTasks := counts.receiveTasks + 1 }
    | .configuredTask .. =>
        { counts with configuredTasks := counts.configuredTasks + 1 }
    | .serviceTask .. => { counts with effects := counts.effects + 1 }
    | .parallelGateway _ .diverging =>
        { counts with duplicates := counts.duplicates + 1 }
    | .parallelGateway _ .converging =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .exclusiveMerge .. =>
        { counts with exclusiveMerges := counts.exclusiveMerges + 1 }
    | .exclusiveGateway .. => { counts with choices := counts.choices + 1 }
    | .inclusiveGatewayDiverging .. =>
        { counts with inclusiveSplits := counts.inclusiveSplits + 1 }
    | .inclusiveGatewayConverging .. =>
        { counts with inclusiveJoins := counts.inclusiveJoins + 1 }
    | .eventBasedGateway .. =>
        { counts with eventGateways := counts.eventGateways + 1 }
    | .errorEndEvent .. => { counts with errorEnds := counts.errorEnds + 1 }
    | .terminateEndEvent .. =>
        { counts with terminateEnds := counts.terminateEnds + 1 }
    | .noneEndEvent .. => { counts with ends := counts.ends + 1 }

private def operationCardinalities (operations : List SemanticOperation) :
    ShapeCardinalities :=
  operations.foldl (init := {}) fun counts operation =>
    match operation with
    | .initiate .. => { counts with initiates := counts.initiates + 1 }
    | .initiateMessage .. =>
        { counts with messageInitiates := counts.messageInitiates + 1 }
    | .initiateTimer .. =>
        { counts with timerInitiates := counts.timerInitiates + 1 }
    | .enterScope .. => { counts with scopeEntries := counts.scopeEntries + 1 }
    | .enterBoundedScope .. =>
        { counts with boundedScopeEntries := counts.boundedScopeEntries + 1 }
    | .invokeProcess .. =>
        { counts with processInvokes := counts.processInvokes + 1 }
    | .returnProcess .. =>
        { counts with processReturns := counts.processReturns + 1 }
    | .awaitUserTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .awaitSequentialMultiInstanceUserTask .. =>
        { counts with sequentialMultiInstanceUserTasks :=
            counts.sequentialMultiInstanceUserTasks + 1 }
    | .awaitParallelMultiInstanceUserTask ..
    | .completeParallelMultiInstanceUserTask .. => counts
    | .awaitTimer .. => { counts with timers := counts.timers + 1 }
    | .awaitMessage .. => { counts with messages := counts.messages + 1 }
    | .awaitEventRace .. => { counts with eventRaces := counts.eventRaces + 1 }
    | .awaitBoundedUserTask .. =>
        { counts with boundedUserTasks := counts.boundedUserTasks + 1 }
    | .awaitMonitoredUserTask .. =>
        { counts with monitoredUserTasks := counts.monitoredUserTasks + 1 }
    | .awaitEffect .. => { counts with effects := counts.effects + 1 }
    | .duplicate .. => { counts with duplicates := counts.duplicates + 1 }
    | .synchronize .. =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .mergeExclusive .. =>
        { counts with exclusiveMerges := counts.exclusiveMerges + 1 }
    | .choose .. => { counts with choices := counts.choices + 1 }
    | .selectMany .. => { counts with selectMany := counts.selectMany + 1 }
    | .synchronizeSelected .. =>
        { counts with synchronizeSelected := counts.synchronizeSelected + 1 }
    | .throwError .. => { counts with errorThrows := counts.errorThrows + 1 }
    | .reachNoneEnd .. => { counts with ends := counts.ends + 1 }
    | .terminateScope .. =>
        { counts with scopeTerminations := counts.scopeTerminations + 1 }
    | .completeScope .. =>
        { counts with scopeCompletions := counts.scopeCompletions + 1 }

private def withScopeCompletions (count : Nat) (shape : ShapeCardinalities) :
    ShapeCardinalities :=
  { shape with scopeCompletions := count }

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

private def checkedShape? (profile : String) : Option (Nat × ShapeCardinalities) :=
  if profile = sequentialMultiInstanceUserTaskProfileId.value then
    some (1,
      { starts := 1, userTasks := 1, sequentialMultiInstanceUserTasks := 1,
        ends := 2 })
  else if profile = parallelMultiInstanceUserTaskProfileId.value then
    some (1, { starts := 1, userTasks := 1, ends := 2 })
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
  else none

private def programShape? (profile : String) : Option (Nat × ShapeCardinalities) :=
  if profile = sequentialMultiInstanceUserTaskProfileId.value then
    some (1, withScopeCompletions 1
      { initiates := 1, userTasks := 1, sequentialMultiInstanceUserTasks := 1,
        ends := 2 })
  else if profile = parallelMultiInstanceUserTaskProfileId.value then
    some (1, withScopeCompletions 1 { initiates := 1, userTasks := 1, ends := 2 })
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

private def checkedIncomingPorts (source : CheckedProcess) (nodeId : NodeId) :
    List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then some flow.id else none

private def checkedOutgoingPorts (source : CheckedProcess) (nodeId : NodeId) :
    List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.sourceId = nodeId then some flow.id else none

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

/-- Closed graph-policy capability. Every pre-cycle profile retains whole-graph acyclicity; only the exact cycle profile selects the User Task resumption cut. -/
inductive ProfileGraphPolicy where
  | acyclic
  | resumptionBounded
  deriving Repr, DecidableEq

def profileGraphPolicy? (profile : String) : Option ProfileGraphPolicy :=
  if profile = "bpmn-2.0.2-user-task-cycle-draft" then
    some .resumptionBounded
  else if (checkedShape? profile).isSome && (programShape? profile).isSome then
    some .acyclic
  else none

/-- Exact checked node and definition-scope cardinalities selected by the profile. -/
def checkedProfileCapabilitiesValid (source : CheckedProcess) : Bool :=
  checkedSequentialMultiInstanceProfileMatches source &&
    checkedParallelMultiInstanceProfileMatches source &&
    match checkedShape? source.identity.semanticProfile.value with
    | some (scopeCount, shape) =>
        source.definitionScopes.length = scopeCount &&
          nodeCardinalities source.nodes = shape &&
          checkedUserTaskMetadataValid source.identity.semanticProfile source.nodes &&
          checkedParallelTopologyValid source &&
          structuredHumanWorkCheckedTopologyValid source &&
          configuredTaskCheckedPayloadValid source
    | none => false

private def operationPayloadCapabilitiesValid (profile : String)
    (operations : List SemanticOperation) : Bool :=
  if profile = "bpmn-2.0.2-message-start-event-draft" then
    operations.all fun
      | .initiateMessage _ _ (.operationMessage ..) outputs =>
          outputs.length = 1
      | .initiateMessage .. => false
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
  programSequentialMultiInstanceProfileMatches program &&
    programParallelMultiInstanceProfileMatches program &&
    match programShape? program.identity.semanticProfile.value with
    | some (scopeCount, shape) =>
        program.definitionScopes.length = scopeCount &&
          operationCardinalities program.operations = shape &&
          programUserTaskMetadataValid program.identity.semanticProfile
            program.operations &&
          programParallelTopologyValid program &&
          structuredHumanWorkProgramTopologyValid program &&
          operationPayloadCapabilitiesValid
            program.identity.semanticProfile.value program.operations
    | none => false

end BpmnSemantics.SemanticProcess
