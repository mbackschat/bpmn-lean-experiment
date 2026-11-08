/**
 * The single step function, transcribed from `Kernel/Step.lean`.
 *
 * Owns dispatch on element kind, event role, input kind and open-item kind, and the order in which hooks run: an
 * input's own transition first, then the closure that routes every token, oldest first, to the element at the end
 * of its flow, until no token is left. A closure that does not settle within `closureBound` steps is
 * `unsupported`, never silently truncated.
 */
import {
  ElementTag,
  EventRoleTag,
  assertNever,
  type Element,
  type ElementId,
  type FlowId,
  type Header,
  type Program,
  type StartPayload,
} from "./il/types.js";
import type { Arrival, Ctx, Hooks } from "./hooks.js";
import {
  CommandActionTag,
  FailureTag,
  InputTag,
  InstanceStatus,
  OpenKindTag,
  committed,
  failed,
  initial,
  type CommandInput,
  type Input,
  type OccurrenceRef,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type State,
  type Token,
} from "./state.js";

function headerOf(element: Element): Header {
  switch (element.tag) {
    case ElementTag.Activity:
      return element.header;
    case ElementTag.Scope:
      return element.header;
    case ElementTag.Event:
      return element.header;
    case ElementTag.Gateway:
      return element.header;
    case ElementTag.Start:
      return element.header;
  }
  return assertNever(element);
}

function elementOf(program: Program, id: ElementId): Element | undefined {
  return program.elements.find((element) => headerOf(element).id === id);
}

function targetOf(program: Program, flow: FlowId): ElementId | undefined {
  return program.flows.find((candidate) => candidate.id === flow)?.target;
}

/** Route one token to the element its flow targets. */
function arrive(hooks: Hooks, ctx: Ctx, token: Token, state: State): Outcome {
  const arrival: Arrival = { flow: token.flow, scope: token.scope };
  const targetId = targetOf(ctx.program, token.flow);
  const target = targetId === undefined ? undefined : elementOf(ctx.program, targetId);
  if (target === undefined) {
    return failed(FailureTag.SemanticFailure, "flow-without-target");
  }
  switch (target.tag) {
    case ElementTag.Activity:
      return hooks.arriveActivity(ctx, target.header, target.payload, arrival, state);
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

/** The instance completes when its root scope holds neither a token nor an open item. */
function finish(state: State): State {
  return state.tokens.length === 0 && state.openItems.length === 0
    ? { ...state, status: InstanceStatus.Completed }
    : state;
}

export const closureBound = 100_000;

function settle(hooks: Hooks, ctx: Ctx, bound: number, start: State): Outcome {
  let state = start;
  for (let fuel = bound; fuel > 0; fuel -= 1) {
    const [token, ...rest] = state.tokens;
    if (token === undefined) {
      return committed(finish(state));
    }
    const next = arrive(hooks, ctx, token, { ...state, tokens: rest });
    if (!next.ok) {
      return next;
    }
    state = next.value;
  }
  return failed(FailureTag.Unsupported, "closure-bound");
}

function rootStart(element: Element): readonly [Header, StartPayload] | undefined {
  switch (element.tag) {
    case ElementTag.Start:
      return element.header.parent === null ? [element.header, element.payload] : undefined;
    case ElementTag.Activity:
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
      return undefined;
  }
  return assertNever(element);
}

function startElement(
  program: Program,
  requested: ElementId | null,
): readonly [Header, StartPayload] | undefined {
  const starts = program.elements.flatMap((element) => {
    const start = rootStart(element);
    return start === undefined ? [] : [start];
  });
  if (requested !== null) {
    return starts.find((start) => start[0].id === requested);
  }
  const untriggered = starts.filter((start) => start[1].subscription === null);
  return untriggered.length === 1 ? untriggered[0] : undefined;
}

function isUserTask(kind: OpenKind): boolean {
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return true;
    case OpenKindTag.Receive:
    case OpenKindTag.Timer:
    case OpenKindTag.Subscription:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return false;
  }
  return assertNever(kind);
}

function userTask(state: State, occurrence: OccurrenceRef): OpenItem | undefined {
  return state.openItems.find(
    (item) =>
      item.element === occurrence.element && item.activation === occurrence.activation && isUserTask(item.kind),
  );
}

function command(hooks: Hooks, ctx: Ctx, input: CommandInput, state: State): Outcome {
  const action = input.action;
  switch (action.tag) {
    case CommandActionTag.CompleteUserTask: {
      const item = userTask(state, input.occurrence);
      if (item === undefined) {
        return failed(FailureTag.Rejected, "unknown-user-task");
      }
      const notActivity: Outcome = failed(FailureTag.SemanticFailure, "user-task-without-activity");
      const element = elementOf(ctx.program, item.element);
      if (element === undefined) {
        return notActivity;
      }
      switch (element.tag) {
        case ElementTag.Activity:
          return hooks.completeUserTask(ctx, element.header, element.payload, item, action.values, state);
        case ElementTag.Scope:
        case ElementTag.Event:
        case ElementTag.Gateway:
        case ElementTag.Start:
          return notActivity;
      }
      return assertNever(element);
    }
  }
  return assertNever(action.tag);
}

/** Run an input's transition on a running instance, then settle. */
function onRunning(
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

/** One input. `null` is the state before the instance starts; only a start applies to it. */
export function step(hooks: Hooks, program: Program, before: State | null, input: Input): Outcome {
  const ctx: Ctx = { program, evaluate: hooks.evaluate };
  switch (input.tag) {
    case InputTag.Start: {
      if (before !== null) {
        return failed(FailureTag.Rejected, "instance-already-started");
      }
      const start = startElement(program, input.payload.startEvent);
      if (start === undefined) {
        return failed(FailureTag.Rejected, "no-start-event");
      }
      const started = hooks.startProcess(
        ctx,
        start[0],
        start[1],
        initial(input.payload.instanceId, input.payload.variables),
      );
      return started.ok ? settle(hooks, ctx, closureBound, started.value) : started;
    }
    case InputTag.Command: {
      const payload = input.payload;
      return onRunning(hooks, ctx, before, (state) => command(hooks, ctx, payload, state));
    }
    case InputTag.Deliver:
      return onRunning(hooks, ctx, before, () => failed(FailureTag.Unsupported, "delivery"));
    case InputTag.TimerFire:
      return onRunning(hooks, ctx, before, () => failed(FailureTag.Unsupported, "timer-firing"));
    case InputTag.EffectResult:
      return onRunning(hooks, ctx, before, () => failed(FailureTag.Unsupported, "effect-result"));
    case InputTag.EvaluationResult:
      return onRunning(hooks, ctx, before, () => failed(FailureTag.Unsupported, "evaluation-result"));
  }
  return assertNever(input);
}
