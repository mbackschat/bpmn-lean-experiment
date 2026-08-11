import BpmnSemantics.Scenario

/-! # BpmnSemantics.SemanticProcessContract — reviewed definition and proof boundaries

This module owns the approved checked-process and Semantic Process definition types and the generic proof propositions. The implementations and achieved proof status live in `SemanticProcess` and `SemanticProcessJson` so the reviewed obligation statements remain separately visible.
-/

namespace BpmnSemantics.SemanticProcess

structure ProcessId where
  value : String
  deriving Repr, DecidableEq

structure NodeId where
  value : String
  deriving Repr, DecidableEq

structure SequenceFlowId where
  value : String
  deriving Repr, DecidableEq

structure OperationId where
  value : String
  deriving Repr, DecidableEq

structure ControlPlaceId where
  value : String
  deriving Repr, DecidableEq

structure DefinitionScopeId where
  value : String
  deriving Repr, DecidableEq

structure TaskDefinitionId where
  value : String
  deriving Repr, DecidableEq

structure TaskOccurrenceId where
  value : String
  deriving Repr, DecidableEq

structure SourceIdentity where
  semanticProfile : ProfileId
  sourceId : SemanticId
  sourceOverlay : Option SourceOverlayIdentity := none
  sourceSha256 : String
  deriving Repr, DecidableEq

inductive CompilerId where
  | bpmnSourceSemanticProcess
  deriving Repr, DecidableEq

inductive GatewayDirection where
  | diverging
  | converging
  deriving Repr, DecidableEq

inductive MappingExpression where
  | stringLiteral (value : String)
  | localVariable (name : String)
  deriving Repr, DecidableEq

structure VariableMapping where
  target : String
  expression : MappingExpression
  deriving Repr, DecidableEq

inductive SimpleBooleanExpression where
  | literal (value : Bool)
  | isPresent (name : String)
  | isNull (name : String)
  | stringEquals (name value : String)
  deriving Repr, DecidableEq

structure CheckedCondition where
  language : String
  body : String
  deriving Repr, DecidableEq

structure CheckedBpmnErrorRoute where
  boundaryEventId : NodeId
  boundaryEventName : Option String
  attachedToRef : NodeId
  errorDefinitionId : NodeId
  errorElementId : NodeId
  errorName : Option String
  code : String
  outputFlowId : SequenceFlowId
  deriving Repr, DecidableEq

structure ErrorReference where
  errorDefinitionId : NodeId
  errorElementId : NodeId
  code : String
  deriving Repr, DecidableEq

/-- Whether a Boundary Event ends its host Activity's occurrence when it fires.

A closed value rather than the source attribute's boolean, so the two dispositions select different
lowering clauses in checked source instead of being decided by a field after lowering. -/
inductive BoundaryInterruption where
  | interrupting
  | nonInterrupting
  deriving DecidableEq, Repr, Inhabited

inductive CheckedNode where
  | noneStartEvent (id : NodeId)
  | messageStartEvent (id : NodeId) (channel : MessageChannel)
  | timerStartEvent (id : NodeId) (durationLiteral : String)
  | embeddedSubProcess (id : NodeId) (childScopeId : DefinitionScopeId)
  | callActivity (id : NodeId) (calledProcessId : ProcessId)
  | boundaryErrorEvent (id attachedToRef : NodeId)
      (error : ErrorReference) (outputFlowId : SequenceFlowId)
  /-- `interruption` is the resolved `cancelActivity` disposition, and it selects the host's lowering clause. The XSD and CMOF default the attribute to `true`, so an omitted one is `interrupting`; a lexical `false` is `nonInterrupting`. `durationLiteral` keeps the exact source lexeme so this side normalizes it to milliseconds independently. -/
  | timerBoundaryEvent (id attachedToRef : NodeId)
      (interruption : BoundaryInterruption)
      (durationLiteral : String) (outputFlowId : SequenceFlowId)
  | userTask (id : NodeId) (name : Option String)
  | intermediateCatchTimerEvent (id : NodeId) (durationLiteral : String)
  | intermediateCatchMessageEvent (id : NodeId) (channel : MessageChannel)
  | receiveTask (id : NodeId) (channel : MessageChannel)
  | configuredTask (id : NodeId) (descriptor : EffectDescriptor)
  | serviceTask
      (id : NodeId)
      (descriptor : EffectDescriptor)
      (inputMappings : List VariableMapping)
      (outputMappings : List VariableMapping)
      (bpmnErrorRoute : Option CheckedBpmnErrorRoute)
  | parallelGateway (id : NodeId) (direction : GatewayDirection)
  | exclusiveMerge (id : NodeId)
  | exclusiveGateway
      (id : NodeId)
      (candidateFlowIds : List SequenceFlowId)
      (defaultFlowId : SequenceFlowId)
  | inclusiveGatewayDiverging
      (id : NodeId)
      (candidateFlowIds : List SequenceFlowId)
      (defaultFlowId : SequenceFlowId)
  | inclusiveGatewayConverging
      (id : NodeId)
      (pairedGatewayId : NodeId)
  | eventBasedGateway (id : NodeId)
  | errorEndEvent (id : NodeId) (error : ErrorReference)
  | terminateEndEvent (id : NodeId)
  | noneEndEvent (id : NodeId)
  deriving Repr, DecidableEq

def CheckedNode.id : CheckedNode → NodeId
  | .noneStartEvent id
  | .messageStartEvent id _
  | .timerStartEvent id _
  | .embeddedSubProcess id _
  | .callActivity id _
  | .boundaryErrorEvent id _ _ _
  | .timerBoundaryEvent id _ _ _ _
  | .userTask id _
  | .intermediateCatchTimerEvent id _
  | .intermediateCatchMessageEvent id _
  | .receiveTask id _
  | .configuredTask id _
  | .serviceTask id _ _ _ _
  | .parallelGateway id _
  | .exclusiveMerge id
  | .exclusiveGateway id _ _
  | .inclusiveGatewayDiverging id _ _
  | .inclusiveGatewayConverging id _
  | .eventBasedGateway id
  | .errorEndEvent id _
  | .terminateEndEvent id
  | .noneEndEvent id => id

structure CheckedSequenceFlow where
  id : SequenceFlowId
  sourceId : NodeId
  targetId : NodeId
  condition : Option CheckedCondition := none
  deriving Repr, DecidableEq

structure DefinitionScope where
  id : DefinitionScopeId
  parentScopeId : Option DefinitionScopeId
  originElementId : NodeId
  deriving Repr, DecidableEq

structure NodeScopeOwnership where
  nodeId : NodeId
  scopeId : DefinitionScopeId
  deriving Repr, DecidableEq

structure SequenceFlowScopeOwnership where
  sequenceFlowId : SequenceFlowId
  scopeId : DefinitionScopeId
  deriving Repr, DecidableEq

structure CheckedProcess where
  identity : SourceIdentity
  processId : ProcessId
  definitionScopes : List DefinitionScope
  nodeScopes : List NodeScopeOwnership
  sequenceFlowScopes : List SequenceFlowScopeOwnership
  nodes : List CheckedNode
  sequenceFlows : List CheckedSequenceFlow
  deriving Repr, DecidableEq

structure ProgramIdentity where
  compiler : CompilerId
  semanticProfile : ProfileId
  sourceId : SemanticId
  sourceOverlay : Option SourceOverlayIdentity := none
  sourceSha256 : String
  deriving Repr, DecidableEq

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

/-- `origin` carries the boundary Sequence Flow's provenance, not the Timer Event's: control places and BPMN elements are separate namespaces, and `elementId` already publishes the Event. A boundary-attached Timer is never lowered as a standalone `awaitTimer`. -/
structure BoundaryTimerArm where
  elementId : NodeId
  durationMs : Nat
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
  deriving Repr, DecidableEq

def SemanticOperation.id : SemanticOperation → OperationId
  | .initiate id _ _
  | .initiateMessage id _ _ _
  | .initiateTimer id _ _ _
  | .enterScope id _ _ _ _
  | .enterBoundedScope id _ _ _ _ _
  | .invokeProcess id _ _ _ _ _ _
  | .returnProcess id _ _ _ _
  | .awaitUserTask id _ _ _ _
  | .awaitTimer id _ _ _ _
  | .awaitMessage id _ _ _ _
  | .awaitEventRace id _ _ _ _
  | .awaitBoundedUserTask id _ _ _ _
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
  | .completeScope id _ _ _ => id

structure OperationScopeOwnership where
  operationId : OperationId
  scopeId : DefinitionScopeId
  deriving Repr, DecidableEq

structure ControlPlaceScopeOwnership where
  controlPlaceId : ControlPlaceId
  scopeId : DefinitionScopeId
  deriving Repr, DecidableEq

structure Program where
  identity : ProgramIdentity
  processId : ProcessId
  definitionScopes : List DefinitionScope
  operationScopes : List OperationScopeOwnership
  controlPlaceScopes : List ControlPlaceScopeOwnership
  controlPlaces : List ControlPlace
  operations : List SemanticOperation
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
