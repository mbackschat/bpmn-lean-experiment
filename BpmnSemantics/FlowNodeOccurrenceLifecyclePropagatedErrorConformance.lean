import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
import BpmnSemantics.SubProcessErrorPropagationConformance

/-! Lifecycle publication of direct-parent Error propagation, as an executable check that
[`ConformanceChecksMain`](ConformanceChecksMain.lean) runs natively. It is apart from the other cancellation
witnesses because those import proof owners an executable root may not reach. -/

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def propagatedErrorTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SubProcessErrorPropagationConformance.program
    SubProcessErrorPropagationConformance.childWaiting.state
    (SubProcessErrorPropagationConformance.completeTask
      "complete-trigger-error" "UserTask_TriggerError")

def propagatedScopeAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .scope
    { processInstanceId := SubProcessErrorPropagationConformance.instanceId
      definitionScopeId := SubProcessErrorPropagationConformance.childScopeId
      activation := 1 }

def propagatedSiblingAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .wait (SubProcessErrorPropagationConformance.taskId "UserTask_SiblingWork")

/-- Propagation emits Error End and Boundary Error together while cancelling the scope and its sibling work. -/
def propagated_error_publishes_both_events_and_cancels_subtree : Bool := decide <|
    ((lifecycleStarts propagatedErrorTrace).filter
        (fun start => start.elementId.value = "EndEvent_ScopedFailure")).length = 1 ∧
      ((lifecycleStarts propagatedErrorTrace).filter
        (fun start => start.elementId.value = "BoundaryEvent_ScopedFailure")).length = 1 ∧
      (lifecycleEnds propagatedErrorTrace).count
        { anchor := propagatedScopeAnchor, terminal := .cancelled } = 1 ∧
      (lifecycleEnds propagatedErrorTrace).count
        { anchor := propagatedSiblingAnchor, terminal := .cancelled } = 1

/-- Every executable check of this module, named for the driver's failure report. -/
def flowNodeOccurrenceLifecyclePropagatedErrorConformanceChecks : List (String × Bool) := [
  ("propagated_error_publishes_both_events_and_cancels_subtree", propagated_error_publishes_both_events_and_cancels_subtree)
]

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
