module

public import BpmnSemantics.ActivityBoundaryTimerConformance
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Runtime-state identity-bound negative fixtures

These three states isolate the consumer-required branches of `RSI-BOUND-01`. Each removes only the
counter entry that bounds one live occurrence from the reachable interrupting boundary-Timer state.
The absent key reads as zero, so the corresponding live activation at one must be refused.
-/

@[expose] public section

namespace BpmnSemantics.RuntimeStateIdentityBoundConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

def armedState : RuntimeState := ActivityBoundaryTimerConformance.armedState

def armed_state_satisfies_identity_bound : Bool := decide <|
    runtimeStateIdentityBound armedState = true

def userTaskCounterAbsentState : RuntimeState :=
  { armedState with activations := [] }

def user_task_counter_absence_fails_identity_bound : Bool := decide <|
    runtimeStateIdentityBound userTaskCounterAbsentState = false

def user_task_identity_above_absent_counter_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId userTaskCounterAbsentState = false

def timerCounterAbsentState : RuntimeState :=
  { armedState with timerActivations := [] }

def timer_counter_absence_fails_identity_bound : Bool := decide <|
    runtimeStateIdentityBound timerCounterAbsentState = false

def timer_identity_above_absent_counter_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId timerCounterAbsentState = false

def activityCounterAbsentState : RuntimeState :=
  { armedState with activityActivations := [] }

def activity_counter_absence_fails_identity_bound : Bool := decide <|
    runtimeStateIdentityBound activityCounterAbsentState = false

def activity_identity_above_absent_counter_is_refused : Bool := decide <|
    runtimeStateWellFormed program instanceId activityCounterAbsentState = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("armed_state_satisfies_identity_bound", armed_state_satisfies_identity_bound),
  ("user_task_counter_absence_fails_identity_bound", user_task_counter_absence_fails_identity_bound),
  ("user_task_identity_above_absent_counter_is_refused", user_task_identity_above_absent_counter_is_refused),
  ("timer_counter_absence_fails_identity_bound", timer_counter_absence_fails_identity_bound),
  ("timer_identity_above_absent_counter_is_refused", timer_identity_above_absent_counter_is_refused),
  ("activity_counter_absence_fails_identity_bound", activity_counter_absence_fails_identity_bound),
  ("activity_identity_above_absent_counter_is_refused", activity_identity_above_absent_counter_is_refused)
]

end BpmnSemantics.RuntimeStateIdentityBoundConformance
