import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcessJson.Scenario
import BpmnSemantics.SemanticProcessJson.Publication

/-! Answer-free private scheduling witnesses use the same Program, stimulus and directives in both
interpreters. This test entrypoint does not add a profile or engine API contract.
-/

namespace BpmnSemantics.InternalChoiceScheduleJsonMain

open Lean BpmnSemantics SemanticProcess SemanticProcessJson SemanticProcess.InternalCommutation

private def decodeAlternative (json : Json) : Except String InternalAlternative := do
  match ← stringField json "kind" with
  | "operation" =>
      requireObjectShape json ["kind", "operationId"]
      pure (.operation ⟨← stringField json "operationId"⟩)
  | "mergeInput" =>
      requireObjectShape json ["kind", "operationId", "owner", "inputControlPlace"]
      let owner ← field json "owner"
      requireObjectShape owner ["processInstanceId", "definitionScopeId", "activation"]
      pure (.mergeInput ⟨← stringField json "operationId"⟩
        { processInstanceId := ⟨← stringField owner "processInstanceId"⟩
          definitionScopeId := ⟨← stringField owner "definitionScopeId"⟩
          activation := ← decodeSafeNat (← field owner "activation") }
        ⟨← stringField json "inputControlPlace"⟩)
  | kind => throw s!"unknown alternative {kind}"

private def decodeDirective (json : Json) : Except String InternalChoiceDirective := do
  requireObjectShape json ["ordinal", "alternatives", "selected"]
  pure { ordinal := ← decodeSafeNat (← field json "ordinal")
         alternatives := ← decodeArray decodeAlternative (← field json "alternatives")
         selected := ← decodeAlternative (← field json "selected") }

private def outcomeName : CommandOutcome → String
  | .committed => "committed"
  | .rolledBack => "rolledBack"
  | .rejected => "rejected"
  | .semanticFailure => "semanticFailure"
  | .unsupported => "unsupported"

private def failureName : InternalChoiceScheduleFailure → String
  | .scheduleForbiddenForMode => "scheduleForbiddenForMode"
  | .missingDirective => "missingDirective"
  | .ordinalMismatch => "ordinalMismatch"
  | .alternativesMismatch => "alternativesMismatch"
  | .selectedAlternativeMissing => "selectedAlternativeMissing"
  | .unusedDirective => "unusedDirective"

private def statusName : ProcessControl → String
  | .notStarted => "notStarted"
  | .running _ => "running"
  | .completed _ => "completed"
  | .cancelled _ => "cancelled"
  | .failed .. => "failed"

private def evaluate (json : Json) : Except String Json := do
  requireObjectShape json ["id", "program", "stimulus", "schedule", "limit"]
  let id ← stringField json "id"
  let program ← decodeProgram (← field json "program")
  if !programWellFormed program then throw "scheduled witness Program is not structurally admitted"
  let stimulus ← decodeStimulus (← field json "stimulus")
  let schedule ← decodeArray decodeDirective (← field json "schedule")
  let limit ← decodeSafeNat (← field json "limit")
  let instanceId ← match stimulus with
    | .startProcess _ _ instanceId _ => pure instanceId
    | _ => throw "this witness requires manual Start"
  let traced := applyStimulusScheduledTraced limit program initialState stimulus schedule
  let frontierCounts := (List.range traced.committedTransitions.length).mapM fun index => do
    let before ← if index = 0 then some initialState
      else replayCommittedTransitions program initialState (traced.committedTransitions.take index)
    pure (enabledInternalOperationCount program before)
  let publication := Publication.tracedExecutionPublicationJson? program instanceId initialState
    { result := traced.result.toStimulusResult, committedTransitions := traced.committedTransitions
      flowNodeOccurrenceLifecycles := traced.flowNodeOccurrenceLifecycles }
  pure <| Json.mkObj
    [ ("id", toJson id)
    , ("outcome", toJson (outcomeName traced.result.outcome))
    , ("internalStepBoundExceeded", toJson traced.result.internalStepBoundExceeded)
    , ("ambiguousInternalChoice", toJson traced.result.ambiguousInternalChoice)
    , ("scheduleFailure", toJson (traced.result.scheduleFailure.map failureName))
    , ("stateUnchanged", toJson (decide (traced.result.state = initialState)))
    , ("stateWellFormed", toJson (runtimeStateWellFormed program instanceId traced.result.state))
    , ("status", toJson (statusName traced.result.state.control))
    , ("endOccurrences", toJson traced.result.state.endOccurrences)
    , ("lifecycleCount", toJson traced.flowNodeOccurrenceLifecycles.length)
    , ("predecessorFrontierCounts", toJson frontierCounts)
    , ("traceReplays", toJson (decide (replayCommittedTransitions program initialState
        traced.committedTransitions = some traced.result.state)))
    , ("publication", publication.getD .null) ]

def emit (path : System.FilePath) : IO Unit := do
  let lines := ((← IO.FS.readFile path).splitOn "\n").filter fun line => !line.isEmpty
  for line in lines do
    match parseWireJson line >>= evaluate with
    | .ok result => IO.println result.compress
    | .error message => throw (IO.userError message)

end BpmnSemantics.InternalChoiceScheduleJsonMain

def main (arguments : List String) : IO Unit := do
  match arguments with
  | [path] => BpmnSemantics.InternalChoiceScheduleJsonMain.emit ⟨path⟩
  | _ => throw (IO.userError "usage: InternalChoiceScheduleJsonMain <answer-free-inputs.jsonl>")
