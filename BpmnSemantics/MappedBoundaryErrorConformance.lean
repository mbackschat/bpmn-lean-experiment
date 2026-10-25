module

public import BpmnSemantics.MappedBoundaryErrorConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
/-! # Typed BPMN Error and interrupting boundary conformance

This module owns the direct Lean account for the exact mapped boundary-Error capsule. The profile-scoped CIB mapping rule applies a validated pre-error local patch through the committed output mapping before local cleanup and boundary routing.
-/

@[expose] public section

namespace BpmnSemantics.MappedBoundaryErrorConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel

theorem caught_error_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide +kernel

theorem message_does_not_affect_caught_transition
    (first second : Option String) :
    applyEffectResult [] outputMappings [] (errorResult first) =
      applyEffectResult [] outputMappings [] (errorResult second) := by
  simp [applyEffectResult, applyEffectPatch, errorResult, outputMappings]

theorem mismatched_error_code_is_rejected
    (commandId : SemanticId) (submittedCode : String)
    (message : Option String)
    (mismatch : submittedCode ≠ checkedRoute.code) :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect commandId effectId
          (.bpmnError submittedCode message
            [{ name := "result", value := .null }])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact effect_result_route_failure_is_rejected
    program effectWait commandId
      (.bpmnError submittedCode message
        [{ name := "result", value := .null }])
      0
      (by decide +kernel)
      (by decide +kernel)
      (by decide +kernel)
      (by decide +kernel)
      (by
        have reversed : checkedRoute.code ≠ submittedCode :=
          Ne.symm mismatch
        simp [effectResultOutput, effectWait, route, reversed])

end BpmnSemantics.MappedBoundaryErrorConformance
