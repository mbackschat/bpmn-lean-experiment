import { CommandOutcome } from "./contract.js";
import type { InternalAlternative } from "./internal-transition-alternative.js";
import { compareInternalAlternatives } from "./internal-transition-alternative.js";
import { applyPreparedInternalTransition } from "./internal-transition-batch.js";
import type { PreparedInternalTransition } from "./internal-transition-batch.js";
import { classifyPreparedInternalFrontier, InternalFrontierDisposition } from "./internal-transition-preparation.js";
import type { InternalExecutionFrontier, InternalExecutionOffer } from "./internal-transition-preparation.js";
import type { CommandAdmission } from "./semantic-command-admission.js";
import { InternalSchedulingMode } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { AppliedInternalOperationStep, CommandResult, StimulusEvaluationResult } from "./semantic-process-runtime.js";
import { ControlStateKind } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

export type InternalChoiceDirective = Readonly<{
  ordinal: number;
  alternatives: ReadonlyArray<InternalAlternative>;
  selected: InternalAlternative;
}>;

export type InternalChoiceSchedule = ReadonlyArray<InternalChoiceDirective>;

export enum InternalChoiceScheduleFailure {
  ScheduleForbiddenForMode = "scheduleForbiddenForMode",
  MissingDirective = "missingDirective",
  OrdinalMismatch = "ordinalMismatch",
  AlternativesMismatch = "alternativesMismatch",
  SelectedAlternativeMissing = "selectedAlternativeMissing",
  UnusedDirective = "unusedDirective",
}

export type ScheduledStimulusResult = CommandResult & Readonly<{
  scheduleFailure: InternalChoiceScheduleFailure | null;
}>;

export type ScheduledStimulusEvaluationResult = Omit<StimulusEvaluationResult, "result"> & Readonly<{
  result: ScheduledStimulusResult;
}>;

/** The proposal's explicit-choice precedence applies only after committed external admission. */
export function evaluateScheduledClosure<Refusal>(
  program: SemanticProcessProgram,
  initial: RuntimeState,
  admission: CommandAdmission,
  schedule: InternalChoiceSchedule,
  limit: number,
  frontierAt: (state: RuntimeState) => InternalExecutionFrontier<Refusal>,
): ScheduledStimulusEvaluationResult {
  if (admission.outcome !== CommandOutcome.Committed) return discard({
    outcome: admission.outcome, state: admission.state,
    internalStepBoundExceeded: false, ambiguousInternalChoice: false, scheduleFailure: null,
  });
  const rollback = (
    failure: InternalChoiceScheduleFailure | null,
    hitBound = false,
    ambiguous = false,
  ): ScheduledStimulusEvaluationResult => discard({
    outcome: CommandOutcome.RolledBack, state: initial,
    internalStepBoundExceeded: hitBound, ambiguousInternalChoice: ambiguous, scheduleFailure: failure,
  });
  const refused = (): ScheduledStimulusEvaluationResult => discard({
    outcome: CommandOutcome.Rejected, state: initial,
    internalStepBoundExceeded: false, ambiguousInternalChoice: false, scheduleFailure: null,
  });
  if (program.internalSchedulingMode === InternalSchedulingMode.RejectObservableChoice && schedule.length > 0) {
    return rollback(InternalChoiceScheduleFailure.ScheduleForbiddenForMode);
  }
  let state = admission.state;
  let ordinal = 0;
  const steps: AppliedInternalOperationStep[] = [];
  const batches: AppliedInternalOperationStep[][] = [];
  const preparations: (ReadonlyArray<PreparedInternalTransition> | null)[] = [];
  for (;;) {
    const frontier = state.control.kind === ControlStateKind.Cancelled || state.control.kind === ControlStateKind.Failed
      ? { offers: [], refusal: null, preparationFailed: false } : frontierAt(state);
    if (frontier.refusal !== null) return refused();
    if (frontier.offers.length === 0 && !frontier.preparationFailed) {
      if (ordinal !== schedule.length) return rollback(InternalChoiceScheduleFailure.UnusedDirective);
      return {
        result: { outcome: CommandOutcome.Committed, state, internalStepBoundExceeded: false,
          ambiguousInternalChoice: false, scheduleFailure: null },
        ambiguousInternalChoice: false, admittedState: admission.state,
        selectedInternalSteps: steps, selectedInternalBatches: batches, selectedInternalPreparations: preparations,
      };
    }
    // Fuel precedes both directive inspection and ambiguity, as in the existing zero-fuel closure.
    if (steps.length === limit) return rollback(null, true);
    if (frontier.preparationFailed) return rollback(null, false, true);

    let selected: ReadonlyArray<InternalExecutionOffer>;
    const prepared = frontier.offers.flatMap(({ preparation }) => preparation === null ? [] : [preparation]);
    if (prepared.length !== frontier.offers.length) {
      // Families outside the proved preparation boundary retain only their existing singleton path.
      if (frontier.offers.length !== 1) return rollback(null, false, true);
      selected = frontier.offers;
    } else {
      const classified = classifyPreparedInternalFrontier(prepared);
      if (classified === null) return rollback(null, false, true);
      switch (classified.kind) {
        case InternalFrontierDisposition.Stable:
          throw new Error("a nonempty prepared frontier cannot classify as stable");
        case InternalFrontierDisposition.IndependentBatch:
          selected = classified.members.map((member) => frontier.offers.find((offer) =>
            compareInternalAlternatives(offer.alternative, member.alternative) === 0)!);
          break;
        case InternalFrontierDisposition.ObservableChoice: {
          if (program.internalSchedulingMode === InternalSchedulingMode.RejectObservableChoice) {
            return rollback(null, false, true);
          }
          const alternatives = classified.members.map(({ alternative }) => alternative);
          const directive = schedule[ordinal];
          const failure = validateDirective(directive, ordinal, alternatives);
          if (failure !== null) return rollback(failure);
          selected = [frontier.offers.find((offer) =>
            compareInternalAlternatives(offer.alternative, directive!.selected) === 0)!];
          ordinal += 1;
          break;
        }
      }
    }
    if (selected.length > limit - steps.length) return rollback(null, true);
    const batch: AppliedInternalOperationStep[] = [];
    for (const expected of selected) {
      const current = batch.length === 0 ? frontier : frontierAt(state);
      if (current.refusal !== null) return refused();
      if (current.preparationFailed) return rollback(null, false, true);
      const fresh = current.offers.find(({ alternative }) =>
        compareInternalAlternatives(alternative, expected.alternative) === 0);
      if (fresh === undefined || JSON.stringify(fresh.preparation) !== JSON.stringify(expected.preparation)) {
        return rollback(null, false, true);
      }
      const successor = expected.preparation === null ? fresh.step.successor
        : applyPreparedInternalTransition(program, state, expected.preparation);
      if (successor === null) return rollback(null, false, true);
      batch.push({ operation: fresh.step.operation, owner: fresh.step.owner, successor });
      state = successor;
    }
    steps.push(...batch);
    batches.push(batch);
    preparations.push(selected.every(({ preparation }) => preparation !== null)
      ? selected.map(({ preparation }) => preparation!) : null);
  }
}

function validateDirective(
  directive: InternalChoiceDirective | undefined,
  ordinal: number,
  alternatives: ReadonlyArray<InternalAlternative>,
): InternalChoiceScheduleFailure | null {
  if (directive === undefined) return InternalChoiceScheduleFailure.MissingDirective;
  if (directive.ordinal !== ordinal) return InternalChoiceScheduleFailure.OrdinalMismatch;
  if (directive.alternatives.length !== alternatives.length || directive.alternatives.some((alternative, index) =>
    compareInternalAlternatives(alternative, alternatives[index]!) !== 0)) {
    return InternalChoiceScheduleFailure.AlternativesMismatch;
  }
  if (!alternatives.some((alternative) => compareInternalAlternatives(alternative, directive.selected) === 0)) {
    return InternalChoiceScheduleFailure.SelectedAlternativeMissing;
  }
  return null;
}

function discard(result: ScheduledStimulusResult): ScheduledStimulusEvaluationResult {
  return { result, ambiguousInternalChoice: result.ambiguousInternalChoice, admittedState: null,
    selectedInternalSteps: [], selectedInternalBatches: [], selectedInternalPreparations: [] };
}
