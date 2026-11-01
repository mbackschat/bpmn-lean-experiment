module

public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.CallVariableMappingLaws
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames

/-! Refinement of the prepared mapped invocation (CMCALL-PREPARE-01 of the
[concurrent mapped Calls specification](../../docs/capsules/CONCURRENT-MAPPED-CALLS-SPEC.md#representation-and-runtime-ownership)):
the control's invocation composed with the called-root frame is the variable-mapping evaluator's step. -/

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The mapped invocation refines `CallVariableMapping.invokeState?`: the control selects exactly the
data-erased invocation from the Call's owner, the copied values are the ones the evaluator copies, and the
invocation keeps the data, so the root it creates still holds no frame. -/
theorem prepareInternalMappedInvocation_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalMappedInvocation)
    (found : prepareInternalMappedInvocation? program state operation = some prepared) :
    fire? program operation state = some (prepared.apply state) := by
  obtain ⟨id, origin, input, process, scope, entry, returned, inputs, outputs, bindings, _, rfl, _, valid, controlFound,
    copied, fresh, frame, _, _⟩ := prepareInternalMappedInvocation_facts program state _ prepared found
  obtain ⟨selection, snapshots, _⟩ :=
    prepareInternalScopeCreation_selection_facts program state _ prepared.control controlFound
  obtain ⟨owned, root, invoked⟩ := selectInternalScopeCreation_invokes state id origin input process scope entry
    returned _ prepared.control.selection selection
  rw [fire_mapped_invoke program state id origin input process scope entry returned inputs outputs snapshots,
    CallVariableMapping.invokeState?_of_parts program state _ origin input process scope entry returned inputs outputs
      _ _ bindings valid owned copied invoked root
      (by rw [(scopeCreation_apply_scopes state prepared.control.selection).2]; exact fresh),
    PreparedInternalMappedInvocation.apply_eq, frame]

/-- The inserted frame belongs to the created called root, which holds no frame before the invocation. -/
theorem prepareInternalMappedInvocation_frame (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalMappedInvocation)
    (found : prepareInternalMappedInvocation? program state operation = some prepared) :
    prepared.frame.owner = prepared.control.selection.created.id ∧
      state.variables.scopes.any (·.owner == prepared.frame.owner) = false := by
  obtain ⟨_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, fresh, frame, _, _⟩ :=
    prepareInternalMappedInvocation_facts program state operation prepared found
  have owner : prepared.frame.owner = prepared.control.selection.created.id := by
    rw [frame, CallVariableMapping.calledRootFrame_owner]
  exact ⟨owner, by rw [owner]; exact fresh⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
