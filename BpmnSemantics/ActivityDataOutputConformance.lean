module

public import BpmnSemantics.ActivityDataOutputConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
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
/-! # Activity data-output conformance

Checked facts for the bounded Activity data-output account: the concrete credit-underwriting
witnesses that separate a routed association write from a name-merged one, an available supplied
output from an omitted one, and data-independent entry from the sibling input family's
data-dependent entry. The family's quantified activation, routing, refusal, and disposal laws are
stated at their owner, [ActivityDataOutput](SemanticProcess/ActivityDataOutput.lean).

The model deliberately gives the `DataOutput` and its target `Property` different ids. Every routed
expectation below would also hold under a name-merged completion if those ids agreed, so the
inequality is what makes these witnesses discriminating rather than merely true.
-/

@[expose] public section

namespace BpmnSemantics.ActivityDataOutputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
theorem activationConsumesTheIncomingToken :
    projectTokenMultiplicities underwritingProgram started.state =
      [(⟨"place:Flow_Application_Decide"⟩, 0), (⟨"place:Flow_Decide_Recorded"⟩, 0)] := by
  decide +kernel

theorem staleCompletionPreservesTheCommittedState :
    applyStimulus scenarioClosureLimit underwritingProgram approved.state decideApproved =
      { outcome := .rejected
        state := approved.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem multipleOutputDeclarationsRefuseSuppliedAndOmittedOutput
    (count : Nat) (duplicated : count = 2 ∨ count = 3)
    (command : Stimulus)
    (selected : command = decideApproved ∨ command = complete "decide-without-output" []) :
    applyStimulus scenarioClosureLimit (repeatedOutputDeclarations count)
      started.state command =
      { outcome := .rejected
        state := started.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  rcases duplicated with rfl | rfl <;> rcases selected with rfl | rfl <;>
    decide +kernel

end BpmnSemantics.ActivityDataOutputConformance
