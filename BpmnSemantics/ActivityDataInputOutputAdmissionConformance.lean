module

public import BpmnSemantics.ActivityDataInputOutputAdmissionConformanceCheckFixtures
public import BpmnSemantics.ActivityDataInputOutputConformanceFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
/-! # Composed Activity data-input/output admission conformance

Exact start-binding and ready-input decisions for the claim-assessment profile. These decisions are
separate from completion and lifetime reductions to preserve the fixed build-memory boundary.
-/

@[expose] public section

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
