import BpmnSemantics.SemanticProcessContract

/-! Checked-node and operation counts remain separate from profile selection so new capabilities do not duplicate the exhaustive constructor classification. -/

namespace BpmnSemantics.SemanticProcess

structure ShapeCardinalities where
  starts : Nat := 0
  initiates : Nat := 0
  messageStarts : Nat := 0
  messageInitiates : Nat := 0
  timerStarts : Nat := 0
  timerInitiates : Nat := 0
  embeddedScopes : Nat := 0
  callActivities : Nat := 0
  boundaryErrors : Nat := 0
  boundaryTimers : Nat := 0
  boundaryMessages : Nat := 0
  monitoredBoundaryTimers : Nat := 0
  scopeEntries : Nat := 0
  processInvokes : Nat := 0
  processReturns : Nat := 0
  userTasks : Nat := 0
  dataInputUserTasks : Nat := 0
  dataInputOutputUserTasks : Nat := 0
  dataOutputUserTasks : Nat := 0
  messages : Nat := 0
  payloadMessages : Nat := 0
  correlatedPayloadMessages : Nat := 0
  receiveTasks : Nat := 0
  timers : Nat := 0
  configuredTasks : Nat := 0
  effects : Nat := 0
  duplicates : Nat := 0
  synchronizes : Nat := 0
  exclusiveMerges : Nat := 0
  choices : Nat := 0
  inclusiveSplits : Nat := 0
  inclusiveJoins : Nat := 0
  eventGateways : Nat := 0
  compensationThrows : Nat := 0
  selectMany : Nat := 0
  synchronizeSelected : Nat := 0
  eventRaces : Nat := 0
  boundedUserTasks : Nat := 0
  messageBoundedUserTasks : Nat := 0
  messageMonitoredUserTasks : Nat := 0
  monitoredUserTasks : Nat := 0
  sequentialMultiInstanceUserTasks : Nat := 0
  boundedScopeEntries : Nat := 0
  monitoredScopeEntries : Nat := 0
  errorEnds : Nat := 0
  terminateEnds : Nat := 0
  errorThrows : Nat := 0
  scopeTerminations : Nat := 0
  ends : Nat := 0
  scopeCompletions : Nat := 0
  eventSubProcessCompletions : Nat := 0
  compensationTriggers : Nat := 0
  deriving DecidableEq

def nodeCardinalities (nodes : List CheckedNode) : ShapeCardinalities :=
  nodes.foldl (init := {}) fun counts node =>
    match node with
    | .noneStartEvent .. => { counts with starts := counts.starts + 1 }
    | .messageStartEvent .. =>
        { counts with messageStarts := counts.messageStarts + 1 }
    | .timerStartEvent .. =>
        { counts with timerStarts := counts.timerStarts + 1 }
    | .embeddedSubProcess .. =>
        { counts with embeddedScopes := counts.embeddedScopes + 1 }
    | .callActivity .. =>
        { counts with callActivities := counts.callActivities + 1 }
    | .boundaryErrorEvent .. =>
        { counts with boundaryErrors := counts.boundaryErrors + 1 }
    -- Counted per disposition, because the two boundary-Timer profiles pin the same node kinds and
    -- the disposition is the only thing separating them at checked-source admission.
    | .timerBoundaryEvent _ _ .interrupting _ _ =>
        { counts with boundaryTimers := counts.boundaryTimers + 1 }
    | .timerBoundaryEvent _ _ .nonInterrupting _ _ =>
        { counts with
          monitoredBoundaryTimers := counts.monitoredBoundaryTimers + 1 }
    | .messageBoundaryEvent .. =>
        { counts with boundaryMessages := counts.boundaryMessages + 1 }
    | .userTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .dataInputUserTask .. =>
        { counts with dataInputUserTasks := counts.dataInputUserTasks + 1 }
    | .dataInputOutputUserTask .. =>
        { counts with dataInputOutputUserTasks := counts.dataInputOutputUserTasks + 1 }
    | .dataOutputUserTask .. =>
        { counts with dataOutputUserTasks := counts.dataOutputUserTasks + 1 }
    | .sequentialMultiInstanceUserTask .. =>
        { counts with sequentialMultiInstanceUserTasks :=
            counts.sequentialMultiInstanceUserTasks + 1 }
    | .transactionSubProcess .. | .cancelEndEvent .. | .cancelBoundaryEvent ..
    | .parallelMultiInstanceUserTask .. => counts
    | .intermediateCatchTimerEvent .. =>
        { counts with timers := counts.timers + 1 }
    | .intermediateCatchMessageEvent .. =>
        { counts with messages := counts.messages + 1 }
    | .payloadMessageCatchEvent .. =>
        { counts with payloadMessages := counts.payloadMessages + 1 }
    | .correlatedPayloadMessageCatchEvent .. =>
        { counts with correlatedPayloadMessages := counts.correlatedPayloadMessages + 1 }
    | .receiveTask .. =>
        { counts with receiveTasks := counts.receiveTasks + 1 }
    | .configuredTask .. =>
        { counts with configuredTasks := counts.configuredTasks + 1 }
    | .serviceTask .. => { counts with effects := counts.effects + 1 }
    | .parallelGateway _ .diverging =>
        { counts with duplicates := counts.duplicates + 1 }
    | .parallelGateway _ .converging =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .exclusiveMerge .. =>
        { counts with exclusiveMerges := counts.exclusiveMerges + 1 }
    | .exclusiveGateway .. => { counts with choices := counts.choices + 1 }
    | .inclusiveGatewayDiverging .. =>
        { counts with inclusiveSplits := counts.inclusiveSplits + 1 }
    | .inclusiveGatewayConverging .. =>
        { counts with inclusiveJoins := counts.inclusiveJoins + 1 }
    | .eventBasedGateway .. =>
        { counts with eventGateways := counts.eventGateways + 1 }
    | .globalSynchronousCompensationThrowEvent .. =>
        { counts with compensationThrows := counts.compensationThrows + 1 }
    | .errorEndEvent .. => { counts with errorEnds := counts.errorEnds + 1 }
    | .terminateEndEvent .. =>
        { counts with terminateEnds := counts.terminateEnds + 1 }
    | .noneEndEvent .. => { counts with ends := counts.ends + 1 }

def addOperationCardinality (counts : ShapeCardinalities)
    (operation : SemanticOperation) : ShapeCardinalities :=
  match operation with
    | .initiate .. => { counts with initiates := counts.initiates + 1 }
    | .initiateMessage .. =>
        { counts with messageInitiates := counts.messageInitiates + 1 }
    | .initiateTimer .. =>
        { counts with timerInitiates := counts.timerInitiates + 1 }
    | .enterScope .. => { counts with scopeEntries := counts.scopeEntries + 1 }
    | .enterBoundedScope .. =>
        { counts with boundedScopeEntries := counts.boundedScopeEntries + 1 }
    | .enterMonitoredScope .. =>
        { counts with monitoredScopeEntries := counts.monitoredScopeEntries + 1 }
    | .invokeProcess .. =>
        { counts with processInvokes := counts.processInvokes + 1 }
    | .returnProcess .. =>
        { counts with processReturns := counts.processReturns + 1 }
    | .awaitUserTask .. => { counts with userTasks := counts.userTasks + 1 }
    | .awaitDataInputUserTask .. =>
        { counts with dataInputUserTasks := counts.dataInputUserTasks + 1 }
    | .awaitDataInputOutputUserTask .. =>
        { counts with dataInputOutputUserTasks := counts.dataInputOutputUserTasks + 1 }
    | .awaitDataOutputUserTask .. =>
        { counts with dataOutputUserTasks := counts.dataOutputUserTasks + 1 }
    | .awaitSequentialMultiInstanceUserTask .. =>
        { counts with sequentialMultiInstanceUserTasks :=
            counts.sequentialMultiInstanceUserTasks + 1 }
    | .awaitParallelMultiInstanceUserTask ..
    | .completeParallelMultiInstanceUserTask .. => counts
    | .awaitTimer .. => { counts with timers := counts.timers + 1 }
    | .awaitMessage .. => { counts with messages := counts.messages + 1 }
    | .awaitPayloadMessage .. =>
        { counts with payloadMessages := counts.payloadMessages + 1 }
    | .awaitCorrelatedPayloadMessage .. =>
        { counts with correlatedPayloadMessages := counts.correlatedPayloadMessages + 1 }
    | .awaitEventRace .. => { counts with eventRaces := counts.eventRaces + 1 }
    | .awaitBoundedUserTask .. =>
        { counts with boundedUserTasks := counts.boundedUserTasks + 1 }
    | .awaitMessageBoundedUserTask .. =>
        { counts with messageBoundedUserTasks := counts.messageBoundedUserTasks + 1 }
    | .awaitMessageMonitoredUserTask .. =>
        { counts with messageMonitoredUserTasks := counts.messageMonitoredUserTasks + 1 }
    | .awaitMonitoredUserTask .. =>
        { counts with monitoredUserTasks := counts.monitoredUserTasks + 1 }
    | .awaitEffect .. => { counts with effects := counts.effects + 1 }
    | .duplicate .. => { counts with duplicates := counts.duplicates + 1 }
    | .synchronize .. =>
        { counts with synchronizes := counts.synchronizes + 1 }
    | .mergeExclusive .. =>
        { counts with exclusiveMerges := counts.exclusiveMerges + 1 }
    | .choose .. => { counts with choices := counts.choices + 1 }
    | .selectMany .. => { counts with selectMany := counts.selectMany + 1 }
    | .synchronizeSelected .. =>
        { counts with synchronizeSelected := counts.synchronizeSelected + 1 }
    | .throwError .. => { counts with errorThrows := counts.errorThrows + 1 }
    | .reachNoneEnd .. => { counts with ends := counts.ends + 1 }
    | .terminateScope .. =>
        { counts with scopeTerminations := counts.scopeTerminations + 1 }
    | .completeScope .. =>
        { counts with scopeCompletions := counts.scopeCompletions + 1 }
    | .completeEventSubProcess .. =>
        { counts with eventSubProcessCompletions := counts.eventSubProcessCompletions + 1 }
    | .triggerCompensation .. | .cancelTransaction .. =>
        { counts with compensationTriggers := counts.compensationTriggers + 1 }

def operationCardinalities (operations : List SemanticOperation) : ShapeCardinalities :=
  operations.foldl (init := {}) addOperationCardinality

def isEventRaceOperation : SemanticOperation → Bool
  | .awaitEventRace .. => true
  | _ => false

theorem operationCardinalities_eventRaces (operations : List SemanticOperation) :
    (operationCardinalities operations).eventRaces =
      (operations.filter isEventRaceOperation).length := by
  unfold operationCardinalities
  have foldCount : ∀ counts : ShapeCardinalities,
      (operations.foldl addOperationCardinality counts).eventRaces =
        counts.eventRaces + (operations.filter isEventRaceOperation).length := by
    intro counts
    induction operations generalizing counts with
    | nil => simp
    | cons operation rest ih =>
        rw [List.foldl_cons, ih]
        cases operation <;> simp [addOperationCardinality, isEventRaceOperation] <;> omega
  simpa using foldCount {}

def withScopeCompletions (count : Nat) (shape : ShapeCardinalities) : ShapeCardinalities :=
  { shape with scopeCompletions := count }

end BpmnSemantics.SemanticProcess
