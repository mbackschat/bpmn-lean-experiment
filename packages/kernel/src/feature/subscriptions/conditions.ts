/**
 * Subscriptions: Conditional Events, transcribed from `Kernel/Feature/Subscriptions/Conditions.lean`.
 *
 * A Conditional catch, boundary, Event Sub-Process start or Event-Based Gateway arm is evaluated when it is armed and
 * whenever a write is offered to it; it fires through a `Signal.fire`, so a firing that cancels another item first
 * leaves that item's pending firing nothing to fire. `feature/subscriptions.ts` arms and fires the items; this module
 * owns when they fire.
 */
import {
  ConditionalRetrigger,
  TriggerTag,
  ValueTag,
  assertNever,
  elementEvent,
  elementScope,
  elementStart,
  eventPayloadCatch,
  programBoundary,
  programElement,
  type ConditionTrigger,
  type Expression,
  type Subscription,
  type Trigger,
} from "../../il/types.js";
import {
  FailureTag,
  FiredTag,
  OpenKindTag,
  SignalTag,
  calledRoot,
  committed,
  failed,
  failedWith,
  openKindView,
  signal,
  type OpenItem,
  type Outcome,
  type Result,
  type ScopeOccurrenceId,
  type State,
  type WriteEvent,
} from "../../state.js";
import { EvaluationTag, evalContext, type Ctx } from "../../hooks.js";

/**
 * The scope occurrence a subscription attached to `host` reads from and lies in: the host's own local or child scope, so
 * its input-mapped locals are visible (`PvmExecutionImpl.java:1304-1318`), otherwise `scope`, the enclosing one. A called
 * instance's root belongs to the callee and is never the host's own.
 */
export function ownScope(state: State, host: number, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  const own = state.scopes.find((entry) => entry.occurrence === host && entry.calledInstance === null);
  return own === undefined ? scope : own.id;
}

/** `ownScope` of an open item: its host's own scope, else the item's scope. */
function homeScope(state: State, item: OpenItem): ScopeOccurrenceId {
  return item.attachedTo === null ? item.scope : ownScope(state, item.attachedTo, item.scope);
}

/**
 * A predicate's reading. An unknown variable or property makes it false where the read is reached, as CIB's
 * `UelExpressionCondition.tryEvaluate` swallows `PropertyNotFoundException` (`:57-67`); a non-Boolean result, `null`
 * included (`:51`), and any other failure roll the input back.
 */
function predicateHolds(ctx: Ctx, state: State, scope: ScopeOccurrenceId, condition: Expression): Result<boolean> {
  const evaluation = ctx.evaluate(evalContext(state, scope), condition);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return evaluation.result.tag === ValueTag.Bool
        ? committed(evaluation.result.value)
        : failed(FailureTag.RolledBack, "condition-not-boolean");
    case EvaluationTag.Failure:
      return evaluation.code === "unknown-variable" || evaluation.code === "juel.propertyNotFound"
        ? committed(false)
        : failed(FailureTag.RolledBack, evaluation.code);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
  }
  return assertNever(evaluation);
}

/**
 * Evaluate an open Conditional item and fire it when the profile's rule says so: under `eachWrite` whenever the
 * predicate holds, under `edge` only when it holds after an evaluation that did not, which the item records. `write` is
 * the offered write, `null` at arming, where no filter applies (`ConditionalEventDefinition.java:112-113`).
 */
function evaluateItem(ctx: Ctx, write: WriteEvent | null, item: OpenItem, condition: ConditionTrigger, state: State): Outcome {
  const detail = openKindView(item.kind).conditional;
  if (detail === null) return committed(state);
  const value = predicateHolds(ctx, state, homeScope(state, item), condition.condition);
  if (!value.ok) return failedWith(value.failure);
  const fire = (current: State): State => signal(current, { tag: SignalTag.Fire, item: item.id, fired: { tag: FiredTag.Condition, write } });
  switch (ctx.program.options.conditionalRetrigger) {
    case ConditionalRetrigger.EachWrite:
      return committed(value.value ? fire(state) : state);
    case ConditionalRetrigger.Edge: {
      const recorded: State = {
        ...state,
        openItems: state.openItems.map((open) =>
          open.id === item.id ? { ...open, kind: { tag: OpenKindTag.Conditional, detail: { ...detail, lastValue: value.value } } } : open),
      };
      return committed(value.value && detail.lastValue !== true ? fire(recorded) : recorded);
    }
  }
  return assertNever(ctx.program.options.conditionalRetrigger);
}

/** The Conditional trigger a subscription waits for, if it is one. */
function conditionTrigger(trigger: Trigger): ConditionTrigger | null {
  switch (trigger.tag) {
    case TriggerTag.Condition:
      return trigger.payload;
    case TriggerTag.Timer:
    case TriggerTag.Message:
    case TriggerTag.Signal:
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return null;
  }
  return assertNever(trigger);
}

/** What an item does once open: a Conditional one is evaluated at once. */
export function armed(ctx: Ctx, subscription: Subscription, item: OpenItem, state: State): Outcome {
  const condition = conditionTrigger(subscription.trigger);
  return condition === null ? committed(state) : evaluateItem(ctx, null, item, condition, state);
}

/**
 * The subscription an open item belongs to: a boundary's, a catch Event's or an Event Sub-Process start's; an
 * Activity's own subscription (a Receive Task) is the work feature's.
 */
export function subscriptionOf(ctx: Ctx, item: OpenItem): Subscription | null {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) return boundary[1].subscription;
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const catchEvent = event === null ? null : eventPayloadCatch(event[1]);
  if (catchEvent !== null) return catchEvent;
  const start = element === null ? null : elementStart(element);
  const parent = start === null || start[0].parent === null ? null : programElement(ctx.program, start[0].parent);
  const scope = parent === null ? null : elementScope(parent);
  return (scope === null ? null : ctx.eventStart(scope[1]))?.[0] ?? null;
}

/** The Conditional trigger of an open item's subscription, if it has one. */
function conditionOf(ctx: Ctx, item: OpenItem): ConditionTrigger | null {
  const subscription = subscriptionOf(ctx, item);
  return subscription === null ? null : conditionTrigger(subscription.trigger);
}

/** Whether a write passes a Conditional item's `camunda:variableName` and `camunda:variableEvents` filters. */
function passes(condition: ConditionTrigger, write: WriteEvent): boolean {
  return (condition.variableName === null || condition.variableName === write.name) &&
    (condition.variableEvents.length === 0 || condition.variableEvents.includes(write.kind));
}

/**
 * Whether `scope` lies in `owner`'s subtree, no called instance's root between them: CIB offers a write to the
 * subscriptions under the scope that owns the variable (`VariableListenerInvocationListener.java:75-80`), whatever
 * shadows it there, and a called instance has its own variables.
 */
function inSubtree(state: State, owner: ScopeOccurrenceId, scope: ScopeOccurrenceId): boolean {
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    if (current === owner) return true;
    if (calledRoot(state, current)) return false;
    const at: ScopeOccurrenceId = current;
    current = state.scopes.find((entry) => entry.id === at)?.parent ?? null;
  }
  return false;
}

/** How deep an item's subscription sits: an Event Sub-Process start on its scope, any other item one level below. */
function depth(state: State, item: OpenItem): number {
  let levels = item.passive ? 0 : 1;
  let current: ScopeOccurrenceId = item.scope;
  for (let fuel = state.scopes.length; fuel > 0; fuel -= 1) {
    const at: ScopeOccurrenceId = current;
    const parent = state.scopes.find((entry) => entry.id === at)?.parent ?? null;
    if (parent === null) break;
    current = parent;
    levels += 1;
  }
  return levels;
}

/**
 * `Hooks.written`: offer each write, in order, to the open Conditional items in the subtree of the scope that owns the
 * variable whose filters it passes, outermost first and then in opening order, CIB's top-down walk
 * (`ExecutionEntity.java:1731-1755`).
 */
export function offerWrites(ctx: Ctx, writes: readonly WriteEvent[], state: State): Outcome {
  let current = state;
  for (const write of writes) {
    const offered = current.openItems.flatMap((item): Array<readonly [OpenItem, ConditionTrigger]> => {
      const condition = conditionOf(ctx, item);
      return condition !== null && passes(condition, write) && inSubtree(current, write.scope, homeScope(current, item))
        ? [[item, condition]]
        : [];
    });
    const at = current;
    const ordered = [...offered].sort(([left], [right]) => depth(at, left) - depth(at, right) || left.id - right.id);
    for (const [item, condition] of ordered) {
      const next = evaluateItem(ctx, write, item, condition, current);
      if (!next.ok) return next;
      current = next.value;
    }
  }
  return committed(current);
}
