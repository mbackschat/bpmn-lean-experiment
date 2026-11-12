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
  ValueTag,
  assertNever,
  elementScope,
  elementStart,
  programBoundary,
  programElement,
  triggerCondition,
  type ConditionTrigger,
  type Expression,
  type Subscription,
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
  ownScope,
  signal,
  type OpenItem,
  type Outcome,
  type Result,
  type ScopeOccurrenceId,
  type State,
  type WriteEvent,
} from "../../state.js";
import { EvaluationTag, evalContext, subscriptionOf, type Ctx } from "../../hooks.js";

/** `ownScope` of an open item: its host's own scope, else the item's scope. */
function homeScope(state: State, item: OpenItem): ScopeOccurrenceId {
  return item.attachedTo === null ? item.scope : ownScope(state, item.attachedTo, item.scope);
}

/**
 * A predicate's reading. An unknown variable or property makes it false where the read is reached, as CIB's
 * `UelExpressionCondition.tryEvaluate` swallows `PropertyNotFoundException` (`:57-67`); a non-Boolean result, `null`
 * included (`:51`), and any other failure roll the input back.
 */
export function predicateHolds(ctx: Ctx, state: State, scope: ScopeOccurrenceId, condition: Expression): Result<boolean> {
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
 * the offered write, `null` at arming, where no filter applies (`ConditionalEventDefinition.java:112-113`). The flag says
 * whether the item fired.
 */
function evaluateItem(
  ctx: Ctx, write: WriteEvent | null, item: OpenItem, condition: ConditionTrigger, state: State,
): Result<readonly [State, boolean]> {
  const detail = openKindView(item.kind).conditional;
  if (detail === null) return committed([state, false]);
  const value = predicateHolds(ctx, state, homeScope(state, item), condition.condition);
  if (!value.ok) return failedWith(value.failure);
  const fire = (current: State): State => signal(current, { tag: SignalTag.Fire, item: item.id, fired: { tag: FiredTag.Condition, write } });
  switch (ctx.program.options.conditionalRetrigger) {
    case ConditionalRetrigger.EachWrite:
      return committed(value.value ? [fire(state), true] : [state, false]);
    case ConditionalRetrigger.Edge: {
      const recorded: State = {
        ...state,
        openItems: state.openItems.map((open) =>
          open.id === item.id ? { ...open, kind: { tag: OpenKindTag.Conditional, detail: { ...detail, lastValue: value.value } } } : open),
      };
      return committed(value.value && detail.lastValue !== true ? [fire(recorded), true] : [recorded, false]);
    }
  }
  return assertNever(ctx.program.options.conditionalRetrigger);
}

/** What an item does once open: a Conditional one is evaluated at once. The flag says whether it fired. */
export function armed(ctx: Ctx, subscription: Subscription, item: OpenItem, state: State): Result<readonly [State, boolean]> {
  const condition = triggerCondition(subscription.trigger);
  return condition === null ? committed([state, false]) : evaluateItem(ctx, null, item, condition, state);
}

/**
 * Conditional items of which at most one may fire: the arms of one Event-Based Gateway occurrence, the interrupting
 * boundaries of one host occurrence, the interrupting Event Sub-Process starts of one scope occurrence. The first to fire
 * disarms the others.
 */
type Contest =
  | Readonly<{ tag: "gateway"; occurrence: number }>
  | Readonly<{ tag: "host"; occurrence: number }>
  | Readonly<{ tag: "scope"; scope: ScopeOccurrenceId }>;

/** The refusal of two items of one contest true at one evaluation. */
function contestCode(contest: Contest): string {
  switch (contest.tag) {
    case "gateway":
      return "gateway-arms-simultaneous";
    case "host":
    case "scope":
      return "conditions-simultaneous";
  }
  return assertNever(contest);
}

function sameContest(left: Contest, right: Contest): boolean {
  switch (left.tag) {
    case "gateway":
    case "host":
      return right.tag === left.tag && right.occurrence === left.occurrence;
    case "scope":
      return right.tag === "scope" && right.scope === left.scope;
  }
  return assertNever(left);
}

/** The contest an open item enters, `null` for an item no other item disarms by firing. */
function contestOf(ctx: Ctx, item: OpenItem): Contest | null {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) {
    return item.attachedTo !== null && boundary[1].interrupting ? { tag: "host", occurrence: item.attachedTo } : null;
  }
  if (item.attachedTo !== null) return { tag: "gateway", occurrence: item.attachedTo };
  const element = programElement(ctx.program, item.element);
  const start = element === null ? null : elementStart(element);
  const parent = start === null || start[0].parent === null ? null : programElement(ctx.program, start[0].parent);
  const scope = parent === null ? null : elementScope(parent);
  const interrupting = scope === null ? null : ctx.eventStart(scope[1])?.[1] ?? null;
  return item.passive && interrupting === true ? { tag: "scope", scope: item.scope } : null;
}

/**
 * Two items of one contest that fired at one evaluation (one arming, one offered write): which wins is a choice neither
 * BPMN (§13.4.4 gives simultaneous triggers no order) nor CIB (a `HashSet` of activities,
 * `EventBasedGatewayActivityBehavior.java:36-44`) makes, and the kernel takes no arming order for one, so it refuses the
 * input (FLOW-SPEC).
 */
export function requireOneWinner(ctx: Ctx, fired: readonly OpenItem[]): Result<null> {
  const contests = fired.flatMap((item) => {
    const contest = contestOf(ctx, item);
    return contest === null ? [] : [contest];
  });
  const repeated = contests.find((contest, index) => contests.slice(0, index).some((earlier) => sameContest(earlier, contest)));
  // dynamic-only: which Conditions hold at one evaluation is the run's data
  return repeated === undefined ? committed(null) : failed(FailureTag.Unsupported, contestCode(repeated));
}

/** The Conditional trigger of an open item's subscription, if it has one. */
function conditionOf(ctx: Ctx, item: OpenItem): ConditionTrigger | null {
  const subscription = subscriptionOf(ctx, item);
  return subscription === null ? null : triggerCondition(subscription.trigger);
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
    const fired: OpenItem[] = [];
    for (const [item, condition] of ordered) {
      const next = evaluateItem(ctx, write, item, condition, current);
      if (!next.ok) return failedWith(next.failure);
      [current] = next.value;
      if (next.value[1]) fired.push(item);
    }
    const winner = requireOneWinner(ctx, fired);
    if (!winner.ok) return failedWith(winner.failure);
  }
  return committed(current);
}
