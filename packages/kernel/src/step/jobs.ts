/**
 * How the failure of an input's closure becomes the input's outcome where CIB runs the work in a job rather than in
 * the command, transcribed from `Kernel/Step/Jobs.lean`: past a transaction boundary (`deferred`), in a timer firing
 * (`timerJob`) and in the continuation an effect result reaches (`effectContinuation`). `step.ts` applies them.
 */
import { ContinuationFailure, assertNever, type Program } from "../il/types.js";
import { EffectOutcomeTag, FailureTag, crossed, failed, type EffectInput, type Outcome, type State } from "../state.js";
import type { Ctx } from "../hooks.js";

/**
 * `outcome`, unless it rolls back or fails after `state` crossed a transaction boundary: CIB commits an input at the
 * boundary and runs the rest in a job, which alone fails (`ExecutionEntity#performOperation`, CIB-EXT-0027). Rolling the
 * whole input back would be wrong and the kernel does not split it, so the outcome is `unsupported`.
 */
export function deferred(program: Program, state: State, outcome: Outcome): Outcome {
  if (outcome.ok) return outcome;
  switch (outcome.failure.tag) {
    case FailureTag.RolledBack:
    case FailureTag.SemanticFailure:
      // dynamic-only: whether a closure fails after it crossed a boundary depends on the run's data and order
      return crossed(program, state) ? failed(FailureTag.Unsupported, "async-boundary-failure") : outcome;
    case FailureTag.Rejected:
    case FailureTag.Unsupported:
      return outcome;
  }
  return assertNever(outcome.failure.tag);
}

/** A rolled-back timer firing stays rolled back under `ContinuationFailure.RolledBack`, `unsupported` under `Incident`. */
export function timerJob(failure: ContinuationFailure, outcome: Outcome): Outcome {
  const rolledBack = !outcome.ok && outcome.failure.tag === FailureTag.RolledBack;
  // dynamic-only: whether a firing's closure rolls back depends on the run's data
  return rolledBack && failure === ContinuationFailure.Incident ? failed(FailureTag.Unsupported, "timer-job-failure") : outcome;
}

/**
 * A continuation an effect result reaches that cannot go on rolls back; under a profile selecting the job-failure
 * reading (`ContinuationFailure.incident`, CIB-EXT-0026, the boundary of CIB-INT-0003) it instead turns the effect into
 * a technical failure, the path a real job's retry and incident follow.
 */
export function effectContinuation(ctx: Ctx, data: EffectInput, run: (data: EffectInput) => Outcome): Outcome {
  const result = run(data);
  const retried = !result.ok && result.failure.tag === FailureTag.RolledBack &&
    ctx.program.options.continuationFailure === ContinuationFailure.Incident &&
    (data.outcome.tag === EffectOutcomeTag.Success || data.outcome.tag === EffectOutcomeTag.BusinessFailure);
  return retried ? run({ ...data, outcome: { tag: EffectOutcomeTag.TechnicalFailure } }) : result;
}
