import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Internal commutation census

This module classifies every current operation and RuntimeState field under the reviewed final-closure account. Classification enables no transition and supplies no footprint by itself.
-/

namespace BpmnSemantics.SemanticProcess

inductive InternalOperationFamily where
  | processInitiation
  | ordinaryWaitArming
  | compositeWaitAndActivityArming
  | scopeCreationAndCallInvocation
  | localControlTransformation
  | mergeAndOrdinaryEnd
  | scopeReturnCompletionAndInterruption
  | externallyAddressedCompletion
  deriving Repr, DecidableEq

def semanticOperationInternalFamily : SemanticOperation → InternalOperationFamily
  | .initiate _ _ _
  | .initiateMessage _ _ _ _
  | .initiateTimer _ _ _ _ => .processInitiation
  | .awaitUserTask _ _ _ _ _
  | .awaitMessage _ _ _ _ _
  | .awaitPayloadMessage _ _ _ _ _ _
  | .awaitTimer _ _ _ _ _
  | .awaitEffect _ _ _ _ _ _ => .ordinaryWaitArming
  | .enterBoundedScope _ _ _ _ _ _
  | .awaitDataInputUserTask _ _ _ _ _ _ _
  | .awaitDataOutputUserTask _ _ _ _ _ _ _
  | .awaitBoundedUserTask _ _ _ _ _
  | .awaitMessageBoundedUserTask _ _ _ _ _
  | .awaitMonitoredUserTask _ _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ _ _ _
  | .awaitEventRace _ _ _ _ _ => .compositeWaitAndActivityArming
  | .enterScope _ _ _ _ _
  | .invokeProcess _ _ _ _ _ _ _ => .scopeCreationAndCallInvocation
  | .duplicate _ _ _ _
  | .synchronize _ _ _ _
  | .choose _ _ _ _ _ _
  | .selectMany _ _ _ _ _ _
  | .synchronizeSelected _ _ _ _ _ => .localControlTransformation
  | .mergeExclusive _ _ _ _
  | .reachNoneEnd _ _ _ => .mergeAndOrdinaryEnd
  | .returnProcess _ _ _ _ _
  | .completeScope _ _ _ _
  | .throwError _ _ _ _ _
  | .terminateScope _ _ _ _ => .scopeReturnCompletionAndInterruption
  | .completeParallelMultiInstanceUserTask _ _ _ _ _ => .externallyAddressedCompletion

inductive InternalRuntimeStateAtomDomain where
  | runtimeControl
  | initiationPending
  | scopeOccurrence
  | controlToken
  | userTaskWait
  | messageWait
  | timerWait
  | effectWait
  | effectIncident
  | selectedBranch
  | eventRace
  | callOccurrence
  | activityOccurrence
  | sequentialController
  | parallelController
  | variable
  | userTaskActivation
  | messageActivation
  | timerActivation
  | eventRaceActivation
  | callActivation
  | effectActivation
  | scopeActivation
  | activityActivation
  | endOccurrence
  | logicalTime
  deriving Repr, DecidableEq

inductive InternalRuntimeStateField where
  | control
  | initiationPending
  | scopeOccurrences
  | tokens
  | waits
  | messageWaits
  | timerWaits
  | effectWaits
  | effectIncidents
  | selectedBranchSets
  | eventRaces
  | calledProcessOccurrences
  | activityOccurrences
  | sequentialMultiInstanceControllers
  | parallelMultiInstanceControllers
  | variables
  | activations
  | messageActivations
  | timerActivations
  | eventRaceActivations
  | callActivations
  | effectActivations
  | scopeActivations
  | activityActivations
  | endOccurrences
  | logicalTimeMs
  deriving Repr, DecidableEq

def internalRuntimeStateFieldAtomDomain :
    InternalRuntimeStateField → InternalRuntimeStateAtomDomain
  | .control => .runtimeControl
  | .initiationPending => .initiationPending
  | .scopeOccurrences => .scopeOccurrence
  | .tokens => .controlToken
  | .waits => .userTaskWait
  | .messageWaits => .messageWait
  | .timerWaits => .timerWait
  | .effectWaits => .effectWait
  | .effectIncidents => .effectIncident
  | .selectedBranchSets => .selectedBranch
  | .eventRaces => .eventRace
  | .calledProcessOccurrences => .callOccurrence
  | .activityOccurrences => .activityOccurrence
  | .sequentialMultiInstanceControllers => .sequentialController
  | .parallelMultiInstanceControllers => .parallelController
  | .variables => .variable
  | .activations => .userTaskActivation
  | .messageActivations => .messageActivation
  | .timerActivations => .timerActivation
  | .eventRaceActivations => .eventRaceActivation
  | .callActivations => .callActivation
  | .effectActivations => .effectActivation
  | .scopeActivations => .scopeActivation
  | .activityActivations => .activityActivation
  | .endOccurrences => .endOccurrence
  | .logicalTimeMs => .logicalTime

end BpmnSemantics.SemanticProcess
