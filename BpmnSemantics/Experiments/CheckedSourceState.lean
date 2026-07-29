import BpmnSemantics.SemanticProcessContract

/-! # Checked-source runtime state

This module owns the direct checked-graph state and token operations used by the provisional checked-source experiment. Tokens retain BPMN Sequence Flow identity.
-/

namespace BpmnSemantics.Experiments.CheckedSourceSemantics

open BpmnSemantics
open BpmnSemantics.SemanticProcess

inductive SourceControl where
  | notStarted
  | running (instanceId : SemanticId)
  | completed (instanceId : SemanticId)
  deriving Repr, DecidableEq

structure SourceUserTaskWait where
  processInstanceId : SemanticId
  taskNodeId : NodeId
  name : Option String
  activation : Nat
  output : SequenceFlowId
  deriving Repr, DecidableEq

structure SourceTaskActivation where
  taskNodeId : NodeId
  count : Nat
  deriving Repr, DecidableEq

structure SourceRuntimeState where
  control : SourceControl
  initiationPending : Bool
  tokens : List SequenceFlowId
  waits : List SourceUserTaskWait
  activations : List SourceTaskActivation
  endOccurrences : Nat
  logicalTimeMs : Nat
  deriving Repr, DecidableEq

def initialState : SourceRuntimeState :=
  { control := .notStarted
    initiationPending := false
    tokens := []
    waits := []
    activations := []
    endOccurrences := 0
    logicalTimeMs := 0 }

def runningStartState (instanceId : SemanticId) : SourceRuntimeState :=
  { initialState with
    control := .running instanceId
    initiationPending := true }

def incomingFlowIds (source : CheckedProcess) (nodeId : NodeId) :
    List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.targetId = nodeId then some flow.id else none

def outgoingFlowIds (source : CheckedProcess) (nodeId : NodeId) :
    List SequenceFlowId :=
  source.sequenceFlows.filterMap fun flow =>
    if flow.sourceId = nodeId then some flow.id else none

def firstFlowId (flows : List SequenceFlowId) : SequenceFlowId :=
  flows.head?.getD ⟨""⟩

def tokenMultiplicity (state : SourceRuntimeState)
    (flowId : SequenceFlowId) : Nat :=
  (state.tokens.filter fun token => decide (token = flowId)).length

def hasToken (state : SourceRuntimeState) (flowId : SequenceFlowId) : Bool :=
  tokenMultiplicity state flowId > 0

def removeToken : List SequenceFlowId → SequenceFlowId →
    List SequenceFlowId
  | [], _ => []
  | token :: rest, flowId =>
      if token = flowId then rest else token :: removeToken rest flowId

def removeTokens (tokens : List SequenceFlowId)
    (flows : List SequenceFlowId) : List SequenceFlowId :=
  flows.foldl removeToken tokens

def addTokens (tokens : List SequenceFlowId)
    (flows : List SequenceFlowId) : List SequenceFlowId :=
  flows.foldr List.cons tokens

def activationCount (state : SourceRuntimeState) (nodeId : NodeId) : Nat :=
  (state.activations.find? fun activation =>
    decide (activation.taskNodeId = nodeId)).map (·.count) |>.getD 0

def setActivationCount (activations : List SourceTaskActivation)
    (nodeId : NodeId) (count : Nat) : List SourceTaskActivation :=
  { taskNodeId := nodeId, count } ::
    activations.filter fun activation =>
      decide (activation.taskNodeId ≠ nodeId)

def activateUserTask (state : SourceRuntimeState) (instanceId : SemanticId)
    (nodeId : NodeId) (name : Option String)
    (input output : SequenceFlowId) : SourceRuntimeState :=
  let activation := activationCount state nodeId + 1
  { state with
    tokens := removeToken state.tokens input
    waits :=
      { processInstanceId := instanceId
        taskNodeId := nodeId
        name
        activation
        output } :: state.waits
    activations :=
      setActivationCount state.activations nodeId activation }

def duplicateToken (state : SourceRuntimeState) (input : SequenceFlowId)
    (outputs : List SequenceFlowId) : SourceRuntimeState :=
  { state with
    tokens := addTokens (removeToken state.tokens input) outputs }

def synchronizeTokens (state : SourceRuntimeState)
    (inputs : List SequenceFlowId) (output : SequenceFlowId) :
    SourceRuntimeState :=
  { state with
    tokens := output :: removeTokens state.tokens inputs }

def terminateToken (state : SourceRuntimeState) (instanceId : SemanticId)
    (input : SequenceFlowId) : SourceRuntimeState :=
  let tokens := removeToken state.tokens input
  let completed :=
    tokens.isEmpty && state.waits.isEmpty && !state.initiationPending
  { state with
    control := if completed then .completed instanceId else state.control
    tokens
    endOccurrences := state.endOccurrences + 1 }

end BpmnSemantics.Experiments.CheckedSourceSemantics
