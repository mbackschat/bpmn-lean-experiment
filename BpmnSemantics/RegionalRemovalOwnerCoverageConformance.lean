module

public import BpmnSemantics.RegionalRemovalOwnerCoverageConformanceCheckFixtures
public import BpmnSemantics.CallActivityConformanceFixtures
import BpmnSemantics.SemanticProcess.InternalRegionalActivityRemoval
public import BpmnSemantics.SemanticProcess.TerminateEnd
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
public import BpmnSemantics.SemanticProcess.ScopeAncestryLaws
/-! # Populated regional removal ownership witnesses

These direct remover and Terminate executions populate the five AA-21 collections with distinct
removed and surviving owners. Literal expected records are independent of the candidate successor.
Position validity is checked; these synthetic controller populations do not claim full-state or
profile admission, whose parallel scope-controller clause still requires an empty population.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.RegionalRemovalOwnerCoverageConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
theorem regional_removal_preserves_each_populated_outside_owner :
    expectedOwners (cancelScopeSubtree regionalBefore child .remove) root := by decide +kernel

theorem actual_terminate_preserves_each_populated_outside_owner :
    (terminateScopeState? program regionalBefore ⟨"F"⟩ ⟨⟨"Terminate"⟩⟩ ⟨"P3"⟩ ⟨"B"⟩).map
      (fun after => decide (expectedOwners after root) &&
        decide (after.scopeOccurrences = [{ id := root, parent := none }, { id := child, parent := some root }]) &&
        decide (after.endOccurrences = 8 ∧ after.logicalTimeMs = 13)) = some true := by decide +kernel

theorem called_instance_removal_preserves_each_populated_outside_owner :
    expectedOwners (removeCalledProcessTree calledBefore call) callerRoot := by decide +kernel

end BpmnSemantics.RegionalRemovalOwnerCoverageConformance
