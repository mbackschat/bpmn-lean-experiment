module

public import BpmnSemantics.SnapshotInternalArmingConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.InternalSnapshotArmingBatch
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.CompensationSourceLoweringFixtures
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
import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.SemanticProcess.ActivityBodyClaimUniqueness
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection
import all BpmnSemantics.SemanticProcess.CompensationActivityRetention
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerFlowNodeOccurrence
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataMapping
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutation
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalSnapshotArming
import all BpmnSemantics.SemanticProcess.InternalSnapshotArmingBatch
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeWellFormedness
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialScopeStateValidation
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.SnapshotInternalArmingConformanceCheckFixtures
import all BpmnSemantics.Scenario
import all BpmnSemantics.SemanticProcess.CorrelationScalarPath
import all BpmnSemantics.SemanticProcess.UserTaskMetadata
/-! Six ordinary wait families exercise retained preparation across a dormant snapshot declaration. -/

public section

namespace BpmnSemantics.SnapshotInternalArmingConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
theorem six_family_predecessor_is_valid :
    programWellFormed program = true ∧
      runtimeStateWellFormed program instanceId ready = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program ready).isSome = true := by
  decide +kernel

theorem six_families_retain_complete_preparations :
    prepareSnapshotArmingBatch? program ready ordinary = some prepared ∧ prepared.length = 6 ∧
      internalOperationFrontierPairwiseIndependent? program ready ordinary = false := by
  decide +kernel

theorem six_family_permutations_preserve_state_and_accepted_publication
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    ∃ final leftPublications rightPublications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrencesWithCompensation? program final).isSome = true ∧
      runPreparedSnapshotArmingBatch? program instanceId ⟨"c"⟩ ready prepared =
        some (final, leftPublications) ∧
      runPreparedSnapshotArmingBatch? program instanceId ⟨"c"⟩ ready reordered =
        some (final, rightPublications) ∧
      canonicalAcceptedInternalPublicationPairs leftPublications =
        canonicalAcceptedInternalPublicationPairs rightPublications := by
  have selected := prepareSnapshotArmingBatch_sound program ready ordinary prepared
    six_families_retain_complete_preparations.1
  exact snapshot_prepared_batch_publication_perm program instanceId ⟨"c"⟩ ready prepared reordered
    six_family_predecessor_is_valid.1 six_family_predecessor_is_valid.2.1
    six_family_predecessor_is_valid.2.2 selected.2.2.1 selected.2.2.2.1 permutation

end BpmnSemantics.SnapshotInternalArmingConformance
