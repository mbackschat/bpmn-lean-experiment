module

public import BpmnSemantics.FiniteInternalArmingConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.InternalArmingBatchPublication
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity
/-! An admitted claim-assessment frontier separates retained finite arming from ID-only execution. -/

@[expose] public section

namespace BpmnSemantics.FiniteInternalArmingConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
theorem fixture_is_admitted :
    programWellFormed program = true ∧
      runtimeStateWellFormed program instanceId ready = true ∧
      (projectOpenFlowNodeOccurrences? program ready).isSome = true := by
  decide +kernel

theorem entire_frontier_is_prepared :
    prepareInternalArmingBatch? program ready frontier = some prepared ∧ prepared.length = 3 := by
  decide +kernel

theorem every_permutation_has_one_defined_canonical_publication
    (reordered : List PreparedInternalArming) (permutation : prepared.Perm reordered) :
    ∃ final publications,
      runtimeStateWellFormed program instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? program final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? program instanceId ⟨"claim-review"⟩ 37 ready prepared =
        some (final, publications) ∧
      acceptedPreparedArmingBatch? program instanceId ⟨"claim-review"⟩ 37 ready reordered =
        some (final, publications) := by
  have selected := prepareInternalArmingBatch_sound program ready frontier prepared
    entire_frontier_is_prepared.1
  exact prepared_arming_batch_publication_perm program instanceId ⟨"claim-review"⟩ 37 ready
    prepared reordered fixture_is_admitted.1 fixture_is_admitted.2.1 fixture_is_admitted.2.2
    rfl selected.2.1 selected.2.2.1 permutation

theorem standalone_frontier_has_valid_complete_predecessors :
    programWellFormed standaloneProgram = true ∧
      runtimeStateWellFormed standaloneProgram instanceId ready = true ∧
      (projectOpenFlowNodeOccurrences? standaloneProgram ready).isSome = true ∧
      prepareInternalArmingBatch? standaloneProgram ready standaloneFrontier = some standalonePrepared ∧
      standalonePrepared.length = 3 := by
  decide +kernel

theorem standalone_every_permutation_has_one_defined_publication
    (reordered : List PreparedInternalArming) (permutation : standalonePrepared.Perm reordered) :
    ∃ final publications,
      runtimeStateWellFormed standaloneProgram instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? standaloneProgram final).isSome = true ∧
      canonicalCollectionOrder final = true ∧
      acceptedPreparedArmingBatch? standaloneProgram instanceId ⟨"standalone-review"⟩ 37 ready
        standalonePrepared = some (final, publications) ∧
      acceptedPreparedArmingBatch? standaloneProgram instanceId ⟨"standalone-review"⟩ 37 ready
        reordered = some (final, publications) := by
  obtain ⟨programValid, stateValid, projected, prepared, _⟩ :=
    standalone_frontier_has_valid_complete_predecessors
  have selected := prepareInternalArmingBatch_sound standaloneProgram ready standaloneFrontier
    standalonePrepared prepared
  exact prepared_arming_batch_publication_perm standaloneProgram instanceId ⟨"standalone-review"⟩ 37
    ready standalonePrepared reordered programValid stateValid projected rfl selected.2.1
    selected.2.2.1 permutation

end BpmnSemantics.FiniteInternalArmingConformance
