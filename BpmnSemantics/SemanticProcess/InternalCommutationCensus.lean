module

public import BpmnSemantics.SemanticProcessContract

/-! # Internal commutation census

This module classifies every current operation and RuntimeState field under the reviewed final-closure account. Classification enables no transition and supplies no footprint by itself.
-/

@[expose] public section

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
  | compensationTriggerAndFrontierActivation
  deriving Repr, DecidableEq

def semanticOperationInternalFamily : SemanticOperation → InternalOperationFamily
  | .initiate _ _ _
  | .initiateMessage _ _ _ _
  | .initiateTimer _ _ _ _ => .processInitiation
  | .awaitUserTask _ _ _ _ _
  | .awaitMessage _ _ _ _ _
  | .awaitPayloadMessage _ _ _ _ _ _
  | .awaitCorrelatedPayloadMessage _ _ _ _ _ _ _ _ _
  | .awaitTimer _ _ _ _ _
  | .awaitEffect _ _ _ _ _ _ => .ordinaryWaitArming
  | .enterBoundedScope _ _ _ _ _ _
  | .enterMonitoredScope _ _ _ _ _ _
  | .awaitDataInputUserTask _ _ _ _ _ _ _
  | .awaitDataInputOutputUserTask _ _ _ _ _ _ _ _
  | .awaitDataOutputUserTask _ _ _ _ _ _ _
  | .awaitBoundedUserTask _ _ _ _ _
  | .awaitMessageBoundedUserTask _ _ _ _ _
  | .awaitMessageMonitoredUserTask _ _ _ _ _
  | .awaitMonitoredUserTask _ _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ _ _ _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ _ _ _ _ _ _ _ _ _
  | .awaitEventRace _ _ _ _ _ => .compositeWaitAndActivityArming
  | .enterSequentialMultiInstanceScope _ _ _ _ _ _ _ _ _ _
  | .enterParallelMultiInstanceScope _ _ _ _ _ _ _ _ _ _
  | .enterScope _ _ _ _ _
  | .invokeProcess _ _ _ _ _ _ _ _ => .scopeCreationAndCallInvocation
  | .duplicate _ _ _ _
  | .synchronize _ _ _ _
  | .choose _ _ _ _ _ _
  | .selectMany _ _ _ _ _ _
  | .synchronizeSelected _ _ _ _ _ => .localControlTransformation
  | .mergeExclusive _ _ _ _
  | .reachNoneEnd _ _ _ => .mergeAndOrdinaryEnd
  | .returnProcess _ _ _ _ _ _
  | .completeSequentialMultiInstanceScope _ _ _
  | .completeParallelMultiInstanceScope _ _ _
  | .completeScope _ _ _ _
  | .completeEventSubProcess _ _ _
  | .throwError _ _ _ _ _
  | .terminateScope _ _ _ _ => .scopeReturnCompletionAndInterruption
  | .completeParallelMultiInstanceUserTask _ _ _ _ _ => .externallyAddressedCompletion
  | .triggerCompensation _ _ _ _ _ => .compensationTriggerAndFrontierActivation
  | .cancelTransaction _ _ _ _ _ _ => .compensationTriggerAndFrontierActivation

inductive InternalRuntimeStateAtomDomain where
  | runtimeControl
  | initiationPending
  | scopeOccurrence
  | controlToken
  | userTaskWait
  | messageWait
  | eventSubProcessMessageSubscription
  | timerWait
  | effectWait
  | effectIncident
  | selectedBranch
  | eventRace
  | callOccurrence
  | activityOccurrence
  | sequentialScopeController
  | parallelScopeController
  | sequentialController
  | parallelController
  | compensationActivityRetention
  | compensationParentContextRetention
  | compensationTrigger
  | compensationHandlerEffectWait
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
  | eventSubProcessMessageSubscriptions
  | timerWaits
  | effectWaits
  | effectIncidents
  | selectedBranchSets
  | eventRaces
  | calledProcessOccurrences
  | activityOccurrences
  | sequentialScopeControllers
  | parallelScopeControllers
  | sequentialMultiInstanceControllers
  | parallelMultiInstanceControllers
  | compensationActivityRetentions
  | compensationParentContextRetentions
  | compensationTriggers
  | compensationHandlerEffectWaits
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
  | .eventSubProcessMessageSubscriptions => .eventSubProcessMessageSubscription
  | .timerWaits => .timerWait
  | .effectWaits => .effectWait
  | .effectIncidents => .effectIncident
  | .selectedBranchSets => .selectedBranch
  | .eventRaces => .eventRace
  | .calledProcessOccurrences => .callOccurrence
  | .activityOccurrences => .activityOccurrence
  | .sequentialScopeControllers => .sequentialScopeController
  | .parallelScopeControllers => .parallelScopeController
  | .sequentialMultiInstanceControllers => .sequentialController
  | .parallelMultiInstanceControllers => .parallelController
  | .compensationActivityRetentions => .compensationActivityRetention
  | .compensationParentContextRetentions => .compensationParentContextRetention
  | .compensationTriggers => .compensationTrigger
  | .compensationHandlerEffectWaits => .compensationHandlerEffectWait
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
