import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! The boundary-Timer fixture is shared by executable rejection probes and its conformance proofs. -/

namespace BpmnSemantics.ActivityBoundaryTimerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-activity-boundary-timer-draft"⟩
        sourceId := ⟨"activity-boundary-timer"⟩
        sourceSha256 :=
          "564a36ffc3815bbadc78d739892ae1e74c7137ff44beaa76eb20fad47401f30e" }
    processId := ⟨"Process_ActivityBoundaryTimer"⟩
    definitionScopes :=
      [rootDefinitionScope ⟨"Process_ActivityBoundaryTimer"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_ActivityBoundaryTimer"⟩
      [ ⟨"BoundaryEnd"⟩, ⟨"BoundaryTask"⟩, ⟨"BoundedTask"⟩, ⟨"Deadline"⟩
      , ⟨"NormalEnd"⟩, ⟨"NormalTask"⟩, ⟨"Start"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_ActivityBoundaryTimer"⟩
      [ ⟨"Flow_Boundary"⟩, ⟨"Flow_Boundary_End"⟩, ⟨"Flow_Normal"⟩
      , ⟨"Flow_Normal_End"⟩, ⟨"Flow_Start"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"BoundaryEnd"⟩
      , .userTask ⟨"BoundaryTask"⟩ (some "Deadline reached")
      , .userTask ⟨"BoundedTask"⟩ (some "Bounded work")
      , .timerBoundaryEvent ⟨"Deadline"⟩ ⟨"BoundedTask"⟩ .interrupting (.duration "PT1S")
          ⟨"Flow_Boundary"⟩
      , .noneEndEvent ⟨"NormalEnd"⟩
      , .userTask ⟨"NormalTask"⟩ (some "Completed in time")
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩
          sourceId := ⟨"Deadline"⟩
          targetId := ⟨"BoundaryTask"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩
          sourceId := ⟨"BoundaryTask"⟩
          targetId := ⟨"BoundaryEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩
          sourceId := ⟨"BoundedTask"⟩
          targetId := ⟨"NormalTask"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩
          sourceId := ⟨"NormalTask"⟩
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩
          sourceId := ⟨"Start"⟩
          targetId := ⟨"BoundedTask"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def instanceId : SemanticId := ⟨"Instance_1"⟩

def taskId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"BoundedTask"⟩
    activation := 1 }

def deadlineId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"Deadline"⟩
    activation := 1 }

def startCommandId : SemanticId := ⟨"start-process"⟩

def armedState : RuntimeState :=
  (applyStimulus scenarioClosureLimit program initialState
    (.startProcess startCommandId ⟨"Process_ActivityBoundaryTimer"⟩
      instanceId [])).state

end BpmnSemantics.ActivityBoundaryTimerConformance
