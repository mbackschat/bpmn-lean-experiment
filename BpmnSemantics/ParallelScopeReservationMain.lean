import BpmnSemantics.SemanticProcess.InternalScheduledClosure
import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcessJson.Scenario
import BpmnSemantics.SemanticProcessJson.Publication

/-! Private reservation agreement reads existing Program/Start wires and projects each applied prefix.
This diagnostic does not admit a command or assert full publication/refinement agreement. -/

open BpmnSemantics BpmnSemantics.SemanticProcess BpmnSemantics.SemanticProcess.InternalCommutation
open BpmnSemantics.SemanticProcessJson Lean

private def ownerJson (owner : ScopeOccurrenceId) : Json :=
  toJson [toJson owner.processInstanceId.value, toJson owner.definitionScopeId.value, toJson owner.activation]

private def bindingsJson (bindings : List VariableBinding) : Json :=
  toJson (bindings.map fun binding => Json.mkObj [("name", toJson binding.name), ("value", encodeVariableValue binding.value)])

private def prefixJson (before state : RuntimeState) : Json :=
  Json.mkObj [
    ("tokens", toJson (state.tokens.map fun token => toJson [toJson token.placeId.value, ownerJson token.owner])),
    ("tasks", toJson (state.waits.map fun wait => toJson [ownerJson wait.owner, toJson wait.task.id.value,
      toJson wait.activation, toJson wait.output.value])),
    ("effects", toJson (state.effectWaits.map fun wait => toJson [ownerJson wait.owner, toJson wait.elementId.value,
      toJson wait.activation, toJson wait.output.value, bindingsJson wait.arguments])),
    ("taskCounters", toJson (state.activations.map fun row => toJson [toJson row.taskId.value, toJson row.count])),
    ("effectCounters", toJson (state.effectActivations.map fun row => toJson [toJson row.elementId.value, toJson row.count])),
    ("effectFrames", toJson (state.variables.activities.filterMap fun frame => match frame.owner with
      | .effectOccurrence id => some (toJson [toJson id.processInstanceId.value, toJson id.elementId.value,
          toJson id.activation, bindingsJson frame.bindings])
      | _ => none)),
    ("otherStateUnchanged", toJson (decide ({ state with
      tokens := before.tokens
      waits := before.waits
      effectWaits := before.effectWaits
      activations := before.activations
      effectActivations := before.effectActivations
      variables := { state.variables with activities := before.variables.activities } } = before))) ]

private def publicationJson? (program : Program) (before : RuntimeState)
    (successors : List RuntimeState) (closed : ScheduledClosureResult) : Option Json := do
  let records ← closed.records
  let lifecycles ← closed.lifecycles
  if records.length != successors.length || lifecycles.length != successors.length then none else pure ()
  let instanceId ← hostingInstanceId? before
  let mut state := before
  let mut encoded := []
  for (record, next) in records.zip successors do
    if replayInternalOperationOccurrence? program state record != some next then none else pure ()
    if (replayInternalOperationOccurrence? program next record).isSome then none else pure ()
    let [root] := state.scopeOccurrences.filter (·.parent.isNone) | none
    for invalid in [{ record with owner := root.id }, { record with operationId := ⟨"missing"⟩ },
        { record with operationKind := .initiate },
        { record with origin := { record.origin with elementId := ⟨"Wrong"⟩ } }] do
      if (replayInternalOperationOccurrence? program state invalid).isSome then none else pure ()
    let transition ← Publication.internalTransitionJson record
    let position ← controlPositionDelta? program instanceId state next
    encoded := encoded ++ [Json.mkObj [("logicalTimeMs", toJson state.logicalTimeMs),
      ("transition", transition), ("positionDelta", Publication.positionDeltaJson position)]]
    state := next
  pure (Json.mkObj [("records", toJson encoded),
    ("lifecycles", toJson (lifecycles.map Publication.occurrenceDeltaJson))])

private def enteredReservationState? (program : Program) (stimulus : Stimulus) : Option RuntimeState := do
  let .startProcess _ _ instanceId bindings := stimulus | none
  let state ← runningProgramStartState? program instanceId bindings
  let [root] := state.scopeOccurrences | none
  let [start] := program.operations.filter (fun operation => match operation with | .initiate .. => true | _ => false) | none
  let state ← applyInternalOperationOccurrence? program state ⟨start.id, root.id⟩
  let [entry] := program.operations.filter (fun operation => match operation with | .enterParallelMultiInstanceScope .. => true | _ => false) | none
  applyInternalOperationOccurrence? program state ⟨entry.id, root.id⟩

private def refusalJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let entered ← enteredReservationState? program stimulus
  let frontier := deriveInternalExecutionFrontier program entered
  let closed := closeScheduledTraced 16 program ⟨"batch"⟩ 0 0 [] entered
  pure (Json.mkObj [("preparationFailed", toJson frontier.preparationFailed),
    ("failed", toJson closed.failed), ("unchanged", toJson (decide (closed.state = entered)))])

private def reservationJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let entered ← enteredReservationState? program stimulus
  let batch ← (deriveInternalExecutionFrontier program entered).occurrenceBatch
  let successors ← applyInternalOccurrenceArmingBatch? program entered batch
  let final ← successors.getLast?
  let closed := closeScheduledTraced batch.members.length program ⟨"batch"⟩ 0 0 [] entered
  let short := closeScheduledTraced (batch.members.length - 1) program ⟨"batch"⟩ 0 0 [] entered
  if closed.failed || closed.state != final || !short.hitBound || short.state != entered then none else pure ()
  pure (Json.mkObj [
    ("programWellFormed", toJson (programWellFormed program)),
    ("slots", toJson (batch.members.map fun member => toJson [toJson member.operation.id.value,
      ownerJson member.owner, toJson member.write.occurrence.activation])),
    ("publications", (publicationJson? program entered successors closed).getD Json.null),
    ("prefixes", toJson (successors.map (prefixJson entered))) ])

private def runInputs (refusal : Bool) : List String → IO UInt32
  | [] => pure 0
  | programPath :: startPath :: rest => do
      let programText ← IO.FS.readFile programPath
      let startText ← IO.FS.readFile startPath
      let result := do
        let program ← parseWireJson programText >>= decodeProgram
        let stimulus ← parseWireJson startText >>= decodeStimulus
        pure ((if refusal then refusalJson program stimulus else reservationJson program stimulus).getD Json.null)
      match result with
      | .error error => throw (IO.userError error)
      | .ok value => IO.println value.compress
      runInputs refusal rest
  | _ => throw (IO.userError "expected Program/Start path pairs")

def main (paths : List String) : IO UInt32 :=
  match paths with
  | "--refusal" :: rest => runInputs true rest
  | _ => runInputs false paths
