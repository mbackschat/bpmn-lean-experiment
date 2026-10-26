module

public import BpmnSemantics.ActivityDataInputConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
/-! # Activity data-input conformance

Checked facts for the bounded Activity data-input account: the local-owner discriminator boundary and
the concrete invoice-review witnesses that separate an unavailable source from a present one carrying
explicit null. The family's quantified activation, copy, refusal, and disposal laws are stated at
their owner, [ActivityDataInput](SemanticProcess/ActivityDataInput.lean).

The owner-discriminator cases come first so an equal-coordinate effect occurrence cannot become an
Activity-local owner by structural coincidence before the transition family is introduced.
-/

@[expose] public section

namespace BpmnSemantics.ActivityDataInputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
theorem equalCoordinateOwnersRemainDistinct : effectOwner ≠ activityOwner := by
  decide +kernel

theorem effectCompletionPreservesEqualCoordinateActivityScope :
    completeActivityVariableScope mixedVariables inputEffectOccurrenceId [] (.success []) =
      some
        { process := { bindings := [] }
          activities := [activityScope]
          processInterfaces := [], scopes := [] } := by
  decide +kernel

theorem activationConsumesTheIncomingToken :
    projectTokenMultiplicities reviewProgram (runStart startWithContext).state =
      [(⟨"place:Flow_Review_Completed"⟩, 0), (⟨"place:Flow_Start_Review"⟩, 0)] := by
  decide +kernel

theorem staleCompletionPreservesTheCommittedState :
    applyStimulus scenarioClosureLimit reviewProgram completedReview.state
        completeReview =
      { outcome := .rejected
        state := completedReview.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem multipleInputDeclarationsRefuseWithoutOrdinaryCompletion
    (count : Nat) (duplicated : count = 2 ∨ count = 3) :
    applyStimulus scenarioClosureLimit (repeatedInputDeclarations count)
      activeState completeReview = refused activeState := by
  rcases duplicated with rfl | rfl <;> decide +kernel

end BpmnSemantics.ActivityDataInputConformance
