module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
public import BpmnSemantics.MappedBoundaryErrorConformance
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

/-! # Flow-node occurrence lifecycle cancellation conformance

This module owns the executable lifecycle witnesses for BPMN error, boundary interruption, and incident cancellation.
-/

@[expose] public section

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
