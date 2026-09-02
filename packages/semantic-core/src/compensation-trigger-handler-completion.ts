import {
  EffectExecutionResultKind,
  type CompleteEffectStimulus,
} from "./contract.js";
import type { CompensationHandlerExecution } from "./compensation-trigger-handler-runtime-contract.js";
import {
  compensationExecutionStateDefects,
} from "./compensation-trigger-handler-runtime-state-validation.js";
import {
  activateCompensationFrontier,
  executionFits,
} from "./compensation-trigger-handler-transition.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  ControlStateKind,
  addToken,
  sameOccurrence,
  type RuntimeState,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

/** Commits one exact semantic compensation result or refuses without consuming its wait. */
export function completeCompensationHandlerEffect(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteEffectStimulus,
): RuntimeState | null {
  const triggers = state.compensationTriggers;
  const waits = state.compensationHandlerEffectWaits;
  if (
    state.control.kind !== ControlStateKind.Running ||
    triggers === undefined ||
    waits === undefined ||
    stimulus.result.localPatch.length !== 0 ||
    compensationExecutionStateDefects(program, state).length > 0
  ) return null;
  const matches = waits.filter(({ id }) => sameOccurrence(id, stimulus.effectId));
  const wait = matches[0];
  if (matches.length !== 1 || wait === undefined) return null;
  const matchingTriggers = triggers.filter(({ id }) => sameOccurrence(id, wait.triggerId));
  const trigger = matchingTriggers[0];
  if (matchingTriggers.length !== 1 || trigger?.lifecycle !== "active") return null;
  const matchingHandlers = trigger.handlers.filter(({ id }) =>
    sameOccurrence(id, wait.handlerId)
  );
  const handler = matchingHandlers[0];
  if (
    matchingHandlers.length !== 1 ||
    handler?.lifecycle !== "compensating" ||
    !sameOccurrence(handler.effectId, stimulus.effectId)
  ) return null;

  switch (stimulus.result.kind) {
    case EffectExecutionResultKind.Success:
      return completeSuccess(program, state, trigger, handler);
    case EffectExecutionResultKind.BpmnError:
      return completeFailure(program, state, trigger, handler, stimulus);
  }
}

function completeSuccess(
  program: SemanticProcessProgram,
  state: RuntimeState,
  trigger: NonNullable<RuntimeState["compensationTriggers"]>[number],
  handler: Extract<CompensationHandlerExecution, { readonly lifecycle: "compensating" }>,
): RuntimeState | null {
  const completedHandler = terminalHandler(handler, "compensated");
  const handlers = trigger.handlers.map((candidate) =>
    candidate === handler ? completedHandler : candidate
  );
  const allCompensated = handlers.every(({ lifecycle }) => lifecycle === "compensated");
  const progressed = {
    ...trigger,
    lifecycle: allCompensated ? "succeeded" : "active",
    handlers,
  } as const;
  const remainingWaits = state.compensationHandlerEffectWaits!.filter(({ id }) =>
    !sameOccurrence(id, handler.effectId)
  );
  const activated = allCompensated
    ? { trigger: progressed, waits: [], effectActivations: state.effectActivations }
    : activateCompensationFrontier(program, {
        ...state,
        compensationHandlerEffectWaits: remainingWaits,
      }, progressed);
  if (activated === null) return null;
  const triggers = state.compensationTriggers!.map((candidate) =>
    candidate === trigger ? activated.trigger : candidate
  ).sort(compareTriggers);
  const waits = [...remainingWaits, ...activated.waits].sort(compareWaits);
  if (!executionFits(program, triggers, waits)) return null;
  const prospective = {
    ...state,
    controlTokens: allCompensated
      ? addToken(state.controlTokens, trigger.output, trigger.owner)
      : state.controlTokens,
    compensationTriggers: triggers,
    compensationHandlerEffectWaits: waits,
    effectActivations: activated.effectActivations,
  };
  return compensationExecutionStateDefects(program, prospective).length === 0
    ? prospective
    : null;
}

function completeFailure(
  program: SemanticProcessProgram,
  state: RuntimeState,
  trigger: NonNullable<RuntimeState["compensationTriggers"]>[number],
  handler: Extract<CompensationHandlerExecution, { readonly lifecycle: "compensating" }>,
  stimulus: CompleteEffectStimulus,
): RuntimeState | null {
  if (stimulus.result.kind !== EffectExecutionResultKind.BpmnError) return null;
  const failedTrigger = {
    ...trigger,
    lifecycle: "failed",
    handlers: trigger.handlers.map((candidate) => {
      if (candidate === handler) return terminalHandler(candidate, "failed");
      return candidate.lifecycle === "pending" || candidate.lifecycle === "compensating"
        ? terminalHandler(candidate, "terminated")
        : candidate;
    }),
  } as const;
  const failure = {
    kind: "compensationHandlerFailure",
    triggerId: trigger.id,
    handlerId: handler.id,
    effectId: stimulus.effectId,
    code: stimulus.result.code,
    message: stimulus.result.message,
  } as const;
  const prospective: RuntimeState = {
    ...state,
    control: {
      kind: ControlStateKind.Failed,
      instanceId: trigger.owner.processInstanceId,
      failure,
    },
    initiationPending: false,
    scopeOccurrences: [],
    controlTokens: [],
    userTaskWaits: [],
    messageWaits: [],
    timerWaits: [],
    effectWaits: [],
    effectIncidents: [],
    selectedBranchSets: [],
    eventRaces: [],
    calledProcessOccurrences: [],
    activityOccurrences: [],
    ...(state.sequentialMultiInstanceControllers === undefined
      ? {}
      : { sequentialMultiInstanceControllers: [] }),
    ...(state.parallelMultiInstanceControllers === undefined
      ? {}
      : { parallelMultiInstanceControllers: [] }),
    ...(state.compensationActivityRetentions === undefined
      ? {}
      : { compensationActivityRetentions: [] }),
    ...(state.compensationParentContextRetentions === undefined
      ? {}
      : { compensationParentContextRetentions: [] }),
    compensationTriggers: state.compensationTriggers!.map((candidate) =>
      candidate === trigger ? failedTrigger : candidate
    ).sort(compareTriggers),
    compensationHandlerEffectWaits: [],
    variables: { ...state.variables, activities: [] },
  };
  return compensationExecutionStateDefects(program, prospective).length === 0
    ? prospective
    : null;
}

function terminalHandler(
  handler: CompensationHandlerExecution,
  lifecycle: "compensated" | "failed" | "terminated",
): CompensationHandlerExecution {
  return {
    id: handler.id,
    subject: handler.subject,
    handlerElementId: handler.handlerElementId,
    lifecycle,
  };
}

function compareTriggers(
  left: NonNullable<RuntimeState["compensationTriggers"]>[number],
  right: NonNullable<RuntimeState["compensationTriggers"]>[number],
): number {
  return compareOccurrences(left.id, right.id);
}

function compareWaits(
  left: NonNullable<RuntimeState["compensationHandlerEffectWaits"]>[number],
  right: NonNullable<RuntimeState["compensationHandlerEffectWaits"]>[number],
): number {
  return compareOccurrences(left.id, right.id);
}

function compareOccurrences(
  left: NonNullable<RuntimeState["compensationTriggers"]>[number]["id"],
  right: NonNullable<RuntimeState["compensationTriggers"]>[number]["id"],
): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}
