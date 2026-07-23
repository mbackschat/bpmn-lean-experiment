import BpmnSemantics.Conformance
import BpmnSemantics.SequentialUserTask

/-! # BpmnSemantics.SequentialUserTaskConformance — calibrated lifecycle locks

These examples require the production Lean interpreter to derive the Milestone 0 trace from command admission and internal closure. The expected trace is written independently from the interpreter so a hard-coded or reordered observation is visible.
-/

namespace BpmnSemantics.SequentialUserTaskConformance

open BpmnSemantics
open BpmnSemantics.SequentialUserTask

def expectedCalibratedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state
      { instanceId := ⟨"Instance_1"⟩
        status := .running
        activeWaits :=
          [ { elementId := ⟨"UserTask_Approve"⟩
              kind := .userTask
              multiplicity := 1 } ]
        enabledStimuli :=
          [ .completeUserTask ⟨"complete-user-task"⟩ ⟨"UserTask_Approve"⟩ ]
        logicalTimeMs := 0 }
  , .command ⟨"complete-user-task"⟩ .committed
  , .state
      { instanceId := ⟨"Instance_1"⟩
        status := .completed
        activeWaits := []
        enabledStimuli := []
        logicalTimeMs := 0 } ]

example :
    run contractScenario =
      { outcome := .semantic .committed
        trace := expectedCalibratedTrace } := by
  decide

example : expectedCalibratedTrace.length = 5 := rfl

end BpmnSemantics.SequentialUserTaskConformance
