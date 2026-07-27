import BpmnSemantics.SemanticProcess
import BpmnSemantics.StrictJson
import Lean.Data.Json

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

def maxSafeWireNat : Nat := 9007199254740991

def isSafeWireNat (value : Nat) : Bool :=
  value ≤ maxSafeWireNat

def parseWireJson (contents : String) : Except String Json :=
  BpmnSemantics.StrictJson.parse contents

private def decodeSafeNat (json : Json) : Except String Nat := do
  let value ← json.getNat?
  if isSafeWireNat value then
    pure value
  else
    throw s!"wire integer exceeds {maxSafeWireNat}"

private def requireObjectShape (json : Json) (keys : List String) :
    Except String Unit :=
  match json with
  | .obj object =>
      if object.size = keys.length &&
          keys.all fun key => (object.get? key).isSome then
        pure ()
      else
        throw s!"object fields do not match {keys}"
  | _ => throw "object expected"

private def field (json : Json) (key : String) : Except String Json :=
  json.getObjVal? key

private def stringField (json : Json) (key : String) : Except String String := do
  (← field json key).getStr?

private def expectString (json : Json) (expected : String) :
    Except String Unit := do
  let actual ← json.getStr?
  if actual = expected then
    pure ()
  else
    throw s!"expected {expected}, got {actual}"

private def expectStringField (json : Json) (key expected : String) :
    Except String Unit := do
  expectString (← field json key) expected

private def decodeArray (decode : Json → Except String α) (json : Json) :
    Except String (List α) := do
  let values ← json.getArr?
  values.toList.mapM decode

private def decodeOptionalString : Json → Except String (Option String)
  | .null => pure none
  | .str value => pure (some value)
  | _ => throw "string or null expected"

private def decodeStringArray (json : Json) :
    Except String (List String) :=
  decodeArray Json.getStr? json

private def decodeResourceIdentity (json : Json) :
    Except String ResourceIdentity := do
  requireObjectShape json ["id", "relativePath", "sha256"]
  pure
    { id := ⟨← stringField json "id"⟩
      relativePath := ← stringField json "relativePath"
      sha256 := ← stringField json "sha256" }

private def decodeOccurrenceId (json : Json) :
    Except String OccurrenceId := do
  requireObjectShape json
    ["activation", "elementId", "processInstanceId"]
  let activation ← decodeSafeNat (← field json "activation")
  if activation = 0 then
    throw "occurrence activation must be positive"
  pure
    { processInstanceId := ⟨← stringField json "processInstanceId"⟩
      elementId := ⟨← stringField json "elementId"⟩
      activation }

private def decodeVariableValue (json : Json) :
    Except String VariableValue := do
  requireObjectShape json ["kind", "value"]
  expectStringField json "kind" "string"
  pure (.string (← stringField json "value"))

private def decodeVariableBinding (json : Json) :
    Except String VariableBinding := do
  requireObjectShape json ["name", "value"]
  pure
    { name := ← stringField json "name"
      value := ← decodeVariableValue (← field json "value") }

private def decodeEffectExecutionResult (json : Json) :
    Except String EffectExecutionResult := do
  requireObjectShape json ["kind", "localPatch"]
  expectStringField json "kind" "success"
  pure
    (.success
      (← decodeArray decodeVariableBinding (← field json "localPatch")))

private def decodeStimulus (json : Json) : Except String Stimulus := do
  let kind ← stringField json "kind"
  match kind with
  | "startProcess" =>
      requireObjectShape json
        ["commandId", "instanceId", "kind", "processId"]
      pure
        (.startProcess
          ⟨← stringField json "commandId"⟩
          ⟨← stringField json "processId"⟩
          ⟨← stringField json "instanceId"⟩)
  | "completeUserTaskInstance" =>
      requireObjectShape json ["commandId", "kind", "taskId"]
      pure
        (.completeUserTaskInstance
          ⟨← stringField json "commandId"⟩
          (← decodeOccurrenceId (← field json "taskId")))
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

private def decodeCheckedNode (json : Json) : Except String CheckedNode := do
  let kind ← stringField json "kind"
  match kind with
  | "noneStartEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneStartEvent ⟨← stringField json "id"⟩)
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
  | "serviceTask" =>
      requireObjectShape json
        ["id", "implementation", "inputMappings", "kind", "outputMappings",
          "sourceBinding"]
      let implementation ← stringField json "implementation"
      let binding ← field json "sourceBinding"
      let delegateExpression ← field binding "delegateExpressionAttribute"
      requireObjectShape delegateExpression ["namespace", "value"]
      let sourceBinding ←
        match implementation with
        | "urn:bpmn-lean:effect:probe-v1" => do
            requireObjectShape binding
              ["asyncBeforeAttribute", "delegateExpressionAttribute"]
            let asyncBefore ← field binding "asyncBeforeAttribute"
            requireObjectShape asyncBefore ["namespace", "value"]
            pure
              (.probe
                (← stringField delegateExpression "namespace")
                (← stringField delegateExpression "value")
                (← stringField asyncBefore "namespace")
                (← stringField asyncBefore "value"))
        | "urn:bpmn-lean:a12-delegate:v1" => do
            requireObjectShape binding
              ["delegateExpressionAttribute", "inputOutputElement",
                "protocolSource"]
            expectStringField binding "protocolSource" "semanticProfile"
            let inputOutput ← field binding "inputOutputElement"
            requireObjectShape inputOutput
              ["inputParameter", "namespace", "outputParameter"]
            let inputParameter ← field inputOutput "inputParameter"
            let outputParameter ← field inputOutput "outputParameter"
            requireObjectShape inputParameter ["body", "name"]
            requireObjectShape outputParameter ["body", "name"]
            pure
              (.a12CreateDocument
                (← stringField delegateExpression "namespace")
                (← stringField delegateExpression "value")
                (← stringField inputOutput "namespace")
                (← stringField inputParameter "name")
                (← stringField inputParameter "body")
                (← stringField outputParameter "name")
                (← stringField outputParameter "body"))
        | _ => throw s!"unsupported Service Task implementation {implementation}"
      pure
        (.serviceTask
          ⟨← stringField json "id"⟩
          implementation
          sourceBinding
          (← decodeArray decodeVariableMapping (← field json "inputMappings"))
          (← decodeArray decodeVariableMapping (← field json "outputMappings")))
  | "parallelGateway" =>
      requireObjectShape json ["direction", "id", "kind"]
      let direction ← stringField json "direction"
      match direction with
      | "diverging" =>
          pure (.parallelGateway ⟨← stringField json "id"⟩ .diverging)
      | "converging" =>
          pure (.parallelGateway ⟨← stringField json "id"⟩ .converging)
      | _ => throw s!"unsupported gateway direction {direction}"
  | "noneEndEvent" =>
      requireObjectShape json ["id", "kind"]
      pure (.noneEndEvent ⟨← stringField json "id"⟩)
  | _ => throw s!"unsupported checked node kind {kind}"

private def decodeCheckedSequenceFlow (json : Json) :
    Except String CheckedSequenceFlow := do
  requireObjectShape json ["id", "sourceId", "targetId"]
  pure
    { id := ⟨← stringField json "id"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      targetId := ⟨← stringField json "targetId"⟩ }

def decodeCheckedProcess (json : Json) : Except String CheckedProcess := do
  requireObjectShape json
    ["identity", "kind", "nodes", "processId", "sequenceFlows"]
  expectStringField json "kind" "checkedProcess"
  pure
    { identity := ← decodeSourceIdentity (← field json "identity")
      processId := ⟨← stringField json "processId"⟩
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

private def decodeEffectDescriptor (json : Json) :
    Except String EffectDescriptor := do
  requireObjectShape json ["handler", "protocol"]
  pure
    { protocol := ← stringField json "protocol"
      handler := ← stringField json "handler" }

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

private def decodePlaceIdArray (json : Json) :
    Except String (List ControlPlaceId) :=
  decodeArray (fun value => ControlPlaceId.mk <$> value.getStr?) json

private def decodeOperation (json : Json) :
    Except String SemanticOperation := do
  let kind ← stringField json "kind"
  let id : OperationId := ⟨← stringField json "id"⟩
  let origin ← decodeElementOrigin (← field json "origin")
  match kind with
  | "initiate" =>
      requireObjectShape json ["id", "kind", "origin", "output"]
      pure (.initiate id origin ⟨← stringField json "output"⟩)
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
  | "awaitEffect" =>
      requireObjectShape json
        ["effect", "id", "input", "kind", "origin", "output"]
      pure
        (.awaitEffect
          id
          origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "output"⟩
          (← decodeEffectDefinition (← field json "effect")))
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
  | "terminate" =>
      requireObjectShape json ["id", "input", "kind", "origin"]
      pure (.terminate id origin ⟨← stringField json "input"⟩)
  | _ => throw s!"unsupported Semantic Process operation {kind}"

def decodeProgram (json : Json) : Except String Program := do
  requireObjectShape json
    ["controlPlaces", "identity", "kind", "operations", "processId"]
  expectStringField json "kind" "semanticProcess"
  pure
    { identity := ← decodeProgramIdentity (← field json "identity")
      processId := ⟨← stringField json "processId"⟩
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
