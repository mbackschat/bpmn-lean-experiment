module

public import BpmnSemantics.SemanticProcess.InternalPreparedTransition
public import BpmnSemantics.SemanticProcess.InternalRegionalPairDependencies

/-! Prepared-transition independence is symmetric across the supported transition variants. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem messageTask_independent_iff (contract : InternalMessageTaskContract)
    (patch : InternalMessageTaskPatch) (other : PreparedInternalTransition) :
    (PreparedInternalTransition.messageTask contract patch).Independent other ↔
      other.Independent (.messageTask contract patch) := by
  cases other <;> constructor <;> intro separated <;>
    exact regionalStateFootprintsIndependent_symmetric _ _ separated

private theorem boundedScope_independent_iff (contract : InternalBoundedScopeContract)
    (prepared : PreparedInternalBoundedScope) (other : PreparedInternalTransition) :
    (PreparedInternalTransition.boundedScope contract prepared).Independent other ↔
      other.Independent (.boundedScope contract prepared) := by
  cases other <;> constructor <;> intro separated <;>
    exact regionalStateFootprintsIndependent_symmetric _ _ separated

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

end BpmnSemantics.SemanticProcess.InternalCommutation
