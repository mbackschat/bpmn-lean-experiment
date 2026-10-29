module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
import BpmnSemantics.MappedBoundaryErrorConformance
public import BpmnSemantics.SubProcessErrorPropagationConformance
public import BpmnSemantics.SubProcessBoundaryTimerConformance
public import BpmnSemantics.ServiceTaskIncidentCancellationConformance
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
public import BpmnSemantics.MappedBoundaryErrorConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
import all BpmnSemantics.MappedBoundaryErrorConformanceCheckFixtures
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BoundedScopeArming
import all BpmnSemantics.SemanticProcess.BoundedTask
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CallInstanceClosure
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectCompletion
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.EffectDataMapping
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
import all BpmnSemantics.SemanticProcess.IncidentCancellation
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.ParallelScopeReplayExecution
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimeOwnerRemoval
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeCancellation
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionRecord
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.SemanticProcess.WaitCompletion
import all BpmnSemantics.ServiceTaskEffectConformance
import all BpmnSemantics.ServiceTaskIncidentCancellationConformance
import all BpmnSemantics.ServiceTaskIncidentRetryConformance
import all BpmnSemantics.SubProcessBoundaryTimerConformance

/-! # Flow-node occurrence lifecycle cancellation conformance

This module owns the executable lifecycle witnesses for BPMN error, boundary interruption, and incident cancellation.
-/

public section

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def mappedErrorStimulus : Stimulus :=
  .completeEffect ⟨"complete-mapped-error"⟩ MappedBoundaryErrorConformance.effectId
    (MappedBoundaryErrorConformance.errorResult none)

def mappedErrorTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit MappedBoundaryErrorConformance.program
    MappedBoundaryErrorConformance.waitingState mappedErrorStimulus

/-- Matching BPMN Error cancels the Service Task and emits the Boundary Error atomically, never normal completion. -/
theorem matching_effect_error_cancels_service_and_completes_boundary :
    (lifecycleEnds mappedErrorTrace).count
        { anchor := .wait MappedBoundaryErrorConformance.effectId, terminal := .cancelled } = 1 ∧
      (lifecycleEnds mappedErrorTrace).count
        { anchor := .wait MappedBoundaryErrorConformance.effectId, terminal := .completed } = 0 ∧
      ((lifecycleStarts mappedErrorTrace).filter
        (fun start => start.elementId.value = "BoundaryEvent_MappedBusinessError")).length = 1 ∧
      ((lifecycleEnds mappedErrorTrace).filter
        (fun ending => match ending.anchor with
          | .transition commandId _ _ => commandId.value = "complete-mapped-error"
          | _ => false)).length ≥ 1 := by
  decide +kernel

def boundedScopeDeadlineTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SubProcessBoundaryTimerConformance.program
    SubProcessBoundaryTimerConformance.armedState
    (.fireTimer ⟨"fire-scope-deadline"⟩
      SubProcessBoundaryTimerConformance.deadlineId 1000)

def boundedScopeAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .scope
    { processInstanceId := SubProcessBoundaryTimerConformance.instanceId
      definitionScopeId := SubProcessBoundaryTimerConformance.childScopeId
      activation := 1 }

/-- Interrupting a Sub-Process cancels both its host occurrence and its exact open child work. -/
theorem boundary_interruption_cancels_exact_scope_and_child_occurrences :
    (lifecycleEnds boundedScopeDeadlineTrace).count
        { anchor := boundedScopeAnchor, terminal := .cancelled } = 1 ∧
      (lifecycleEnds boundedScopeDeadlineTrace).count
        { anchor := .wait SubProcessBoundaryTimerConformance.childTaskId,
          terminal := .cancelled } = 1 ∧
      ((lifecycleStarts boundedScopeDeadlineTrace).filter
        (fun start => start.elementId.value = "Deadline")).length = 1 := by
  decide +kernel

def incidentCancellationTrace : TracedStimulusResult :=
  applyStimulusTraced 0 ServiceTaskIncidentCancellationConformance.program
    ServiceTaskIncidentCancellationConformance.incidentState
    ServiceTaskIncidentCancellationConformance.cancellationStimulus

/-- Root incident cancellation resolves the incident-held Service Task and creates no synthetic node. -/
theorem root_incident_cancellation_only_cancels_existing_open_occurrences :
    lifecycleStarts incidentCancellationTrace = [] ∧
      (lifecycleEnds incidentCancellationTrace).count
        { anchor := .wait ServiceTaskIncidentCancellationConformance.effectId,
          terminal := .cancelled } = 1 ∧
      projectOpenFlowNodeOccurrences? ServiceTaskIncidentCancellationConformance.program
        incidentCancellationTrace.result.state = some [] := by
  decide +kernel

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
