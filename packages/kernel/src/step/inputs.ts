/**
 * What an input states besides its payload, transcribed from `Kernel/Step/Inputs.lean`: the clock it advances, its ranking
 * of competing Conditional items, and the transitions of a command and an effect result on a running instance. `step.ts`
 * runs them. Lean's `inputHead` has no counterpart: an input's payload carries its time and ranking.
 */
import { assertNever, elementActivity, programElement, programPublicId } from "../il/types.js";
import {
  ActivationRole, CommandActionTag, FailureTag, SignalTag, WriteRule, committed, failed, instanceOf, ownScope,
  semanticFailure, SemanticCause, signal as enqueue, type CommandInput, type EffectInput, type Occurrence, type OccurrenceRef,
  type OpenItem, type IncidentDetail, type Outcome, type ScopeOccurrenceId, type Signal, type State,
} from "../state.js";
import { admitThen, itemDetailOf, itemOf, type Ctx, type Hooks } from "../hooks.js";
/** The begun occurrence with the public identity `ref`, the instance rather than the body of a Multi-Instance element. */
function occurrenceOfRef(ctx: Ctx, state: State, ref: OccurrenceRef): Occurrence | null {
  return state.occurrences.find((occurrence) =>
    (occurrence.begun || state.openItems.some((item) => item.id.occurrence === occurrence.id)) && occurrence.role === ActivationRole.Element && occurrence.activation === ref.activation &&
    programPublicId(ctx.program, occurrence.element) === ref.element &&
    instanceOf(state, occurrence.scope) === ref.processInstanceId) ?? null;
}

export function command(hooks: Hooks, ctx: Ctx, input: CommandInput, state: State): Outcome {
  const incident = (resolve: (item: OpenItem, detail: IncidentDetail) => Outcome): Outcome => {
    const found = itemDetailOf(ctx, state, input.occurrence, (view) => view.incident);
    return found === null ? failed(FailureTag.Rejected, "unknown-incident") : resolve(found[0], found[1]);
  };
  // A variable command acts from the occurrence's own scope outward, its input-mapped locals first, as CIB's
  // `setVariables` on the waiting activity's execution does (`AbstractVariableScope#setVariable`).
  const variables = (act: (scope: ScopeOccurrenceId) => Signal): Outcome => {
    const occurrence = occurrenceOfRef(ctx, state, input.occurrence);
    return occurrence === null
      ? failed(FailureTag.Rejected, "unknown-occurrence")
      : committed(enqueue(state, act(ownScope(state, occurrence.id, occurrence.scope))));
  };
  const action = input.action;
  switch (action.tag) {
    case CommandActionTag.CompleteUserTask: {
      const item = itemOf(ctx, state, input.occurrence, (view) => view.userTask);
      if (item === null) return failed(FailureTag.Rejected, "unknown-user-task");
      const element = programElement(ctx.program, item.element);
      const activity = element === null ? null : elementActivity(element);
      if (activity === null) return semanticFailure(SemanticCause.Invariant, "activity-item-without-activity");
      return hooks.completeUserTask(ctx, activity[0], activity[1], item, action.values, state);
    }
    case CommandActionTag.RetryIncident:
      return incident((item, detail) => hooks.retryIncident(ctx, item, detail, action.generation, state));
    case CommandActionTag.CancelIncidentProcess:
      return incident((_item, detail) => hooks.cancelIncidentProcess(ctx, detail, action.generation, state));
    case CommandActionTag.SetVariables:
      return admitThen(ctx.program.options.bounds, action.values.map(([, value]) => value), () => variables((scope) => ({ tag: SignalTag.Write, scope, writes: action.values, rule: WriteRule.Outward })));
    case CommandActionTag.RemoveVariables:
      return variables((scope) => ({ tag: SignalTag.Remove, scope, names: action.names }));
  }
  return assertNever(action);
}

export function deliverEffectResult(hooks: Hooks, ctx: Ctx, input: EffectInput, state: State): Outcome {
  const item = itemOf(ctx, state, input.occurrence, (view) => view.effect);
  return item === null ? failed(FailureTag.Rejected, "unknown-effect") : hooks.effectResult(ctx, item, input.outcome, state);
}

/** `Kernel.Step.admitChoices *> next`: `next` runs only on a ranking that repeats no element and names only competing ones. */
export function admitChoicesThen(hooks: Hooks, ctx: Ctx, next: () => Outcome): Outcome {
  const elements = ctx.conditionChoices.map((choice) => choice.element);
  if (new Set(elements).size !== elements.length) return failed(FailureTag.Rejected, "condition-choice-duplicate");
  return elements.every((element) => hooks.competes(ctx, element)) ? next() : failed(FailureTag.Rejected, "condition-choice-not-candidate");
}

/**
 * Advance the clock to an input's logical time, `null` leaving it where it is; a time before the clock is rejected,
 * since logical time never runs backward.
 */
export function advanceClock(atMs: number | null, state: State): Outcome {
  if (atMs === null) return committed(state);
  return atMs < state.logicalTimeMs ? failed(FailureTag.Rejected, "logical-time-backward") : committed({ ...state, logicalTimeMs: atMs });
}

