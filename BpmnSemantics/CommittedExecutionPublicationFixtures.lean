import BpmnSemantics.SemanticProcess.ControlPosition
import BpmnSemantics.SemanticProcess.TopologyFixtures
import BpmnSemantics.CallActivityConformanceFixtures

/-! Executable publication probes and conformance proofs share these exact states and expected traces. -/

namespace BpmnSemantics.CommittedExecutionPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def instanceId : SemanticId := ⟨"instance:publication"⟩

def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId sequentialProgram.processId

def startStimulus : Stimulus :=
  .startProcess ⟨"command:start"⟩ ⟨sequentialProgram.processId.value⟩ instanceId []

def startRecord : InternalTransitionRecord :=
  { operationId := ⟨"operation:StartEvent_1"⟩
    operationKind := .initiate
    origin := ⟨⟨"StartEvent_1"⟩⟩
    owner }

def taskRecord : InternalTransitionRecord :=
  { operationId := ⟨"operation:UserTask_Approve"⟩
    operationKind := .awaitUserTask
    origin := ⟨⟨"UserTask_Approve"⟩⟩
    owner }

def exactTrace : List CommittedTransition :=
  [.externalStimulus startStimulus, .internalOperation startRecord, .internalOperation taskRecord]

def tracedStart : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit sequentialProgram initialState startStimulus

def droppedTrace : List CommittedTransition :=
  [.externalStimulus startStimulus, .internalOperation startRecord]

def swappedTrace : List CommittedTransition :=
  [.externalStimulus startStimulus, .internalOperation taskRecord, .internalOperation startRecord]

def duplicatedTrace : List CommittedTransition :=
  [.externalStimulus startStimulus, .internalOperation startRecord,
    .internalOperation startRecord, .internalOperation taskRecord]

def substitutedIdRecord : InternalTransitionRecord :=
  { startRecord with operationId := taskRecord.operationId }

def substitutedKindRecord : InternalTransitionRecord :=
  { startRecord with operationKind := .awaitUserTask }

def substitutedOriginRecord : InternalTransitionRecord :=
  { startRecord with origin := ⟨⟨"UserTask_Approve"⟩⟩ }

def substitutedOwnerRecord : InternalTransitionRecord :=
  { startRecord with owner := { owner with activation := 2 } }

def traceWithFirstRecord (record : InternalTransitionRecord) : List CommittedTransition :=
  [.externalStimulus startStimulus, .internalOperation record, .internalOperation taskRecord]

def wrongProcessStimulus : Stimulus :=
  .startProcess ⟨"command:wrong"⟩ ⟨"Process_Other"⟩ instanceId []

def ambiguousProgram : Program :=
  { sequentialProgram with
    operations := sequentialProgram.operations ++
      [.reachNoneEnd ⟨"operation:SecondEnd"⟩ ⟨⟨"EndEvent_Second"⟩⟩
        ⟨"place:Flow_TaskToEnd"⟩] }

def completeTaskStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"command:complete"⟩
    { processInstanceId := instanceId
      elementId := ⟨"UserTask_Approve"⟩
      activation := 1 } []

def expectedScope : PublicScopePosition :=
  { id := owner
    parent := none
    bpmnElementId := ⟨sequentialProgram.processId.value⟩ }

def expectedStartFlowToken : PublicControlTokenPosition :=
  { sequenceFlowId := ⟨"Flow_StartToTask"⟩
    owner
    multiplicity := 1 }

def expectedDeltas : List PublicControlPositionDelta :=
  [ { consumedTokens := []
      producedTokens := []
      enteredScopes := [expectedScope]
      exitedScopes := [] }
  , { consumedTokens := []
      producedTokens := [expectedStartFlowToken]
      enteredScopes := []
      exitedScopes := [] }
  , { consumedTokens := [expectedStartFlowToken]
      producedTokens := []
      enteredScopes := []
      exitedScopes := [] } ]

def expectedHeadPosition : PublicControlPosition :=
  { controlTokens := [], scopes := [expectedScope] }

def stateWithBadScopeParent : RuntimeState :=
  { tracedStart.result.state with
    scopeOccurrences := [{ id := owner, parent := some owner }] }

def initiatedState : RuntimeState :=
  (replayCommittedTransitions sequentialProgram initialState
    [.externalStimulus startStimulus, .internalOperation startRecord]).getD initialState

def admittedStartState : RuntimeState :=
  (admitStimulus sequentialProgram initialState startStimulus).state

def stateWithBadTokenOwner : RuntimeState :=
  { initiatedState with
    tokens := initiatedState.tokens.map fun token =>
      { token with owner := { token.owner with definitionScopeId := ⟨"scope:other"⟩ } } }

def unassociatedParentlessRootState : RuntimeState :=
  { tracedStart.result.state with
    scopeOccurrences :=
      tracedStart.result.state.scopeOccurrences ++
        [{ id :=
            { processInstanceId := ⟨"instance:rogue"⟩
              definitionScopeId := owner.definitionScopeId
              activation := 1 }
           parent := none }] }

def completedWithLivePositionsState : RuntimeState :=
  { initiatedState with control := .completed instanceId }

def cleanCompletedState : RuntimeState :=
  { initialState with control := .completed instanceId }

def calledRootProcessDriftState : RuntimeState :=
  { CallActivityConformance.calledWaiting.state with
    calledProcessOccurrences :=
      CallActivityConformance.calledWaiting.state.calledProcessOccurrences.map fun record =>
        { record with calledProcessId := CallActivityConformance.callerProcessId } }

def zeroMultiplicityDelta : PublicControlPositionDelta :=
  { consumedTokens := []
    producedTokens := [{ expectedStartFlowToken with multiplicity := 0 }]
    enteredScopes := []
    exitedScopes := [] }

end BpmnSemantics.CommittedExecutionPublicationConformance
