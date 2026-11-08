/**
 * The single step function, transcribed from `Kernel/Step.lean`.
 *
 * Owns dispatch on element kind, event role, input kind, open-item kind and signal, and the order in which hooks
 * run: an input's own transition first, then the closure. The closure repeats, oldest first: hand the next signal
 * to its hook; else route the next token to the element at the end of its flow; else complete one idle scope
 * occurrence; until none is left. A closure that does not settle within `closureBound` steps is `unsupported`,
 * never silently truncated.
 *
 * A scope occurrence is idle when it holds no token, no blocking open item, no parked or held token and no child
 * occurrence. An idle Scope element is completed by its hook, an idle called instance's root by its Call
 * Activity's; an idle process root completes the instance, removing the passive items left in it.
 */
import {
  ElementTag,
  EventRoleTag,
  assertNever,
  type ActivityPayload,
  type Element,
  type ElementId,
  type Header,
  type Program,
  type StartPayload,
} from "./il/types.js";
import { programChildren, programElement, programTarget } from "./il/query.js";
import type { Arrival, Ctx, Hooks } from "./hooks.js";
import {
  CommandActionTag,
  FailureTag,
  FiredTag,
  InputTag,
  InstanceStatus,
  OpenKindTag,
  SignalTag,
  clearInside,
  committed,
  failed,
  initial,
  instanceOf,
  root,
  signal,
  type CommandAction,
  type CommandInput,
  type EffectInput,
  type Fired,
  type Input,
  type OccurrenceRef,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type Signal,
  type State,
  type Token,
} from "./state.js";

/**
 * Route one token to the element its flow targets. An Activity with Multi-Instance loop characteristics goes to the
 * Multi-Instance hook, which runs its instances (BPMN 2.0.2 §13.3.7).
 */
export function arrive(hooks: Hooks, ctx: Ctx, token: Token, state: State): Outcome {
  const arrival: Arrival = { flow: token.flow, scope: token.scope };
  const targetId = programTarget(ctx.program, token.flow);
  const target = targetId === null ? null : programElement(ctx.program, targetId);
  if (target === null) {
    return failed(FailureTag.SemanticFailure, "flow-without-target");
  }
  switch (target.tag) {
    case ElementTag.Activity: {
      const loop = target.payload.envelope.multiInstance;
      return loop === null
        ? hooks.arriveActivity(ctx, target.header, target.payload, arrival, state)
        : hooks.arriveMultiInstance(ctx, target.header, target.payload, loop, arrival, state);
    }
    case ElementTag.Scope:
      return hooks.arriveScope(ctx, target.header, target.payload, arrival, state);
    case ElementTag.Gateway:
      return hooks.arriveGateway(ctx, target.header, target.payload, arrival, state);
    case ElementTag.Start:
      return failed(FailureTag.SemanticFailure, "flow-into-start-event");
    case ElementTag.Event: {
      const role = target.payload.role;
      switch (role.tag) {
        case EventRoleTag.Catch:
          return hooks.arriveCatch(ctx, target.header, target.payload, role.subscription, arrival, state);
        case EventRoleTag.Throw:
          return hooks.arriveThrow(ctx, target.header, target.payload, role.record, arrival, state);
        case EventRoleTag.LinkCatch:
          return hooks.arriveLink(ctx, target.header, target.payload, arrival, state);
        case EventRoleTag.LinkThrow:
          return hooks.arriveLink(ctx, target.header, target.payload, arrival, state);
      }
      return assertNever(role);
    }
  }
  return assertNever(target);
}

function startActivity(hooks: Hooks, ctx: Ctx, element: ElementId, scope: ScopeOccurrenceId, state: State): Outcome {
  const notActivity: Outcome = failed(FailureTag.SemanticFailure, "start-activity-without-activity");
  const found = programElement(ctx.program, element);
  if (found === null) {
    return notActivity;
  }
  switch (found.tag) {
    case ElementTag.Activity:
      return found.payload.envelope.multiInstance !== null
        ? failed(FailureTag.Unsupported, "start-multi-instance-activity")
        : hooks.startActivity(ctx, found.header, found.payload, scope, state);
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return notActivity;
  }
  return assertNever(found);
}

/** Hand one signal to the hook that owns it. */
export function dispatchSignal(hooks: Hooks, ctx: Ctx, next: Signal, state: State): Outcome {
  switch (next.tag) {
    case SignalTag.Arm:
      return hooks.arm(ctx, next.host, next.element, next.scope, state);
    case SignalTag.ArmScope:
      return hooks.armScope(ctx, next.scope, state);
    case SignalTag.ArmGateway:
      return hooks.armGateway(ctx, next.gateway, next.scope, state);
    case SignalTag.Raise:
      return hooks.raise(ctx, next.event, next.origin, state);
    case SignalTag.StartEventSubProcess:
      return hooks.startEventSubProcess(ctx, next.element, next.parent, next.variables, state);
    case SignalTag.Completed:
      return hooks.retain(ctx, next.element, next.scope, next.snapshot, state);
    case SignalTag.Compensate:
      return hooks.compensate(ctx, next.scope, next.trigger, next.leave, next.resume, state);
    case SignalTag.StartActivity:
      return startActivity(hooks, ctx, next.element, next.scope, state);
    case SignalTag.CompensationFailed:
      return hooks.failCompensation(ctx, next.handler, next.code, next.message, next.origin, state);
  }
  return assertNever(next);
}

export function idle(state: State, scope: ScopeOccurrenceId): boolean {
  return !state.tokens.some((token) => token.scope === scope) &&
    !state.openItems.some((item) => item.scope === scope && !item.passive) &&
    !state.slots.parked.some((token) => token.scope === scope) &&
    !state.slots.held.some((token) => token.scope === scope) &&
    !state.scopes.some((occurrence) => occurrence.parent === scope);
}

/**
 * Complete an idle scope occurrence: a compensation handler's by the compensation hook, a Scope's by its hook, a
 * called instance's root by its Call Activity's.
 */
export function completeScope(hooks: Hooks, ctx: Ctx, occurrence: ScopeOccurrence, state: State): Outcome {
  const notScope: Outcome = failed(FailureTag.SemanticFailure, "scope-occurrence-without-scope");
  if (occurrence.compensating) {
    return hooks.completeCompensation(ctx, occurrence, state);
  }
  const element = occurrence.element === null ? null : programElement(ctx.program, occurrence.element);
  if (element === null) {
    return notScope;
  }
  switch (element.tag) {
    case ElementTag.Scope:
      return hooks.completeScope(ctx, element.header, element.payload, occurrence, state);
    case ElementTag.Activity:
      return occurrence.calledInstance !== null
        ? hooks.completeCall(ctx, element.header, element.payload, occurrence, state)
        : notScope;
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return notScope;
  }
  return assertNever(element);
}

export const closureBound = 100_000;

export function settle(hooks: Hooks, ctx: Ctx, bound: number, start: State): Outcome {
  let state = start;
  for (let fuel = bound; fuel > 0; fuel -= 1) {
    if (state.status !== InstanceStatus.Running) {
      return committed(state);
    }
    const [next, ...signals] = state.signals;
    const [token, ...tokens] = state.tokens;
    let outcome: Outcome;
    if (next !== undefined) {
      outcome = dispatchSignal(hooks, ctx, next, { ...state, signals });
    } else if (token !== undefined) {
      outcome = arrive(hooks, ctx, token, { ...state, tokens });
    } else {
      const current = state;
      const occurrence = current.scopes.find((candidate) => candidate.id !== root && idle(current, candidate.id));
      if (occurrence === undefined) {
        return committed(idle(state, root) ? { ...clearInside(state, root), status: InstanceStatus.Completed } : state);
      }
      outcome = completeScope(hooks, ctx, occurrence, state);
    }
    if (!outcome.ok) {
      return outcome;
    }
    state = outcome.value;
  }
  return failed(FailureTag.Unsupported, "closure-bound");
}

function startOf(element: Element): readonly [Header, StartPayload] | null {
  switch (element.tag) {
    case ElementTag.Start:
      return [element.header, element.payload];
    case ElementTag.Activity:
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
      return null;
  }
  return assertNever(element);
}

/** The start Event of the root process a start input names, else its one none start Event. */
export function startElement(program: Program, requested: ElementId | null): readonly [Header, StartPayload] | null {
  const starts = programChildren(program, null).flatMap((element) => {
    const start = startOf(element);
    return start === null ? [] : [start];
  });
  if (requested !== null) {
    return starts.find((start) => start[0].id === requested) ?? null;
  }
  const untriggered = starts.filter((start) => start[1].subscription === null);
  return untriggered.length === 1 ? (untriggered[0] ?? null) : null;
}

export function isUserTask(kind: OpenKind): boolean {
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return true;
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return false;
  }
  return assertNever(kind);
}

export function isEffect(kind: OpenKind): boolean {
  switch (kind.tag) {
    case OpenKindTag.Effect:
      return true;
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return false;
  }
  return assertNever(kind);
}

export function isIncident(kind: OpenKind): boolean {
  switch (kind.tag) {
    case OpenKindTag.Incident:
      return true;
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Evaluation:
      return false;
  }
  return assertNever(kind);
}

export function isMessage(kind: OpenKind): boolean {
  switch (kind.tag) {
    case OpenKindTag.Message:
      return true;
    case OpenKindTag.UserTask:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return false;
  }
  return assertNever(kind);
}

export function isTimer(kind: OpenKind): boolean {
  switch (kind.tag) {
    case OpenKindTag.Timer:
      return true;
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return false;
  }
  return assertNever(kind);
}

/** The open item of a kind `accepts` with the public identity `occurrence`. */
export function item(state: State, occurrence: OccurrenceRef, accepts: (kind: OpenKind) => boolean): OpenItem | null {
  return state.openItems.find((candidate) =>
    candidate.element === occurrence.element && candidate.activation === occurrence.activation &&
    accepts(candidate.kind) && instanceOf(state, candidate.scope) === occurrence.processInstanceId,
  ) ?? null;
}

/** Run `onActivity` on the Activity an open item belongs to. */
export function atActivity(
  ctx: Ctx,
  open: OpenItem,
  onActivity: (header: Header, payload: ActivityPayload) => Outcome,
): Outcome {
  const notActivity: Outcome = failed(FailureTag.SemanticFailure, "activity-item-without-activity");
  const element = programElement(ctx.program, open.element);
  if (element === null) {
    return notActivity;
  }
  switch (element.tag) {
    case ElementTag.Activity:
      return onActivity(element.header, element.payload);
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return notActivity;
  }
  return assertNever(element);
}

export function command(hooks: Hooks, ctx: Ctx, input: CommandInput, state: State): Outcome {
  const incident = (action: CommandAction): Outcome => {
    const found = item(state, input.occurrence, isIncident);
    return found === null
      ? failed(FailureTag.Rejected, "unknown-incident")
      : atActivity(ctx, found, (header, payload) => hooks.resolveIncident(ctx, header, payload, found, action, state));
  };
  const action = input.action;
  switch (action.tag) {
    case CommandActionTag.CompleteUserTask: {
      const found = item(state, input.occurrence, isUserTask);
      if (found === null) {
        return failed(FailureTag.Rejected, "unknown-user-task");
      }
      return atActivity(ctx, found, (header, payload) => {
        const loop = payload.envelope.multiInstance;
        return loop === null
          ? hooks.completeUserTask(ctx, header, payload, found, action.values, state)
          : hooks.completeInstance(ctx, header, payload, loop, found, action.values, state);
      });
    }
    case CommandActionTag.RetryIncident:
      return incident(action);
    case CommandActionTag.CancelIncidentProcess:
      return incident(action);
  }
  return assertNever(action);
}

/** A subscription an Activity opened goes back to its Activity; every other one to `Hooks.trigger`. */
export function fire(hooks: Hooks, ctx: Ctx, open: OpenItem, fired: Fired, state: State): Outcome {
  const element = programElement(ctx.program, open.element);
  if (element === null) {
    return hooks.trigger(ctx, open, fired, state);
  }
  switch (element.tag) {
    case ElementTag.Activity:
      return hooks.triggerActivity(ctx, element.header, element.payload, open, fired, state);
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return hooks.trigger(ctx, open, fired, state);
  }
  return assertNever(element);
}

export function effectResult(hooks: Hooks, ctx: Ctx, input: EffectInput, state: State): Outcome {
  const found = item(state, input.occurrence, isEffect);
  return found === null
    ? failed(FailureTag.Rejected, "unknown-effect")
    : atActivity(ctx, found, (header, payload) =>
        hooks.effectResult(ctx, header, payload, found, input.outcome, state));
}

/** Run an input's transition on a running instance, then settle. */
export function onRunning(
  hooks: Hooks,
  ctx: Ctx,
  before: State | null,
  transition: (state: State) => Outcome,
): Outcome {
  if (before === null) {
    return failed(FailureTag.Rejected, "instance-not-started");
  }
  if (before.status !== InstanceStatus.Running) {
    return failed(FailureTag.Rejected, "instance-not-running");
  }
  const next = transition(before);
  return next.ok ? settle(hooks, ctx, closureBound, next.value) : next;
}

/** The context every hook of `program` reads, its queries filled from `hooks`. */
export function context(hooks: Hooks, program: Program): Ctx {
  return {
    program,
    evaluate: hooks.evaluate,
    catches: hooks.catches,
    eventStart: hooks.eventStart,
    bodyWait: hooks.bodyWait,
  };
}

/**
 * One input. `null` is the state before the instance starts; only a start applies to it. The root's Event
 * Sub-Process starts are armed before the start Event's tokens move.
 */
export function step(hooks: Hooks, program: Program, before: State | null, input: Input): Outcome {
  const ctx = context(hooks, program);
  switch (input.tag) {
    case InputTag.Start: {
      if (before !== null) {
        return failed(FailureTag.Rejected, "instance-already-started");
      }
      const start = startElement(program, input.payload.startEvent);
      if (start === null) {
        return failed(FailureTag.Rejected, "no-start-event");
      }
      const armed = signal(initial(input.payload.instanceId, input.payload.variables), {
        tag: SignalTag.ArmScope,
        scope: root,
      });
      const started = hooks.startProcess(ctx, start[0], start[1], armed);
      return started.ok ? settle(hooks, ctx, closureBound, started.value) : started;
    }
    case InputTag.Command: {
      const payload = input.payload;
      return onRunning(hooks, ctx, before, (state) => command(hooks, ctx, payload, state));
    }
    case InputTag.Deliver: {
      const payload = input.payload;
      return onRunning(hooks, ctx, before, (state) => {
        const found = item(state, payload.occurrence, isMessage);
        return found === null
          ? failed(FailureTag.Rejected, "unknown-message-subscription")
          : fire(hooks, ctx, found, { tag: FiredTag.Message, delivery: payload }, state);
      });
    }
    case InputTag.TimerFire: {
      const payload = input.payload;
      return onRunning(hooks, ctx, before, (state) => {
        const found = item(state, payload.occurrence, isTimer);
        return found === null
          ? failed(FailureTag.Rejected, "unknown-timer")
          : fire(hooks, ctx, found, { tag: FiredTag.Timer, logicalTimeMs: payload.logicalTimeMs }, state);
      });
    }
    case InputTag.EffectResult: {
      const payload = input.payload;
      return onRunning(hooks, ctx, before, (state) => effectResult(hooks, ctx, payload, state));
    }
    case InputTag.EvaluationResult:
      return onRunning(hooks, ctx, before, () => failed(FailureTag.Unsupported, "evaluation-result"));
  }
  return assertNever(input);
}
