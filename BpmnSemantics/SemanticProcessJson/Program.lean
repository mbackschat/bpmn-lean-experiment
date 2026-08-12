import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcessJson.Elements

/-! # Strict Semantic Process program wire decoding

Owns one public contract: the executable program the semantic core evaluates. Decoding establishes
neither structural validity, profile capability, nor equality with checked-process lowering. -/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

private def decodeProgramIdentity (json : Json) :
    Except String ProgramIdentity := do
  requireObjectShape json
    ["compiler", "semanticProfile", "sourceId", "sourceOverlay",
      "sourceSha256"]
  expectStringField json "compiler" "bpmn-source-semantic-process"
  pure
    { compiler := .bpmnSourceSemanticProcess
      semanticProfile := ⟨← stringField json "semanticProfile"⟩
      sourceId := ⟨← stringField json "sourceId"⟩
      sourceOverlay :=
        ← decodeSourceOverlayIdentity (← field json "sourceOverlay")
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

/-- Decode the exact ordinary User Task definition, preserving physical metadata absence. -/
def decodeTaskDefinition (json : Json) :
    Except String UserTaskDefinition := do
  let metadata ← decodeOptionalUserTaskMetadataField json
  requireObjectShape json
    (if metadata.isSome then ["elementId", "metadata", "name"]
      else ["elementId", "name"])
  pure
    { id := ⟨← stringField json "elementId"⟩
      name := ← decodeOptionalString (← field json "name")
      metadata }

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

private def decodeEventRaceMessageArm (json : Json) :
    Except String EventRaceMessageArm := do
  requireObjectShape json
    ["channel", "configurationOrigin", "elementId", "output"]
  pure
    { configurationOrigin :=
        ← decodeSequenceFlowOrigin (← field json "configurationOrigin")
      elementId := ⟨← stringField json "elementId"⟩
      channel := ← decodeMessageChannel (← field json "channel")
      output := ⟨← stringField json "output"⟩ }

private def decodeEventRaceTimerArm (json : Json) :
    Except String EventRaceTimerArm := do
  requireObjectShape json
    ["configurationOrigin", "durationMs", "elementId", "output"]
  pure
    { configurationOrigin :=
        ← decodeSequenceFlowOrigin (← field json "configurationOrigin")
      elementId := ⟨← stringField json "elementId"⟩
      durationMs := ← decodeSafeNat (← field json "durationMs")
      output := ⟨← stringField json "output"⟩ }

private def decodeBoundedTaskArm (json : Json) :
    Except String BoundedTaskArm := do
  requireObjectShape json ["elementId", "name", "output"]
  pure
    { id := ⟨← stringField json "elementId"⟩
      name := ← decodeOptionalString (← field json "name")
      output := ⟨← stringField json "output"⟩ }

private def decodeBoundaryTimerArm (json : Json) :
    Except String BoundaryTimerArm := do
  requireObjectShape json ["durationMs", "elementId", "origin", "output"]
  pure
    { elementId := ⟨← stringField json "elementId"⟩
      durationMs := ← decodeSafeNat (← field json "durationMs")
      output := ⟨← stringField json "output"⟩
      origin := ← decodeSequenceFlowOrigin (← field json "origin") }

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

private def decodeInclusiveCandidate (json : Json) :
    Except String InclusiveCandidate := do
  requireObjectShape json
    ["condition", "expectedJoinInput", "origin", "output"]
  pure
    { condition := ← decodeSimpleBooleanExpression (← field json "condition")
      output := ⟨← stringField json "output"⟩
      expectedJoinInput := ⟨← stringField json "expectedJoinInput"⟩
      origin := ← decodeSequenceFlowOrigin (← field json "origin") }

private def decodeInclusiveDefaultBranch (json : Json) :
    Except String InclusiveDefaultBranch := do
  requireObjectShape json ["expectedJoinInput", "origin", "output"]
  pure
    { output := ⟨← stringField json "output"⟩
      expectedJoinInput := ⟨← stringField json "expectedJoinInput"⟩
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
  | "initiateMessage" =>
      requireObjectShape json
        ["channel", "id", "kind", "origin", "outputs"]
      pure
        (.initiateMessage id origin
          (← decodeOperationMessageChannel (← field json "channel"))
          (← decodePlaceIdArray (← field json "outputs")))
  | "initiateTimer" =>
      requireObjectShape json
        ["id", "kind", "origin", "outputs", "timer"]
      let timer ← field json "timer"
      requireObjectShape timer ["durationMs"]
      let durationMs ← decodeSafeNat (← field timer "durationMs")
      let outputs ← decodePlaceIdArray (← field json "outputs")
      if id.value.isEmpty || origin.elementId.value.isEmpty ||
          durationMs ≠ 1000 || outputs.isEmpty ||
          outputs.any (fun output => output.value.isEmpty) ||
          outputs.eraseDups.length ≠ outputs.length then
        throw "initiateTimer requires exact identity, PT1S normalization, and distinct outputs"
      pure
        (.initiateTimer id origin
          durationMs
          outputs)
  | "enterScope" =>
      requireObjectShape json
        ["childEntry", "childScopeId", "id", "input", "kind", "origin"]
      pure
        (.enterScope id origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "childEntry"⟩
          ⟨← stringField json "childScopeId"⟩)
  | "enterBoundedScope" =>
      requireObjectShape json
        ["boundaryTimer", "childEntry", "childScopeId", "id", "input", "kind",
          "origin"]
      pure
        (.enterBoundedScope id origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "childEntry"⟩
          ⟨← stringField json "childScopeId"⟩
          (← decodeBoundaryTimerArm (← field json "boundaryTimer")))
  | "invokeProcess" =>
      requireObjectShape json
        ["calledEntry", "calledProcessId", "calledRootScopeId", "id",
          "input", "kind", "origin", "returnOperationId"]
      pure
        (.invokeProcess id origin
          ⟨← stringField json "input"⟩
          ⟨← stringField json "calledProcessId"⟩
          ⟨← stringField json "calledRootScopeId"⟩
          ⟨← stringField json "calledEntry"⟩
          ⟨← stringField json "returnOperationId"⟩)
  | "returnProcess" =>
      requireObjectShape json
        ["calledProcessId", "calledRootScopeId", "callerOutput", "id",
          "kind", "origin"]
      pure
        (.returnProcess id origin
          ⟨← stringField json "calledProcessId"⟩
          ⟨← stringField json "calledRootScopeId"⟩
          ⟨← stringField json "callerOutput"⟩)
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
  | "awaitEventRace" =>
      requireObjectShape json
        ["id", "input", "kind", "message", "origin", "timer"]
      pure
        (.awaitEventRace
          id
          origin
          ⟨← stringField json "input"⟩
          (← decodeEventRaceMessageArm (← field json "message"))
          (← decodeEventRaceTimerArm (← field json "timer")))
  | "awaitBoundedUserTask" =>
      requireObjectShape json
        ["boundaryTimer", "id", "input", "kind", "origin", "task"]
      pure
        (.awaitBoundedUserTask
          id
          origin
          ⟨← stringField json "input"⟩
          (← decodeBoundedTaskArm (← field json "task"))
          (← decodeBoundaryTimerArm (← field json "boundaryTimer")))
  | "awaitMonitoredUserTask" =>
      requireObjectShape json
        ["boundaryTimer", "id", "input", "kind", "origin", "task"]
      pure
        (.awaitMonitoredUserTask
          id
          origin
          ⟨← stringField json "input"⟩
          (← decodeBoundedTaskArm (← field json "task"))
          (← decodeBoundaryTimerArm (← field json "boundaryTimer")))
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
  | "mergeExclusive" =>
      requireObjectShape json
        ["id", "inputs", "kind", "origin", "output"]
      let inputs ← decodePlaceIdArray (← field json "inputs")
      if inputs.isEmpty || inputs.any (·.value.isEmpty) ||
          inputs.eraseDups.length != inputs.length then
        throw "mergeExclusive inputs must be nonempty, nonempty-valued, and distinct"
      pure
        (.mergeExclusive
          id
          origin
          inputs
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
  | "selectMany" =>
      requireObjectShape json
        ["candidates", "defaultBranch", "id", "input", "kind", "origin",
          "selectionKey"]
      pure
        (.selectMany id origin
          ⟨← stringField json "input"⟩
          (← decodeArray decodeInclusiveCandidate (← field json "candidates"))
          (← decodeInclusiveDefaultBranch (← field json "defaultBranch"))
          (← stringField json "selectionKey"))
  | "synchronizeSelected" =>
      requireObjectShape json
        ["id", "inputs", "kind", "origin", "output", "selectionKey"]
      pure
        (.synchronizeSelected id origin
          (← decodePlaceIdArray (← field json "inputs"))
          ⟨← stringField json "output"⟩
          (← stringField json "selectionKey"))
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
  | "terminateScope" =>
      requireObjectShape json ["id", "input", "kind", "origin", "scopeId"]
      let terminateId := OperationId.mk (← decodeNonemptyStringField json "id")
      let terminateOrigin := BpmnElementOrigin.mk
        (NodeId.mk (← decodeNonemptyStringField (← field json "origin") "elementId"))
      pure
        (.terminateScope terminateId terminateOrigin
          ⟨← decodeNonemptyStringField json "input"⟩
          ⟨← decodeNonemptyStringField json "scopeId"⟩)
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

/-- Decode the exact current Semantic Process wire shape without establishing structural validity, profile capability, or equality with checked-process lowering. -/
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

end BpmnSemantics.SemanticProcessJson
