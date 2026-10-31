module

import BpmnSemantics.ActivityDataInputOutputAdmissionConformanceCheckFixtures
import BpmnSemantics.ActivityDataInputOutputConformanceFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import BpmnSemantics.SemanticProcess.Execution
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
import all BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.ActivityDataContract
/-! # Composed Activity data-input/output admission conformance

Exact start-binding and ready-input decisions for the claim-assessment profile. These decisions are
separate from completion and lifetime reductions to preserve the fixed build-memory boundary.
-/

public section

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem outputPropertyStartRefusesWithExactStatePreservation :
    runStart (startClaim "start-output-property"
      [{ name := claimDirectOutput.target.id, value := .string "seed" }]) =
      refused initialState := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

theorem extraStartBindingRefusesWithExactStatePreservation :
    runStart (startClaim "start-extra-binding" [summary, unrelated]) =
      refused initialState := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

end BpmnSemantics.ActivityDataInputOutputConformance
