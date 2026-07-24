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
        openUserTasks := none
        enabledStimuli :=
          some
            [ Stimulus.completeUserTask
                ⟨"complete-user-task"⟩ ⟨"UserTask_Approve"⟩ ]
        enabledInteractions := none
        logicalTimeMs := 0 }
  , .command ⟨"complete-user-task"⟩ .committed
  , .state
      { instanceId := ⟨"Instance_1"⟩
        status := .completed
        activeWaits := []
        openUserTasks := none
        enabledStimuli := some []
        enabledInteractions := none
        logicalTimeMs := 0 } ]

example :
    run contractScenario =
      { outcome := .semantic .committed
        trace := expectedCalibratedTrace } := by
  decide

example : expectedCalibratedTrace.length = 5 := rfl

example :
    runWithClosureLimit 0 contractScenario =
      { outcome := .harnessFailure
        trace := [.deployment .committed] } := by
  decide

example (definition : Model) (before after : RuntimeState) (event : MicroEvent)
    (h : internalStep definition before = some (after, event)) :
    InternalMicroStep definition before event after :=
  internalStep_sound definition before after event h

end BpmnSemantics.SequentialUserTaskConformance
