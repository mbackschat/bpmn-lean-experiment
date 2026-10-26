module

public import BpmnSemantics.ActivityDataInputOutputRefusalConformanceCheckFixtures
public import BpmnSemantics.ActivityDataInputOutputConformanceFixtures
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
/-! # Composed Activity data-input/output refusal conformance

Whole-state and direct-transition refusal decisions over the shared claim fixture. The separate
owner prevents malformed-state reductions from accumulating with successful lifetime proofs.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.ActivityDataInputOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
/-- `ADIO-REFUSE-01` applies at command dispatch, including malformed Programs that cannot pass
source admission; successful unique lookup must not decide whether the family owns the task. -/
theorem duplicateComposedDeclarationRefusesOutputWithExactStatePreservation :
    applyStimulus scenarioClosureLimit (withExtraComposedDeclarations 1) active
        (completeClaim "duplicate-output" [decision (.string "approve")]) = refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

theorem duplicateComposedDeclarationRefusesEmptyOutputWithExactStatePreservation :
    applyStimulus scenarioClosureLimit (withExtraComposedDeclarations 1) active
        (completeClaim "duplicate-empty" []) = refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

theorem threeComposedDeclarationsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit (withExtraComposedDeclarations 2) active
        (completeClaim "three-declarers" [decision (.string "approve")]) = refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-FILL-01`: omitting the sole required output preserves the complete active state. -/
theorem zeroOutputsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-without-decision" []) = refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-FILL-01`: the association target is not a declared DataOutput name. -/
theorem targetPropertyNamedOutputRefusesWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-under-target"
          [{ name := claimDirectOutput.target.id, value := .string "approve" }]) =
      refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-FILL-01`: a second submitted output is not silently discarded. -/
theorem twoOutputsRefuseWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram active
        (completeClaim "complete-with-two-decisions"
          [decision (.string "approve"),
           { name := "DataOutput_Unadmitted", value := .string "second" }]) =
      refused active := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-SCOPE-01` and `ADIO-REFUSE-01`: two scopes for one Activity cannot be resolved by order. -/
theorem duplicateActivityOwnerRefusesWithExactStatePreservation :
    applyStimulus scenarioClosureLimit claimProgram
        (withLocalScopes [copiedScope, copiedScope])
        (completeClaim "complete-duplicate-owner" [decision (.string "approve")]) =
      refused (withLocalScopes [copiedScope, copiedScope]) := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-REFUSE-01`: one scope with the wrong local binding is not the activation-time input. -/
theorem wrongLocalContentRefusesWithExactStatePreservation :
    let malformed : ActivityVariableScope :=
      { copiedScope with bindings := [{ name := "DataInput_Wrong", value := summary.value }] }
    applyStimulus scenarioClosureLimit claimProgram (withLocalScopes [malformed])
        (completeClaim "complete-wrong-local" [decision (.string "approve")]) =
      refused (withLocalScopes [malformed]) := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

/-- `ADIO-REFUSE-01`: the copied local value remains in the composed profile's String-or-Null
domain even when an otherwise valid state is injected directly below Process-data admission. -/
theorem booleanLocalValueRefusesWithExactStatePreservation :
    let malformed : ActivityVariableScope :=
      { copiedScope with
          bindings :=
            [{ name := claimDirectInput.targetDataInputId, value := .boolean true }] }
    applyStimulus scenarioClosureLimit claimProgram (withLocalScopes [malformed])
        (completeClaim "complete-boolean-local" [decision (.string "approve")]) =
      refused (withLocalScopes [malformed]) := by
  exact applyStimulus_rejected_of_admission _ _ _ _ rfl

end BpmnSemantics.ActivityDataInputOutputConformance
