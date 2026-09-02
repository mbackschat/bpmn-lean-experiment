import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcessJson.CheckedProcess

/-! # Compensation source lowering fixtures

Independent checked, Program, and JSON fixtures shared by the responsibility-split conformance
owners for the owner-approved source checkpoint.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson

def descriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }

def processId : ProcessId := ⟨"Process_Compensation"⟩
def rootScopeId : DefinitionScopeId := ⟨"scope:Process_Compensation"⟩
def parentScopeId : DefinitionScopeId := ⟨"scope:SubProcess_ArrangeGroundTravel"⟩
def handlerScopeId : DefinitionScopeId := ⟨"scope:EventSubProcess_UndoGroundTravel"⟩

def arrangeSubProcessId : NodeId := ⟨"SubProcess_ArrangeGroundTravel"⟩
def arrangeTaskId : NodeId := ⟨"Task_ArrangeGroundTravel"⟩
def issueTaskId : NodeId := ⟨"Task_IssueInsurance"⟩
def reserveTaskId : NodeId := ⟨"Task_ReserveHotel"⟩
def throwId : NodeId := ⟨"Throw_Compensate"⟩

def eventHandlerId : NodeId := ⟨"EventSubProcess_UndoGroundTravel"⟩
def eventEffectId : NodeId := ⟨"Task_UndoGroundTravel"⟩
def issueBoundaryId : NodeId := ⟨"Boundary_IssueInsurance_Compensation"⟩
def issueHandlerId : NodeId := ⟨"Task_UndoInsurance"⟩
def reserveBoundaryId : NodeId := ⟨"Boundary_ReserveHotel_Compensation"⟩
def reserveHandlerId : NodeId := ⟨"Task_UndoReserveHotel"⟩

def restoredInput : CheckedCompensationInput :=
  .directRestoredProcessBinding "Property_TravelDetails" "DataInput_TravelDetails"

def eventBody : CheckedCompensationBody :=
  { handlerElementId := eventHandlerId
    effectElementId := eventEffectId
    descriptor
    input := restoredInput }

def issueBody : CheckedCompensationBody :=
  { handlerElementId := issueHandlerId
    effectElementId := issueHandlerId
    descriptor
    input := .empty }

def reserveBody : CheckedCompensationBody :=
  { handlerElementId := reserveHandlerId
    effectElementId := reserveHandlerId
    descriptor
    input := .empty }

def checkedCompensation : CheckedCompensation :=
  { triggerElementId := throwId
    subjects :=
      [ .eventSubProcess arrangeSubProcessId parentScopeId handlerScopeId eventBody
      , .boundaryActivity issueTaskId issueBoundaryId issueBody
      , .boundaryActivity reserveTaskId reserveBoundaryId reserveBody ]
    dependencies :=
      [{ predecessorElementId := reserveTaskId
         successorElementId := arrangeSubProcessId
         reason := .sequenceFlow }]
    retentionLimits := { maxRecords := 2, maxCanonicalBytes := 4096 }
    snapshotLimits := { maxRecords := 1, maxCanonicalBytes := 8192 }
    executionLimits :=
      { maxTriggers := 1, maxHandlers := 3, maxCanonicalBytes := 20480 } }

def definitionScopes : List DefinitionScope :=
  [ { id := handlerScopeId
      parentScopeId := some parentScopeId
      originElementId := eventHandlerId }
  , { id := rootScopeId
      parentScopeId := none
      originElementId := ⟨processId.value⟩ }
  , { id := parentScopeId
      parentScopeId := some rootScopeId
      originElementId := arrangeSubProcessId } ]

def nodes : List CheckedNode :=
  [ .noneEndEvent ⟨"End_ArrangeGroundTravel"⟩
  , .noneEndEvent ⟨"End_Done"⟩
  , .parallelGateway ⟨"Gateway_Join"⟩ .converging
  , .parallelGateway ⟨"Gateway_Split"⟩ .diverging
  , .noneStartEvent ⟨"Start_ArrangeGroundTravel"⟩
  , .noneStartEvent ⟨"Start_Travel"⟩
  , .embeddedSubProcess arrangeSubProcessId parentScopeId
  , .userTask arrangeTaskId (some "Same display name")
  , .userTask issueTaskId (some "Same display name")
  , .userTask reserveTaskId (some "Same display name")
  , .globalSynchronousCompensationThrowEvent throwId ]

def nodeScopes : List NodeScopeOwnership :=
  [ { nodeId := ⟨"End_ArrangeGroundTravel"⟩, scopeId := parentScopeId }
  , { nodeId := ⟨"End_Done"⟩, scopeId := rootScopeId }
  , { nodeId := ⟨"Gateway_Join"⟩, scopeId := rootScopeId }
  , { nodeId := ⟨"Gateway_Split"⟩, scopeId := rootScopeId }
  , { nodeId := ⟨"Start_ArrangeGroundTravel"⟩, scopeId := parentScopeId }
  , { nodeId := ⟨"Start_Travel"⟩, scopeId := rootScopeId }
  , { nodeId := arrangeSubProcessId, scopeId := rootScopeId }
  , { nodeId := arrangeTaskId, scopeId := parentScopeId }
  , { nodeId := issueTaskId, scopeId := rootScopeId }
  , { nodeId := reserveTaskId, scopeId := rootScopeId }
  , { nodeId := throwId, scopeId := rootScopeId } ]

def sequenceFlows : List CheckedSequenceFlow :=
  [ { id := ⟨"Flow_ArrangeGroundTravel_Join"⟩
      sourceId := arrangeSubProcessId, targetId := ⟨"Gateway_Join"⟩ }
  , { id := ⟨"Flow_ArrangeGroundTravel_Start_Task"⟩
      sourceId := ⟨"Start_ArrangeGroundTravel"⟩, targetId := arrangeTaskId }
  , { id := ⟨"Flow_ArrangeGroundTravel_Task_End"⟩
      sourceId := arrangeTaskId, targetId := ⟨"End_ArrangeGroundTravel"⟩ }
  , { id := ⟨"Flow_Compensate_End"⟩
      sourceId := throwId, targetId := ⟨"End_Done"⟩ }
  , { id := ⟨"Flow_IssueInsurance_Join"⟩
      sourceId := issueTaskId, targetId := ⟨"Gateway_Join"⟩ }
  , { id := ⟨"Flow_Join_Compensate"⟩
      sourceId := ⟨"Gateway_Join"⟩, targetId := throwId }
  , { id := ⟨"Flow_ReserveHotel_ArrangeGroundTravel"⟩
      sourceId := reserveTaskId, targetId := arrangeSubProcessId }
  , { id := ⟨"Flow_Split_IssueInsurance"⟩
      sourceId := ⟨"Gateway_Split"⟩, targetId := issueTaskId }
  , { id := ⟨"Flow_Split_ReserveHotel"⟩
      sourceId := ⟨"Gateway_Split"⟩, targetId := reserveTaskId }
  , { id := ⟨"Flow_Start_Split"⟩
      sourceId := ⟨"Start_Travel"⟩, targetId := ⟨"Gateway_Split"⟩ } ]

def sequenceFlowScopes : List SequenceFlowScopeOwnership :=
  [ { sequenceFlowId := ⟨"Flow_ArrangeGroundTravel_Join"⟩, scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_ArrangeGroundTravel_Start_Task"⟩,
      scopeId := parentScopeId }
  , { sequenceFlowId := ⟨"Flow_ArrangeGroundTravel_Task_End"⟩,
      scopeId := parentScopeId }
  , { sequenceFlowId := ⟨"Flow_Compensate_End"⟩, scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_IssueInsurance_Join"⟩, scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_Join_Compensate"⟩, scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_ReserveHotel_ArrangeGroundTravel"⟩,
      scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_Split_IssueInsurance"⟩, scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_Split_ReserveHotel"⟩, scopeId := rootScopeId }
  , { sequenceFlowId := ⟨"Flow_Start_Split"⟩, scopeId := rootScopeId } ]

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := compensationSourceCheckpointProfileId
        sourceId := ⟨"compensation-source-checkpoint"⟩
        sourceSha256 :=
          "1111111111111111111111111111111111111111111111111111111111111111" }
    processId
    definitionScopes
    nodeScopes
    sequenceFlowScopes
    nodes
    sequenceFlows
    compensation := some checkedCompensation }

private def place (flowId : String) : ControlPlace :=
  { id := ⟨"place:" ++ flowId⟩, origin := { elementId := ⟨flowId⟩ } }

def controlPlaces : List ControlPlace :=
  [ place "Flow_ArrangeGroundTravel_Join"
  , place "Flow_ArrangeGroundTravel_Start_Task"
  , place "Flow_ArrangeGroundTravel_Task_End"
  , place "Flow_Compensate_End"
  , place "Flow_IssueInsurance_Join"
  , place "Flow_Join_Compensate"
  , place "Flow_ReserveHotel_ArrangeGroundTravel"
  , place "Flow_Split_IssueInsurance"
  , place "Flow_Split_ReserveHotel"
  , place "Flow_Start_Split" ]

def operations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End_ArrangeGroundTravel"⟩
      { elementId := ⟨"End_ArrangeGroundTravel"⟩ }
      ⟨"place:Flow_ArrangeGroundTravel_Task_End"⟩
  , .reachNoneEnd ⟨"operation:End_Done"⟩ { elementId := ⟨"End_Done"⟩ }
      ⟨"place:Flow_Compensate_End"⟩
  , .synchronize ⟨"operation:Gateway_Join"⟩ { elementId := ⟨"Gateway_Join"⟩ }
      [⟨"place:Flow_ArrangeGroundTravel_Join"⟩, ⟨"place:Flow_IssueInsurance_Join"⟩]
      ⟨"place:Flow_Join_Compensate"⟩
  , .duplicate ⟨"operation:Gateway_Split"⟩ { elementId := ⟨"Gateway_Split"⟩ }
      ⟨"place:Flow_Start_Split"⟩
      [⟨"place:Flow_Split_IssueInsurance"⟩, ⟨"place:Flow_Split_ReserveHotel"⟩]
  , .initiate ⟨"operation:Start_Travel"⟩ { elementId := ⟨"Start_Travel"⟩ }
      ⟨"place:Flow_Start_Split"⟩
  , .enterScope ⟨"operation:SubProcess_ArrangeGroundTravel"⟩
      { elementId := arrangeSubProcessId }
      ⟨"place:Flow_ReserveHotel_ArrangeGroundTravel"⟩
      ⟨"place:Flow_ArrangeGroundTravel_Start_Task"⟩ parentScopeId
  , .awaitUserTask ⟨"operation:Task_ArrangeGroundTravel"⟩
      { elementId := arrangeTaskId }
      ⟨"place:Flow_ArrangeGroundTravel_Start_Task"⟩
      ⟨"place:Flow_ArrangeGroundTravel_Task_End"⟩
      { id := ⟨arrangeTaskId.value⟩, name := some "Same display name" }
  , .awaitUserTask ⟨"operation:Task_IssueInsurance"⟩ { elementId := issueTaskId }
      ⟨"place:Flow_Split_IssueInsurance"⟩ ⟨"place:Flow_IssueInsurance_Join"⟩
      { id := ⟨issueTaskId.value⟩, name := some "Same display name" }
  , .awaitUserTask ⟨"operation:Task_ReserveHotel"⟩ { elementId := reserveTaskId }
      ⟨"place:Flow_Split_ReserveHotel"⟩
      ⟨"place:Flow_ReserveHotel_ArrangeGroundTravel"⟩
      { id := ⟨reserveTaskId.value⟩, name := some "Same display name" }
  , .triggerCompensation ⟨"operation:Throw_Compensate"⟩ { elementId := throwId }
      rootScopeId ⟨"place:Flow_Join_Compensate"⟩ ⟨"place:Flow_Compensate_End"⟩
  , .completeScope ⟨"operation:complete-scope:scope:Process_Compensation"⟩
      { elementId := ⟨processId.value⟩ } rootScopeId none
  , .completeScope
      ⟨"operation:complete-scope:scope:SubProcess_ArrangeGroundTravel"⟩
      { elementId := arrangeSubProcessId } parentScopeId
      (some ⟨"place:Flow_ArrangeGroundTravel_Join"⟩) ]

def operationScopes : List OperationScopeOwnership :=
  operations.map fun operation =>
    let scopeId := match operation.id.value with
      | "operation:End_ArrangeGroundTravel"
      | "operation:Task_ArrangeGroundTravel"
      | "operation:complete-scope:scope:SubProcess_ArrangeGroundTravel" => parentScopeId
      | _ => rootScopeId
    { operationId := operation.id, scopeId }

def expectedProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := compensationSourceCheckpointProfileId
        sourceId := ⟨"compensation-source-checkpoint"⟩
        sourceSha256 :=
          "1111111111111111111111111111111111111111111111111111111111111111" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes
    operationScopes
    controlPlaceScopes := sequenceFlowScopes.map fun ownership =>
      { controlPlaceId := ⟨"place:" ++ ownership.sequenceFlowId.value⟩
        scopeId := ownership.scopeId }
    controlPlaces
    operations
    compensationActivityRetention := some
      { definitionScopeId := rootScopeId
        targets :=
          [ { activityElementId := issueTaskId
              boundaryEventElementId := issueBoundaryId
              compensationActivityElementId := issueHandlerId }
          , { activityElementId := reserveTaskId
              boundaryEventElementId := reserveBoundaryId
              compensationActivityElementId := reserveHandlerId } ]
        maxRecords := 2
        maxCanonicalBytes := 4096 }
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId, handlerScopeId }]
        maxRecords := 1
        maxCanonicalBytes := 8192 }
    compensationExecution := some
      { definitionScopeId := rootScopeId
        triggerOperationId := ⟨"operation:Throw_Compensate"⟩
        subjects :=
          [ .eventSubProcess parentScopeId handlerScopeId
              { handlerElementId := eventHandlerId
                effectElementId := eventEffectId
                descriptor
                input := .restoredProcessBinding
                  "Property_TravelDetails" "DataInput_TravelDetails" }
          , .boundaryActivity issueTaskId
              { handlerElementId := issueHandlerId
                effectElementId := issueHandlerId
                descriptor
                input := .empty }
          , .boundaryActivity reserveTaskId
              { handlerElementId := reserveHandlerId
                effectElementId := reserveHandlerId
                descriptor
                input := .empty } ]
        dependencies :=
          [{ predecessorElementId := reserveTaskId
             successorElementId := arrangeSubProcessId }]
        limits :=
          { maxTriggers := 1, maxHandlers := 3, maxCanonicalBytes := 20480 } } }

private def replaceEventSubject
    (program : Program) (body : SingleEffectCompensationHandlerBody) : Program :=
  match program.compensationExecution with
  | none => program
  | some declaration =>
      let updated :=
        { declaration with subjects :=
            declaration.subjects.map fun
              | .eventSubProcess parent handler _ => .eventSubProcess parent handler body
              | subject => subject }
      { program with compensationExecution := some updated }

def swappedRestoredBindingProgram : Program :=
  replaceEventSubject expectedProgram
    { handlerElementId := eventHandlerId
      effectElementId := eventEffectId
      descriptor
      input := .restoredProcessBinding "DataInput_TravelDetails" "Property_TravelDetails" }

def reversedDependencyProgram : Program :=
  match expectedProgram.compensationExecution with
  | none => expectedProgram
  | some declaration =>
      let updated :=
        { declaration with dependencies :=
            [{ predecessorElementId := arrangeSubProcessId
               successorElementId := reserveTaskId }] }
      { expectedProgram with compensationExecution := some updated }

def substitutedEffectProgram : Program :=
  replaceEventSubject expectedProgram
    { handlerElementId := eventHandlerId
      effectElementId := ⟨"Task_UndoGroundTravel_Substituted"⟩
      descriptor
      input := .restoredProcessBinding "Property_TravelDetails" "DataInput_TravelDetails" }

def triggerFlowProgram : Program :=
  { expectedProgram with operations := expectedProgram.operations.map fun
      | .triggerCompensation id origin scope _ output =>
          .triggerCompensation id origin scope ⟨"place:Flow_Start_Split"⟩ output
      | operation => operation }

def triggerScopeProgram : Program :=
  { expectedProgram with operations := expectedProgram.operations.map fun
      | .triggerCompensation id origin _ input output =>
          .triggerCompensation id origin parentScopeId input output
      | operation => operation }

def executableDormantScopeProgram : Program :=
  let operation := SemanticOperation.completeScope
    ⟨"operation:complete-scope:scope:EventSubProcess_UndoGroundTravel"⟩
    { elementId := eventHandlerId } handlerScopeId none
  { expectedProgram with
    operations := expectedProgram.operations ++ [operation]
    operationScopes := expectedProgram.operationScopes ++
      [{ operationId := operation.id, scopeId := handlerScopeId }] }

def mutateRetentionLimits (records bytes : Nat) : Program :=
  match expectedProgram.compensationActivityRetention with
  | none => expectedProgram
  | some declaration =>
      let updated :=
        { declaration with maxRecords := records, maxCanonicalBytes := bytes }
      { expectedProgram with compensationActivityRetention := some updated }

def mutateSnapshotLimits (records bytes : Nat) : Program :=
  match expectedProgram.compensationEventSubProcessSnapshots with
  | none => expectedProgram
  | some declaration =>
      let updated :=
        { declaration with maxRecords := records, maxCanonicalBytes := bytes }
      { expectedProgram with compensationEventSubProcessSnapshots := some updated }

def mutateExecutionLimits (triggers handlers bytes : Nat) : Program :=
  match expectedProgram.compensationExecution with
  | none => expectedProgram
  | some declaration =>
      let updated :=
        { declaration with limits :=
            { maxTriggers := triggers, maxHandlers := handlers,
              maxCanonicalBytes := bytes } }
      { expectedProgram with compensationExecution := some updated }

def oldCheckedProcess : CheckedProcess := sequentialCheckedProcess

def compensationAcceptedAs (json : Lean.Json)
    (expected : CheckedCompensation) : Bool :=
  match decodeCheckedCompensation json with
  | .ok actual => decide (actual = expected)
  | .error _ => false

def compensationRejected (json : Lean.Json) : Bool :=
  match decodeCheckedCompensation json with
  | .ok _ => false
  | .error _ => true

def checkedAccepted (json : Lean.Json) : Bool :=
  match decodeCheckedProcess json with
  | .ok _ => true
  | .error _ => false

private def descriptorJson : Lean.Json :=
  Lean.Json.mkObj
    [ ("protocol", .str descriptor.protocol)
    , ("operation", .str descriptor.operation) ]

private def inputJson (restored : Bool) : Lean.Json :=
  if restored then
    Lean.Json.mkObj
      [ ("kind", .str "directRestoredProcessBinding")
      , ("sourcePropertyId", .str "Property_TravelDetails")
      , ("targetDataInputId", .str "DataInput_TravelDetails") ]
  else
    Lean.Json.mkObj [("kind", .str "empty")]

private def bodyJson (handler effect kind : String) (restored : Bool) : Lean.Json :=
  Lean.Json.mkObj
    [ ("kind", .str kind)
    , ("handlerElementId", .str handler)
    , ("effectElementId", .str effect)
    , ("descriptor", descriptorJson)
    , ("input", inputJson restored) ]

private def eventSubjectJson (bodyKind : String) : Lean.Json :=
  Lean.Json.mkObj
    [ ("kind", .str "eventSubProcess")
    , ("parentElementId", .str arrangeSubProcessId.value)
    , ("parentScopeId", .str parentScopeId.value)
    , ("handlerScopeId", .str handlerScopeId.value)
    , ("body", bodyJson eventHandlerId.value eventEffectId.value bodyKind true) ]

private def boundarySubjectJson
    (subject boundary handler : String) : Lean.Json :=
  Lean.Json.mkObj
    [ ("kind", .str "boundaryActivity")
    , ("subjectElementId", .str subject)
    , ("boundaryEventElementId", .str boundary)
    , ("body", bodyJson handler handler "singleEffect" false) ]

private def dependencyJson (reason : String) : Lean.Json :=
  Lean.Json.mkObj
    [ ("predecessorElementId", .str reserveTaskId.value)
    , ("successorElementId", .str arrangeSubProcessId.value)
    , ("reason", .str reason) ]

def compensationJson
    (retentionRecords : Nat := 2) (retentionBytes : Nat := 4096)
    (snapshotRecords : Nat := 1) (snapshotBytes : Nat := 8192)
    (executionTriggers : Nat := 1) (executionHandlers : Nat := 3)
    (executionBytes : Nat := 20480) (bodyKind : String := "singleEffect")
    (dependencyReason : String := "sequenceFlow")
    (includeExtra : Bool := false) : Lean.Json :=
  let fields :=
    [ ("triggerElementId", .str throwId.value)
    , ("subjects", .arr
        #[ eventSubjectJson bodyKind
         , boundarySubjectJson issueTaskId.value issueBoundaryId.value issueHandlerId.value
         , boundarySubjectJson reserveTaskId.value reserveBoundaryId.value
             reserveHandlerId.value ])
    , ("dependencies", .arr #[dependencyJson dependencyReason])
    , ("retentionLimits", Lean.Json.mkObj
        [("maxRecords", .num retentionRecords), ("maxCanonicalBytes", .num retentionBytes)])
    , ("snapshotLimits", Lean.Json.mkObj
        [("maxRecords", .num snapshotRecords), ("maxCanonicalBytes", .num snapshotBytes)])
    , ("executionLimits", Lean.Json.mkObj
        [ ("maxTriggers", .num executionTriggers)
        , ("maxHandlers", .num executionHandlers)
        , ("maxCanonicalBytes", .num executionBytes) ]) ]
  Lean.Json.mkObj (if includeExtra then fields ++ [("extra", .bool true)] else fields)

private def sourceIdentityJson (semanticProfile : String) : Lean.Json :=
  Lean.Json.mkObj
    [ ("semanticProfile", .str semanticProfile)
    , ("sourceId", .str "s")
    , ("sourceOverlay", .null)
    , ("sourceSha256",
        .str "1111111111111111111111111111111111111111111111111111111111111111") ]

def checkedJsonWithCompensation (compensation : Lean.Json := compensationJson) : Lean.Json :=
  Lean.Json.mkObj
    [ ("kind", .str "checkedProcess")
    , ("identity", sourceIdentityJson compensationSourceCheckpointProfileId.value)
    , ("processId", .str processId.value)
    , ("definitionScopes", .arr #[])
    , ("nodeScopes", .arr #[])
    , ("sequenceFlowScopes", .arr #[])
    , ("nodes", .arr
        #[Lean.Json.mkObj
            [("kind", .str "globalSynchronousCompensationThrowEvent"),
             ("id", .str throwId.value)]])
    , ("sequenceFlows", .arr #[])
    , ("compensation", compensation) ]

def oldCheckedJson : Lean.Json :=
  Lean.Json.mkObj
    [ ("kind", .str "checkedProcess")
    , ("identity", sourceIdentityJson "old")
    , ("processId", .str "p")
    , ("definitionScopes", .arr #[])
    , ("nodeScopes", .arr #[])
    , ("sequenceFlowScopes", .arr #[])
    , ("nodes", .arr #[])
    , ("sequenceFlows", .arr #[]) ]

end BpmnSemantics.CompensationSourceLoweringConformance
