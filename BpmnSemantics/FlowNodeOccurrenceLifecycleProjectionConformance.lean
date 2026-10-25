module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
public import BpmnSemantics.EventBasedGatewayConformance
public import BpmnSemantics.ActivityBoundaryTimerConformance
public import BpmnSemantics.ReceiveTaskConformance
public import BpmnSemantics.ConfiguredTaskConformance

/-! # Flow-node occurrence lifecycle projection conformance

This module owns independent open-set projection witnesses for boundary subscriptions, event races, and reused wait shapes.
-/

@[expose] public section

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def armedBoundaryOpen : Option (List OpenSemanticFlowNodeOccurrence) :=
  projectOpenFlowNodeOccurrences? ActivityBoundaryTimerConformance.program
    ActivityBoundaryTimerConformance.armedState

def armedEventRaceOpen : Option (List OpenSemanticFlowNodeOccurrence) :=
  projectOpenFlowNodeOccurrences? EventBasedGatewayConformance.program
    EventBasedGatewayConformance.armed.state

/-- An armed Boundary Timer is not a flow-node occurrence, while both armed Event-Based candidates are. -/
def boundary_subscription_and_event_race_candidates_are_distinct : Bool := decide <|
    armedBoundaryOpen.map (fun current => current.map fun occurrence => occurrence.elementId.value) =
        some ["BoundedTask"] ∧
      armedEventRaceOpen.map (fun current => current.map fun occurrence => occurrence.elementId.value) =
        some ["MessageCatch", "TimerCatch"]

def receiveStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit ReceiveTaskConformance.program initialState
    ReceiveTaskConformance.startStimulus

def configuredStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit ConfiguredTaskConformance.program initialState
    ConfiguredTaskConformance.startStimulus

/-- Reused Message and effect operations retain the admitted Receive Task and Configured Task element identities. -/
def reused_wait_shapes_publish_receive_and_configured_tasks : Bool := decide <|
    ((lifecycleStarts receiveStartTrace).filter
        (fun start => start.anchor = .wait ReceiveTaskConformance.subscriptionId)).map
          (fun start => start.elementId.value) = ["ReceiveTask_WaitForInvoice"] ∧
      ((lifecycleStarts configuredStartTrace).filter
        (fun start => start.anchor = .wait ConfiguredTaskConformance.effectId)).map
          (fun start => start.elementId.value) = ["ConfiguredTask_Probe"]

/-- Every executable check of this module, named for the driver's failure report. -/
def flowNodeOccurrenceLifecycleProjectionConformanceChecks : List (String × Bool) := [
  ("boundary_subscription_and_event_race_candidates_are_distinct", boundary_subscription_and_event_race_candidates_are_distinct),
  ("reused_wait_shapes_publish_receive_and_configured_tasks", reused_wait_shapes_publish_receive_and_configured_tasks)
]

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
