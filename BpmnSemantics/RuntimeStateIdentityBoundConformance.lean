import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state identity-bound negative fixtures

These three states isolate the consumer-required branches of `RSI-BOUND-01`. Each removes only the
counter entry that bounds one live occurrence from the reachable interrupting boundary-Timer state.
The absent key reads as zero, so the corresponding live activation at one must be refused.
-/

namespace BpmnSemantics.RuntimeStateIdentityBoundConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

def armedState : RuntimeState := ActivityBoundaryTimerConformance.armedState

theorem armed_state_satisfies_identity_bound :
    runtimeStateIdentityBound armedState = true := by decide +kernel

def userTaskCounterAbsentState : RuntimeState :=
  { armedState with activations := [] }

theorem user_task_counter_absence_fails_identity_bound :
    runtimeStateIdentityBound userTaskCounterAbsentState = false := by decide +kernel

theorem user_task_identity_above_absent_counter_is_refused :
    runtimeStateWellFormed program instanceId userTaskCounterAbsentState = false := by
  decide +kernel

def timerCounterAbsentState : RuntimeState :=
  { armedState with timerActivations := [] }

theorem timer_counter_absence_fails_identity_bound :
    runtimeStateIdentityBound timerCounterAbsentState = false := by decide +kernel

theorem timer_identity_above_absent_counter_is_refused :
    runtimeStateWellFormed program instanceId timerCounterAbsentState = false := by
  decide +kernel

def activityCounterAbsentState : RuntimeState :=
  { armedState with activityActivations := [] }

theorem activity_counter_absence_fails_identity_bound :
    runtimeStateIdentityBound activityCounterAbsentState = false := by decide +kernel

theorem activity_identity_above_absent_counter_is_refused :
    runtimeStateWellFormed program instanceId activityCounterAbsentState = false := by
  decide +kernel

end BpmnSemantics.RuntimeStateIdentityBoundConformance
