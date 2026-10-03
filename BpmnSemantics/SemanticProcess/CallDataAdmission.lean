import BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants

/-! # Independent checked admission for scalar Call data

CDATA-MATCH-01 admits the two reviewed serial paths by following exact Sequence Flow references.
The caller and called Task endpoints must close over their respective Process declarations;
global retained identities and the canonical caller Property inventory remain independently checked.
-/

namespace BpmnSemantics.SemanticProcess

abbrev callDataCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-call-activity-data-boundaries-draft"⟩

namespace CallDataAdmission

private def one? (values : List α) : Option α :=
  match values with | [value] => some value | _ => none

private def owner? (source : CheckedProcess) (id : NodeId) : Option DefinitionScopeId :=
  (one? (source.nodeScopes.filter fun binding => binding.nodeId == id)).map (·.scopeId)

private def root? (source : CheckedProcess) (process : ProcessId) : Option DefinitionScope :=
  one? (source.definitionScopes.filter fun scope =>
    scope.parentScopeId.isNone && scope.originElementId.value == process.value)

private def start? (source : CheckedProcess) (scope : DefinitionScopeId) : Option NodeId :=
  one? (source.nodes.filterMap fun
    | .noneStartEvent id => if owner? source id == some scope then some id else none
    | _ => none)

private def next? (source : CheckedProcess) (id : NodeId) : Option CheckedNode := do
  let flow ← one? (source.sequenceFlows.filter fun flow => flow.sourceId == id)
  if flow.condition.isSome then none
  else one? (source.nodes.filter fun node => node.id == flow.targetId)

private structure Task where
  id : NodeId
  input : DirectActivityDataInput
  output : DirectActivityDataOutput

private def task? : CheckedNode → Option Task
  | .dataInputOutputUserTask id _ input output => some { id, input, output }
  | _ => none

private def taskIds (task : Task) : List String :=
  [task.input.associationId, task.input.targetDataInputId,
    task.output.associationId, task.output.sourceDataOutputId]

private def portsValid (data : ScalarCallData) (caller called : Task) : Bool :=
  match data.directInput.source, data.directOutput.target,
      caller.input.source, caller.output.target, called.input.source, called.output.target with
  | .property request, .property result, .property readResult, .property receipt,
      .processDataInput input, .processDataOutput output =>
      readResult == result && data.callerProperties.contains receipt &&
        receipt != request && receipt != result && input == data.called.input.id && output == data.called.output.id
  | _, _, _, _, _, _ => false

/-- Returns the exact retained declaration only after both owned paths and their data links close. -/
def checked? (source : CheckedProcess) : Option ScalarCallData := do
  let callerRoot ← root? source source.processId
  let callerStart ← start? source callerRoot.id
  let .callActivity callId calledProcessId (.scalar data) := (← next? source callerStart) | none
  let callerTask ← task? (← next? source callId)
  let .noneEndEvent callerEnd := (← next? source callerTask.id) | none
  let calledRoot ← root? source calledProcessId
  let calledStart ← start? source calledRoot.id
  let calledTask ← task? (← next? source calledStart)
  let .noneEndEvent calledEnd := (← next? source calledTask.id) | none
  let callers := [callerStart, callId, callerTask.id, callerEnd]
  let called := [calledStart, calledTask.id, calledEnd]
  let ids := [source.processId.value, calledProcessId.value] ++ source.nodes.map (·.id.value) ++
    source.sequenceFlows.map (·.id.value) ++ data.callerProperties ++
    (scalarIoDeclarationIds data.call).drop 1 ++ (scalarIoDeclarationIds data.called).drop 1 ++
    [data.directInput.associationId, data.directOutput.associationId] ++ taskIds callerTask ++ taskIds calledTask
  if source.definitionScopes.length == 2 && callerRoot.id != calledRoot.id &&
      source.nodes.length == 7 && source.sequenceFlows.length == 5 &&
      source.compensation.isNone && source.transactionCancellation.isNone &&
      callers.all (fun id => owner? source id == some callerRoot.id) &&
      called.all (fun id => owner? source id == some calledRoot.id) &&
      callDataInterfaceValid (.scalar data) callId.value calledProcessId.value &&
      strictlySortedStrings data.callerProperties && portsValid data callerTask calledTask &&
      ids.all nonempty && decide ids.Nodup then some data else none

private def operationOwner? (program : Program) (id : OperationId) : Option DefinitionScopeId :=
  (one? (program.operationScopes.filter fun binding => binding.operationId == id)).map (·.scopeId)

private def consuming? (program : Program) (place : ControlPlaceId) : Option SemanticOperation :=
  one? (program.operations.filter fun
    | .invokeProcess _ _ input .. | .awaitDataInputOutputUserTask _ _ input ..
    | .reachNoneEnd _ _ input => input == place
    | _ => false)

/-- Follows IL control references independently of checked-source admission and exact lowering. -/
def program? (program : Program) : Option ScalarCallData := do
  let .initiate startId startOrigin startOutput :=
    (← one? (program.operations.filter fun | .initiate .. => true | _ => false)) | none
  let .invokeProcess invokeId callOrigin _ calledProcess calledRoot entry returnId (.scalar data) :=
    (← consuming? program startOutput) | none
  let .awaitDataInputOutputUserTask calledTaskId calledOrigin _ calledOutput calledTask _ calledInput calledDataOutput :=
    (← consuming? program entry) | none
  let .reachNoneEnd calledEnd calledEndOrigin _ := (← consuming? program calledOutput) | none
  let .returnProcess _ returnOrigin returnedProcess returnedRoot callerOutput returnedData :=
    (← one? (program.operations.filter fun operation => operation.id == returnId)) | none
  let .awaitDataInputOutputUserTask callerTaskId callerOrigin _ callerEndInput callerTask _ callerInput callerDataOutput :=
    (← consuming? program callerOutput) | none
  let .reachNoneEnd callerEnd callerEndOrigin _ := (← consuming? program callerEndInput) | none
  let .completeScope completeId completeOrigin callerRoot none :=
    (← one? (program.operations.filter fun | .completeScope .. => true | _ => false)) | none
  let callerDefinition ← one? (program.definitionScopes.filter fun scope => scope.id == callerRoot)
  let calledDefinition ← one? (program.definitionScopes.filter fun scope => scope.id == calledRoot)
  let caller : Task := { id := ⟨callerTask.value⟩, input := callerInput, output := callerDataOutput }
  let called : Task := { id := ⟨calledTask.value⟩, input := calledInput, output := calledDataOutput }
  let ids := [program.processId.value, calledProcess.value, startOrigin.elementId.value,
    callOrigin.elementId.value, callerOrigin.elementId.value, calledOrigin.elementId.value,
    callerEndOrigin.elementId.value, calledEndOrigin.elementId.value] ++
    program.controlPlaces.map (·.origin.elementId.value) ++ data.callerProperties ++
    (scalarIoDeclarationIds data.call).drop 1 ++ (scalarIoDeclarationIds data.called).drop 1 ++
    [data.directInput.associationId, data.directOutput.associationId] ++ taskIds caller ++ taskIds called
  if program.operations.length == 8 && program.controlPlaces.length == 5 && program.definitionScopes.length == 2 &&
      program.internalSchedulingMode == .rejectObservableChoice &&
      program.compensationActivityRetention.isNone && program.compensationEventSubProcessSnapshots.isNone &&
      program.compensationExecution.isNone && callerRoot != calledRoot &&
      callerDefinition.parentScopeId.isNone && calledDefinition.parentScopeId.isNone &&
      callerDefinition.originElementId.value == program.processId.value &&
      calledDefinition.originElementId.value == calledProcess.value &&
      completeOrigin.elementId.value == program.processId.value &&
      returnedProcess == calledProcess && returnedRoot == calledRoot &&
      returnOrigin == callOrigin && returnedData == .scalar data &&
      [startId, invokeId, callerTaskId, callerEnd, completeId].all (fun id => operationOwner? program id == some callerRoot) &&
      [calledTaskId, calledEnd, returnId].all (fun id => operationOwner? program id == some calledRoot) &&
      callDataInterfaceValid (.scalar data) callOrigin.elementId.value calledProcess.value &&
      strictlySortedStrings data.callerProperties && portsValid data caller called &&
      ids.all nonempty && decide ids.Nodup then some data else none

end CallDataAdmission

def callDataCheckedGraph (source : CheckedProcess) : Bool :=
  (CallDataAdmission.checked? source).isSome

def callDataProgramGraph (program : Program) : Bool :=
  (CallDataAdmission.program? program).isSome

end BpmnSemantics.SemanticProcess
