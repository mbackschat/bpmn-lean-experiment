import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.BoundedTask
import BpmnSemantics.SemanticProcess.Message
import BpmnSemantics.SemanticProcess.EffectCompletion

/-! # External wait completion

This module owns how a waiting runtime state advances when its external event arrives: matching a User Task or Timer wait on its full occurrence identity, and routing a matched Timer into the composite wait that owns it instead of completing it directly. It owns no stimulus admission, closure, or public command outcome; a `none` result here means the caller refuses the command.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def completeUserTask (state : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) : Option RuntimeState :=
  match state.waits.find? fun wait =>
      decide (
        wait.processInstanceId = processInstanceId &&
          wait.task.id = taskId &&
          wait.activation = activation) with
  | none => none
  | some wait =>
      some
        { state with
          waits := state.waits.erase wait
          tokens := addToken state.tokens wait.output wait.owner }

def timerDefinitionMatches (program : Program) (wait : TimerWait) : Bool :=
  program.operations.any fun
    | .awaitTimer _ _ _ _ timer =>
        decide (timer.elementId = wait.elementId)
    | _ => false

def fireTimer (program : Program) (state : RuntimeState)
    (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat) : Option RuntimeState :=
  match state.timerWaits.find? fun wait =>
      decide (
        wait.processInstanceId = timerId.processInstanceId &&
          wait.elementId.value = timerId.elementId.value &&
          wait.activation = timerId.activation) with
  | none => none
  | some wait =>
      if state.eventRaces.any (eventRaceHasTimer · wait) then
        eventRaceTimerWinner? program state timerId logicalTimeMs
      else if isBoundaryTimerDefinition program wait.elementId then
        interruptBoundedUserTask? program state timerId logicalTimeMs
      else if isMonitoredBoundaryTimerDefinition program wait.elementId then
        spawnFromMonitoredUserTask? program state timerId logicalTimeMs
      else if isBoundedScopeDeadlineDefinition program wait.elementId then
        interruptBoundedScope? program state timerId logicalTimeMs
      else if logicalTimeMs = wait.deadlineMs &&
          timerDefinitionMatches program wait then
          some
            { state with
              timerWaits := state.timerWaits.erase wait
              tokens := addToken state.tokens wait.output wait.owner
              logicalTimeMs := wait.deadlineMs }
        else
          none

end BpmnSemantics.SemanticProcess
