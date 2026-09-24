import BpmnSemantics.Scenario
import BpmnSemantics.SemanticProcess.ActivityDataContract
import BpmnSemantics.SemanticProcess.CorrelationScalarPath

/-! # BpmnSemantics.CheckedProcessContract — checked definitions and shared identities

This module owns checked-source definitions and the identities shared with Semantic Process IL. Keeping their declarations together preserves the reviewed source boundary independently of executable operation variants.
-/

namespace BpmnSemantics.SemanticProcess

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

inductive InternalSchedulingMode where
  | rejectObservableChoice
  | requireChoiceSchedule
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

/-- Exact checked and IL identities for the collection copied into one sequential Multi-Instance
Activity and the scalar item mediated into each inner User Task. -/
structure SequentialMultiInstanceInputDefinition where
  collectionItemDefinitionId : String
  scalarItemDefinitionId : String
  dataObjectId : String
  dataObjectReferenceId : String
  loopDataInputId : String
  inputDataItemId : String
  taskDataInputId : String
  collectionAssociationId : String
  itemAssociationId : String
  deriving Repr, DecidableEq

/-- Exact checked and IL identities for each inner result and the final aggregated collection. -/
structure SequentialMultiInstanceOutputDefinition where
  dataObjectId : String
  dataObjectReferenceId : String
  taskDataOutputId : String
  outputDataItemId : String
  loopDataOutputId : String
  itemAssociationId : String
  collectionAssociationId : String
  deriving Repr, DecidableEq

structure SequentialMultiInstanceDataDefinition where
  input : SequentialMultiInstanceInputDefinition
  output : SequentialMultiInstanceOutputDefinition
  deriving Repr, DecidableEq

/-- The source-level boundary Timer carried inside the distinct checked Multi-Instance node. -/
structure CheckedSequentialMultiInstanceBoundaryTimer where
  elementId : NodeId
  durationLiteral : String
  outputFlowId : SequenceFlowId
  deriving Repr, DecidableEq

/-- One direct Catch Event Data Output Association carrying a received Message payload into a
Process `Property`. The source output identity is retained for the fill phase and the target
property identity for routing; neither is interchangeable with the Message or Catch Event id. -/
structure DirectCatchEventPayloadOutput where
  associationId : String
  sourceDataOutputId : String
  sourceDataOutputName : Option String
  targetPropertyId : String
  deriving Repr, DecidableEq

/-- Inclusive runtime collection bounds selected by the bounded profile. -/
structure SequentialMultiInstanceLimits where
  maximumItems : Nat
  maximumItemUtf8Bytes : Nat
  maximumCanonicalCollectionUtf8Bytes : Nat
  deriving Repr, DecidableEq

inductive CheckedCompensationInput where
  | empty
  | directRestoredProcessBinding (sourcePropertyId targetDataInputId : String)
  deriving Repr, DecidableEq

structure CheckedCompensationBody where
  handlerElementId : NodeId
  effectElementId : NodeId
  descriptor : EffectDescriptor
  input : CheckedCompensationInput
  deriving Repr, DecidableEq

inductive CheckedCompensationSubject where
  | boundaryActivity (subjectElementId boundaryEventElementId : NodeId)
      (body : CheckedCompensationBody)
  | eventSubProcess (parentElementId : NodeId)
      (parentScopeId handlerScopeId : DefinitionScopeId)
      (body : CheckedCompensationBody)
  deriving Repr, DecidableEq

inductive CheckedCompensationDependencyReason where
  | sequenceFlow
  deriving Repr, DecidableEq

structure CheckedCompensationDependency where
  predecessorElementId : NodeId
  successorElementId : NodeId
  reason : CheckedCompensationDependencyReason
  deriving Repr, DecidableEq

structure CheckedCompensationRetentionLimits where
  maxRecords : Nat
  maxCanonicalBytes : Nat
  deriving Repr, DecidableEq

structure CheckedCompensationSnapshotLimits where
  maxRecords : Nat
  maxCanonicalBytes : Nat
  deriving Repr, DecidableEq

structure CheckedCompensationExecutionLimits where
  maxTriggers : Nat
  maxHandlers : Nat
  maxCanonicalBytes : Nat
  deriving Repr, DecidableEq

structure CheckedCompensation where
  triggerElementId : NodeId
  subjects : List CheckedCompensationSubject
  dependencies : List CheckedCompensationDependency
  retentionLimits : CheckedCompensationRetentionLimits
  snapshotLimits : CheckedCompensationSnapshotLimits
  executionLimits : CheckedCompensationExecutionLimits
  deriving Repr, DecidableEq

inductive CheckedBoundaryTimerExpression where
  | duration (literal : String)
  | cycle (literal : String)
  deriving Repr, DecidableEq

inductive CheckedNode where
  | noneStartEvent (id : NodeId)
  | messageStartEvent (id : NodeId) (channel : MessageChannel)
  | timerStartEvent (id : NodeId) (durationLiteral : String)
  | embeddedSubProcess (id : NodeId) (childScopeId : DefinitionScopeId)
  | callActivity (id : NodeId) (calledProcessId : ProcessId)
  | boundaryErrorEvent (id attachedToRef : NodeId)
      (error : ErrorReference) (outputFlowId : SequenceFlowId)
  /-- The XSD and CMOF default `cancelActivity` to `true`. The disjoint expression retains the exact source duration or cycle lexeme for independent normalization. -/
  | timerBoundaryEvent (id attachedToRef : NodeId)
      (interruption : BoundaryInterruption)
      (expression : CheckedBoundaryTimerExpression) (outputFlowId : SequenceFlowId)
  | messageBoundaryEvent (id attachedToRef : NodeId)
      (interruption : BoundaryInterruption)
      (channel : MessageChannel) (outputFlowId : SequenceFlowId)
  | userTask (id : NodeId) (name : Option String)
      (metadata : Option UserTaskMetadata := none)
  /-- A User Task whose one required DataInput is filled by one direct Data Input Association. A
  distinct node rather than a flag on `userTask`, because plain readiness and data-dependent
  readiness select different lowering clauses. -/
  | dataInputUserTask (id : NodeId) (name : Option String)
      (directInput : DirectActivityDataInput)
  /-- A distinct arm because both associations share one Activity lifetime without widening either predecessor profile. -/
  | dataInputOutputUserTask (id : NodeId) (name : Option String)
      (directInput : DirectActivityDataInput)
      (directOutput : DirectActivityDataOutput)
  /-- A User Task whose one required DataOutput is written by one direct Data Output Association. A
  distinct node rather than a flag on `userTask`, because a declared OutputSet constrains completion
  where the input node's InputSet constrains entry. -/
  | dataOutputUserTask (id : NodeId) (name : Option String)
      (directOutput : DirectActivityDataOutput)
  | sequentialMultiInstanceUserTask
      (id : NodeId)
      (name : Option String)
      (input : SequentialMultiInstanceInputDefinition)
      (output : SequentialMultiInstanceOutputDefinition)
      (normalOutputFlowId : SequenceFlowId)
      (boundaryTimer : CheckedSequentialMultiInstanceBoundaryTimer)
  | parallelMultiInstanceUserTask
      (id : NodeId)
      (name : Option String)
      (input : SequentialMultiInstanceInputDefinition)
      (output : SequentialMultiInstanceOutputDefinition)
      (completionCondition : CheckedCondition)
      (normalOutputFlowId : SequenceFlowId)
      (boundaryTimer : CheckedSequentialMultiInstanceBoundaryTimer)
  | intermediateCatchTimerEvent (id : NodeId) (durationLiteral : String)
  | intermediateCatchMessageEvent (id : NodeId) (channel : MessageChannel)
  | payloadMessageCatchEvent (id : NodeId) (channel : MessageChannel)
      (directOutput : DirectCatchEventPayloadOutput)
  | correlatedPayloadMessageCatchEvent (id : NodeId) (channel : MessageChannel)
      (correlationKeyId correlationPropertyId : String)
      (payloadSelector : CorrelationMessagePath)
      (processPropertySelector : CorrelationProcessPropertyPath)
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
  | globalSynchronousCompensationThrowEvent (id : NodeId)
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
  | .messageBoundaryEvent id _ _ _ _
  | .userTask id _ _
  | .dataInputUserTask id _ _
  | .dataInputOutputUserTask id _ _ _
  | .dataOutputUserTask id _ _
  | .sequentialMultiInstanceUserTask id _ _ _ _ _
  | .parallelMultiInstanceUserTask id _ _ _ _ _ _
  | .intermediateCatchTimerEvent id _
  | .intermediateCatchMessageEvent id _
  | .payloadMessageCatchEvent id _ _
  | .correlatedPayloadMessageCatchEvent id _ _ _ _ _
  | .receiveTask id _
  | .configuredTask id _
  | .serviceTask id _ _ _ _
  | .parallelGateway id _
  | .exclusiveMerge id
  | .exclusiveGateway id _ _
  | .inclusiveGatewayDiverging id _ _
  | .inclusiveGatewayConverging id _
  | .eventBasedGateway id
  | .globalSynchronousCompensationThrowEvent id
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
  compensation : Option CheckedCompensation := none
  deriving Repr, DecidableEq

end BpmnSemantics.SemanticProcess
