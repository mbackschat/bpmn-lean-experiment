module

public import BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import BpmnSemantics.SemanticProcess.TransactionCompensationTokenPreservation
import BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetentionLaws

/-! Prepared regional transitions preserve position, references and the root-compensation refusal domain. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- TXC's selected frontier requires no regional batch with child-owned Compensation. -/
theorem prepareInternalRegional_rootCompensationDomain (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (found : prepareInternalRegional? program state operation = some prepared) :
    RootCompensationExecutionDomain program := by
  unfold prepareInternalRegional? at found
  split at found
  · contradiction
  · rename_i absent
    exact rootCompensationExecutionDomain_of_no_cancel program (Bool.eq_false_iff.mpr absent)

/-- Predecessor publication supplies the valid position, and exact declaration plus ownership
closure supply the selected evaluator's position and reference preservation premises. -/
theorem preparedInternalRegional_preserves_position_and_references (program : Program)
    [InterruptionInvocationsRooted program] (before : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (identities : waitIdentitiesUnique before = true)
    (activities : activityRecordsOwnLiveWork before = true)
    (races : eventRaceAssociationsValid before = true)
    (found : prepareInternalRegional? program before operation = some prepared) :
    ∃ hosting after, runningInstance? before = some hosting ∧
      applyPreparedInternalRegional? program before prepared = some after ∧
      runtimePositionValid program hosting after = true ∧
      activityRecordsOwnLiveWork after = true ∧ eventRaceAssociationsValid after = true := by
  obtain ⟨snapshots, declared, _, selected, _, _, published⟩ :=
    prepareInternalRegional_facts program before operation prepared found
  obtain ⟨hosting, positions, _, _, _, _, running, projected, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have position : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at projected
    split at projected
    · assumption
    · contradiction
  have member : operation ∈ program.operations :=
    (List.mem_filter.mp (by rw [declared]; simp)).1
  obtain ⟨after, result, retainedPosition, retainedActivities, retainedRaces⟩ :=
    ownershipClosedSelection_preserves_position_and_references program before hosting operation prepared.selection
      snapshots position structural member identities activities races
      (InterruptionInvocationsRooted.declared program operation member) selected
  refine ⟨hosting, after, running, ?_, retainedPosition, retainedActivities, retainedRaces⟩
  simp [applyPreparedInternalRegional?, prepareInternalRegional_operation program before operation prepared found, found, result]

end BpmnSemantics.SemanticProcess.InternalCommutation
