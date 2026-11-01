module

public import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies
import BpmnSemantics.SemanticProcess.InternalLocalControlFootprintCommutation
import BpmnSemantics.SemanticProcess.InternalMappedInvocationCommutation
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalRegionalDependencies
import all BpmnSemantics.SemanticProcess.InternalTimerTaskPreparation

/-! Prepared-transition independence is symmetric across the supported transition variants. The mapped
invocation's dispatcher row lives here too, so its pair laws hold in a module that imports no prepared-transition
dispatcher and stays out of the hidden-edit fanout of the definitions behind it. The row rewrites with private
characterizations of its companions' preparation and application, never with the hidden definitions themselves,
whose equation lemmas such a rewrite would export. -/

public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem messageTask_independent_iff (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (other : PreparedInternalTransition) :
    (PreparedInternalTransition.messageTask contract patch).Independent other ↔
      other.Independent (.messageTask contract patch) := by
  cases other <;> constructor <;> intro separated <;>
    first | exact regionalStateFootprintsIndependent_symmetric _ _ separated | exact separated

private theorem boundedScope_independent_iff (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (other : PreparedInternalTransition) :
    (PreparedInternalTransition.boundedScope contract prepared).Independent other ↔
      other.Independent (.boundedScope contract prepared) := by
  cases other <;> constructor <;> intro separated <;>
    first | exact regionalStateFootprintsIndependent_symmetric _ _ separated | exact separated

theorem PreparedInternalTransition.independent_symm {left right : PreparedInternalTransition}
    (separated : left.Independent right) : right.Independent left := by
  cases left with
  | messageTask contract patch => exact (messageTask_independent_iff contract patch right).mp separated
  | boundedScope contract prepared => exact (boundedScope_independent_iff contract prepared right).mp separated
  | _ =>
      cases right with
      | messageTask contract patch => exact (messageTask_independent_iff contract patch _).mpr separated
      | boundedScope contract prepared => exact (boundedScope_independent_iff contract prepared _).mpr separated
      | _ =>
          first
          | exact PreparedInternalArming.independent_symm separated
          | exact localControlStateFootprintsNonInterfering_symm _ _ separated
          | exact regionalStateFootprintsIndependent_symmetric _ _ separated
          | exact separated

/-- CMCALL-PREPARE-01's batch premise: a mapped invocation is independent only of the frame-inserting families,
scope creations, local control and armings, and only through separated footprints. -/
private theorem PreparedInternalTransition.mappedInvocation_independent {mapped : PreparedInternalMappedInvocation}
    {other : PreparedInternalTransition}
    (independent : (PreparedInternalTransition.mappedInvocation mapped).Independent other) :
    (∃ arm, other = .arming arm ∧
        localControlStateFootprintsNonInterfering mapped.footprint arm.stateFootprint = true) ∨
      (∃ control, other = .localControl control ∧
        localControlStateFootprintsNonInterfering mapped.footprint control.footprint = true) ∨
      (∃ scope, other = .scopeCreation scope ∧
        localControlStateFootprintsNonInterfering mapped.footprint scope.footprint = true) ∨
      (∃ entry, other = .declaredEntry entry ∧
        localControlStateFootprintsNonInterfering mapped.footprint entry.footprint = true) ∨
      ∃ invocation, other = .mappedInvocation invocation ∧
        localControlStateFootprintsNonInterfering mapped.footprint invocation.footprint = true := by
  cases other with
  | arming arm => exact .inl ⟨arm, rfl, independent⟩
  | localControl control => exact .inr (.inl ⟨control, rfl, independent⟩)
  | scopeCreation scope => exact .inr (.inr (.inl ⟨scope, rfl, independent⟩))
  | declaredEntry entry => exact .inr (.inr (.inr (.inl ⟨entry, rfl, independent⟩)))
  | mappedInvocation invocation => exact .inr (.inr (.inr (.inr ⟨invocation, rfl, independent⟩)))
  | _ => exact (independent : False).elim

private theorem PreparedInternalTransition.arming_prepared (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) :
    (PreparedInternalTransition.arming arm).Prepared program state ↔ arm.Prepared program state := Iff.rfl

private theorem PreparedInternalTransition.localControl_prepared (program : Program) (state : RuntimeState)
    (control : PreparedInternalLocalControl) :
    (PreparedInternalTransition.localControl control).Prepared program state ↔
      prepareInternalLocalControl? program state control.operation = some control := Iff.rfl

private theorem PreparedInternalTransition.scopeCreation_prepared (program : Program) (state : RuntimeState)
    (scope : PreparedInternalScopeCreation) :
    (PreparedInternalTransition.scopeCreation scope).Prepared program state ↔
      prepareInternalScopeCreation? program state scope.selection.operation = some scope ∧
        internalScopeCreationUndeclared program scope.selection.operation = true ∧
        internalScopeCreationUnmapped scope.selection.operation = true := Iff.rfl

private theorem PreparedInternalTransition.declaredEntry_prepared (program : Program) (state : RuntimeState)
    (entry : PreparedInternalDeclaredEntry) :
    (PreparedInternalTransition.declaredEntry entry).Prepared program state ↔
      prepareInternalDeclaredEntry? program state entry.control.selection.operation = some entry := Iff.rfl

private theorem PreparedInternalTransition.mappedInvocation_prepared (program : Program) (state : RuntimeState)
    (mapped : PreparedInternalMappedInvocation) :
    (PreparedInternalTransition.mappedInvocation mapped).Prepared program state ↔
      prepareInternalMappedInvocation? program state mapped.control.selection.operation = some mapped := Iff.rfl

private theorem PreparedInternalTransition.arming_apply (program : Program) (state : RuntimeState)
    (arm : PreparedInternalArming) : (PreparedInternalTransition.arming arm).apply program state = arm.apply state := by
  unfold PreparedInternalTransition.apply
  rfl

private theorem PreparedInternalTransition.localControl_apply (program : Program) (state : RuntimeState)
    (control : PreparedInternalLocalControl) :
    (PreparedInternalTransition.localControl control).apply program state = control.selection.apply state := by
  unfold PreparedInternalTransition.apply
  rfl

private theorem PreparedInternalTransition.scopeCreation_apply (program : Program) (state : RuntimeState)
    (scope : PreparedInternalScopeCreation) :
    (PreparedInternalTransition.scopeCreation scope).apply program state = scope.selection.apply state := by
  unfold PreparedInternalTransition.apply
  rfl

private theorem PreparedInternalTransition.declaredEntry_apply (program : Program) (state : RuntimeState)
    (entry : PreparedInternalDeclaredEntry) :
    (PreparedInternalTransition.declaredEntry entry).apply program state = entry.apply state := by
  unfold PreparedInternalTransition.apply
  rfl

private theorem PreparedInternalTransition.mappedInvocation_apply (program : Program) (state : RuntimeState)
    (mapped : PreparedInternalMappedInvocation) :
    (PreparedInternalTransition.mappedInvocation mapped).apply program state = mapped.apply state := by
  unfold PreparedInternalTransition.apply
  rfl

/-- The finite dispatcher's mapped-invocation row: the invocation commutes with every family `Independent` admits
beside it. -/
theorem prepared_mapped_invocation_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (mapped : PreparedInternalMappedInvocation) (other : PreparedInternalTransition)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (mappedFound : prepareInternalMappedInvocation? program state mapped.control.selection.operation = some mapped)
    (otherFound : other.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : (PreparedInternalTransition.mappedInvocation mapped).Independent other) :
    other.Prepared program (mapped.apply state) ∧
      prepareInternalMappedInvocation? program (other.apply program state) mapped.control.selection.operation =
        some mapped ∧
      other.apply program (mapped.apply state) = mapped.apply (other.apply program state) := by
  rcases PreparedInternalTransition.mappedInvocation_independent independent with
    ⟨arm, rfl, separated⟩ | ⟨control, rfl, separated⟩ | ⟨scope, rfl, separated⟩ | ⟨entry, rfl, separated⟩ |
    ⟨invocation, rfl, separated⟩ <;>
    simp only [PreparedInternalTransition.arming_prepared, PreparedInternalTransition.localControl_prepared,
      PreparedInternalTransition.scopeCreation_prepared, PreparedInternalTransition.declaredEntry_prepared,
      PreparedInternalTransition.mappedInvocation_prepared,
      PreparedInternalTransition.arming_apply, PreparedInternalTransition.localControl_apply,
      PreparedInternalTransition.scopeCreation_apply, PreparedInternalTransition.declaredEntry_apply,
      PreparedInternalTransition.mappedInvocation_apply]
      at otherFound ⊢
  · exact prepared_mapped_invocation_arming_pair program state _ mapped arm mappedFound otherFound canonical separated
  · exact prepared_mapped_invocation_local_control_pair program state _ _ mapped control mappedFound otherFound
      canonical separated
  · have pair := prepared_mapped_invocation_scope_creation_pair program instanceId state _ _ mapped scope programValid
      stateValid mappedFound otherFound.1 separated
    exact ⟨⟨pair.1, otherFound.2⟩, pair.2.1, pair.2.2⟩
  · exact prepared_mapped_invocation_declared_entry_pair program instanceId state _ _ mapped entry programValid
      stateValid mappedFound otherFound separated
  · exact prepared_mapped_invocation_pair program instanceId state _ _ mapped invocation programValid stateValid
      mappedFound otherFound separated

end BpmnSemantics.SemanticProcess.InternalCommutation
