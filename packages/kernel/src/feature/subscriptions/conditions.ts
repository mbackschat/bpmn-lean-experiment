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
  elementEnvelope,
  elementHeader,
  elementScope,
  elementStart,
  programBoundary,
  programElement,
  programPublicId,
  triggerCondition,
  type ConditionTrigger,
  type ElementId,
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
  disarm,
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
import { EvaluationTag, evalContext, subscriptionOf, withdrawInside, withdrawOccurrence, type Ctx } from "../../hooks.js";

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
  const evaluation = ctx.evaluate(evalContext(state, ctx.program, scope), condition);
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
 * Evaluate an open Conditional item: under `eachWrite` it fires whenever the predicate holds, under `edge` only when it
 * holds after an evaluation that did not, which the item records. The flag says whether the item fires; its firing is
 * enqueued once the evaluation's contests are resolved (`resolveContests`).
 */
export function evaluateItem(ctx: Ctx, item: OpenItem, condition: ConditionTrigger, state: State): Result<readonly [State, boolean]> {
  const detail = openKindView(item.kind).conditional;
  if (detail === null) return committed([state, false]);
  const value = predicateHolds(ctx, state, homeScope(state, item), condition.condition);
  if (!value.ok) return failedWith(value.failure);
  switch (ctx.program.options.conditionalRetrigger) {
    case ConditionalRetrigger.EachWrite:
      return committed([state, value.value]);
    case ConditionalRetrigger.Edge: {
      const recorded: State = {
        ...state,
        openItems: state.openItems.map((open) =>
          open.id === item.id ? { ...open, kind: { tag: OpenKindTag.Conditional, detail: { ...detail, lastValue: value.value } } } : open),
      };
      return committed([recorded, value.value && detail.lastValue !== true]);
    }
  }
  return assertNever(ctx.program.options.conditionalRetrigger);
}

/**
 * What an item does once open: a Conditional one is evaluated at once, where no filter applies
 * (`ConditionalEventDefinition.java:112-113`). The flag says whether it fires.
 */
export function armed(ctx: Ctx, subscription: Subscription, item: OpenItem, state: State): Result<readonly [State, boolean]> {
  const condition = triggerCondition(subscription.trigger);
  return condition === null ? committed([state, false]) : evaluateItem(ctx, item, condition, state);
}

/**
 * Enqueue the firing of each of `items`, in order, for the offered write `write` (`null` at arming). A firing goes
 * through `Signal.fire`, so one that an earlier firing withdrew finds nothing to fire.
 */
export function fireAll(write: WriteEvent | null, items: readonly OpenItem[], state: State): State {
  return items.reduce((current, item) => signal(current, { tag: SignalTag.Fire, item: item.id, fired: { tag: FiredTag.Condition, write } }), state);
}

/**
 * What firing `item` withdraws at once, the same removal its firing makes (`fireBoundary`, `fireCatch`,
 * `fireEventStart`): an interrupting boundary whatever its host's cancellation removes, its host's other boundaries and
 * everything inside the host; an Event-Based Gateway arm its gateway's arms; an interrupting Event Sub-Process start
 * everything inside its scope occurrence. `null` for an item whose firing withdraws nothing else: a non-interrupting
 * boundary or start, or a catch Event.
 */
function withdrawal(ctx: Ctx, item: OpenItem): ((state: State) => State) | null {
  const boundary = programBoundary(ctx.program, item.element);
  const host = item.attachedTo;
  if (boundary !== null) return host !== null && boundary[1].interrupting ? (state) => withdrawOccurrence(state, host) : null;
  if (host !== null) return (state) => disarm(state, host);
  const element = programElement(ctx.program, item.element);
  const start = element === null ? null : elementStart(element);
  const parent = start === null || start[0].parent === null ? null : programElement(ctx.program, start[0].parent);
  const scope = parent === null ? null : elementScope(parent);
  const interrupting = scope === null ? null : ctx.eventStart(scope[1])?.[1] ?? null;
  return item.passive && interrupting === true ? (state) => withdrawInside(state, item.scope) : null;
}

/** The open items other than `item` that firing `item` would withdraw from `state`, by identity. */
function withdrawnBy(ctx: Ctx, state: State, item: OpenItem): readonly number[] {
  const withdraw = withdrawal(ctx, item);
  if (withdraw === null) return [];
  const kept = withdraw(state).openItems.map((open) => open.id);
  return state.openItems.filter((open) => open.id !== item.id && !kept.includes(open.id)).map((open) => open.id);
}

/** The refusal of a contest the ranking leaves undecided: the Event-Based Gateway code when it holds an arm. */
function contestCode(ctx: Ctx, contest: readonly OpenItem[]): string {
  return contest.some((item) => item.attachedTo !== null && programBoundary(ctx.program, item.element) === null)
    ? "gateway-arms-simultaneous"
    : "conditions-simultaneous";
}

/** The contest of an item: the items of `fired` connected to `members` by `linked`, in evaluation order. */
function contestOf(
  linked: (left: OpenItem, right: OpenItem) => boolean, fired: readonly OpenItem[], fuel: number, members: readonly OpenItem[],
): readonly OpenItem[] {
  let current = members;
  for (let left = fuel; left > 0; left -= 1) {
    const grown = fired.filter((item) => current.some((member) => member.id === item.id || linked(member, item)));
    if (grown.length === current.length) return current;
    current = grown;
  }
  return current;
}

/**
 * The firings of one contest (SUBSCRIPTIONS-SPEC "Conditions", CIB-LIM-0053): the members whose interrupting firing an
 * earlier write of the micro-step already enqueued (`pending`) first, then, entry by entry of the input's ranking, every
 * live member whose element the entry names, a firing withdrawing what it cancels. The contest is decided when every
 * member fired or was withdrawn; otherwise, or when two members one entry names withdraw one another, no order the
 * kernel may take separates them and the input is `unsupported`.
 */
function walk(
  ctx: Ctx, withdraws: (member: OpenItem, other: OpenItem) => boolean, pending: readonly OpenItem[], contest: readonly OpenItem[],
): Result<readonly OpenItem[]> {
  let live = contest;
  const firings: OpenItem[] = [];
  const fire = (member: OpenItem): void => {
    live = live.filter((other) => other.id !== member.id && !withdraws(member, other));
    firings.push(member);
  };
  for (const member of pending) if (live.some((other) => other.id === member.id)) fire(member);
  for (const choice of ctx.conditionChoices) {
    const listed = live.filter((member) => programPublicId(ctx.program, member.element) === choice.element);
    // dynamic-only: which Conditions hold at one evaluation is the run's data
    if (listed.some((member) => listed.some((other) => withdraws(member, other)))) return failed(FailureTag.Unsupported, contestCode(ctx, contest));
    for (const member of listed) fire(member);
  }
  // dynamic-only: which Conditions hold at one evaluation is the run's data
  return live.length === 0 ? committed(firings) : failed(FailureTag.Unsupported, contestCode(ctx, contest));
}

/**
 * The firings of one evaluation (one arming, or one offered write) in order. Of `fired`, the items it found true in
 * evaluation order, two compete when firing one withdraws the other (`withdrawnBy`), and a contest is a connected set of
 * competing items: which fires and in which order is a choice neither BPMN (§13.4.4 gives simultaneous triggers no
 * order) nor CIB (CIB-LIM-0053) makes, so the input's ranking decides it (`walk`) and the kernel takes none. An
 * uncontested item fires at its place in evaluation order, a contest at the place of its first member.
 */
export function resolveContests(
  ctx: Ctx, state: State, pending: readonly OpenItem[], fired: readonly OpenItem[],
): Result<readonly OpenItem[]> {
  const takes = new Map(fired.map((item) => [item.id, withdrawnBy(ctx, state, item)] as const));
  const withdraws = (member: OpenItem, other: OpenItem): boolean => (takes.get(member.id) ?? []).includes(other.id);
  const firings: OpenItem[] = [];
  const handled: number[] = [];
  for (const item of fired) {
    if (handled.includes(item.id)) continue;
    const contest = contestOf((left, right) => withdraws(left, right) || withdraws(right, left), fired, fired.length, [item]);
    if (contest.length === 1) {
      firings.push(item);
      handled.push(item.id);
      continue;
    }
    const walked = walk(ctx, withdraws, pending, contest);
    if (!walked.ok) return walked;
    firings.push(...walked.value);
    handled.push(...contest.map((member) => member.id));
  }
  return committed(firings);
}

/** The Conditional trigger of the element `id`'s subscription, if it has one. */
function conditionOfElement(ctx: Ctx, id: ElementId): ConditionTrigger | null {
  const subscription = subscriptionOf(ctx, id);
  return subscription === null ? null : triggerCondition(subscription.trigger);
}

/** The Conditional trigger of an open item's subscription, if it has one. */
export function conditionOf(ctx: Ctx, item: OpenItem): ConditionTrigger | null {
  return conditionOfElement(ctx, item.element);
}

/**
 * `Hooks.competes`: whether some element or boundary whose public identity is `element` opens a Conditional item, a
 * catch, an Event-Based Gateway arm, a boundary or an Event Sub-Process start, interrupting or not.
 */
export function competes(ctx: Ctx, element: ElementId): boolean {
  return ctx.program.elements.some((declared) =>
    [elementHeader(declared).id, ...(elementEnvelope(declared)?.boundaries.map((boundary) => boundary.id) ?? [])].some((id) =>
      programPublicId(ctx.program, id) === element && conditionOfElement(ctx, id) !== null));
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
 * (`ExecutionEntity.java:1731-1755`), and fire what each write's contests resolve to. All writes of a micro-step land
 * before they are offered, so a later write can find true again an item whose interrupting firing an earlier one
 * enqueued: that firing runs first and decides the later write's contest, as the explicit write order makes it do.
 */
export function offerWrites(ctx: Ctx, writes: readonly WriteEvent[], state: State): Outcome {
  let current = state;
  const pending: OpenItem[] = [];
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
      const next = evaluateItem(ctx, item, condition, current);
      if (!next.ok) return failedWith(next.failure);
      [current] = next.value;
      if (next.value[1]) fired.push(item);
    }
    const firings = resolveContests(ctx, current, pending, fired);
    if (!firings.ok) return failedWith(firings.failure);
    current = fireAll(write, firings.value, current);
    pending.push(...firings.value.filter((item) => withdrawal(ctx, item) !== null));
  }
  return committed(current);
}
