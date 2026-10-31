module

public import BpmnSemantics.InternalScopeCreationFrameConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.InternalScopeCreationFrameConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.ActivityBodyClaimUniqueness
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallActivityIdentity
import all BpmnSemantics.SemanticProcess.CompensationActivityRetention
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import all BpmnSemantics.SemanticProcess.ControlPositionContract
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPositionDelta
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeWellFormedness
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialScopeStateValidation
import all BpmnSemantics.CheckedProcessContract
import all BpmnSemantics.SemanticProcess.CallDataContract
/-! # Independent scope-creation preparation witnesses

The [scope-creation account](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite)
requires structurally valid Programs and valid predecessors for independent creator pairs. These
constructed fork frontiers exercise actual preparations without claiming source admission,
source reachability of retained counters, or production batching. The existing Call profile supplies
only its acyclic graph policy here; its separate profile cardinalities exclude these constructed pairs.
-/

public section

namespace BpmnSemantics.InternalScopeCreationFrameConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
theorem child_child_premises_hold_jointly :
    programWellFormed (program .child .child) = true ∧
    runtimeStateWellFormed (program .child .child) owner.processInstanceId before = true ∧
    pairPreconditions (program .child .child) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem child_call_premises_hold_jointly :
    programWellFormed (program .child .called) = true ∧
    runtimeStateWellFormed (program .child .called) owner.processInstanceId before = true ∧
    pairPreconditions (program .child .called) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem call_call_premises_hold_jointly :
    programWellFormed (program .called .called) = true ∧
    runtimeStateWellFormed (program .called .called) owner.processInstanceId before = true ∧
    pairPreconditions (program .called .called) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

theorem repeated_child_input_retains_one_token_and_publishes_one_consumption :
    runtimeStateWellFormed (program .child .child) owner.processInstanceId repeatedInput = true ∧
    positionPublicationMatches (program .child .child) repeatedInput ⟨"C_Left"⟩ = true ∧
    (match preparation (program .child .child) repeatedInput ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         ((prepared.selection.apply repeatedInput).tokens.filter fun token =>
           token.placeId == flowControlPlaceId ⟨"f02"⟩ && token.owner == owner).length == 1 &&
         prepared.publicationTemplate.positionDelta.consumedTokens ==
           [{ sequenceFlowId := ⟨"f02"⟩, owner, multiplicity := 1 }]) = true := by
  constructor
  · decide +kernel
  · constructor <;> decide +kernel

end BpmnSemantics.InternalScopeCreationFrameConformance
