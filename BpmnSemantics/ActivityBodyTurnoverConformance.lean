import BpmnSemantics.SemanticProcess.ActivityBodyTurnover
import BpmnSemantics.ActivityBoundaryTimerConformance

/-! # Activity body turnover fixtures

The concrete facts that make the turnover operation's *content* checked rather than defined.

The two quantified laws in `ActivityBodyTurnover` are both insensitive to whether the operation does
anything: a `replacedState` that returned its argument unchanged would satisfy frame preservation and
well-formedness preservation alike. That is not a defect in the laws, which say what they say, but it
means neither one witnesses `AOO-TURNOVER-02`'s first half — that the outgoing wait is withdrawn, the
incoming one armed, and the counter advanced. This module supplies that half.

It also carries the capsule's nearest checked non-law. Before a replacement the body's activation, its
attached handler's, and the Activity occurrence's are all `1`, which is the coincidence every join
this account retired read as a pair. After one replacement the body is at `2` while the handler and
the Activity stay at `1`. That divergence is the whole point of the record, and stating it as a
decided fact is what stops it from being only a described one.
-/

namespace BpmnSemantics.ActivityBodyTurnoverConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- The armed bounded-task state, reused so the turnover fixture perturbs a reachable state. -/
def program : Program := ActivityBoundaryTimerConformance.program

def instanceId : SemanticId := ActivityBoundaryTimerConformance.instanceId

def armedState : RuntimeState := ActivityBoundaryTimerConformance.armedState

/-- The state after replacing the single armed record's body.

Resolved through the record the state actually carries rather than a hand-written one, so the fixture
cannot drift away from the arming transition that produced it. -/
def turnedOver? : Option RuntimeState :=
  match armedState.activityOccurrences.head? with
  | some record => replaceActivityBodyTask armedState record
  | none => none

/-- The pre-state is the ordinal coincidence: all three families agree at activation `1`. -/
theorem armed_state_carries_the_ordinal_coincidence :
    (armedState.waits.map (·.activation), armedState.timerWaits.map (·.activation),
      armedState.activityOccurrences.map (·.activation)) = ([1], [1], [1]) := by
  decide +kernel

/-- Replacement is defined on the armed state, so every fact below is about a real result. -/
theorem turnover_is_defined : turnedOver?.isSome = true := by decide +kernel

/-- `AOO-TURNOVER-02` and `AOO-TURNOVER-04` as content rather than as definition.

The body advances and the handler does not. An operation that returned its argument unchanged would
answer `([1], [1], [1])` here, so this is the fact both quantified laws cannot supply. -/
theorem turnover_diverges_the_body_from_its_handler :
    turnedOver?.map (fun state =>
      (state.waits.map (·.activation), state.timerWaits.map (·.activation),
        state.activityOccurrences.map (·.activation))) = some ([2], [1], [1]) := by
  decide +kernel

/-- Exactly one body stays live: the outgoing wait is withdrawn in the same step. -/
theorem turnover_leaves_one_live_body :
    turnedOver?.map (·.waits.length) = some 1 := by decide +kernel

/-- The post-state is admitted, which the quantified law asserts only under hypotheses. -/
theorem turnover_reaches_a_well_formed_state :
    turnedOver?.map (runtimeStateWellFormed program instanceId) = some true := by
  decide +kernel

end BpmnSemantics.ActivityBodyTurnoverConformance
