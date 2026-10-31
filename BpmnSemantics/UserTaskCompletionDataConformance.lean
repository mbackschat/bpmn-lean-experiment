module

public import BpmnSemantics.UserTaskCompletionDataConformanceCheckFixtures
import BpmnSemantics.SequentialUserTask
import BpmnSemantics.SemanticProcess.Execution
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
import all BpmnSemantics.SemanticProcess.ActivityDataInput
import all BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import all BpmnSemantics.SemanticProcess.ActivityDataOutput
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BoundedTask
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.EventBasedGateway
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
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import all BpmnSemantics.SemanticProcess.TopologyFixtures
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitCompletion
import all BpmnSemantics.SequentialUserTaskFixtures
import all BpmnSemantics.UserTaskCompletionDataConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.UserTaskMetadata
/-! # BpmnSemantics.UserTaskCompletionDataConformance — exact completion-patch locks

This module owns the selected CIB Seven completion-data extension over the existing exact User Task occurrence. It checks atomic Process-variable merge, enabledness independence, bounded outgoing closure, and complete variable-state preservation on refusal.
-/

public section

namespace BpmnSemantics.UserTaskCompletionDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialUserTask
/-- Exact completion creates, replaces, preserves, and retains null before the ordinary outgoing closure completes. -/
theorem exact_completion_merges_process_bindings :
    applyStimulus scenarioClosureLimit program stateWithExistingBindings
        completionStimulus =
      { outcome := .committed
        state := completedStateWithMergedBindings
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- A mismatched completion preserves every Process and Activity-local binding supplied by the pre-command state. -/
theorem mismatched_completion_preserves_all_scoped_variables
    (variables : ScopedVariables) (submittedValues : List VariableBinding) :
    applyStimulus scenarioClosureLimit program
        (singletonWaitingState exactWait 0 variables)
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { exactTaskInstanceId with activation := 2 }
          submittedValues) =
      { outcome := .rejected
        state := singletonWaitingState exactWait 0 variables
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact task_identity_mismatch_is_rejected
    program exactWait ⟨"wrong-activation"⟩
      { exactTaskInstanceId with activation := 2 }
      submittedValues 0 variables
      (by decide +kernel)
      (by decide +kernel)
      (Or.inr (Or.inr (by decide +kernel)))

/-- Null completion data belongs to the Process-data composition, not to a structurally similar profile. -/
theorem completion_value_domain_is_profile_closed :
    variableValueAdmitted
        ⟨"bpmn-2.0.2-user-task-preserved-notation-draft"⟩
        .userTaskCompletion .null = false ∧
      variableValueAdmitted
        ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        .userTaskCompletion .null = false ∧
      variableValueAdmitted
        ⟨"cibseven-2.2.0-user-task-process-data-preserved-notation-draft"⟩
        .userTaskCompletion .null = true := by
  decide +kernel

end BpmnSemantics.UserTaskCompletionDataConformance
