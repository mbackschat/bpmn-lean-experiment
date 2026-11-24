module

public import Kernel.Step.Jobs
import all Kernel.Step.Jobs

/-! # Laws of the step function: job failures

What `Kernel.Step.Jobs` does to an outcome, read from its bodies: a transaction boundary (`Step.deferred`), a timer
firing (`Step.timerJob`) and an effect result's continuation (`Step.effectContinuation`) pass a committed outcome, a
rejection and an invariant failure through. This is the one module that sees `Kernel.Step.Jobs`' bodies
([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)); `Kernel.Laws.Step` composes these
facts with `Kernel.Step`'s bodies. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- A committed outcome passes a transaction boundary unchanged. -/
theorem deferred_pass {program : Program} {state after : State} : deferred program state (.ok after) = .ok after := by
  simp [deferred]

/-- A transaction boundary changes only a failure: a committed outcome passes through it. -/
theorem deferred_ok {program : Program} {state after : State} {outcome : Outcome}
    (ran : deferred program state outcome = .ok after) : outcome = .ok after := by
  unfold deferred at ran
  split at ran <;> (try split at ran) <;> simp_all

/-- A rejection passes a transaction boundary unchanged. -/
theorem deferred_rejected {program : Program} {state : State} {code : String} :
    deferred program state (.error (.rejected code)) = .error (.rejected code) := by
  simp [deferred]

/-- An invariant failure passes a transaction boundary unchanged, crossed or not: never CIB-EXT-0027's limitation (#148). -/
theorem deferred_invariant {program : Program} {state : State} {code : String} :
    deferred program state (.error (.semanticFailure .invariant code)) = .error (.semanticFailure .invariant code) := by
  simp [deferred]

/-- A committed timer firing committed its closure's outcome: `Step.timerJob` changes only a failure. -/
theorem timerJob_ok {failure : ContinuationFailure} {outcome : Outcome} {after : State}
    (ran : timerJob failure outcome = .ok after) : outcome = .ok after := by
  unfold timerJob at ran
  split at ran <;> simp_all

/-- A committed effect result committed the continuation of the result it reports, or of the technical failure
`Step.effectContinuation` substitutes. -/
theorem effectContinuation_ok {ctx : Ctx} {data : EffectInput} {run : EffectInput → Outcome} {after : State}
    (ran : effectContinuation ctx data run = .ok after) : ∃ reported, run reported = .ok after := by
  unfold effectContinuation at ran
  split at ran <;> first | exact ⟨_, ran⟩ | exact ⟨data, ran⟩

/-! ## Rejections

The body facts behind `Kernel.Laws.Step.Inputs.step_unknown`: a timer firing and an effect result pass a rejection
through. -/

theorem rejected_timerJob {failure : ContinuationFailure} {outcome : Outcome}
    (rejected : ∃ code, outcome = .error (.rejected code)) : ∃ code, timerJob failure outcome = .error (.rejected code) := by
  obtain ⟨code, same⟩ := rejected
  exact ⟨code, by subst same; cases failure <;> rfl⟩

theorem rejected_effectContinuation {ctx : Ctx} {data : EffectInput} {run : EffectInput → Outcome}
    (rejected : ∀ reported : EffectInput, reported.occurrence = data.occurrence → ∃ code, run reported = .error (.rejected code)) :
    ∃ code, effectContinuation ctx data run = .error (.rejected code) := by
  obtain ⟨code, same⟩ := rejected data rfl
  refine ⟨code, ?_⟩
  unfold effectContinuation
  split <;> simp_all

/-- A committed job failure failed the job item the firing addresses (`Hooks.failJob`). -/
theorem jobFailure_ok {hooks : Hooks} {ctx : Ctx} {data : TimerInput} {state after : State}
    (ran : jobFailure hooks ctx data state = .ok after) :
    ∃ item job, itemDetail? ctx state data.occurrence (·.job) = some (item, job) ∧
      hooks.failJob ctx item job state = .ok after := by
  unfold jobFailure at ran
  split at ran
  · simp at ran
  · exact ⟨_, _, ‹_›, ran⟩

end Kernel.Laws.Step
