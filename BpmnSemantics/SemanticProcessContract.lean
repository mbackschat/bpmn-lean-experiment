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

structure TaskDefinitionId where
  value : String
  deriving Repr, DecidableEq

structure TaskOccurrenceId where
  value : String
  deriving Repr, DecidableEq

structure SourceIdentity where
  semanticProfile : ProfileId
  sourceId : SemanticId
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

inductive ServiceTaskSourceBinding where
  | probe
      (delegateExpressionNamespace : String)
      (delegateExpressionValue : String)
      (asyncBeforeNamespace : String)
      (asyncBeforeValue : String)
  | a12CreateDocument
      (delegateExpressionNamespace : String)
      (delegateExpressionValue : String)
      (inputOutputNamespace : String)
      (inputParameterName : String)
      (inputParameterBody : String)
      (outputParameterName : String)
      (outputParameterBody : String)
  | a12BoundaryError
      (delegateExpressionNamespace : String)
      (delegateExpressionValue : String)
      (implementationValue : String)
      (inputOutputNamespace : String)
      (inputParameterName : String)
      (inputParameterBody : String)
      (outputParameterName : String)
      (outputParameterBody : String)
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

inductive CheckedNode where
  | noneStartEvent (id : NodeId)
  | userTask (id : NodeId) (name : Option String)
  | intermediateCatchTimerEvent (id : NodeId) (durationLiteral : String)
  | serviceTask
      (id : NodeId)
      (implementation : String)
      (sourceBinding : ServiceTaskSourceBinding)
      (inputMappings : List VariableMapping)
      (outputMappings : List VariableMapping)
      (bpmnErrorRoute : Option CheckedBpmnErrorRoute)
  | parallelGateway (id : NodeId) (direction : GatewayDirection)
  | noneEndEvent (id : NodeId)
  deriving Repr, DecidableEq

structure CheckedSequenceFlow where
  id : SequenceFlowId
  sourceId : NodeId
  targetId : NodeId
  deriving Repr, DecidableEq

structure CheckedProcess where
  identity : SourceIdentity
  processId : ProcessId
  nodes : List CheckedNode
  sequenceFlows : List CheckedSequenceFlow
  deriving Repr, DecidableEq

structure ProgramIdentity where
  compiler : CompilerId
  semanticProfile : ProfileId
  sourceId : SemanticId
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

inductive SemanticOperation where
  | initiate
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (output : ControlPlaceId)
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
  | terminate
      (id : OperationId)
      (origin : BpmnElementOrigin)
      (input : ControlPlaceId)
  deriving Repr, DecidableEq

structure Program where
  identity : ProgramIdentity
  processId : ProcessId
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
