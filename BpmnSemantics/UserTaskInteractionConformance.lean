module

public import BpmnSemantics.UserTaskInteractionConformanceCheckFixtures
import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTask
import BpmnSemantics.SemanticProcess.Execution
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.Conformance
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
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationStartDataAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.Data
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
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
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
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
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OpenWaitProjection
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.PortableHandoffAdmission
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ScenarioAdmission
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.SequentialScopeObservation
import all BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.TopologyFixtures
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.SemanticProcess.WaitCompletion
import all BpmnSemantics.SequentialUserTaskFixtures
import all BpmnSemantics.UserTaskInteractionConformanceCheckFixtures
meta import BpmnSemantics.PrivateEquationLemmas
import all BpmnSemantics.SemanticProcess.UserTaskMetadata

/-! # BpmnSemantics.UserTaskInteractionConformance — task-occurrence interaction locks

These checks close the structured User Task occurrence, exact completion, full-identity mismatch, wrong-activation, stale-completion, and state-derived interaction projection lanes for the bounded interaction capsule.
-/

run_meta privateEquations `BpmnSemantics #[`SequentialUserTask.exactWait, `UserTaskInteractionConformance.exactTaskId]

public section

namespace BpmnSemantics.UserTaskInteractionConformance

open BpmnSemantics
open BpmnSemantics.SequentialUserTask
theorem successful_scenario_trace_is_exact :
    run successfulScenario =
      { outcome := .semantic .committed
        trace := expectedSuccessfulTrace } := by
  decide +kernel

theorem stale_completion_is_rejected_without_reactivation :
    run staleCompletionScenario =
      { outcome := .semantic .rejected
        trace := expectedStaleCompletionTrace } := by
  decide +kernel

theorem waiting_projection_is_independent_of_next_command :
    (run successfulScenario).trace[2]? =
      (run wrongActivationScenario).trace[2]? := by
  decide +kernel

theorem wrong_activation_application_is_rejected :
    BpmnSemantics.SemanticProcess.applyStimulus
        BpmnSemantics.SemanticProcess.scenarioClosureLimit
        program afterStartState
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { processInstanceId := ⟨"Instance_1"⟩
            elementId := ⟨"UserTask_Approve"⟩
            activation := 2 }
          submittedValues) =
      { outcome := .rejected
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  wrong_activation_is_rejected 2 (by decide +kernel)

theorem wrong_process_instance_is_rejected :
    BpmnSemantics.SemanticProcess.applyStimulus
        BpmnSemantics.SemanticProcess.scenarioClosureLimit
        program afterStartState
        (.completeUserTaskInstance ⟨"wrong-process-instance"⟩
          { exactTaskId with
            processInstanceId := ⟨"Other_Instance"⟩ }
          submittedValues) =
      { outcome := .rejected
        state := afterStartState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  BpmnSemantics.SemanticProcess.task_identity_mismatch_is_rejected
    program exactWait ⟨"wrong-process-instance"⟩
      { exactTaskId with processInstanceId := ⟨"Other_Instance"⟩ }
      submittedValues 0 afterStartState.variables
      (by decide +kernel)
      (by decide +kernel)
      (by simp [exactTaskId, exactWait])

theorem element_identity_without_activation_is_insufficient :
    let wrongTaskId := { exactTaskId with activation := 2 }
    wrongTaskId.elementId = exactTaskId.elementId ∧
      (BpmnSemantics.SemanticProcess.applyStimulus
        BpmnSemantics.SemanticProcess.scenarioClosureLimit
        program afterStartState
        (.completeUserTaskInstance
          ⟨"wrong-activation"⟩ wrongTaskId submittedValues)).outcome =
          .rejected :=
  element_id_alone_is_insufficient

end BpmnSemantics.UserTaskInteractionConformance
