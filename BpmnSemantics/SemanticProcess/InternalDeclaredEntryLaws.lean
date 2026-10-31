module

public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.InternalScopeCreationArmingFrames
import BpmnSemantics.SemanticProcess.InternalScopeCreationFreshness
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.NestedScopeDataLaws

/-! Laws of the prepared declared entry (CSD-PREPARE-01 of the
[concurrent scope data proposal](../../docs/capsules/CONCURRENT-SCOPE-DATA-PROPOSAL.md#representation-and-runtime-ownership)),
each composed from the unchanged scope-creation control's law and a law of the frame insertion. -/

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The declared entry refines `enterDeclaredScope?`: the frame evaluated against the predecessor is the
frame entry initializes, because the entered state adds only the fresh child, which is on no parent's
chain, and leaves the data unchanged. -/
theorem prepareInternalDeclaredEntry_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalDeclaredEntry)
    (found : prepareInternalDeclaredEntry? program state operation = some prepared) :
    fire? program operation state = some (prepared.apply state) := by
  obtain ⟨id, origin, input, entry, scope, record, _, rfl, recorded, controlFound, evaluated, _⟩ :=
    prepareInternalDeclaredEntry_facts program state _ prepared found
  obtain ⟨selection, snapshots, retention⟩ :=
    prepareInternalScopeCreation_selection_facts program state _ prepared.control controlFound
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state _ _ selection
  obtain ⟨child, definition⟩ := scopeCreation_enter_child state id origin input entry scope _ selection
  obtain ⟨_, _, parentOf, noneLive⟩ :=
    scopeCreation_selection_child_facts state _ _ hosting running selection child
  obtain ⟨scopes, variables⟩ := scopeCreation_apply_scopes state prepared.control.selection
  rw [selectInternalScopeCreation_fires_declared program state id origin input entry scope _ record snapshots
    retention recorded selection]
  have located := occurrenceWithParent?_insert_created state.scopeOccurrences
    (prepared.control.selection.apply state) prepared.control.selection.created prepared.control.selection.owner
    scopes parentOf noneLive
  rw [definition] at located
  have entered := evaluateFrame?_insert_fresh program state (prepared.control.selection.apply state)
    prepared.control.selection.created (selectInternalScopeCreation_fresh state _ _ selection) scopes variables
    record _ _ _ evaluated
  rw [NestedScopeData.initializeFrame?_of_evaluated program _ scope record _ _ _ recorded located entered,
    PreparedInternalDeclaredEntry.apply_eq]

end BpmnSemantics.SemanticProcess.InternalCommutation
