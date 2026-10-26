module

public import BpmnSemantics.MappedSuccessConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
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
/-! # Mapped-success Service Task data and mapping locks

These checks own the direct Lean account for the exact string-only mapped-success capsule. They establish independent checked-source normalization, committed effect arguments, typed local-patch validation, Process-scope output mapping, exact state preservation on refusal, and the nearest accept-unvalidated-patch non-law.
-/

@[expose] public section

namespace BpmnSemantics.MappedSuccessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel

theorem activation_creates_complete_occurrence_owned_local_scope :
    waitingState.variables = expectedWaitingVariables := by
  decide +kernel

theorem completion_removes_only_the_matching_owned_scope :
    completeActivityVariableScope twoOwnedScopes effectId outputMappings
        (successResult "example-result") =
      some
        { process := { bindings := [expectedVariable "example-result"] }
          activities :=
            [{ owner := .effectOccurrence secondEffectId, bindings := arguments }]
          processInterfaces := [], scopes := [] } := by
  decide +kernel

theorem activity_local_bindings_remain_outside_public_observation :
    (observeStableState program privateLocalState).map
        (fun state => (state.variables, state.openEffects)) =
      some ([], waitingObservation.openEffects) := by
  decide +kernel

theorem successful_result_maps_only_process_target (reference : String) :
    completeActivityVariableScope expectedWaitingVariables effectId
        outputMappings (successResult reference) =
      some
        { process := { bindings := [expectedVariable reference] }
          activities := []
          processInterfaces := [], scopes := [] } := by
  simp [completeActivityVariableScope, expectedWaitingVariables,
    activityScopeMatches, localDataOwnerMatches, applyEffectResult, applyEffectPatch,
    outputMappings, successResult, expectedVariable]

/-- Any typed patch outside the exact one-local-string contract is refused with exact semantic-state preservation. -/
theorem invalid_patch_is_rejected
    (commandId : SemanticId)
    (result : EffectExecutionResult)
    (invalid :
      completeActivityVariableScope expectedWaitingVariables effectId
        outputMappings result = none) :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect commandId effectId result) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact effect_result_mapping_failure_is_rejected
    program effectWait commandId result 0 (by decide +kernel) (by decide +kernel) (by decide +kernel) (by decide +kernel)
    (by decide +kernel) invalid

theorem missing_patch_is_rejected :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"missing-patch"⟩ effectId (.success [])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"missing-patch"⟩ (.success []) (by decide +kernel)

theorem extra_patch_is_rejected :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"extra-patch"⟩ effectId
          (.success
            [ { name := "result", value := .string "example-result" }
            , { name := "extra", value := .string "extra" } ])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"extra-patch"⟩
    (.success
      [ { name := "result", value := .string "example-result" }
      , { name := "extra", value := .string "extra" } ])
    (by decide +kernel)

theorem duplicate_patch_is_rejected :
    applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"duplicate-patch"⟩ effectId
          (.success
            [ { name := "result", value := .string "example-result" }
            , { name := "result", value := .string "other-result" } ])) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  invalid_patch_is_rejected ⟨"duplicate-patch"⟩
    (.success
      [ { name := "result", value := .string "example-result" }
      , { name := "result", value := .string "other-result" } ])
    (by decide +kernel)

theorem direct_patch_to_process_scope_is_a_non_law :
    (writeLocalPatchToProcessScope waitingState).variables.process.bindings =
      [ { name := "result", value := .string "example-result" } ] ∧
      (applyStimulus scenarioClosureLimit program waitingState
        (.completeEffect ⟨"mapped-patch"⟩ effectId
          (successResult "example-result"))).state.variables.process.bindings =
        [expectedVariable "example-result"] := by
  decide +kernel

end BpmnSemantics.MappedSuccessConformance
