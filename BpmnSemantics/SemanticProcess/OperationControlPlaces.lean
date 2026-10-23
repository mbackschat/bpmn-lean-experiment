import BpmnSemantics.SemanticProcessContract

/-! # Operation control places

The token-carrying input and output places of each Semantic Process operation, shared by graph validation and its scope consequences. A place listed here is one the operation reads or produces in a committed run; scope ownership of those places is decided by graph validation.
-/

namespace BpmnSemantics.SemanticProcess

def operationInputPlaces : SemanticOperation → List ControlPlaceId
  | .initiate ..
  | .initiateMessage ..
  | .initiateTimer ..
  | .returnProcess ..
  | .completeSequentialMultiInstanceScope ..
  | .completeParallelMultiInstanceScope ..
  | .completeParallelMultiInstanceUserTask ..
  | .completeScope ..
  | .completeEventSubProcess .. => []
  | .enterSequentialMultiInstanceScope _ _ input _ _ _ _ _ _ _
  | .enterParallelMultiInstanceScope _ _ input _ _ _ _ _ _ _
  | .enterScope _ _ input _ _
  | .enterBoundedScope _ _ input _ _ _
  | .enterMonitoredScope _ _ input _ _ _
  | .invokeProcess _ _ input _ _ _ _ _
  | .awaitUserTask _ _ input _ _
  | .awaitDataInputUserTask _ _ input _ _ _ _
  | .awaitDataInputOutputUserTask _ _ input _ _ _ _ _
  | .awaitDataOutputUserTask _ _ input _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ _ input _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ _ input _ _ _ _ _ _ _
  | .awaitTimer _ _ input _ _
  | .awaitMessage _ _ input _ _ | .awaitPayloadMessage _ _ input _ _ _
  | .awaitCorrelatedPayloadMessage _ _ input _ _ _ _ _ _
  | .awaitEventRace _ _ input _ _
  | .awaitBoundedUserTask _ _ input _ _
  | .awaitMessageBoundedUserTask _ _ input _ _
  | .awaitMessageMonitoredUserTask _ _ input _ _
  | .awaitMonitoredUserTask _ _ input _ _
  | .awaitEffect _ _ input _ _ _
  | .duplicate _ _ input _
  | .choose _ _ input _ _ _
  | .selectMany _ _ input _ _ _
  | .throwError _ _ input _ _
  | .reachNoneEnd _ _ input
  | .terminateScope _ _ input _ => [input]
  | .triggerCompensation _ _ _ input _ => [input]
  | .cancelTransaction _ _ _ input _ _ => [input]
  | .synchronize _ _ inputs _
  | .mergeExclusive _ _ inputs _
  | .synchronizeSelected _ _ inputs _ _ => inputs

def operationOutputs : SemanticOperation → List ControlPlaceId
  | .initiate _ _ output
  | .invokeProcess _ _ _ _ _ output _ _
  | .returnProcess _ _ _ _ output _
  | .awaitUserTask _ _ _ output _
  | .awaitDataInputUserTask _ _ _ output _ _ _
  | .awaitDataInputOutputUserTask _ _ _ output _ _ _ _
  | .awaitDataOutputUserTask _ _ _ output _ _ _
  | .awaitTimer _ _ _ output _
  | .awaitMessage _ _ _ output _ | .awaitPayloadMessage _ _ _ output _ _
  | .awaitCorrelatedPayloadMessage _ _ _ output _ _ _ _ _
  | .synchronize _ _ _ output
  | .mergeExclusive _ _ _ output => [output]
  | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ normalOutput boundaryTimer _ =>
      [normalOutput, boundaryTimer.output]
  | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ boundaryTimer _ _ =>
      [boundaryTimer.output]
  | .completeParallelMultiInstanceUserTask _ _ _ _ normalOutput => [normalOutput]
  | .awaitEventRace _ _ _ message timer => [message.output, timer.output]
  -- The monitored family declares the same two outputs, though it can produce both within one run
  -- rather than one of them.
  | .awaitBoundedUserTask _ _ _ task boundaryTimer
  | .awaitMonitoredUserTask _ _ _ task boundaryTimer =>
      [task.output, boundaryTimer.output]
  | .awaitMessageBoundedUserTask _ _ _ task boundaryMessage
  | .awaitMessageMonitoredUserTask _ _ _ task boundaryMessage =>
      [task.output, boundaryMessage.output]
  | .synchronizeSelected _ _ _ output _ => [output]
  | .enterSequentialMultiInstanceScope _ _ _ childEntry _ _ _ _ _ _
  | .enterParallelMultiInstanceScope _ _ _ childEntry _ _ _ _ _ _
  | .enterScope _ _ _ childEntry _ => [childEntry]
  -- The boundary route is token-carrying and lands in the parent scope, unlike the child entry.
  | .enterBoundedScope _ _ _ childEntry _ boundaryTimer
  | .enterMonitoredScope _ _ _ childEntry _ boundaryTimer =>
      [childEntry, boundaryTimer.output]
  | .awaitEffect _ _ _ output _ route =>
      output :: route.toList.map (·.output)
  | .duplicate _ _ _ outputs => outputs
  | .choose _ _ _ candidates defaultOutput _ =>
      candidates.map (·.output) ++ [defaultOutput]
  | .selectMany _ _ _ candidates defaultBranch _ =>
      candidates.map (·.output) ++ [defaultBranch.output]
  | .throwError _ _ _ _ handler => [handler.output]
  | .completeSequentialMultiInstanceScope ..
  | .completeParallelMultiInstanceScope ..
  | .reachNoneEnd ..
  | .completeEventSubProcess ..
  | .terminateScope .. => []
  | .completeScope _ _ _ parentOutput => parentOutput.toList
  | .initiateMessage _ _ _ outputs => outputs
  | .initiateTimer _ _ _ outputs => outputs
  | .triggerCompensation _ _ _ _ output => [output]
  | .cancelTransaction _ _ _ _ output _ => [output]

/-- All token-carrying ports read or produced by one operation. -/
def operationControlPlaces (operation : SemanticOperation) : List ControlPlaceId :=
  operationInputPlaces operation ++ operationOutputs operation

/-- Whether every token-carrying port of an operation belongs to its operation scope.

The excluded constructors deliberately cross a definition-scope boundary for at least one port.
-/
def operationControlPlacesShareOwner : SemanticOperation → Bool
  | .enterSequentialMultiInstanceScope ..
  | .enterParallelMultiInstanceScope ..
  | .completeSequentialMultiInstanceScope ..
  | .completeParallelMultiInstanceScope ..
  | .enterScope ..
  | .enterBoundedScope ..
  | .enterMonitoredScope ..
  | .invokeProcess ..
  | .returnProcess ..
  | .completeScope ..
  | .throwError .. | .cancelTransaction .. => false
  | _ => true

/-- A payload-bearing Message Catch Event's outgoing place is one of its same-scope token ports. -/
theorem awaitPayloadMessage_output_mem_operationControlPlaces (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId) (message : MessageDefinition) (directOutput : DirectCatchEventPayloadOutput) :
    output ∈ operationControlPlaces (.awaitPayloadMessage id origin input output message directOutput) := by simp [operationControlPlaces, operationInputPlaces, operationOutputs]

/-- A correlated payload Message Catch Event's outgoing place is one of its same-scope token ports. -/
theorem awaitCorrelatedPayloadMessage_output_mem_operationControlPlaces
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (message : MessageDefinition) (correlationKeyId correlationPropertyId : String)
    (payloadSelector : CorrelationMessagePath)
    (processPropertySelector : CorrelationProcessPropertyPath) :
    output ∈ operationControlPlaces
      (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
        correlationPropertyId payloadSelector processPropertySelector) := by
  simp [operationControlPlaces, operationInputPlaces, operationOutputs]

end BpmnSemantics.SemanticProcess
