module

public import Kernel.Hooks

/-! # Step: job failures

How the failure of an input's closure becomes the input's outcome where CIB runs the work in a job rather than in
the command: past a transaction boundary (`deferred`), in a timer firing (`timerJob`) and in the continuation an
effect result reaches (`effectContinuation`). `Kernel.Step` applies them; none matches a guarded type.
-/

public section

namespace Kernel.Step

/-- `outcome`, unless it rolls back or fails after `state` crossed a transaction boundary: CIB commits an input at the
boundary and runs the rest in a job, which alone fails (`ExecutionEntity#performOperation`, CIB-EXT-0027). Rolling the
whole input back would be wrong and the kernel does not split it, so the outcome is `unsupported`. -/
def deferred (program : Program) (state : State) (outcome : Outcome) : Outcome :=
  match outcome with
  | .error (.rolledBack _) | .error (.semanticFailure _) =>
    -- dynamic-only: whether a closure fails after it crossed a boundary depends on the run's data and order
    if crossed program state then .error (.unsupported "async-boundary-failure") else outcome
  | .error (.rejected _) | .error (.unsupported _) | .ok _ => outcome

/-- `outcome` of a timer firing. CIB fires a timer in a job, whose failure lowers its retries and ends in an incident,
never the rollback of a command (EXPRESSION-SEMANTICS-SPEC, failure outcomes per stimulus). Under
`ContinuationFailure.rolledBack` the firing is `rolledBack` with the state before it, the Timer still open at its
deadline: CIB's later retries are outside the claim, as for an effect result (PC-TIMER-03). Under `.incident` no row
models a timer job's retries and incident, so the firing is `unsupported`. -/
def timerJob (failure : ContinuationFailure) (outcome : Outcome) : Outcome :=
  match outcome, failure with
  | .error (.rolledBack _), .incident =>
    -- dynamic-only: whether a firing's closure rolls back depends on the run's data
    .error (.unsupported "timer-job-failure")
  | .error (.rolledBack _), .rolledBack => outcome
  | .error (.rejected _), _ | .error (.semanticFailure _), _ | .error (.unsupported _), _ | .ok _, _ => outcome

/-- A continuation an effect result reaches that cannot go on rolls back; under a profile selecting the job-failure
reading (`ContinuationFailure.incident`, CIB-EXT-0026, the boundary of CIB-INT-0003) it instead turns the
effect into a technical failure, the path a real job's retry and incident follow. -/
def effectContinuation (ctx : Ctx) (data : EffectInput) (run : EffectInput → Outcome) : Outcome :=
  match run data, ctx.program.options.continuationFailure, data.outcome with
  | .error (.rolledBack _), .incident, .success _ => run { data with outcome := .technicalFailure }
  | .error (.rolledBack _), .incident, .businessFailure _ _ _ => run { data with outcome := .technicalFailure }
  | result, _, _ => result

end Kernel.Step
