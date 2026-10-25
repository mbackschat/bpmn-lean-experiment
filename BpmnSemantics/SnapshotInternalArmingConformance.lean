module

public import BpmnSemantics.SnapshotInternalArmingConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.InternalSnapshotArmingBatch
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.CompensationSourceLoweringFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
/-! Six ordinary wait families exercise retained preparation across a dormant snapshot declaration. -/

@[expose] public section

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
