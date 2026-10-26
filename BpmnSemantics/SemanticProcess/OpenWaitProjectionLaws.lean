module

public import BpmnSemantics.SemanticProcess.OpenWaitProjection
import BpmnSemantics.SemanticProcess.InternalOccurrenceRegionLaws

/-! Canonical open-wait sorting preserves every occurrence, including multiplicity. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Canonical presentation retains every occurrence, including multiplicity. -/
theorem sortOpenWaitOccurrences_perm (identity : α → OccurrenceId) (values : List α) :
    (sortOpenWaitOccurrences identity values).Perm values :=
  InternalCommutation.sortBy_permutation _ values

end BpmnSemantics.SemanticProcess
