import BpmnSemantics.SemanticProcess.ControlPosition
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Committed execution publication JSON

This module owns one-way JSON projection for cross-target evidence: unnumbered committed transition records, control positions, and semantic occurrence lifecycles. The scenario runner supplies its canonical stimulus encoder for complete command schedules; the standalone parallel witness retains its manual-Start encoder. Private occurrence anchors are diagnostic evidence, never public Product 1 identities. Revisioning, state observation, and Temporal facts remain outside this owner.
-/

namespace BpmnSemantics.SemanticProcessJson.Publication

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

private def jsonArray (values : List Json) : Json :=
  .arr values.toArray

private def variableBindingJson (binding : VariableBinding) : Json :=
  Json.mkObj
    [ ("name", toJson binding.name)
    , ("value", encodeVariableValue binding.value) ]

private def manualStartStimulusJson? : Stimulus → Option Json
  | .startProcess commandId processId instanceId initialVariables =>
      some <| Json.mkObj
        [ ("kind", toJson "startProcess")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value)
        , ("initialVariables",
            jsonArray (initialVariables.map variableBindingJson)) ]
  | _ => none

private def operationKindJson : SemanticOperationKind → Option Json
  | .initiate => some (toJson "initiate")
  | .initiateMessage => some (toJson "initiateMessage")
  | .initiateTimer => some (toJson "initiateTimer")
  | .enterScope => some (toJson "enterScope")
  | .enterBoundedScope => some (toJson "enterBoundedScope")
  | .invokeProcess => some (toJson "invokeProcess")
  | .returnProcess => some (toJson "returnProcess")
  | .awaitUserTask => some (toJson "awaitUserTask")
  | .awaitDataInputUserTask => some (toJson "awaitDataInputUserTask")
  | .awaitDataInputOutputUserTask => some (toJson "awaitDataInputOutputUserTask")
  | .awaitDataOutputUserTask => some (toJson "awaitDataOutputUserTask")
  | .awaitSequentialMultiInstanceUserTask =>
      some (toJson "awaitSequentialMultiInstanceUserTask")
  | .awaitParallelMultiInstanceUserTask =>
      some (toJson "awaitParallelMultiInstanceUserTask")
  | .completeParallelMultiInstanceUserTask => none
  | .awaitTimer => some (toJson "awaitTimer")
  | .awaitMessage => some (toJson "awaitMessage")
  | .awaitPayloadMessage => some (toJson "awaitPayloadMessage")
  | .awaitCorrelatedPayloadMessage => some (toJson "awaitCorrelatedPayloadMessage")
  | .awaitEventRace => some (toJson "awaitEventRace")
  | .awaitBoundedUserTask => some (toJson "awaitBoundedUserTask")
  | .awaitMessageBoundedUserTask => some (toJson "awaitMessageBoundedUserTask")
  | .awaitMonitoredUserTask => some (toJson "awaitMonitoredUserTask")
  | .awaitEffect => some (toJson "awaitEffect")
  | .duplicate => some (toJson "duplicate")
  | .synchronize => some (toJson "synchronize")
  | .mergeExclusive => some (toJson "mergeExclusive")
  | .choose => some (toJson "choose")
  | .selectMany => some (toJson "selectMany")
  | .synchronizeSelected => some (toJson "synchronizeSelected")
  | .throwError => some (toJson "throwError")
  | .reachNoneEnd => some (toJson "reachNoneEnd")
  | .terminateScope => some (toJson "terminateScope")
  | .completeScope => some (toJson "completeScope")
  | .triggerCompensation => some (toJson "triggerCompensation")

private def scopeOccurrenceIdJson (id : ScopeOccurrenceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson id.processInstanceId.value)
    , ("definitionScopeId", toJson id.definitionScopeId.value)
    , ("activation", toJson id.activation) ]

private def optionalScopeOccurrenceIdJson : Option ScopeOccurrenceId → Json
  | none => .null
  | some id => scopeOccurrenceIdJson id

private def originJson (origin : BpmnElementOrigin) : Json :=
  Json.mkObj
    [ ("kind", toJson "bpmnElement")
    , ("elementId", toJson origin.elementId.value) ]

private def internalTransitionJson (record : InternalTransitionRecord) : Option Json := do
  let kind ← operationKindJson record.operationKind
  pure <| Json.mkObj
    [ ("kind", toJson "internalOperation")
    , ("operationId", toJson record.operationId.value)
    , ("operationKind", kind)
    , ("origin", originJson record.origin)
    , ("owner", scopeOccurrenceIdJson record.owner) ]

private def committedTransitionJson? (encodeStimulus : Stimulus → Option Json) :
    CommittedTransition → Option Json
  | .externalStimulus stimulus => do
      pure <| Json.mkObj
        [ ("kind", toJson "externalStimulus")
        , ("stimulus", ← encodeStimulus stimulus) ]
  | .internalOperation record => internalTransitionJson record

private def tokenPositionJson (position : PublicControlTokenPosition) : Json :=
  Json.mkObj
    [ ("sequenceFlowId", toJson position.sequenceFlowId.value)
    , ("owner", scopeOccurrenceIdJson position.owner)
    , ("multiplicity", toJson position.multiplicity) ]

private def scopePositionJson (position : PublicScopePosition) : Json :=
  Json.mkObj
    [ ("id", scopeOccurrenceIdJson position.id)
    , ("parent", optionalScopeOccurrenceIdJson position.parent)
    , ("bpmnElementId", toJson position.bpmnElementId.value) ]

private def positionDeltaJson (delta : PublicControlPositionDelta) : Json :=
  Json.mkObj
    [ ("consumedTokens", jsonArray (delta.consumedTokens.map tokenPositionJson))
    , ("producedTokens", jsonArray (delta.producedTokens.map tokenPositionJson))
    , ("enteredScopes", jsonArray (delta.enteredScopes.map scopePositionJson))
    , ("exitedScopes", jsonArray (delta.exitedScopes.map scopePositionJson)) ]

private def currentPositionJson (position : PublicControlPosition) : Json :=
  Json.mkObj
    [ ("controlTokens", jsonArray (position.controlTokens.map tokenPositionJson))
    , ("scopes", jsonArray (position.scopes.map scopePositionJson)) ]

private def transitionSuccessor? (program : Program) (state : RuntimeState) :
    CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus =>
      let admission := admitStimulusWithCompensationSnapshots program state stimulus
      if admission.outcome = .committed then some admission.state else none
  | .internalOperation record =>
      if program.compensationEventSubProcessSnapshots.isSome || program.compensationExecution.isSome
      then replayInternalTransitionWithCompensationSnapshots? program state record
      else replayInternalTransition? program state record

private def transitionRecordJson? (program : Program) (instanceId : SemanticId)
    (encodeStimulus : Stimulus → Option Json)
    (before : RuntimeState) (transition : CommittedTransition) :
    Option (Json × RuntimeState) := do
  let successor ← transitionSuccessor? program before transition
  let delta ← controlPositionDelta? program instanceId before successor
  let transitionJson ← committedTransitionJson? encodeStimulus transition
  pure
    ( Json.mkObj
        [ ("logicalTimeMs", toJson successor.logicalTimeMs)
        , ("transition", transitionJson)
        , ("positionDelta", positionDeltaJson delta) ]
    , successor )

private def transitionRecordsJson? (program : Program) (instanceId : SemanticId) :
    (Stimulus → Option Json) → RuntimeState → List CommittedTransition → Option (List Json × RuntimeState)
  | _, state, [] => some ([], state)
  | encodeStimulus, state, transition :: remaining => do
      let (record, successor) ← transitionRecordJson? program instanceId encodeStimulus state transition
      let (tail, finalState) ←
        transitionRecordsJson? program instanceId encodeStimulus successor remaining
      pure (record :: tail, finalState)

/-- Both ordinary and scheduled parity witnesses replay actual records before projecting their head. -/
def tracedExecutionPublicationJson? (program : Program) (instanceId : SemanticId)
    (initial : RuntimeState) (traced : TracedStimulusResult)
    (encodeStimulus : Stimulus → Option Json := manualStartStimulusJson?) : Option Json := do
  if traced.committedTransitions.isEmpty then none
  else
    let (records, finalState) ←
      transitionRecordsJson? program instanceId encodeStimulus initial
        traced.committedTransitions
    if finalState ≠ traced.result.state then none
    else
      let current ← projectControlPosition? program instanceId finalState
      pure <| Json.mkObj
        [ ("transitions", jsonArray records)
        , ("current", currentPositionJson current) ]

/-- Emit only the exact unnumbered records and independently projected head position for one publishable manual Process start. -/
def committedExecutionPublicationJson? (closureLimit : Nat) (program : Program)
    (instanceId : SemanticId) (initial : RuntimeState) (stimulus : Stimulus) : Option Json :=
  tracedExecutionPublicationJson? program instanceId initial
    (applyStimulusTracedWithCompensationSnapshots closureLimit program initial stimulus)

private def occurrenceIdJson (id : OccurrenceId) : Json :=
  Json.mkObj [("processInstanceId", toJson id.processInstanceId.value),
    ("elementId", toJson id.elementId.value), ("activation", toJson id.activation)]

private def anchorJson : SemanticFlowNodeOccurrenceAnchor → Json
  | .wait id => Json.mkObj [("kind", toJson "wait"), ("id", occurrenceIdJson id)]
  | .scope id => Json.mkObj [("kind", toJson "scope"), ("id", scopeOccurrenceIdJson id)]
  | .callActivity id => Json.mkObj [("kind", toJson "callActivity"), ("id", occurrenceIdJson id)]
  | .compensationTrigger id =>
      Json.mkObj [("kind", toJson "compensationTrigger"), ("id", occurrenceIdJson id)]
  | .compensationHandler id =>
      Json.mkObj [("kind", toJson "compensationHandler"), ("id", occurrenceIdJson id)]
  | .transition commandId transitionIndex localIndex =>
      Json.mkObj [("kind", toJson "transition"), ("commandId", toJson commandId.value),
        ("transitionIndex", toJson transitionIndex), ("localIndex", toJson localIndex)]

def occurrenceStartJson (start : UnnumberedFlowNodeOccurrenceStart) : Json :=
  Json.mkObj [("anchor", anchorJson start.anchor), ("processId", toJson start.processId.value),
    ("elementId", toJson start.elementId.value), ("owner", scopeOccurrenceIdJson start.owner)]

def occurrenceDeltaJson (delta : UnnumberedFlowNodeOccurrenceDelta) : Json :=
  Json.mkObj [("started", jsonArray (delta.started.map occurrenceStartJson)),
    ("ended", jsonArray (delta.ended.map fun terminal =>
      Json.mkObj [("anchor", anchorJson terminal.anchor), ("terminal", toJson <| match terminal.terminal with
        | .completed => "completed"
        | .cancelled => "cancelled")]))]

private def projectionRejectionsJson
    (cases : List (String × Program × SemanticId × RuntimeState)) : Json :=
  Json.mkObj <| cases.map fun (label, program, instanceId, state) =>
    (label, toJson (projectControlPosition? program instanceId state).isNone)

/-- Report whether each named malformed state is refused as a representable committed state.

Separate from `projectionRejectionsJson` because the two decide different propositions: that one asks
whether a state projects, this one whether the account admits it at all. A state can fail either
without failing the other, so folding them into one section would let a disagreement in one hide
behind agreement in the other. -/
private def wellFormednessRejectionsJson
    (cases : List (String × Program × SemanticId × RuntimeState)) : Json :=
  Json.mkObj <| cases.map fun (label, program, instanceId, state) =>
    (label, toJson (!runtimeStateWellFormed program instanceId state))

/-- Preserve the exact positive publication while reporting cross-target rejection of named malformed positions. -/
def committedExecutionPublicationParityJson? (closureLimit : Nat) (program : Program)
    (instanceId : SemanticId) (initial : RuntimeState) (stimulus : Stimulus)
    (rejectionCases : List (String × Program × SemanticId × RuntimeState))
    (wellFormednessCases : List (String × Program × SemanticId × RuntimeState)) :
    Option Json := do
  let publication ←
    committedExecutionPublicationJson? closureLimit program instanceId initial stimulus
  pure <| Json.mkObj
    [ ("publication", publication)
    , ("projectionRejections", projectionRejectionsJson rejectionCases)
    , ("wellFormednessRejections", wellFormednessRejectionsJson wellFormednessCases) ]

end BpmnSemantics.SemanticProcessJson.Publication
