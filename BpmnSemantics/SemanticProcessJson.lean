import BpmnSemantics.SemanticProcess
import BpmnSemantics.SemanticProcess.JsonSupport

/-! # BpmnSemantics.SemanticProcessJson — strict current artifact decoders

These decoders accept only the current scenario, checked-process, and Semantic Process wire shapes. A definition input is admitted only after both structural validators pass and Lean's canonical lowering exactly equals the received program.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

structure DefinitionInput where
  scenarioId : ScenarioId
  checkedProcess : CheckedProcess
  semanticProcess : Program
  deriving Repr, DecidableEq

private def decodeStimulus (json : Json) : Except String Stimulus := do
  let kind ← stringField json "kind"
  match kind with
  | "startProcess" =>
      requireObjectShape json
        ["commandId", "initialVariables", "instanceId", "kind", "processId"]
      pure
        (.startProcess
          ⟨← stringField json "commandId"⟩
          ⟨← stringField json "processId"⟩
          ⟨← stringField json "instanceId"⟩
          (← decodeCanonicalVariableBindings
            (← field json "initialVariables")))
  | "completeUserTaskInstance" =>
      requireObjectShape json
        ["commandId", "kind", "submittedValues", "taskId"]
      pure
        (.completeUserTaskInstance
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "taskId"))
          (← decodeCanonicalVariableBindings
            (← field json "submittedValues")))
  | "deliverMessage" =>
      requireObjectShape json
        ["channel", "commandId", "kind", "subscriptionId"]
      pure
        (.deliverMessage
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "subscriptionId"))
          (← decodeMessageChannel (← field json "channel")))
  | "fireTimer" =>
      requireObjectShape json
        ["commandId", "kind", "logicalTimeMs", "timerId"]
      pure
        (.fireTimer
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "timerId"))
          (← decodeSafeNat (← field json "logicalTimeMs")))
  | "completeEffect" =>
      requireObjectShape json ["commandId", "effectId", "kind", "result"]
      pure
        (.completeEffect
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "effectId"))
          (← decodeEffectExecutionResult (← field json "result")))
  | _ => throw s!"unsupported scenario stimulus {kind}"

private def decodeObservationKind (json : Json) :
    Except String ObservationKind := do
  match ← json.getStr? with
  | "deployment" => pure .deployment
  | "commandResults" => pure .commandResults
  | "processStatus" => pure .processStatus
  | "activeWaits" => pure .activeWaits
  | "openUserTasks" => pure .openUserTasks
  | "openTimers" => pure .openTimers
  | "openEffects" => pure .openEffects
  | "variables" => pure .variables
  | "enabledInteractions" => pure .enabledInteractions
  | "logicalTime" => pure .logicalTime
  | kind => throw s!"unsupported scenario observation {kind}"

private def decodeScenarioProvenance (json : Json) :
    Except String ScenarioProvenance := do
  requireObjectShape json ["cibRefs", "cibRevision", "normativeRefs"]
  pure
    { normativeRefs :=
        ← decodeStringArray (← field json "normativeRefs")
      cibRevision := ← stringField json "cibRevision"
      cibRefs := ← decodeStringArray (← field json "cibRefs") }

/-- Strict decoder for the exact answer-free scenario document supplied to every target. -/
def decodeScenario (json : Json) : Except String Scenario := do
  requireObjectShape json
    ["bpmn", "id", "kind", "observations", "profile", "provenance",
      "stimuli"]
  expectStringField json "kind" "scenario"
  pure
    { kind := .scenario
      id := ⟨← stringField json "id"⟩
      profile := ⟨← stringField json "profile"⟩
      bpmn := ← decodeResourceIdentity (← field json "bpmn")
      stimuli := ← decodeArray decodeStimulus (← field json "stimuli")
      observations :=
        ← decodeArray decodeObservationKind (← field json "observations")
      provenance :=
        ← decodeScenarioProvenance (← field json "provenance") }

def decodeScenarioDocument (contents : String) :
    Except String Scenario := do
  decodeScenario (← parseWireJson contents)

private def decodeSourceIdentity (json : Json) :
    Except String SourceIdentity := do
  requireObjectShape json
    ["semanticProfile", "sourceId", "sourceSha256"]
  pure
    { semanticProfile := ⟨← stringField json "semanticProfile"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      sourceSha256 := ← stringField json "sourceSha256" }

private def decodeMappingExpression (json : Json) :
    Except String MappingExpression := do
  let kind ← stringField json "kind"
  match kind with
  | "stringLiteral" =>
      requireObjectShape json ["kind", "value"]
      pure (.stringLiteral (← stringField json "value"))
  | "localVariable" =>
      requireObjectShape json ["kind", "name"]
      pure (.localVariable (← stringField json "name"))
  | _ => throw s!"unsupported mapping expression {kind}"

private def decodeVariableMapping (json : Json) :
    Except String VariableMapping := do
  requireObjectShape json ["expression", "target"]
  pure
    { target := ← stringField json "target"
      expression := ← decodeMappingExpression (← field json "expression") }

private def decodeCheckedBpmnErrorRoute (json : Json) :
    Except String (Option CheckedBpmnErrorRoute) :=
  match json with
  | .null => pure none
  | _ => do
      requireObjectShape json
        ["attachedToRef", "boundaryEventId", "boundaryEventName", "code",
          "errorDefinitionId", "errorElementId", "errorName", "outputFlowId"]
      pure
        (some
          { boundaryEventId := ⟨← stringField json "boundaryEventId"⟩
            boundaryEventName :=
              ← decodeOptionalString (← field json "boundaryEventName")
            attachedToRef := ⟨← stringField json "attachedToRef"⟩
            errorDefinitionId := ⟨← stringField json "errorDefinitionId"⟩
            errorElementId := ⟨← stringField json "errorElementId"⟩
            errorName := ← decodeOptionalString (← field json "errorName")
            code := ← stringField json "code"
            outputFlowId := ⟨← stringField json "outputFlowId"⟩ })

private def decodeEffectDescriptor (json : Json) :
    Except String EffectDescriptor := do
  requireObjectShape json ["operation", "protocol"]
  pure
    { protocol := ← stringField json "protocol"
      operation := ← stringField json "operation" }

private def decodeErrorReference (json : Json) :
    Except String ErrorReference := do
  requireObjectShape json ["code", "errorDefinitionId", "errorElementId"]
  pure
    { errorDefinitionId := ⟨← stringField json "errorDefinitionId"⟩
      errorElementId := ⟨← stringField json "errorElementId"⟩
      code := ← stringField json "code" }

private def decodeCheckedCondition : Json →
    Except String (Option CheckedCondition)
  | .null => pure none
  | json => do
      requireObjectShape json ["body", "language"]
      pure
        (some
          { language := ← stringField json "language"
            body := ← stringField json "body" })

private def decodeCheckedNode (json : Json) : Except String CheckedNode := do
  let kind ← stringField json "kind"
  match kind with
  | "noneStartEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneStartEvent ⟨← stringField json "id"⟩)
  | "embeddedSubProcess" =>
      requireObjectShape json ["childScopeId", "id", "kind"]
      pure
        (.embeddedSubProcess
          ⟨← stringField json "id"⟩
          ⟨← stringField json "childScopeId"⟩)
  | "boundaryErrorEvent" =>
      requireObjectShape json
        ["attachedToRef", "error", "id", "kind", "outputFlowId"]
      pure
        (.boundaryErrorEvent
          ⟨← stringField json "id"⟩
          ⟨← stringField json "attachedToRef"⟩
          (← decodeErrorReference (← field json "error"))
          ⟨← stringField json "outputFlowId"⟩)
  | "userTask" =>
      requireObjectShape json ["id", "kind", "name"]
      pure
        (.userTask
          ⟨← stringField json "id"⟩
          (← decodeOptionalString (← field json "name")))
  | "intermediateCatchTimerEvent" =>
      requireObjectShape json ["durationLiteral", "id", "kind"]
      pure
        (.intermediateCatchTimerEvent
          ⟨← stringField json "id"⟩
          (← stringField json "durationLiteral"))
  | "intermediateCatchMessageEvent" =>
      requireObjectShape json ["channel", "id", "kind"]
      pure
        (.intermediateCatchMessageEvent
          ⟨← stringField json "id"⟩
          (← decodeMessageChannel (← field json "channel")))
  | "serviceTask" =>
      requireObjectShape json
        ["bpmnErrorRoute", "descriptor", "id", "inputMappings", "kind",
          "outputMappings"]
      pure
        (.serviceTask
          ⟨← stringField json "id"⟩
          (← decodeEffectDescriptor (← field json "descriptor"))
          (← decodeArray decodeVariableMapping (← field json "inputMappings"))
          (← decodeArray decodeVariableMapping (← field json "outputMappings"))
          (← decodeCheckedBpmnErrorRoute (← field json "bpmnErrorRoute")))
  | "parallelGateway" =>
      requireObjectShape json ["direction", "id", "kind"]
      let direction ← stringField json "direction"
      match direction with
      | "diverging" =>
          pure (.parallelGateway ⟨← stringField json "id"⟩ .diverging)
      | "converging" =>
          pure (.parallelGateway ⟨← stringField json "id"⟩ .converging)
      | _ => throw s!"unsupported gateway direction {direction}"
  | "exclusiveGateway" =>
      requireObjectShape json
        ["candidateFlowIds", "defaultFlowId", "direction", "id", "kind"]
      expectStringField json "direction" "diverging"
      pure
        (.exclusiveGateway
          ⟨← stringField json "id"⟩
          ((← decodeStringArray (← field json "candidateFlowIds")).map
            SequenceFlowId.mk)
          ⟨← stringField json "defaultFlowId"⟩)
  | "noneEndEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneEndEvent ⟨← stringField json "id"⟩)
  | "errorEndEvent" =>
      requireObjectShape json ["error", "id", "kind"]
      pure
        (.errorEndEvent
          ⟨← stringField json "id"⟩
          (← decodeErrorReference (← field json "error")))
  | _ => throw s!"unsupported checked node kind {kind}"

private def decodeCheckedSequenceFlow (json : Json) :
    Except String CheckedSequenceFlow := do
  requireObjectShape json ["condition", "id", "sourceId", "targetId"]
  pure
    { id := ⟨← stringField json "id"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      targetId := ⟨← stringField json "targetId"⟩
      condition := ← decodeCheckedCondition (← field json "condition") }

private def decodeDefinitionScope (json : Json) : Except String DefinitionScope := do
  requireObjectShape json ["id", "originElementId", "parentScopeId"]
  pure
    { id := ⟨← stringField json "id"⟩
      parentScopeId :=
        (← decodeOptionalString (← field json "parentScopeId")).map
          DefinitionScopeId.mk
      originElementId := ⟨← stringField json "originElementId"⟩ }

private def decodeNodeScopeOwnership (json : Json) :
    Except String NodeScopeOwnership := do
  requireObjectShape json ["nodeId", "scopeId"]
  pure
    { nodeId := ⟨← stringField json "nodeId"⟩
      scopeId := ⟨← stringField json "scopeId"⟩ }

private def decodeSequenceFlowScopeOwnership (json : Json) :
    Except String SequenceFlowScopeOwnership := do
  requireObjectShape json ["scopeId", "sequenceFlowId"]
  pure
    { sequenceFlowId := ⟨← stringField json "sequenceFlowId"⟩
      scopeId := ⟨← stringField json "scopeId"⟩ }

def decodeCheckedProcess (json : Json) : Except String CheckedProcess := do
  requireObjectShape json
    ["definitionScopes", "identity", "kind", "nodeScopes", "nodes",
      "processId", "sequenceFlowScopes", "sequenceFlows"]
  expectStringField json "kind" "checkedProcess"
  pure
    { identity := ← decodeSourceIdentity (← field json "identity")
      processId := ⟨← stringField json "processId"⟩
      definitionScopes :=
        ← decodeArray decodeDefinitionScope (← field json "definitionScopes")
      nodeScopes :=
        ← decodeArray decodeNodeScopeOwnership (← field json "nodeScopes")
      sequenceFlowScopes :=
        ← decodeArray decodeSequenceFlowScopeOwnership
          (← field json "sequenceFlowScopes")
      nodes := ← decodeArray decodeCheckedNode (← field json "nodes")
      sequenceFlows :=
        ← decodeArray decodeCheckedSequenceFlow
          (← field json "sequenceFlows") }

private def decodeProgramIdentity (json : Json) :
    Except String ProgramIdentity := do
  requireObjectShape json
    ["compiler", "semanticProfile", "sourceId", "sourceSha256"]
  expectStringField json "compiler" "bpmn-source-semantic-process"
  pure
    { compiler := .bpmnSourceSemanticProcess
      semanticProfile := ⟨← stringField json "semanticProfile"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      sourceSha256 := ← stringField json "sourceSha256" }

private def decodeSequenceFlowOrigin (json : Json) :
    Except String BpmnSequenceFlowOrigin := do
  requireObjectShape json ["elementId", "kind"]
  expectStringField json "kind" "bpmnSequenceFlow"
  pure { elementId := ⟨← stringField json "elementId"⟩ }

private def decodeElementOrigin (json : Json) :
    Except String BpmnElementOrigin := do
  requireObjectShape json ["elementId", "kind"]
  expectStringField json "kind" "bpmnElement"
  pure { elementId := ⟨← stringField json "elementId"⟩ }

private def decodeControlPlace (json : Json) : Except String ControlPlace := do
  requireObjectShape json ["id", "origin"]
  pure
    { id := ⟨← stringField json "id"⟩
      origin := ← decodeSequenceFlowOrigin (← field json "origin") }

private def decodeTaskDefinition (json : Json) :
    Except String UserTaskDefinition := do
  requireObjectShape json ["elementId", "name"]
  pure
    { id := ⟨← stringField json "elementId"⟩
      name := ← decodeOptionalString (← field json "name") }

private def decodeTimerDefinition (json : Json) :
    Except String TimerDefinition := do
  requireObjectShape json ["durationMs", "elementId"]
  pure
    { elementId := ⟨← stringField json "elementId"⟩
      durationMs := ← decodeSafeNat (← field json "durationMs") }

private def decodeMessageDefinition (json : Json) :
    Except String MessageDefinition := do
  requireObjectShape json ["channel", "elementId"]
  pure
    { elementId := ⟨← stringField json "elementId"⟩
      channel := ← decodeMessageChannel (← field json "channel") }

private def decodeEffectDefinition (json : Json) :
    Except String EffectDefinition := do
  requireObjectShape json
    ["descriptor", "elementId", "inputMappings", "outputMappings"]
  pure
    { elementId := ⟨← stringField json "elementId"⟩
      descriptor := ← decodeEffectDescriptor (← field json "descriptor")
      inputMappings :=
        ← decodeArray decodeVariableMapping (← field json "inputMappings")
      outputMappings :=
        ← decodeArray decodeVariableMapping (← field json "outputMappings") }

private def decodeBpmnErrorRoute (json : Json) :
    Except String (Option BpmnErrorRoute) :=
  match json with
  | .null => pure none
  | _ => do
      requireObjectShape json ["code", "origin", "output"]
      let origin ← field json "origin"
      requireObjectShape origin
        ["boundaryEventId", "errorDefinitionId", "errorElementId", "kind",
          "sequenceFlowId"]
      expectStringField origin "kind" "bpmnElement"
      pure
        (some
          { code := ← stringField json "code"
            output := ⟨← stringField json "output"⟩
            origin :=
              { boundaryEventId := ⟨← stringField origin "boundaryEventId"⟩
                errorDefinitionId :=
                  ⟨← stringField origin "errorDefinitionId"⟩
                errorElementId := ⟨← stringField origin "errorElementId"⟩
                sequenceFlowId := ⟨← stringField origin "sequenceFlowId"⟩ } })

private def decodeInterruptingErrorHandler (json : Json) :
    Except String InterruptingErrorHandler := do
  requireObjectShape json ["attachedScopeId", "code", "origin", "output"]
  let origin ← field json "origin"
  requireObjectShape origin
    ["boundaryEventId", "errorDefinitionId", "errorElementId", "kind",
      "sequenceFlowId"]
  expectStringField origin "kind" "bpmnElement"
  pure
    { attachedScopeId := ⟨← stringField json "attachedScopeId"⟩
      code := ← stringField json "code"
      output := ⟨← stringField json "output"⟩
      origin :=
        { boundaryEventId := ⟨← stringField origin "boundaryEventId"⟩
          errorDefinitionId := ⟨← stringField origin "errorDefinitionId"⟩
          errorElementId := ⟨← stringField origin "errorElementId"⟩
          sequenceFlowId := ⟨← stringField origin "sequenceFlowId"⟩ } }

private def decodePlaceIdArray (json : Json) :
    Except String (List ControlPlaceId) :=
  decodeArray (fun value => ControlPlaceId.mk <$> value.getStr?) json

private def decodeSimpleBooleanExpression (json : Json) :
    Except String SimpleBooleanExpression := do
  match ← stringField json "kind" with
  | "literal" =>
      requireObjectShape json ["kind", "value"]
      pure (.literal (← (← field json "value").getBool?))
  | "isPresent" =>
      requireObjectShape json ["kind", "variable"]
      pure (.isPresent (← stringField json "variable"))
  | "isNull" =>
      requireObjectShape json ["kind", "variable"]
      pure (.isNull (← stringField json "variable"))
  | "stringEquals" =>
      requireObjectShape json ["kind", "value", "variable"]
      pure
        (.stringEquals
          (← stringField json "variable")
          (← stringField json "value"))
  | kind => throw s!"unsupported Simple Boolean expression {kind}"

private def decodeConditionalCandidate (json : Json) :
    Except String ConditionalCandidate := do
  requireObjectShape json ["condition", "origin", "output"]
  pure
    { condition :=
        ← decodeSimpleBooleanExpression (← field json "condition")
      output := ⟨← stringField json "output"⟩
      origin := ← decodeSequenceFlowOrigin (← field json "origin") }

private def decodeOperation (json : Json) :
    Except String SemanticOperation := do
  let kind ← stringField json "kind"
  let id : OperationId := ⟨← stringField json "id"⟩
  let origin ← decodeElementOrigin (← field json "origin")
  match kind with
  | "initiate" =>
      requireObjectShape json ["id", "kind", "origin", "output"]
      pure (.initiate id origin ⟨← stringField json "output"⟩)
  | "enterScope" =>
      requireObjectShape json
        ["childEntry", "childScopeId", "id", "input", "kind", "origin"]
      pure
        (.enterScope id origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "childEntry"⟩
          ⟨← stringField json "childScopeId"⟩)
  | "awaitUserTask" =>
      requireObjectShape json
        ["id", "input", "kind", "origin", "output", "task"]
      pure
        (.awaitUserTask
          id
          origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "output"⟩
          (← decodeTaskDefinition (← field json "task")))
  | "awaitTimer" =>
      requireObjectShape json
        ["id", "input", "kind", "origin", "output", "timer"]
      pure
        (.awaitTimer
          id
          origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "output"⟩
          (← decodeTimerDefinition (← field json "timer")))
  | "awaitMessage" =>
      requireObjectShape json
        ["id", "input", "kind", "message", "origin", "output"]
      pure
        (.awaitMessage
          id
          origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "output"⟩
          (← decodeMessageDefinition (← field json "message")))
  | "awaitEffect" =>
      requireObjectShape json
        ["bpmnErrorRoute", "effect", "id", "input", "kind", "origin",
          "output"]
      pure
        (.awaitEffect
          id
          origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "output"⟩
          (← decodeEffectDefinition (← field json "effect"))
          (← decodeBpmnErrorRoute (← field json "bpmnErrorRoute")))
  | "duplicate" =>
      requireObjectShape json
        ["id", "input", "kind", "origin", "outputs"]
      pure
        (.duplicate
          id
          origin
          ⟨← stringField json "input"⟩
          (← decodePlaceIdArray (← field json "outputs")))
  | "synchronize" =>
      requireObjectShape json
        ["id", "inputs", "kind", "origin", "output"]
      pure
        (.synchronize
          id
          origin
          (← decodePlaceIdArray (← field json "inputs"))
          ⟨← stringField json "output"⟩)
  | "choose" =>
      requireObjectShape json
        ["candidates", "defaultOrigin", "defaultOutput", "id", "input",
          "kind", "origin"]
      pure
        (.choose
          id
          origin
          ⟨← stringField json "input"⟩
          (← decodeArray decodeConditionalCandidate
            (← field json "candidates"))
          ⟨← stringField json "defaultOutput"⟩
          (← decodeSequenceFlowOrigin (← field json "defaultOrigin")))
  | "throwError" =>
      requireObjectShape json
        ["error", "handler", "id", "input", "kind", "origin"]
      pure
        (.throwError
          id
          origin
          ⟨← stringField json "input"⟩
          (← decodeErrorReference (← field json "error"))
          (← decodeInterruptingErrorHandler (← field json "handler")))
  | "reachNoneEnd" =>
      requireObjectShape json ["id", "input", "kind", "origin"]
      pure (.reachNoneEnd id origin ⟨← stringField json "input"⟩)
  | "completeScope" =>
      requireObjectShape json
        ["id", "kind", "origin", "parentOutput", "scopeId"]
      pure
        (.completeScope id origin
          ⟨← stringField json "scopeId"⟩
          ((← decodeOptionalString (← field json "parentOutput")).map
            ControlPlaceId.mk))
  | _ => throw s!"unsupported Semantic Process operation {kind}"

private def decodeOperationScopeOwnership (json : Json) :
    Except String OperationScopeOwnership := do
  requireObjectShape json ["operationId", "scopeId"]
  pure
    { operationId := ⟨← stringField json "operationId"⟩
      scopeId := ⟨← stringField json "scopeId"⟩ }

private def decodeControlPlaceScopeOwnership (json : Json) :
    Except String ControlPlaceScopeOwnership := do
  requireObjectShape json ["controlPlaceId", "scopeId"]
  pure
    { controlPlaceId := ⟨← stringField json "controlPlaceId"⟩
      scopeId := ⟨← stringField json "scopeId"⟩ }

def decodeProgram (json : Json) : Except String Program := do
  requireObjectShape json
    ["controlPlaceScopes", "controlPlaces", "definitionScopes", "identity",
      "kind", "operationScopes", "operations", "processId"]
  expectStringField json "kind" "semanticProcess"
  pure
    { identity := ← decodeProgramIdentity (← field json "identity")
      processId := ⟨← stringField json "processId"⟩
      definitionScopes :=
        ← decodeArray decodeDefinitionScope (← field json "definitionScopes")
      operationScopes :=
        ← decodeArray decodeOperationScopeOwnership
          (← field json "operationScopes")
      controlPlaceScopes :=
        ← decodeArray decodeControlPlaceScopeOwnership
          (← field json "controlPlaceScopes")
      controlPlaces :=
        ← decodeArray decodeControlPlace (← field json "controlPlaces")
      operations := ← decodeArray decodeOperation (← field json "operations") }

def decodeDefinitionInput (json : Json) : Except String DefinitionInput := do
  requireObjectShape json
    ["checkedProcess", "scenarioId", "semanticProcess"]
  pure
    { scenarioId := ⟨← stringField json "scenarioId"⟩
      checkedProcess :=
        ← decodeCheckedProcess (← field json "checkedProcess")
      semanticProcess := ← decodeProgram (← field json "semanticProcess") }

def validateDefinitionInput (input : DefinitionInput) :
    Except String DefinitionInput := do
  if !checkedWellFormed input.checkedProcess then
    throw s!"checked Process is not well formed for {input.scenarioId.value}"
  if !programWellFormed input.semanticProcess then
    throw s!"Semantic Process is not well formed for {input.scenarioId.value}"
  if lowerCheckedProcess input.checkedProcess ≠ input.semanticProcess then
    throw s!"Semantic Process does not equal Lean lowering for {input.scenarioId.value}"
  pure input

def decodeAndValidateDefinitionInput (line : String) :
    Except String DefinitionInput := do
  validateDefinitionInput (← decodeDefinitionInput (← parseWireJson line))

end BpmnSemantics.SemanticProcessJson
