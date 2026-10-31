module

public import BpmnSemantics.MappedSuccessConformanceCheckFixtures
import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
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
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.MappedSuccessConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.Data
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectCompletion
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.ErrorDefinition
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.ExecutionRuntime
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalCommutationRegion
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection
import all BpmnSemantics.SemanticProcess.InternalRegionalFootprint
import all BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnerRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import all BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import all BpmnSemantics.SemanticProcess.InternalRegionalPublication
import all BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalSelection
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OpenWaitProjection
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialScopeObservation
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.TransactionSourceAdmission
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
meta import BpmnSemantics.PrivateEquationLemmas
import all BpmnSemantics.CheckedProcessContract

/-! # Mapped-success Service Task data and mapping locks

These checks own the direct Lean account for the exact string-only mapped-success capsule. They establish independent checked-source normalization, committed effect arguments, typed local-patch validation, Process-scope output mapping, exact state preservation on refusal, and the nearest accept-unvalidated-patch non-law.
-/
run_meta privateEquations `BpmnSemantics.SemanticProcess #[`activityScopeMatches, `applyEffectPatch, `applyEffectResult,
  `completeActivityVariableScope, `localDataOwnerMatches]

run_meta privateEquations `BpmnSemantics.MappedSuccessConformance #[`expectedVariable, `expectedWaitingVariables,
  `outputMappings, `successResult]

public section

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
