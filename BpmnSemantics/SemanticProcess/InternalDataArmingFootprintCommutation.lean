import BpmnSemantics.SemanticProcess.InternalDataArmingMixedCommutation
import BpmnSemantics.SemanticProcess.InternalDataArmingCommutation

/-! # Composed data-pair laws from footprint independence

Both key inequalities follow from complete predecessor preparation and footprint separation. Raw
counter storage uses the same canonical-order invariant as the evaluator's other affected fields.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem noninterfering_data_inputs_and_tasks_ne
    (program : Program) (state : RuntimeState)
    (left right : InternalDataArmingContract) (leftPatch rightPatch : InternalDataArmingPatch)
    (leftPrepared : prepareInternalDataArmingContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalDataArmingContract? program state right = some rightPatch)
    (separated : footprintsNonInterfering (footprintOfDataPatch left leftPatch)
      (footprintOfDataPatch right rightPatch) = true) :
    left.input ≠ right.input ∧ left.taskId ≠ right.taskId := by
  have baseSeparated := data_data_noninterfering_arms left right leftPatch rightPatch separated
  obtain ⟨leftOwner, leftOrigin, leftSource, leftOwned, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state left leftPatch leftPrepared
  obtain ⟨rightOwner, rightOrigin, rightSource, rightOwned, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state right rightPatch rightPrepared
  constructor
  · intro sameInput
    rw [sameInput, rightOwned] at leftOwned
    have sameOwner := Option.some.inj leftOwned
    have tokenWritten (patch : InternalArmingPatch) :
        .controlToken patch.owner patch.input ∈ (footprintOfPatch patch).writes := by
      simp [footprintOfPatch, canonicalStateAtomSet, mem_sortBy]
    simp only [footprintsNonInterfering, Bool.and_eq_true] at baseSeparated
    have excluded := not_mem_right_of_listsDisjoint _ _ baseSeparated.1.2
      (.controlToken leftOwner left.input) (tokenWritten _)
    rw [sameOwner, sameInput] at excluded
    exact excluded (tokenWritten _)
  · have elements := noninterfering_same_kind_element_ne
      (makeInternalDataArmingPatch program state left leftOwner leftOrigin leftSource).arm
      (makeInternalDataArmingPatch program state right rightOwner rightOrigin rightSource).arm
      rfl baseSeparated
    intro sameTask
    apply elements
    simp [makeInternalDataArmingPatch, InternalArmingWrite.elementId, sameTask]

theorem prepared_data_pair_commutes
    (program : Program) (state : RuntimeState)
    (left right : InternalDataArmingContract) (leftPatch rightPatch : InternalDataArmingPatch)
    (leftPrepared : prepareInternalDataArmingContract? program state left = some leftPatch)
    (rightPrepared : prepareInternalDataArmingContract? program state right = some rightPatch)
    (canonical : canonicalCollectionOrder state = true)
    (separated : footprintsNonInterfering (footprintOfDataPatch left leftPatch)
      (footprintOfDataPatch right rightPatch) = true) :
    prepareInternalDataArmingContract? program (applyInternalDataArmingPatch state leftPatch)
        right = some rightPatch ∧
      prepareInternalDataArmingContract? program (applyInternalDataArmingPatch state rightPatch)
        left = some leftPatch ∧
      applyInternalDataArmingPatch (applyInternalDataArmingPatch state leftPatch) rightPatch =
        applyInternalDataArmingPatch (applyInternalDataArmingPatch state rightPatch) leftPatch := by
  have different := noninterfering_data_inputs_and_tasks_ne program state left right
    leftPatch rightPatch leftPrepared rightPrepared separated
  have frames := prepareInternalDataArmingContract_pair_preserved program state left right
    leftPatch rightPatch leftPrepared rightPrepared different.1 different.2
  refine ⟨frames.1, frames.2, ?_⟩
  obtain ⟨leftOwner, leftOrigin, leftSource, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state left leftPatch leftPrepared
  obtain ⟨rightOwner, rightOrigin, rightSource, _, _, _, _, _, _, _, _, _, _, rfl⟩ :=
    prepareInternalDataArmingContract_facts program state right rightPatch rightPrepared
  apply makeInternalDataArmingPatch_commutes program state left right leftOwner rightOwner
    leftOrigin rightOrigin leftSource rightSource different.2
  all_goals simp_all only [canonicalCollectionOrder, Bool.and_eq_true]

end BpmnSemantics.SemanticProcess.InternalCommutation
