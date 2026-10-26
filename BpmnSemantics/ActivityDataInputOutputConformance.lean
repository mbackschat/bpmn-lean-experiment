module

import BpmnSemantics.ActivityDataInputOutputConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputActivationRuntimeStatePreservation
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputCompletionRuntimeStatePreservation
import BpmnSemantics.ActivityDataInputOutputAdmissionConformance
import BpmnSemantics.ActivityDataInputOutputRefusalConformance
import BpmnSemantics.ActivityDataInputOutputProjectionConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.ActivityDataInputOutputConformanceDefinitionFixtures
public import BpmnSemantics.SemanticProcess.ActivityDataInputOutput
import BpmnSemantics.ActivityDataInputOutputConformanceFixtures
/-! # Composed Activity data-input/output conformance

Finite claim-assessment witnesses for the composed one-Activity account. The quantified activation,
copy, completion, routing, cleanup, and refusal laws remain in
[ActivityDataInputOutput](SemanticProcess/ActivityDataInputOutput.lean); the two imported preservation
owners prove aggregate runtime well-formedness. These checks bind the laws to the source identities.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
/-- The composed activation preservation law is quantified over its predecessor and successor. -/
theorem quantifiedActivationRuntimeWellFormedPreservationIsAvailable
    (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed claimProgram claimInstanceId before = true)
    (transition : DataInputOutputActivationStep claimProgram before after) :
    runtimeStateWellFormed claimProgram claimInstanceId after = true := by
  exact dataInputOutputActivationStep_preserves_runtimeStateWellFormed
    claimProgram claimInstanceId before after claimProgram_profile claimProgram_capabilities wellFormed
      transition

/-- The composed completion preservation law is quantified over its predecessor and successor. -/
theorem quantifiedCompletionRuntimeWellFormedPreservationIsAvailable
    (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed claimProgram claimInstanceId before = true)
    (transition : DataInputOutputCompletionStep claimProgram before after) :
    runtimeStateWellFormed claimProgram claimInstanceId after = true := by
  exact dataInputOutputCompletionStep_preserves_runtimeStateWellFormed
    claimProgram claimInstanceId before after claimProgram_profile claimProgram_capabilities wellFormed
      transition

end BpmnSemantics.ActivityDataInputOutputConformance
