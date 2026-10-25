module

public import BpmnSemantics.NonInterruptingBoundaryTimerConformance

/-! ESL-TIMER finite command witnesses separate replacement identity, overlapping handlers,
withdrawal and capacity refusal. The shared quantified Timer relation covers both host bodies. -/

@[expose] public section

namespace BpmnSemantics.RecurringTimerLifetimeConformance

open BpmnSemantics.SemanticProcess
open NonInterruptingBoundaryTimerConformance (armedState instanceId taskId reminderId)

def checked : CheckedProcess :=
  { NonInterruptingBoundaryTimerConformance.checkedProcess with
    identity := { NonInterruptingBoundaryTimerConformance.checkedProcess.identity with
      semanticProfile := repeatableSubscriptionCheckpointProfileId
      sourceId := ⟨"constructed-recurring-timer"⟩ }
    nodes := NonInterruptingBoundaryTimerConformance.checkedProcess.nodes.map fun
      | .timerBoundaryEvent id host interruption _ output =>
          .timerBoundaryEvent id host interruption (.cycle "R/PT1S") output
      | node => node }

def recurringTimerProgram := lowerCheckedProcess checked
def first := applyStimulus scenarioClosureLimit recurringTimerProgram armedState
  (.fireTimer ⟨"first"⟩ reminderId 1000)
def second := applyStimulus scenarioClosureLimit recurringTimerProgram first.state
  (.fireTimer ⟨"second"⟩ { reminderId with activation := 2 } 2000)
def completed := applyStimulus scenarioClosureLimit recurringTimerProgram second.state
  (.completeUserTaskInstance ⟨"complete-host"⟩ taskId [])

def recurrence_is_admitted_in_both_representations : Bool := decide <|
    checkedWellFormed checked = true ∧ programWellFormed recurringTimerProgram = true ∧
      programProfileCapabilitiesValid recurringTimerProgram = true

def two_firings_replace_only_timer_identity_and_retain_host_and_handlers : Bool := decide <|
    first.outcome = .committed ∧ second.outcome = .committed ∧
      (second.state.timerWaits.map fun wait => (wait.activation, wait.deadlineMs)) = [(3, 3000)] ∧
      second.state.activityOccurrences.map (fun record => (record.activation, record.body)) =
        armedState.activityOccurrences.map (fun record => (record.activation, record.body)) ∧
      second.state.activityOccurrences.map (·.attachedHandlers) =
        [[.timer { reminderId with activation := 3 }]] ∧
      second.state.activityActivations = armedState.activityActivations ∧
      (second.state.waits.filter (fun wait => wait.task.id == ⟨"HandlerTask"⟩)).map (·.activation) = [1, 2] ∧
      runtimeStateWellFormed recurringTimerProgram instanceId second.state = true

def stale_identity_is_rejected_at_the_same_logical_time : Bool := decide <|
    (applyStimulus scenarioClosureLimit recurringTimerProgram first.state
      (.fireTimer ⟨"stale"⟩ reminderId 1000)).outcome = .rejected ∧
    (applyStimulus scenarioClosureLimit recurringTimerProgram first.state
      (.fireTimer ⟨"stale"⟩ reminderId 1000)).state = first.state

def completion_withdraws_replacement_and_preserves_spawned_handlers : Bool := decide <|
    completed.outcome = .committed ∧ completed.state.timerWaits = [] ∧
      completed.state.activityOccurrences = [] ∧
      completed.state.waits.filter (fun wait => wait.task.id == ⟨"HandlerTask"⟩) =
        second.state.waits.filter (fun wait => wait.task.id == ⟨"HandlerTask"⟩) ∧
      runtimeStateWellFormed recurringTimerProgram instanceId completed.state = true

def missingDeadline : RuntimeState :=
  { armedState with
    timerWaits := []
    activityOccurrences := armedState.activityOccurrences.map fun record => { record with attachedHandlers := [] } }

def recurrence_cannot_masquerade_as_a_consumed_one_shot : Bool := decide <|
    (applyStimulus scenarioClosureLimit recurringTimerProgram missingDeadline
      (.completeUserTaskInstance ⟨"missing-timer"⟩ taskId [])).outcome = .rejected ∧
    (applyStimulus scenarioClosureLimit recurringTimerProgram missingDeadline
      (.completeUserTaskInstance ⟨"missing-timer"⟩ taskId [])).state = missingDeadline

def deadlineOverflow : RuntimeState :=
  { armedState with timerWaits := armedState.timerWaits.map fun wait => { wait with deadlineMs := 9007199254740991 } }

def activationOverflow : RuntimeState :=
  { armedState with timerActivations := [{ elementId := ⟨"Reminder"⟩, count := 9007199254740991 }] }

def either_replacement_overflow_rolls_back_the_complete_command : Bool := decide <|
    (applyStimulus scenarioClosureLimit recurringTimerProgram deadlineOverflow
      (.fireTimer ⟨"deadline-overflow"⟩ reminderId 9007199254740991)).outcome = .rolledBack ∧
    (applyStimulus scenarioClosureLimit recurringTimerProgram deadlineOverflow
      (.fireTimer ⟨"deadline-overflow"⟩ reminderId 9007199254740991)).state = deadlineOverflow ∧
    (applyStimulus scenarioClosureLimit recurringTimerProgram activationOverflow
      (.fireTimer ⟨"activation-overflow"⟩ reminderId 1000)).outcome = .rolledBack ∧
    (applyStimulus scenarioClosureLimit recurringTimerProgram activationOverflow
      (.fireTimer ⟨"activation-overflow"⟩ reminderId 1000)).state = activationOverflow

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("recurrence_is_admitted_in_both_representations", recurrence_is_admitted_in_both_representations),
  ("two_firings_replace_only_timer_identity_and_retain_host_and_handlers", two_firings_replace_only_timer_identity_and_retain_host_and_handlers),
  ("stale_identity_is_rejected_at_the_same_logical_time", stale_identity_is_rejected_at_the_same_logical_time),
  ("completion_withdraws_replacement_and_preserves_spawned_handlers", completion_withdraws_replacement_and_preserves_spawned_handlers),
  ("recurrence_cannot_masquerade_as_a_consumed_one_shot", recurrence_cannot_masquerade_as_a_consumed_one_shot),
  ("either_replacement_overflow_rolls_back_the_complete_command", either_replacement_overflow_rolls_back_the_complete_command)
]

end BpmnSemantics.RecurringTimerLifetimeConformance
