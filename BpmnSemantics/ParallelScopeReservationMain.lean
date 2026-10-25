module

public import BpmnSemantics.SemanticProcess.InternalScheduledClosure
public import BpmnSemantics.SemanticProcessJson.ParallelScopeProgramInput
public import BpmnSemantics.SemanticProcessJson.Scenario
public import BpmnSemantics.SemanticProcessJson.Publication
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! Private occurrence-publication agreement reads existing Program/Start wires and projects applied reservation prefixes, exact body retirements, and real command traces.
The command witness uses the existing evaluator and publication serializer without registering a public profile. -/

@[expose] public section

open BpmnSemantics BpmnSemantics.SemanticProcess BpmnSemantics.SemanticProcess.InternalCommutation
open BpmnSemantics.SemanticProcessJson Lean

def ownerJson (owner : ScopeOccurrenceId) : Json :=
  toJson [toJson owner.processInstanceId.value, toJson owner.definitionScopeId.value, toJson owner.activation]

def bindingsJson (bindings : List VariableBinding) : Json :=
  toJson (bindings.map fun binding => Json.mkObj [("name", toJson binding.name), ("value", encodeVariableValue binding.value)])

/-- Compare projected wait fields and multiplicity by public identity; RuntimeState uses owner-first private storage. -/
def prefixJson (before state : RuntimeState) : Json :=
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

def publicationRecordsJson? (program : Program) (before : RuntimeState)
    (successors : List RuntimeState) (records : List InternalTransitionRecord)
    (lifecycles : List UnnumberedFlowNodeOccurrenceDelta) : Option Json := do
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

def publicationJson? (program : Program) (before : RuntimeState)
    (successors : List RuntimeState) (closed : ScheduledClosureResult) : Option Json := do
  publicationRecordsJson? program before successors (← closed.records) (← closed.lifecycles)

def enteredReservationState? (program : Program) (stimulus : Stimulus) : Option RuntimeState := do
  let .startProcess _ _ instanceId bindings := stimulus | none
  let state ← runningProgramStartState? program instanceId bindings
  let [root] := state.scopeOccurrences | none
  let [start] := program.operations.filter (fun operation => match operation with | .initiate .. => true | _ => false) | none
  let state ← applyInternalOperationOccurrence? program state ⟨start.id, root.id⟩
  let [entry] := program.operations.filter (fun operation => match operation with | .enterParallelMultiInstanceScope .. => true | _ => false) | none
  applyInternalOperationOccurrence? program state ⟨entry.id, root.id⟩

def refusalJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let entered ← enteredReservationState? program stimulus
  let frontier := deriveInternalExecutionFrontier program entered
  let closed := closeScheduledTraced 16 program ⟨"batch"⟩ 0 0 [] entered
  pure (Json.mkObj [("preparationFailed", toJson frontier.preparationFailed),
    ("failed", toJson closed.failed), ("unchanged", toJson (decide (closed.state = entered)))])

def integrityJson (program : Program) (stimulus : Stimulus) : Option Json := do
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

def reservationJson (program : Program) (stimulus : Stimulus) : Option Json := do
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

def startFrontierJson (program : Program) (stimulus : Stimulus) (fuel : Nat)
    (afterEntry : Bool) : Option Json := do
  let .startProcess commandId _ instanceId bindings := stimulus | none
  let admitted ← if afterEntry then enteredReservationState? program stimulus
    else runningProgramStartState? program instanceId bindings
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

def applyElementOccurrence? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (kind : SemanticOperationKind) (elementId : String) : Option RuntimeState := do
  let [operation] := program.operations.filter (fun operation =>
    operation.kind == kind && operation.origin.elementId.value == elementId) | none
  applyInternalOperationOccurrence? program state ⟨operation.id, owner⟩

def completeBodyTask? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (elementId : String) (values : List VariableBinding := []) : Option RuntimeState := do
  let [wait] := state.waits.filter (fun wait => wait.owner == owner && wait.task.id.value == elementId) | none
  completeParallelScopeUserTask? program state ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ values

def completeBodyEffect? (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Option RuntimeState := do
  let [wait] := state.effectWaits.filter (fun wait => wait.owner == owner && wait.elementId.value == "Validate") | none
  completeParallelScopeEffect? program state ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩
    (.success [⟨"result", .string "ok"⟩])

def retireBodyJson? (program : Program) (entryId : OperationId) (commandId : SemanticId)
    (index : Nat) (before : RuntimeState) (owner : ScopeOccurrenceId) : Option (RuntimeState × Json) := do
  let [operation] := program.operations.filter (fun operation => match operation with
    | .completeParallelMultiInstanceScope _ _ paired => paired == entryId
    | _ => false) | none
  let after ← applyInternalOperationOccurrence? program before ⟨operation.id, owner⟩
  let offer : InternalExecutionOffer := {
    alternative := .operationOccurrence operation.id owner, operation, successor := after, preparation := none }
  let (record, lifecycle) ← singletonOccurrencePublication? program commandId index before offer owner
  let publications ← publicationRecordsJson? program before [after] [record] [lifecycle]
  pure (after, Json.mkObj [
    ("failed", toJson false), ("prefix", prefixJson before after),
    ("process", bindingsJson after.variables.process.bindings),
    ("scopeFrames", toJson (after.variables.scopes.map fun frame => toJson [ownerJson frame.owner, bindingsJson frame.bindings])),
    ("scopes", toJson (after.scopeOccurrences.map fun scope => toJson [ownerJson scope.id, toJson (scope.parent.map ownerJson)])),
    ("publications", publications) ])

/-- The finite invoice witness drives real waits and exact operations; each retirement alone crosses the replay/lifecycle/position boundary. -/
def retirementFrontierJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let .startProcess commandId _ _ _ := stimulus | none
  let entered ← enteredReservationState? program stimulus
  let [entry] := program.operations.filterMap parallelScopeEntry? | none
  let [activity] := entered.activityOccurrences.filter (·.activityElementId == entry.elementId) | none
  let .parallelChildScopes first _ := activity.body | none
  let binding ← parallelScopeBinding? entry entered first.scope
  if binding.controller.total != 2 || binding.controller.completed != 0 || binding.iterations.length != 2
    then none else pure ()
  let early ← match entry.completionBooleanName with
    | none => some false
    | some "approved" => some true
    | _ => none
  let mut state := entered
  for iteration in binding.iterations do
    let owner := iteration.scope
    if early then
      state := (← applyElementOccurrence? program state owner .duplicate "Review")
      state := (← applyElementOccurrence? program state owner .awaitUserTask "Branch0")
      state := (← applyElementOccurrence? program state owner .awaitUserTask "Branch1")
      state := (← applyElementOccurrence? program state owner .awaitEffect "Validate")
    else
      state := (← applyElementOccurrence? program state owner .awaitUserTask "Review")
  let selected := if early then [first] else binding.iterations
  let mut outputs := []
  for (iteration, index) in selected.zipIdx do
    let owner := iteration.scope
    if early then
      state := (← completeBodyTask? program state owner "Branch0" [⟨"approved", .boolean true⟩])
      state := (← applyElementOccurrence? program state owner .reachNoneEnd "End0")
      state := (← completeBodyTask? program state owner "Branch1")
      state := (← applyElementOccurrence? program state owner .reachNoneEnd "End1")
    else
      state := (← completeBodyTask? program state owner "Review")
      state := (← applyElementOccurrence? program state owner .awaitEffect "Validate")
    state := (← completeBodyEffect? program state owner)
    state := (← applyElementOccurrence? program state owner .awaitUserTask "Confirm")
    state := (← completeBodyTask? program state owner "Confirm")
    state := (← applyElementOccurrence? program state owner .reachNoneEnd "ItemEnd")
    let (after, output) ← retireBodyJson? program entry.id commandId index state owner
    outputs := outputs ++ [output]
    state := after
  pure (toJson outputs)

def commandOutcomeName : CommandOutcome → String
  | .committed => "committed"
  | .rolledBack => "rolledBack"
  | .rejected => "rejected"
  | .semanticFailure => "semanticFailure"
  | .unsupported => "unsupported"

def controlStatusName : ProcessControl → String
  | .notStarted => "notStarted"
  | .running _ => "running"
  | .completed _ => "completed"
  | .cancelled _ => "cancelled"
  | .failed .. => "failed"

def stateScopeIdJson (id : ScopeOccurrenceId) : Json :=
  Json.mkObj [("processInstanceId", toJson id.processInstanceId.value),
    ("definitionScopeId", toJson id.definitionScopeId.value), ("activation", toJson id.activation)]

def stateOccurrenceIdJson (id : OccurrenceId) : Json :=
  Json.mkObj [("processInstanceId", toJson id.processInstanceId.value),
    ("elementId", toJson id.elementId.value), ("activation", toJson id.activation)]

def stateActivityIdJson (id : ActivityOccurrenceId) : Json :=
  Json.mkObj [("processInstanceId", toJson id.processInstanceId.value),
    ("activityElementId", toJson id.activityElementId.value), ("activation", toJson id.activation)]

def stateMappingJson (mapping : VariableMapping) : Json :=
  let expression := match mapping.expression with
    | .stringLiteral value => Json.mkObj [("kind", toJson "stringLiteral"), ("value", toJson value)]
    | .localVariable name => Json.mkObj [("kind", toJson "localVariable"), ("name", toJson name)]
    | .enclosingVariable name => Json.mkObj [("kind", toJson "enclosingVariable"), ("name", toJson name)]
  Json.mkObj [("target", toJson mapping.target), ("expression", expression)]

/-- ActivityOccurrence deliberately omits operation identity in Lean; resolve its unique PMIS declarer. -/
def stateActivityJson? (program : Program) (activity : ActivityOccurrence) : Option Json := do
  let .parallelChildScopes first rest := activity.body | none
  if !activity.attachedHandlers.isEmpty then none else pure ()
  let [operation] := program.operations.filter (fun operation => match operation with
    | .enterParallelMultiInstanceScope .. => operation.origin.elementId == activity.activityElementId
    | _ => false) | none
  pure (Json.mkObj [("id", stateActivityIdJson ⟨activity.processInstanceId, ⟨activity.activityElementId.value⟩, activity.activation⟩),
    ("owner", stateScopeIdJson activity.owner), ("operationId", toJson operation.id.value),
    ("body", Json.mkObj [("kind", toJson "parallelChildScopes"), ("iterations", toJson ((first :: rest).map fun iteration =>
      Json.mkObj [("scope", stateScopeIdJson iteration.scope), ("loopCounter", toJson iteration.loopCounter),
        ("item", toJson iteration.item)]))]), ("attachedHandlers", toJson ([] : List Json))])

/-- This private observer refuses excluded families rather than erasing their contents from agreement.
As in `prefixJson`, owner-first Lean wait storage maps to the core's public-occurrence order without removing duplicates. -/
def completePrivateStateJson? (program : Program) (state : RuntimeState) : Option Json := do
  if !([state.messageWaits.isEmpty, state.eventSubProcessMessageSubscriptions.isEmpty, state.timerWaits.isEmpty,
      state.effectIncidents.isEmpty, state.selectedBranchSets.isEmpty, state.eventRaces.isEmpty,
      state.calledProcessOccurrences.isEmpty, state.sequentialScopeControllers.isEmpty,
      state.sequentialMultiInstanceControllers.isEmpty, state.parallelMultiInstanceControllers.isEmpty,
      state.compensationActivityRetentions.isEmpty, state.compensationParentContextRetentions.isEmpty,
      state.compensationTriggers.isEmpty, state.compensationHandlerEffectWaits.isEmpty,
      state.variables.processInterfaces.isEmpty].all id) then none else pure ()
  if !(state.waits.all fun wait => decide (wait.metadata = wait.task.metadata)) ||
      !(state.effectWaits.all fun wait => wait.bpmnErrorRoute.isNone) then none else pure ()
  let control ← match state.control with
    | .notStarted => some (Json.mkObj [("kind", toJson "notStarted")])
    | .failed .. => none
    | .running instanceId | .completed instanceId | .cancelled instanceId =>
        some (Json.mkObj [("kind", toJson (controlStatusName state.control)), ("instanceId", toJson instanceId.value)])
  let activities ← state.activityOccurrences.mapM (stateActivityJson? program)
  let frames ← state.variables.activities.mapM fun frame => do
    let .effectOccurrence id := frame.owner | none
    pure (Json.mkObj [("owner", Json.mkObj [("kind", toJson "effectOccurrence"), ("id", stateOccurrenceIdJson id)]),
      ("bindings", bindingsJson frame.bindings)])
  let waits := InternalCommutation.sortBy (fun left right : UserTaskWait =>
    if left.task.id.value != right.task.id.value then left.task.id.value < right.task.id.value
    else left.activation < right.activation) state.waits
  let effects := InternalCommutation.sortBy (fun left right : EffectWait =>
    if left.elementId.value != right.elementId.value then left.elementId.value < right.elementId.value
    else left.activation < right.activation) state.effectWaits
  let counter := fun (elementId : String) (count : Nat) => Json.mkObj [("elementId", toJson elementId), ("count", toJson count)]
  let empty := toJson ([] : List Json)
  pure (Json.mkObj [
    ("control", control), ("initiationPending", toJson state.initiationPending),
    ("scopeOccurrences", toJson (state.scopeOccurrences.map fun scope => Json.mkObj [("id", stateScopeIdJson scope.id),
      ("parent", toJson (scope.parent.map stateScopeIdJson))])),
    ("controlTokens", toJson (state.tokens.map fun token => Json.mkObj [("placeId", toJson token.placeId.value), ("owner", stateScopeIdJson token.owner)])),
    ("userTaskWaits", toJson (waits.map fun wait => Json.mkObj [
      ("id", stateOccurrenceIdJson ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩),
      ("owner", stateScopeIdJson wait.owner), ("name", toJson wait.task.name),
      ("metadata", toJson (wait.metadata.map encodeUserTaskMetadata)), ("output", toJson wait.output.value)])),
    ("effectWaits", toJson (effects.map fun wait => Json.mkObj [
      ("id", stateOccurrenceIdJson ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩),
      ("owner", stateScopeIdJson wait.owner),
      ("descriptor", Json.mkObj [("protocol", toJson wait.descriptor.protocol), ("operation", toJson wait.descriptor.operation)]),
      ("arguments", bindingsJson wait.arguments), ("outputMappings", toJson (wait.outputMappings.map stateMappingJson)),
      ("bpmnErrorRoute", Json.null), ("output", toJson wait.output.value), ("incidentAlreadyRetried", toJson wait.incidentAlreadyRetried)])),
    ("activityOccurrences", toJson activities),
    ("parallelScopeControllers", toJson (state.parallelScopeControllers.map fun controller => Json.mkObj [
      ("id", stateActivityIdJson controller.id), ("total", toJson controller.total), ("completed", toJson controller.completed)])),
    ("variables", Json.mkObj [("process", Json.mkObj [("bindings", bindingsJson state.variables.process.bindings)]),
      ("scopes", toJson (state.variables.scopes.map fun frame => Json.mkObj [("owner", stateScopeIdJson frame.owner), ("bindings", bindingsJson frame.bindings)])),
      ("activities", toJson frames), ("processInterfaces", empty)]),
    ("taskActivations", toJson (state.activations.map fun row => counter row.taskId.value row.count)),
    ("messageActivations", toJson (state.messageActivations.map fun row => counter row.elementId.value row.count)),
    ("timerActivations", toJson (state.timerActivations.map fun row => counter row.elementId.value row.count)),
    ("effectActivations", toJson (state.effectActivations.map fun row => counter row.elementId.value row.count)),
    ("scopeActivations", toJson (state.scopeActivations.map fun row => counter row.scopeId.value row.count)),
    ("eventRaceActivations", toJson (state.eventRaceActivations.map fun row => counter row.elementId.value row.count)),
    ("callActivations", toJson (state.callActivations.map fun row => counter row.elementId.value row.count)),
    ("activityActivations", toJson (state.activityActivations.map fun row => counter row.taskId.value row.count)),
    ("messageWaits", empty), ("eventSubProcessMessageSubscriptions", empty), ("timerWaits", empty),
    ("effectIncidents", empty), ("selectedBranchSets", empty), ("eventRaces", empty), ("calledProcessOccurrences", empty),
    ("sequentialScopeControllers", empty), ("sequentialMultiInstanceControllers", empty), ("parallelMultiInstanceControllers", empty),
    ("compensationActivityRetentions", empty), ("compensationParentContextRetentions", empty),
    ("compensationTriggers", empty), ("compensationHandlerEffectWaits", empty),
    ("endOccurrences", toJson state.endOccurrences), ("logicalTimeMs", toJson state.logicalTimeMs)])

def commandStateJson (before state : RuntimeState) (fullState : Json) : Json :=
  Json.mkObj [
    ("fullState", fullState),
    ("status", toJson (controlStatusName state.control)),
    ("prefix", prefixJson before state),
    ("process", bindingsJson state.variables.process.bindings),
    ("scopeFrames", toJson (state.variables.scopes.map fun frame =>
      toJson [ownerJson frame.owner, bindingsJson frame.bindings])),
    ("scopes", toJson (state.scopeOccurrences.map fun scope =>
      toJson [ownerJson scope.id, toJson (scope.parent.map ownerJson)])) ]

def commandsJson (program : Program) (inputs : List (Stimulus × Json)) : Except String Json := do
  let some (.startProcess _ _ instanceId _, _) := inputs.head? |
    throw "command witness requires an initial manual Start"
  let mut state := initialState
  let mut commands := []
  for (stimulus, wire) in inputs do
    let before := state
    let limit := (ParallelScopeStart.commandClosureLimit? program before stimulus).getD scenarioClosureLimit
    let traced := applyStimulusTraced limit program before stimulus
    state := traced.result.state
    let publication := Publication.tracedExecutionPublicationJson? program instanceId before traced
      (fun recorded => if recorded == stimulus then some wire else none)
    let some fullState := completePrivateStateJson? program state | throw "Command state contains an excluded PMIS family"
    commands := commands ++ [Json.mkObj [
      ("commandId", toJson (stimulusCommandId stimulus).value),
      ("outcome", toJson (commandOutcomeName traced.result.outcome)),
      ("internalStepBoundExceeded", toJson traced.result.internalStepBoundExceeded),
      ("ambiguousInternalChoice", toJson traced.result.ambiguousInternalChoice),
      ("stateUnchanged", toJson (decide (state = before))),
      ("traceReplays", toJson (decide (ParallelScopeReplay.committedTransitions? program before
        traced.committedTransitions = some state))),
      ("publication", publication.getD Json.null),
      ("lifecycles", toJson (traced.flowNodeOccurrenceLifecycles.map Publication.occurrenceDeltaJson)),
      ("state", commandStateJson before state fullState) ]]
  let some fullState := completePrivateStateJson? program state | throw "Final state contains an excluded PMIS family"
  pure (Json.mkObj [
    ("commands", toJson commands),
    ("finalState", commandStateJson initialState state fullState),
    ("publicShapeAdmitted", toJson (programProfileCapabilitiesValid program)) ])

def printCommands (programPath stimuliPath : String) : IO Unit := do
  let programText ← IO.FS.readFile programPath
  let stimuliText ← IO.FS.readFile stimuliPath
  let result := do
    let admitted ← parseWireJson programText >>= decodeParallelScopeProgramInput
    let inputs ← parseWireJson stimuliText >>= decodeArray (fun wire => do
      let stimulus ← decodeStimulus wire
      pure (stimulus, wire))
    match admitted with
    | none => pure Json.null
    | some program => commandsJson program inputs
  match result with
  | .error error => throw (IO.userError error)
  | .ok value => IO.println value.compress

def runCommands : List String → IO UInt32
  | [] => pure 0
  | programPath :: stimuliPath :: rest => do
      printCommands programPath stimuliPath
      runCommands rest
  | _ => throw (IO.userError "expected Program/Stimuli path pairs")

def programCapacityJson (program : Program) (stimulus : Stimulus) : Option Json := do
  let .startProcess _ _ _ bindings := stimulus | none
  let capacity ← ParallelScopeStart.programStartCapacity program bindings
  pure (Json.mkObj [("closureBound", toJson capacity.closureBound),
    ("waits", toJson capacity.waits), ("effects", toJson capacity.effects)])

inductive DiagnosticMode where
  | reservation
  | refusal
  | integrity
  | startFrontier
  | enteredFrontier
  | retirementFrontier
  | programCapacity

def printInput (mode : DiagnosticMode) (programPath startPath : String) (fuel : Nat) : IO Unit := do
  let programText ← IO.FS.readFile programPath
  let startText ← IO.FS.readFile startPath
  let result := do
    let admitted ← parseWireJson programText >>= decodeParallelScopeProgramInput
    let stimulus ← parseWireJson startText >>= decodeStimulus
    match admitted with
    | none => pure Json.null
    | some program => pure ((match mode with
        | .reservation => reservationJson program stimulus
        | .refusal => refusalJson program stimulus
        | .integrity => integrityJson program stimulus
        | .startFrontier => startFrontierJson program stimulus fuel false
        | .enteredFrontier => startFrontierJson program stimulus fuel true
        | .retirementFrontier => retirementFrontierJson program stimulus
        | .programCapacity => programCapacityJson program stimulus).getD Json.null)
  match result with
  | .error error => match mode with
    | .programCapacity => IO.println (Json.mkObj [("syntaxError", toJson error)]).compress
    | _ => throw (IO.userError error)
  | .ok value => IO.println value.compress

def runInputs (mode : DiagnosticMode) : List String → IO UInt32
  | [] => pure 0
  | programPath :: startPath :: rest => match mode with
      | .startFrontier | .enteredFrontier => match rest with
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
  | "--commands" :: rest => runCommands rest
  | "--program-capacity" :: rest => runInputs .programCapacity rest
  | "--refusal" :: rest => runInputs .refusal rest
  | "--integrity" :: rest => runInputs .integrity rest
  | "--start-frontier" :: rest => runInputs .startFrontier rest
  | "--entered-frontier" :: rest => runInputs .enteredFrontier rest
  | "--retirement-frontier" :: rest => runInputs .retirementFrontier rest
  | _ => runInputs .reservation paths
