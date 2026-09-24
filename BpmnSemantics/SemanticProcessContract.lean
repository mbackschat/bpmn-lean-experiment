import BpmnSemantics.CheckedProcessContract

/-! # BpmnSemantics.SemanticProcessContract — reviewed IL and proof boundaries

This module owns the approved Semantic Process definition types and generic proof propositions, using the checked definitions from `CheckedProcessContract`. The implementations and achieved proof status live in `SemanticProcess` and `SemanticProcessJson` so the reviewed obligation statements remain separately visible.
-/

namespace BpmnSemantics.SemanticProcess

structure BpmnSequenceFlowOrigin where
  elementId : SequenceFlowId
  deriving Repr, DecidableEq

structure BpmnElementOrigin where
  elementId : NodeId
  deriving Repr, DecidableEq

structure ControlPlace where
  id : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  deriving Repr, DecidableEq

structure UserTaskDefinition where
  id : TaskDefinitionId
  name : Option String
  metadata : Option UserTaskMetadata := none
  deriving Repr, DecidableEq

/-- The inner User Task fields carried by one sequential Multi-Instance operation. -/
structure SequentialMultiInstanceTaskDefinition where
  id : TaskDefinitionId
  name : Option String
  deriving Repr, DecidableEq

structure TimerDefinition where
  elementId : NodeId
  durationMs : Nat
  deriving Repr, DecidableEq

structure MessageDefinition where
  elementId : NodeId
  channel : MessageChannel
  deriving Repr, DecidableEq

structure EventRaceMessageArm where
  configurationOrigin : BpmnSequenceFlowOrigin
  elementId : NodeId
  channel : MessageChannel
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure EventRaceTimerArm where
  configurationOrigin : BpmnSequenceFlowOrigin
  elementId : NodeId
  durationMs : Nat
  output : ControlPlaceId
  deriving Repr, DecidableEq

structure BoundedTaskArm where
  id : TaskDefinitionId
  name : Option String
  output : ControlPlaceId
  deriving Repr, DecidableEq

inductive BoundaryTimerRecurrence where
  | repeating
  deriving Repr, DecidableEq

/-- `origin` carries the boundary Sequence Flow's provenance, not the Timer Event's: control places and BPMN elements are separate namespaces, and `elementId` already publishes the Event. A boundary-attached Timer is never lowered as a standalone `awaitTimer`. -/
structure BoundaryTimerArm where
  elementId : NodeId
  durationMs : Nat
  output : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  recurrence : Option BoundaryTimerRecurrence := none
  deriving Repr, DecidableEq

/-- The exact operation-addressed interrupting Message handler attached to one User Task. -/
structure BoundaryMessageArm where
  elementId : NodeId
  channel : MessageChannel
  output : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  deriving Repr, DecidableEq

structure EffectDefinition where
  elementId : NodeId
  descriptor : EffectDescriptor
  inputMappings : List VariableMapping
  outputMappings : List VariableMapping
  deriving Repr, DecidableEq

structure BpmnErrorRouteOrigin where
  boundaryEventId : NodeId
  errorDefinitionId : NodeId
  errorElementId : NodeId
  sequenceFlowId : SequenceFlowId
  deriving Repr, DecidableEq

structure BpmnErrorRoute where
  code : String
  output : ControlPlaceId
  origin : BpmnErrorRouteOrigin
  deriving Repr, DecidableEq

structure InterruptingErrorHandlerOrigin where
  boundaryEventId : NodeId
  errorDefinitionId : NodeId
  errorElementId : NodeId
  sequenceFlowId : SequenceFlowId
  deriving Repr, DecidableEq

structure InterruptingErrorHandler where
  attachedScopeId : DefinitionScopeId
  code : String
  output : ControlPlaceId
  origin : InterruptingErrorHandlerOrigin
  deriving Repr, DecidableEq

structure ConditionalCandidate where
  condition : SimpleBooleanExpression
  output : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  deriving Repr, DecidableEq

structure InclusiveCandidate where
  condition : SimpleBooleanExpression
  output : ControlPlaceId
  expectedJoinInput : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  deriving Repr, DecidableEq

structure InclusiveDefaultBranch where
  output : ControlPlaceId
  expectedJoinInput : ControlPlaceId
  origin : BpmnSequenceFlowOrigin
  deriving Repr, DecidableEq

inductive SemanticOperation where
  | initiate
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (output : ControlPlaceId)
  | initiateMessage
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (channel : MessageChannel)
      (outputs : List ControlPlaceId)
  | initiateTimer
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (durationMs : Nat)
      (outputs : List ControlPlaceId)
  | enterScope
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input childEntry : ControlPlaceId)
      (childScopeId : DefinitionScopeId)
  /-- Scope entry that arms an interrupting deadline in the same transition. Entry and deadline are one operation because neither is a resumable state without the other. -/
  | enterBoundedScope
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input childEntry : ControlPlaceId)
      (childScopeId : DefinitionScopeId)
      (boundaryTimer : BoundaryTimerArm)
  | enterMonitoredScope
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input childEntry : ControlPlaceId)
      (childScopeId : DefinitionScopeId)
      (boundaryTimer : BoundaryTimerArm)
  | invokeProcess
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (calledProcessId : ProcessId)
      (calledRootScopeId : DefinitionScopeId)
      (calledEntry : ControlPlaceId)
      (returnOperationId : OperationId)
  | returnProcess
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (calledProcessId : ProcessId)
      (calledRootScopeId : DefinitionScopeId)
      (callerOutput : ControlPlaceId)
  | awaitUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (task : UserTaskDefinition)
  /-- One User Task occurrence whose entry both waits and fills one Activity data input. Separate from
  `awaitUserTask` because enabledness depends on a Process binding this arm reads but never writes. -/
  | awaitDataInputUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (taskId : TaskDefinitionId)
      (taskName : Option String)
      (directInput : DirectActivityDataInput)
  /-- One Activity lifetime whose input gates entry and whose required output gates completion, kept distinct so field presence cannot reinterpret either predecessor. -/
  | awaitDataInputOutputUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input output : ControlPlaceId)
      (taskId : TaskDefinitionId)
      (taskName : Option String)
      (directInput : DirectActivityDataInput)
      (directOutput : DirectActivityDataOutput)
  /-- One User Task occurrence whose accepted completion writes one Activity data output. Separate
  from `awaitDataInputUserTask` because the two constrain opposite ends: entry here is token-only,
  and the declared output becomes an obligation only at completion. -/
  | awaitDataOutputUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (taskId : TaskDefinitionId)
      (taskName : Option String)
      (directOutput : DirectActivityDataOutput)
  | awaitSequentialMultiInstanceUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (task : SequentialMultiInstanceTaskDefinition)
      (data : SequentialMultiInstanceDataDefinition)
      (normalOutput : ControlPlaceId)
      (boundaryTimer : BoundaryTimerArm)
      (limits : SequentialMultiInstanceLimits)
  /-- Atomic entry for the bounded parallel Multi-Instance User Task profile. The shared data and
  limits carriers retain the exact collection vocabulary already reviewed for Multi-Instance; the
  distinct constructor and direct task fields give parallel execution its own closed operation arm. -/
  | awaitParallelMultiInstanceUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (taskId : TaskDefinitionId)
      (taskName : Option String)
      (data : SequentialMultiInstanceDataDefinition)
      (normalOutput : ControlPlaceId)
      (boundaryTimer : BoundaryTimerArm)
      (completionCondition : SimpleBooleanExpression)
      (limits : SequentialMultiInstanceLimits)
  /-- Command-addressed child completion paired to one parallel entry operation. It is external and
  therefore has no control input: the submitted child identity selects the runtime transition. -/
  | completeParallelMultiInstanceUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (entryOperationId : OperationId)
      (taskElementId : TaskDefinitionId)
      (normalOutput : ControlPlaceId)
  | awaitTimer
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (timer : TimerDefinition)
  | awaitMessage
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (message : MessageDefinition)
  | awaitPayloadMessage
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (message : MessageDefinition)
      (directOutput : DirectCatchEventPayloadOutput)
  | awaitCorrelatedPayloadMessage
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (message : MessageDefinition)
      (correlationKeyId correlationPropertyId : String)
      (payloadSelector : CorrelationMessagePath)
      (processPropertySelector : CorrelationProcessPropertyPath)
  | awaitEventRace
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (message : EventRaceMessageArm)
      (timer : EventRaceTimerArm)
  | awaitBoundedUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (task : BoundedTaskArm)
      (boundaryTimer : BoundaryTimerArm)
  | awaitMessageBoundedUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (task : BoundedTaskArm)
      (boundaryMessage : BoundaryMessageArm)
  | awaitMessageMonitoredUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (task : BoundedTaskArm)
      (boundaryMessage : BoundaryMessageArm)
  | awaitMonitoredUserTask
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (task : BoundedTaskArm)
      (boundaryTimer : BoundaryTimerArm)
  | awaitEffect
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (output : ControlPlaceId)
      (effect : EffectDefinition)
      (bpmnErrorRoute : Option BpmnErrorRoute)
  | duplicate
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (outputs : List ControlPlaceId)
  | synchronize
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (inputs : List ControlPlaceId)
      (output : ControlPlaceId)
  | mergeExclusive
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (inputs : List ControlPlaceId)
      (output : ControlPlaceId)
  | choose
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (candidates : List ConditionalCandidate)
      (defaultOutput : ControlPlaceId)
      (defaultOrigin : BpmnSequenceFlowOrigin)
  | selectMany
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (candidates : List InclusiveCandidate)
      (defaultBranch : InclusiveDefaultBranch)
      (selectionKey : String)
  | synchronizeSelected
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (inputs : List ControlPlaceId)
      (output : ControlPlaceId)
      (selectionKey : String)
  | throwError
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (error : ErrorReference)
      (handler : InterruptingErrorHandler)
  | reachNoneEnd
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
  | terminateScope
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
      (scopeId : DefinitionScopeId)
  | completeScope
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (scopeId : DefinitionScopeId)
      (parentOutput : Option ControlPlaceId)
  | triggerCompensation
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId)
  deriving Repr, DecidableEq

def SemanticOperation.id : SemanticOperation → OperationId
  | .initiate id _ _
  | .initiateMessage id _ _ _
  | .initiateTimer id _ _ _
  | .enterScope id _ _ _ _
  | .enterBoundedScope id _ _ _ _ _
  | .enterMonitoredScope id _ _ _ _ _
  | .invokeProcess id _ _ _ _ _ _
  | .returnProcess id _ _ _ _
  | .awaitUserTask id _ _ _ _
  | .awaitDataInputUserTask id _ _ _ _ _ _
  | .awaitDataInputOutputUserTask id _ _ _ _ _ _ _
  | .awaitDataOutputUserTask id _ _ _ _ _ _
  | .awaitSequentialMultiInstanceUserTask id _ _ _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask id _ _ _ _ _ _ _ _ _
  | .completeParallelMultiInstanceUserTask id _ _ _ _
  | .awaitTimer id _ _ _ _
  | .awaitMessage id _ _ _ _
  | .awaitPayloadMessage id _ _ _ _ _
  | .awaitCorrelatedPayloadMessage id _ _ _ _ _ _ _ _
  | .awaitEventRace id _ _ _ _
  | .awaitBoundedUserTask id _ _ _ _
  | .awaitMessageBoundedUserTask id _ _ _ _
  | .awaitMessageMonitoredUserTask id _ _ _ _
  | .awaitMonitoredUserTask id _ _ _ _
  | .awaitEffect id _ _ _ _ _
  | .duplicate id _ _ _
  | .synchronize id _ _ _
  | .mergeExclusive id _ _ _
  | .choose id _ _ _ _ _
  | .selectMany id _ _ _ _ _
  | .synchronizeSelected id _ _ _ _
  | .throwError id _ _ _ _
  | .reachNoneEnd id _ _
  | .terminateScope id _ _ _
  | .completeScope id _ _ _
  | .triggerCompensation id _ _ _ _ => id

structure OperationScopeOwnership where
  operationId : OperationId
  scopeId : DefinitionScopeId
  deriving Repr, DecidableEq

structure ControlPlaceScopeOwnership where
  controlPlaceId : ControlPlaceId
  scopeId : DefinitionScopeId
  deriving Repr, DecidableEq

/-- One Activity made eligible by one associated boundary Compensation handler. -/
structure BoundaryCompensationTarget where
  activityElementId : NodeId
  boundaryEventElementId : NodeId
  compensationActivityElementId : NodeId
  deriving Repr, DecidableEq

/-- Bounded hidden retention selected for one flat Process definition. -/
structure CompensationActivityRetentionDeclaration where
  definitionScopeId : DefinitionScopeId
  targets : List BoundaryCompensationTarget
  maxRecords : Nat
  maxCanonicalBytes : Nat
  deriving Repr, DecidableEq

/-- One declared Compensation Event Sub-Process snapshot target. -/
structure CompensationEventSubProcessSnapshotTarget where
  parentScopeId : DefinitionScopeId
  handlerScopeId : DefinitionScopeId
  deriving Repr, DecidableEq

/-- Bounded hidden parent-context snapshots selected before source admission exists. -/
structure CompensationEventSubProcessSnapshotDeclaration where
  targets : List CompensationEventSubProcessSnapshotTarget
  maxRecords : Nat
  maxCanonicalBytes : Nat
  deriving Repr, DecidableEq

inductive CompensationHandlerInput where
  | empty
  | restoredProcessBinding (sourceName argumentName : String)
  deriving Repr, DecidableEq

structure SingleEffectCompensationHandlerBody where
  handlerElementId : NodeId
  effectElementId : NodeId
  descriptor : EffectDescriptor
  input : CompensationHandlerInput
  deriving Repr, DecidableEq

inductive CompensationSubjectDefinition where
  | boundaryActivity (subjectElementId : NodeId)
      (body : SingleEffectCompensationHandlerBody)
  | eventSubProcess (parentScopeId handlerScopeId : DefinitionScopeId)
      (body : SingleEffectCompensationHandlerBody)
  deriving Repr, DecidableEq

structure CompensationDependency where
  predecessorElementId : NodeId
  successorElementId : NodeId
  deriving Repr, DecidableEq

structure CompensationTriggerLimits where
  maxTriggers : Nat
  maxHandlers : Nat
  maxCanonicalBytes : Nat
  deriving Repr, DecidableEq

structure CompensationExecutionDeclaration where
  definitionScopeId : DefinitionScopeId
  triggerOperationId : OperationId
  subjects : List CompensationSubjectDefinition
  dependencies : List CompensationDependency
  limits : CompensationTriggerLimits
  deriving Repr, DecidableEq

structure Program where
  identity : ProgramIdentity
  internalSchedulingMode : InternalSchedulingMode
  processId : ProcessId
  definitionScopes : List DefinitionScope
  operationScopes : List OperationScopeOwnership
  controlPlaceScopes : List ControlPlaceScopeOwnership
  controlPlaces : List ControlPlace
  operations : List SemanticOperation
  compensationActivityRetention : Option CompensationActivityRetentionDeclaration := none
  compensationEventSubProcessSnapshots :
    Option CompensationEventSubProcessSnapshotDeclaration := none
  compensationExecution : Option CompensationExecutionDeclaration := none
  deriving Repr, DecidableEq

namespace Obligations

/-- Proposition every executable evaluator must satisfy relative to the separately defined declarative relation. -/
def evaluator_sound
    {RuntimeState SemanticInput : Type}
    (programStep : Program → RuntimeState → SemanticInput → RuntimeState → Prop)
    (step : Program → RuntimeState → SemanticInput → Option RuntimeState) : Prop :=
  ∀ program state input successor,
    step program state input = some successor →
      programStep program state input successor

/-- Reviewed observational preservation proposition for the checked-source lowering boundary. The signature does not itself claim that a particular source semantics has been supplied or the proposition proved. -/
def lower_preserves_supported_run
    {ProgramTrace Observation : Type}
    (wellFormed : CheckedProcess → Prop)
    (supportedScenario : CheckedProcess → Scenario → Prop)
    (lower : CheckedProcess → Program)
    (programRun : Program → Scenario → ProgramTrace → Prop)
    (projectSource : CheckedProcess → Scenario → Observation)
    (projectProgram : ProgramTrace → Observation) : Prop :=
  ∀ source scenario,
    wellFormed source →
      supportedScenario source scenario →
        ∃ programTrace,
          programRun (lower source) scenario programTrace ∧
            projectSource source scenario = projectProgram programTrace

end Obligations

end BpmnSemantics.SemanticProcess
