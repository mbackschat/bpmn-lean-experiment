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

/-- Compare the complete wait multiset by public identity; RuntimeState uses owner-first private storage. -/
private def prefixJson (before state : RuntimeState) : Json :=
  let waits := InternalCommutation.sortBy (fun left right : UserTaskWait =>
    if left.task.id.value != right.task.id.value then left.task.id.value < right.task.id.value
    else left.activation < right.activation) state.waits
  let effects := InternalCommutation.sortBy (fun left right : EffectWait =>
    if left.elementId.value != right.elementId.value then left.elementId.value < right.elementId.value
    else left.activation < right.activation) state.effectWaits
  Json.mkObj [
    ("endOccurrences", toJson state.endOccurrences),
    ("tokens", toJson (state.tokens.map fun token => toJson [toJson token.placeId.value, ownerJson token.owner])),
    ("tasks", toJson (waits.map fun wait => toJson [ownerJson wait.owner, toJson wait.task.id.value,
      toJson wait.activation, toJson wait.output.value])),
    ("effects", toJson (effects.map fun wait => toJson [ownerJson wait.owner, toJson wait.elementId.value,
      toJson wait.activation, toJson wait.output.value, bindingsJson wait.arguments])),
    ("taskCounters", toJson (state.activations.map fun row => toJson [toJson row.taskId.value, toJson row.count])),
    ("effectCounters", toJson (state.effectActivations.map fun row => toJson [toJson row.elementId.value, toJson row.count])),
    ("effectFrames", toJson (state.variables.activities.filterMap fun frame => match frame.owner with
      | .effectOccurrence id => some (toJson [toJson id.processInstanceId.value, toJson id.elementId.value,
          toJson id.activation, bindingsJson frame.bindings])
      | _ => none)),
    ("otherStateUnchanged", toJson (decide ({ state with
      tokens := before.tokens
      endOccurrences := before.endOccurrences
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

private def integrityJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let entered ← enteredReservationState? program stimulus
  let [operation] := program.operations.filter (fun operation => match operation with
    | .awaitUserTask .. | .awaitEffect .. => true | _ => false) | none
  let (human, elementId) ← match operation with
    | .awaitUserTask _ _ _ _ task => some (true, task.id.value)
    | .awaitEffect _ _ _ _ effect _ => some (false, effect.elementId.value)
    | _ => none
  let candidates ← internalOperationOccurrences? program entered operation.id
  let count := candidates.length
  let maxSafe := 9007199254740991
  let counters := fun (values : List Nat) => if human then
    { entered with activations := values.map (fun value => ⟨⟨elementId⟩, value⟩) }
    else { entered with effectActivations := values.map (fun value => ⟨⟨elementId⟩, value⟩) }
  let variants := [
    ("normal", entered),
    ("missing-controller", { entered with parallelScopeControllers := [] }),
    ("missing-frames", { entered with variables := { entered.variables with scopes := [] } }),
    ("duplicate-counters", counters [0, 0]),
    ("exhausted-counters", counters [maxSafe]),
    ("exact-headroom", counters [maxSafe - count]),
    ("one-short-headroom", counters [maxSafe - count + 1]) ]
  pure (toJson (variants.map fun (label, state) =>
    let frontier := deriveInternalExecutionFrontier program state
    let closed := closeScheduledTraced count program ⟨"batch"⟩ 0 0 [] state
    let activations := if human then closed.state.waits.map (fun wait : UserTaskWait => wait.activation)
      else closed.state.effectWaits.map (fun wait : EffectWait => wait.activation)
    let finalCounters := if human then closed.state.activations.map (fun row : TaskActivation => row.count)
      else closed.state.effectActivations.map (fun row : EffectActivation => row.count)
    Json.mkObj [
      ("label", toJson label),
      ("preparationFailed", toJson frontier.preparationFailed),
      ("offers", toJson frontier.offers.length),
      ("directRefused", toJson (candidates.all fun candidate =>
        (applyInternalOperationOccurrence? program state candidate).isNone)),
      ("failed", toJson closed.failed),
      ("unchanged", toJson (decide (closed.state = state))),
      ("noPartialOutcomes", toJson (!closed.failed ||
        ((closed.records.map List.isEmpty).getD true && (closed.lifecycles.map List.isEmpty).getD true))),
      ("activations", toJson activations),
      ("counters", toJson finalCounters) ]))

private def reservationJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let entered ← enteredReservationState? program stimulus
  let batch ← (deriveInternalExecutionFrontier program entered).occurrenceBatch
  let successors ← applyInternalOccurrenceBatch? program entered batch
  let final ← successors.getLast?
  let closed := closeScheduledTraced batch.members.length program ⟨"batch"⟩ 0 0 [] entered
  let short := closeScheduledTraced (batch.members.length - 1) program ⟨"batch"⟩ 0 0 [] entered
  if closed.failed || closed.state != final || !short.hitBound || short.state != entered then none else pure ()
  pure (Json.mkObj [
    ("programWellFormed", toJson (programWellFormed program)),
    ("slots", toJson (batch.members.map fun member => toJson [toJson member.operation.id.value,
      ownerJson member.owner, toJson (member.waitOccurrence?.map (·.activation))])),
    ("publications", (publicationJson? program entered successors closed).getD Json.null),
    ("prefixes", toJson (successors.map (prefixJson entered))) ])

private def startFrontierJson (program : Program) (stimulus : Stimulus) (fuel : Nat) : Option Json := do
  let .startProcess commandId _ instanceId bindings := stimulus | none
  let admitted ← runningProgramStartState? program instanceId bindings
  let closed := closeScheduledTraced fuel program commandId 0 0 [] admitted
  let state := (StimulusResult.ofScheduledClosure admitted closed).state
  let publications : Option Json := do
    let records ← closed.records
    let lifecycles ← closed.lifecycles
    let mut previous := admitted
    let mut encoded := []
    for record in records do
      let next ← replayInternalOperationOccurrence? program previous record
      let transition ← Publication.internalTransitionJson record
      let position ← controlPositionDelta? program instanceId previous next
      encoded := encoded ++ [Json.mkObj [("logicalTimeMs", toJson previous.logicalTimeMs),
        ("transition", transition), ("positionDelta", Publication.positionDeltaJson position)]]
      previous := next
    if previous != state then none else pure ()
    pure (Json.mkObj [("records", toJson encoded),
      ("lifecycles", toJson (lifecycles.map Publication.occurrenceDeltaJson))])
  pure (Json.mkObj [
    ("failed", toJson closed.failed), ("prefix", prefixJson admitted state),
    ("process", bindingsJson state.variables.process.bindings),
    ("scopeFrames", toJson (state.variables.scopes.map fun frame => toJson [ownerJson frame.owner, bindingsJson frame.bindings])),
    ("scopes", toJson (state.scopeOccurrences.map fun scope => toJson [ownerJson scope.id, toJson (scope.parent.map ownerJson)])),
    ("publications", publications.getD Json.null) ])

private inductive DiagnosticMode where
  | reservation
  | refusal
  | integrity
  | startFrontier

private def printInput (mode : DiagnosticMode) (programPath startPath : String) (fuel : Nat) : IO Unit := do
  let programText ← IO.FS.readFile programPath
  let startText ← IO.FS.readFile startPath
  let result := do
    let program ← parseWireJson programText >>= decodeProgram
    let stimulus ← parseWireJson startText >>= decodeStimulus
    pure ((match mode with
      | .reservation => reservationJson program stimulus
      | .refusal => refusalJson program stimulus
      | .integrity => integrityJson program stimulus
      | .startFrontier => startFrontierJson program stimulus fuel).getD Json.null)
  match result with
  | .error error => throw (IO.userError error)
  | .ok value => IO.println value.compress

private def runInputs (mode : DiagnosticMode) : List String → IO UInt32
  | [] => pure 0
  | programPath :: startPath :: rest => match mode with
      | .startFrontier => match rest with
          | value :: remaining => do
              let some fuel := value.toNat? | throw (IO.userError "expected natural closure fuel")
              printInput mode programPath startPath fuel
              runInputs mode remaining
          | [] => throw (IO.userError "missing closure fuel")
      | _ => do
          printInput mode programPath startPath 0
          runInputs mode rest
  | _ => throw (IO.userError "expected Program/Start path pairs")

def main (paths : List String) : IO UInt32 :=
  match paths with
  | "--refusal" :: rest => runInputs .refusal rest
  | "--integrity" :: rest => runInputs .integrity rest
  | "--start-frontier" :: rest => runInputs .startFrontier rest
  | _ => runInputs .reservation paths
