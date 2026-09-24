import BpmnSemantics.NonInterruptingBoundaryTimerConformance

/-! ESL-TIMER finite command witnesses separate replacement identity, overlapping handlers,
withdrawal and capacity refusal. The shared quantified Timer relation covers both host bodies. -/

namespace BpmnSemantics.RecurringTimerLifetimeConformance

open BpmnSemantics.SemanticProcess
open NonInterruptingBoundaryTimerConformance (armedState instanceId taskId reminderId)

private def checked : CheckedProcess :=
  { NonInterruptingBoundaryTimerConformance.checkedProcess with
    identity := { NonInterruptingBoundaryTimerConformance.checkedProcess.identity with
      semanticProfile := repeatableSubscriptionCheckpointProfileId
      sourceId := ⟨"constructed-recurring-timer"⟩ }
    nodes := NonInterruptingBoundaryTimerConformance.checkedProcess.nodes.map fun
      | .timerBoundaryEvent id host interruption _ output =>
          .timerBoundaryEvent id host interruption (.cycle "R/PT1S") output
      | node => node }

private def program := lowerCheckedProcess checked
private def first := applyStimulus scenarioClosureLimit program armedState
  (.fireTimer ⟨"first"⟩ reminderId 1000)
private def second := applyStimulus scenarioClosureLimit program first.state
  (.fireTimer ⟨"second"⟩ { reminderId with activation := 2 } 2000)
private def completed := applyStimulus scenarioClosureLimit program second.state
  (.completeUserTaskInstance ⟨"complete-host"⟩ taskId [])

theorem recurrence_is_admitted_in_both_representations :
    checkedWellFormed checked = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true := by
  decide +kernel

theorem two_firings_replace_only_timer_identity_and_retain_host_and_handlers :
    first.outcome = .committed ∧ second.outcome = .committed ∧
      (second.state.timerWaits.map fun wait => (wait.activation, wait.deadlineMs)) = [(3, 3000)] ∧
      second.state.activityOccurrences.map (fun record => (record.activation, record.body)) =
        armedState.activityOccurrences.map (fun record => (record.activation, record.body)) ∧
      second.state.activityOccurrences.map (·.attachedHandlers) =
        [[.timer { reminderId with activation := 3 }]] ∧
      second.state.activityActivations = armedState.activityActivations ∧
      (second.state.waits.filter (fun wait => wait.task.id == ⟨"HandlerTask"⟩)).map (·.activation) = [1, 2] ∧
      runtimeStateWellFormed program instanceId second.state = true := by
  decide +kernel

theorem stale_identity_is_rejected_at_the_same_logical_time :
    (applyStimulus scenarioClosureLimit program first.state
      (.fireTimer ⟨"stale"⟩ reminderId 1000)).outcome = .rejected ∧
    (applyStimulus scenarioClosureLimit program first.state
      (.fireTimer ⟨"stale"⟩ reminderId 1000)).state = first.state := by
  decide +kernel

theorem completion_withdraws_replacement_and_preserves_spawned_handlers :
    completed.outcome = .committed ∧ completed.state.timerWaits = [] ∧
      completed.state.activityOccurrences = [] ∧
      completed.state.waits.filter (fun wait => wait.task.id == ⟨"HandlerTask"⟩) =
        second.state.waits.filter (fun wait => wait.task.id == ⟨"HandlerTask"⟩) ∧
      runtimeStateWellFormed program instanceId completed.state = true := by
  decide +kernel

private def missingDeadline : RuntimeState :=
  { armedState with
    timerWaits := []
    activityOccurrences := armedState.activityOccurrences.map fun record => { record with attachedHandlers := [] } }

theorem recurrence_cannot_masquerade_as_a_consumed_one_shot :
    (applyStimulus scenarioClosureLimit program missingDeadline
      (.completeUserTaskInstance ⟨"missing-timer"⟩ taskId [])).outcome = .rejected ∧
    (applyStimulus scenarioClosureLimit program missingDeadline
      (.completeUserTaskInstance ⟨"missing-timer"⟩ taskId [])).state = missingDeadline := by
  decide +kernel

private def deadlineOverflow : RuntimeState :=
  { armedState with timerWaits := armedState.timerWaits.map fun wait => { wait with deadlineMs := 9007199254740991 } }

private def activationOverflow : RuntimeState :=
  { armedState with timerActivations := [{ elementId := ⟨"Reminder"⟩, count := 9007199254740991 }] }

theorem either_replacement_overflow_rolls_back_the_complete_command :
    (applyStimulus scenarioClosureLimit program deadlineOverflow
      (.fireTimer ⟨"deadline-overflow"⟩ reminderId 9007199254740991)).outcome = .rolledBack ∧
    (applyStimulus scenarioClosureLimit program deadlineOverflow
      (.fireTimer ⟨"deadline-overflow"⟩ reminderId 9007199254740991)).state = deadlineOverflow ∧
    (applyStimulus scenarioClosureLimit program activationOverflow
      (.fireTimer ⟨"activation-overflow"⟩ reminderId 1000)).outcome = .rolledBack ∧
    (applyStimulus scenarioClosureLimit program activationOverflow
      (.fireTimer ⟨"activation-overflow"⟩ reminderId 1000)).state = activationOverflow := by
  decide +kernel

end BpmnSemantics.RecurringTimerLifetimeConformance
