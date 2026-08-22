import BpmnSemantics.SemanticProcess.BoundedTask
import BpmnSemantics.SemanticProcess.RuntimeStateWaitIdentity

/-! # Boundary-Timer withdrawal finality

This module owns the quantified stale-identity law for the interrupting Activity boundary Timer.

The capsule deferred that law with a named blocker: refuting a later lookup needs uniqueness of the
`(instance, element, activation)` key, which `RuntimeState` does not enforce and which the finite
witnesses could not supply, because one concrete state never holds the duplicate that would break the
argument. `waitIdentitiesUnique` now supplies it, so the law is stated here over every state and both
victory arms rather than over one scenario.

It is a separate module because the generic withdrawal lemmas belong with the invariant and this
consequence belongs with the boundary-Timer family, and because `BoundedTask` cannot import the
invariant without a cycle through the lifecycle owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- `ABTIMER-REFUSE-01`, quantified. Every victory withdraws a live task and a live deadline, and
afterwards no wait carries either withdrawn key, so neither losing arm can be found again.

This is what the two finite refusal witnesses could only illustrate. A wrong withdrawal that erased
some other wait, or a state holding a second wait under the same key, fails it; the uniqueness
hypothesis is exactly what rules the second case out and is discharged from
`runtimeStateWellFormed`.

The statement stops at unfindability rather than asserting a refusal outcome, because the outcome is
the stimulus dispatcher's, and joining the two would make one law depend on both accounts. -/
theorem bounded_task_victory_withdrawals_are_final (program : Program)
    (before after : RuntimeState)
    (unique : waitIdentitiesUnique before = true)
    (victory : BoundedTaskVictoryStep program before after) :
    ∃ task timer,
      task ∈ before.waits ∧
      timer ∈ before.timerWaits ∧
      (∀ candidate ∈ after.waits, userTaskWaitKeyMatches task candidate = false) ∧
      (∀ candidate ∈ after.timerWaits, timerWaitKeyMatches timer candidate = false) := by
  cases victory with
  | activity instanceId task timer taskOutput timerOutput running taskLive timerLive paired =>
      exact ⟨task, timer, taskLive, timerLive,
        fun candidate remaining =>
          userTask_key_absent_after_withdrawal before task candidate unique taskLive remaining,
        fun candidate remaining =>
          timer_key_absent_after_withdrawal before timer candidate unique timerLive remaining⟩
  | deadline instanceId task timer taskOutput timerOutput running taskLive timerLive paired =>
      exact ⟨task, timer, taskLive, timerLive,
        fun candidate remaining =>
          userTask_key_absent_after_withdrawal before task candidate unique taskLive remaining,
        fun candidate remaining =>
          timer_key_absent_after_withdrawal before timer candidate unique timerLive remaining⟩

end BpmnSemantics.SemanticProcess
