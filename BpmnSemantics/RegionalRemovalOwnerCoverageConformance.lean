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
import all BpmnSemantics.RegionalRemovalOwnerCoverageConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.ScopeCancellation
import all BpmnSemantics.SemanticProcess.TerminateEnd
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import all BpmnSemantics.SemanticProcess.Data
import all BpmnSemantics.SemanticProcess.MergeRegionAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.RuntimeState
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.CallActivityConformanceFixtures
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityIdentity
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPositionDelta
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalScopeCreationSelection
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation
/-! # Populated regional removal ownership witnesses

These direct remover and Terminate executions populate the five AA-21 collections with distinct
removed and surviving owners. Literal expected records are independent of the candidate successor.
Position validity is checked; these synthetic controller populations do not claim full-state or
profile admission, whose parallel scope-controller clause still requires an empty population.
-/

public section

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
