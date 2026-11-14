/**
 * Order invariance of concurrent branches and instances, transcribed from `Kernel/Admission/Flow/Concurrency.lean`.
 * Under `BranchSchedule.orderInvariant` a closure takes its queued tokens first in, first out, and BPMN 2.0.2 lets the
 * branches of a split and the instances of a parallel Multi-Instance Activity interleave in any order (Table 13.1,
 * §13.3.1, §13.3.7). These checks compare the closures `admission/flow/closure.ts` `closureWalk` finds for them and refuse a
 * model whose committed result would depend on that order: `flow.concurrentWrite` and `flow.concurrentInterference`
 * for a split's branches and for the units one element's run fans out to (`fanOutConflict`), and the `races`
 * `admission/multi-instance.ts` `concurrentInstances` reads for instances.
 */
import {
  BranchSchedule,
  ConditionalRetrigger,
  assertNever,
  definitionRefEquals,
  elementBeginsImplicitly,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementIsCompensationActivity,
  elementOutgoing,
  elementScope,
  elementStart,
  eventPayloadThrow,
  firstOf,
  programBoundary,
  programChildren,
  programElement,
  programInCalledProcess,
  programProcessOf,
  programSiblings,
  scopeKindStart,
  throwView,
  triggerCondition,
  type CalledProcess,
  type Element,
  type ElementId,
  type Flow,
  type FlowId,
  type Header,
  type Program,
} from "../../il/types.js";
import { expressionReads, joined, meets, races, type NameSet } from "../../il/footprint.js";
import { flowReaches } from "../../il/paths.js";
import {
  VisitTag,
  anchors,
  ancestors,
  beyond,
  callers,
  catchers,
  catching,
  closureWalk,
  conditional,
  conditionalCatches,
  handler,
  handlersOf,
  interruption,
  onwardVisits,
  reaches,
  removal,
  runs,
  signalled,
  subjectsOf,
  toEnter,
  visitKey,
  visitSubscription,
  type Closure,
  type Reading,
  type Visit,
  type Walk,
  type Withdrawal,
} from "./closure.js";
import { awaitsStimulus, branchStop, enteredChildren, flowTargets, leaving, routing } from "../flow.js";

/** The closure a token on `start` runs in: the work it reaches, stopping where it waits or joins. */
const branchClosure = (reading: Reading, program: Program, start: FlowId): Closure =>
  closureWalk(reading, program, { stop: branchStop, ascends: false }, flowTargets(program, [start]).map(toEnter));

/** The closure the resumptions in `wakes` run in, which one Signal broadcast may start together. */
const wakeClosure = (reading: Reading, program: Program, wakes: readonly Visit[]): Closure =>
  closureWalk(reading, program, { stop: branchStop, ascends: false }, wakes);

/** Whether `withdrawal` removes the element `id`: `id` lies in its region, or in a called process a Call in it calls. */
function removesElement(program: Program, withdrawal: Withdrawal, fuel: number, id: ElementId): boolean {
  if (fuel === 0) return false;
  if (withdrawal.everything) return true;
  const element = programElement(program, id);
  if (element === null) return false;
  const enclosing = ancestors(program, elementHeader(element).parent);
  const top = enclosing.at(-1) ?? element;
  const processOf = (header: Header): CalledProcess | null => programProcessOf(program, header);
  let inside: boolean;
  if (withdrawal.root !== null) {
    const root = withdrawal.root;
    inside = (withdrawal.inclusive && id === root) || enclosing.some((candidate) => elementHeader(candidate).id === root);
  } else {
    const source = programElement(program, withdrawal.source);
    const own = source === null ? undefined : processOf(elementHeader(source));
    const there = processOf(elementHeader(top));
    inside = own !== undefined && (own === null || there === null ? own === there : definitionRefEquals(own.definition, there.definition));
  }
  const process = processOf(elementHeader(top));
  return inside ||
    (process !== null && callers(program, process).some((call) => removesElement(program, withdrawal, fuel - 1, elementHeader(call).id)));
}

/**
 * Whether `own` acts on work `other` begins or completes, so their order decides what is left: it removes a region
 * holding an element `other` begins, resumes a Signal subscription `other` opens, or compensates an Activity `other`
 * completes.
 */
function interferes(program: Program, own: Closure, other: Closure): boolean {
  return own.withdraws.some((withdrawal) => other.begun.some((id) => removesElement(program, withdrawal, program.elements.length + 1, id))) ||
    own.resumes.some((id) => other.begun.includes(id)) || own.compensates.some((id) => other.completed.includes(id));
}

/**
 * What two closures that may run in either order would answer differently: a name one writes and the other reads or
 * writes (`flow.concurrentWrite`), or work one acts on that the other begins or completes
 * (`flow.concurrentInterference`).
 */
function conflict(program: Program, own: Closure, other: Closure): string | null {
  if (races(own.footprint, other.footprint)) return "flow.concurrentWrite";
  return interferes(program, own, other) || interferes(program, other, own) ? "flow.concurrentInterference" : null;
}

/**
 * Under `BranchSchedule.orderInvariant`, the branches of a split may not conflict (`conflict`) in the closure that
 * begins them, nor in the one a later Signal broadcast starts by resuming a subscription each branch left open, which it
 * resumes in the order this closure opened them: BPMN 2.0.2 lets concurrent branches interleave in any order (Table
 * 13.1, §13.3.1), so a value, a removal, a resumption or a record would depend on the closure's order, which no input
 * states (issue #81). CIB runs the first-declared branch first (CIB-OP-0016), the profile option
 * `declarationDepthFirst` (PC-BASIC-03). A split is a Parallel or Inclusive Gateway, or any element or Boundary Event
 * with several outgoing flows. A forward-compatible restriction, and a conservative one: a branch counts what its
 * elements write (`Reading.writes`), what the catchers, handlers and Signal and Conditional catches it may resume in
 * the closure do, and a loop that may run no instance as completing (issue #99); a Call's output mappings count as
 * written even when the called instance waits, and a JUEL text as reading every name; any raise may meet any catcher
 * around it, any Signal throw any Signal subscription and any Compensation throw any record in its Scope; a later
 * profile may take the interleaving as a choice input instead. Not counted: what an element it stops at evaluates
 * besides its input mappings and Multi-Instance definition.
 */
export function concurrentBranches(reading: Reading, program: Program, flow: Flow): string | null {
  switch (program.options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return null;
    case BranchSchedule.OrderInvariant: {
      const source = programElement(program, flow.source);
      const gateway = source === null ? null : elementGateway(source);
      if (gateway !== null && !routing(gateway[1]).concurrent) return null;
      const own = branchClosure(reading, program, flow.id);
      const others = leaving(program, flow.source).filter((other) => other !== flow.id).map((other) => branchClosure(reading, program, other));
      for (const other of others) {
        const found = conflict(program, own, other);
        if (found !== null) return found;
      }
      if (own.wakes.length === 0) return null;
      const ownWake = wakeClosure(reading, program, own.wakes);
      for (const other of others) {
        if (other.wakes.length === 0) continue;
        const found = conflict(program, ownWake, wakeClosure(reading, program, other.wakes));
        if (found !== null) return found;
      }
      return null;
    }
  }
  return assertNever(program.options.branchSchedule);
}

// Fan-outs of one element's run.
//
// Besides a split's branches and a loop's instances, one element's run may queue several units of work that the
// closure then runs in an order no input states: the resumptions a Signal throw fires beside its thrower's continuation,
// the catcher of an intermediate or end Escalation beside its thrower, the Conditional items a write makes true beside
// its writer, and the compensation handlers one trigger begins together. One check per mechanism compares the units with
// `conflict`; a unit is the closure walk from where it starts, and a continuation ascends, since a token that ends its
// Scope lets the Scope complete beside the other units (`step.ts` `settle` completes idle scopes only after every signal
// and token).

/** The first conflict (`conflict`) between two of `units`, each against every later one. */
function firstConflict(program: Program, units: readonly Closure[]): string | null {
  for (const [index, unit] of units.entries()) {
    for (const other of units.slice(index + 1)) {
      const found = conflict(program, unit, other);
      if (found !== null) return found;
    }
  }
  return null;
}

/** The element a resumption's subscription hangs on: a catch, a boundary's host, an Event Sub-Process. */
function anchorOf(program: Program, visit: Visit): Element | null {
  switch (visit.tag) {
    case VisitTag.Completes:
    case VisitTag.Enters:
      return visit.element;
    case VisitTag.Fires:
      return programBoundary(program, visit.boundary.id)?.[0] ?? null;
    case VisitTag.Passes:
      return null;
  }
  return assertNever(visit);
}

/**
 * Whether a level, the children of a Scope or the elements of a process level, may hold two tokens at once: two starts
 * or implicitly begun children, a split (a concurrent Gateway or any other element or boundary with several outgoing
 * flows), a boundary that does not interrupt, an Event Sub-Process that does not interrupt, or a compensation handler,
 * which a throw may begin beside others. With `alongFlows` only tokens that move along the level's Sequence Flows count,
 * so a handler, which has none (`compensation.handlerFlow`), and a boundary without an outgoing flow, such as a
 * Compensation boundary, add none.
 */
function concurrentLevel(reading: Reading, alongFlows: boolean, level: readonly Element[]): boolean {
  const starts = level.filter((element) => elementStart(element) !== null).length;
  return starts >= 2 || (starts === 0 && level.filter(elementBeginsImplicitly).length >= 2) || level.some((element) => {
    const gateway = elementGateway(element);
    const scope = elementScope(element);
    return (!alongFlows && elementIsCompensationActivity(element)) ||
      (gateway !== null && routing(gateway[1]).concurrent && gateway[1].outgoing.length >= 2) ||
      (gateway === null && elementOutgoing(element).length >= 2) ||
      (elementEnvelope(element)?.boundaries ?? []).some((attached) =>
        (!attached.interrupting && !(alongFlows && attached.outgoing.length === 0)) || attached.outgoing.length >= 2) ||
      (scope !== null && scopeKindStart(scope[1].kind) !== null && !reading.interrupts(element) && !(alongFlows && handler(reading, element)));
  });
}

/**
 * Whether at most one token moves through `element`'s level at a time and the level is entered at most once at a time:
 * that level and every level around it hold no concurrency (`concurrentLevel`), no Scope around it loops, and its process
 * is the root process, which no Call calls.
 */
function solitary(reading: Reading, program: Program, element: Element): boolean {
  const enclosing = ancestors(program, elementHeader(element).parent);
  const top = enclosing.at(-1) ?? element;
  return !programInCalledProcess(program, elementHeader(top).id) && !concurrentLevel(reading, false, programSiblings(program, elementHeader(top))) &&
    enclosing.every((scope) => (elementEnvelope(scope)?.multiInstance ?? null) === null &&
      !concurrentLevel(reading, false, programChildren(program, elementHeader(scope).id)));
}

/**
 * Whether `element`'s level is entered once per process instance and moves one token at a time along its flows, so its
 * occurrences complete one after another along that token's path: that level and every level around it move no two
 * tokens at once along their flows (`concurrentLevel`), no Scope around it loops, is a compensation handler, begun once
 * per record, or may be entered again (`reaches` from it or its boundary Events back to it), and its process is the root
 * process, which no Call calls.
 */
function runsOnce(reading: Reading, program: Program, element: Element): boolean {
  const enclosing = ancestors(program, elementHeader(element).parent);
  const top = enclosing.at(-1) ?? element;
  const boundariesOf = (scope: Element): ElementId[] => (elementEnvelope(scope)?.boundaries ?? []).map((attached) => attached.id);
  return !programInCalledProcess(program, elementHeader(top).id) && !concurrentLevel(reading, true, programSiblings(program, elementHeader(top))) &&
    enclosing.every((scope) => (elementEnvelope(scope)?.multiInstance ?? null) === null && !handler(reading, scope) &&
      !reaches(program, [elementHeader(scope).id, ...boundariesOf(scope)], elementHeader(scope).id) &&
      !concurrentLevel(reading, true, programChildren(program, elementHeader(scope).id)));
}

/**
 * The elements whose occurrences tell apart two open occurrences of the subscription a resumption fires, which one throw
 * or write may resume together: the Scope its anchor lies in, or at a called process's level its Calls; none for a
 * solitary anchor (`solitary`), whose level is entered once at a time, and none at the root process's level, whose
 * subscriptions are open once.
 */
function holders(reading: Reading, program: Program, visit: Visit): ElementId[] {
  const anchor = anchorOf(program, visit);
  if (anchor === null || solitary(reading, program, anchor)) return [];
  const header = elementHeader(anchor);
  if (header.parent !== null) return [header.parent];
  const process = programProcessOf(program, header);
  return process === null ? [] : callers(program, process).map((call) => elementHeader(call).id);
}

/**
 * Whether the subscription `visit` resumes cannot be open while `thrower` runs: its catch, or its boundary's host, lies
 * in a solitary level (`solitary`) whose one token is at the thrower or at another element holding it. An Event
 * Sub-Process start stays open while its scope occurrence lives, so it is never excluded.
 */
function closedAt(reading: Reading, program: Program, thrower: Element, visit: Visit): boolean {
  const held = visit.tag === VisitTag.Enters ? null : anchorOf(program, visit);
  if (held === null || !solitary(reading, program, held)) return false;
  const heldHeader = elementHeader(held);
  const heldProcess = programProcessOf(program, heldHeader);
  const sameLevel = (holder: Element): boolean => {
    const header = elementHeader(holder);
    const process = programProcessOf(program, header);
    return header.parent === heldHeader.parent &&
      (process === null || heldProcess === null ? process === heldProcess : definitionRefEquals(process.definition, heldProcess.definition));
  };
  return [thrower, ...ancestors(program, elementHeader(thrower).parent)].some((holder) =>
    sameLevel(holder) && elementHeader(holder).id !== heldHeader.id);
}

/**
 * What a resumption's first visit removes, as a queued signal that runs before any token moves: an interrupting
 * boundary's host or an interrupting Event Sub-Process's Scope. What its path removes later is not this.
 */
function firstWithdrawals(reading: Reading, program: Program, visit: Visit): Withdrawal[] {
  switch (visit.tag) {
    case VisitTag.Fires:
      return interruption(program, visit.boundary);
    case VisitTag.Enters:
      return removal(reading, visit.element);
    case VisitTag.Completes:
    case VisitTag.Passes:
      return [];
  }
  return assertNever(visit);
}

/**
 * Whether a resumption's first visit removes `element` together with the level its token goes on in, so the
 * continuation never moves beside the resumption: the removal reaches `element` and is not an interruption of `element`
 * itself, whose outflow lies outside it.
 */
function preempts(reading: Reading, program: Program, visit: Visit, element: Element): boolean {
  const id = elementHeader(element).id;
  return firstWithdrawals(reading, program, visit).some((withdrawal) =>
    withdrawal.root !== id && removesElement(program, withdrawal, program.elements.length + 1, id));
}

/**
 * A resumption against itself, when its subscription may be open twice at once (`holders`): one occurrence's path may
 * not write a name, nor remove an element holding the other occurrence.
 */
function againstItself(reading: Reading, program: Program, visit: Visit, wake: Closure): string | null {
  const held = holders(reading, program, visit);
  if (held.length === 0) return null;
  if (races(wake.footprint, wake.footprint)) return "flow.concurrentWrite";
  return wake.withdraws.some((withdrawal) => held.some((id) => removesElement(program, withdrawal, program.elements.length + 1, id)))
    ? "flow.concurrentInterference"
    : null;
}

/** The walk of a resumption's or catcher's path: a branch's, stopping where it waits or joins. */
const pathOf = (reading: Reading, program: Program, begun: readonly Visit[]): Closure =>
  closureWalk(reading, program, { stop: branchStop, ascends: false }, begun);

/**
 * What a token leaving `element` runs next in its closure: its flows and, ascending, the completion of the Scope or
 * called process its token may end (review change 4: `step.ts` `settle` completes an idle scope only after every signal
 * and token, so that completion goes on beside the other units).
 */
function continuation(reading: Reading, program: Program, element: Element): Closure {
  const walk: Walk = { stop: branchStop, ascends: true };
  return closureWalk(reading, program, walk, onwardVisits(reading, program, walk, element));
}

/**
 * Under `BranchSchedule.OrderInvariant`, the work one Signal throw starts in its closure may not conflict (`conflict`):
 * its thrower's continuation and the resumption of every Signal subscription it may resume, any of the program as
 * `admission/flow/closure.ts` `beyond` counts, which the closure runs in arming order, an order no input states (BPMN 2.0.2
 * §10.5.1 lets one Signal reach every catcher; issue #81). A resumption whose first visit removes the thrower
 * (`preempts`) is not held against the continuation: that removal is a queued signal, which runs before any token the
 * thrower's completion emits, whatever the schedule. A resumption that cannot be open while the thrower runs
 * (`closedAt`) is dropped, and one whose subscription may be open twice at once is held against itself (`againstItself`).
 */
function signalFanOut(reading: Reading, program: Program, element: Element): string | null {
  const event = elementEvent(element);
  const thrown = event === null ? null : eventPayloadThrow(event[1]);
  if (thrown === null || throwView(thrown).signal === null) return null;
  const wakes = program.elements.flatMap((other) => catching(signalled, other))
    .filter((visit) => !closedAt(reading, program, element, visit))
    .map((visit) => [visit, pathOf(reading, program, [visit])] as const);
  const own = continuation(reading, program, element);
  return firstOf(wakes.filter(([visit]) => !preempts(reading, program, visit, element)), ([, wake]) => conflict(program, own, wake)) ??
    firstConflict(program, wakes.map(([, wake]) => wake)) ??
    firstOf(wakes, ([visit, wake]) => againstItself(reading, program, visit, wake));
}

/**
 * Under `BranchSchedule.OrderInvariant`, an Escalation thrower's continuation may not conflict with what a catcher that
 * does not interrupt it runs: BPMN 2.0.2 §10.5.1 continues the thrower, an End Event's Scope included, while the
 * catcher's path runs, in an order no input states (issue #81).
 */
function escalationFanOut(reading: Reading, program: Program, element: Element): string | null {
  if (!reading.escalates(element)) return null;
  const beside = catchers(reading, program, element, program.elements.length + 1).filter((visit) => {
    switch (visit.tag) {
      case VisitTag.Fires:
        return !visit.boundary.interrupting;
      case VisitTag.Enters:
        return !reading.interrupts(visit.element);
      case VisitTag.Completes:
      case VisitTag.Passes:
        return false;
    }
    return assertNever(visit);
  });
  return beside.length === 0 ? null : conflict(program, continuation(reading, program, element), pathOf(reading, program, beside));
}

/**
 * Whether a write of `written` may make true the Conditional subscription `visit` resumes: under
 * `ConditionalRetrigger.Edge` only a write of a name its condition reads can turn it true (BPMN 2.0.2 Tables 10.89,
 * 10.90); under `EachWrite` every write its filters pass fires it while it holds (CIB-EXT-0035).
 */
function mayMakeTrue(program: Program, written: NameSet, visit: Visit): boolean {
  const subscription = visitSubscription(visit);
  const trigger = subscription === null ? null : triggerCondition(subscription.trigger);
  return trigger !== null && (trigger.variableName === null || written.all || written.names.includes(trigger.variableName)) &&
    (program.options.conditionalRetrigger === ConditionalRetrigger.EachWrite || meets(expressionReads(trigger.condition), written));
}

/**
 * Whether two Conditional resumptions are one contest, whose order the input's ranking decides
 * (`feature/subscriptions/conditions.ts` `resolveContests`, CIB-LIM-0053): one's first visit removes the other's anchor,
 * or both are arms of one Event-Based Gateway.
 */
function contested(reading: Reading, program: Program, left: Visit, right: Visit): boolean {
  const removes = (first: Visit, second: Visit): boolean => {
    const anchor = anchorOf(program, second);
    return anchor !== null && firstWithdrawals(reading, program, first).some((withdrawal) =>
      removesElement(program, withdrawal, program.elements.length + 1, elementHeader(anchor).id));
  };
  const rightAnchors = anchors(program, right);
  return removes(left, right) || removes(right, left) || anchors(program, left).some((id) => {
    const gateway = rightAnchors.includes(id) ? programElement(program, id) : null;
    const payload = gateway === null ? null : elementGateway(gateway);
    return payload !== null && routing(payload[1]).waits;
  });
}

/**
 * Under `BranchSchedule.OrderInvariant`, a write's Conditional firings may not conflict with the writer's continuation
 * nor with each other: `feature/subscriptions/conditions.ts` `offerWrites` queues the firings of the items one write
 * makes true after the writer's completion, each contest at its first member's place in evaluation order, an order no
 * input states (issue #81, review change 2). A writer is an element whose run writes, or a boundary whose firing
 * writes; its continuation is held against each resumption its write may make true (`mayMakeTrue`), except one whose
 * first visit removes it (`preempts`); an Event Sub-Process writes its start's outputs as it begins, so its entered
 * children are held against them too. The Conditional resumptions `element` holds are held against every other one a
 * single write may make true with them, a variable command's included, unless they are one contest (`contested`), whose
 * order the input's ranking states, and against themselves when open twice at once (`againstItself`). Every walk arms
 * every Conditional once its unit writes (`closureWalk`), so two writing units beside a writing Conditional path
 * conflict: a conservative bound.
 */
function writeFanOut(reading: Reading, program: Program, element: Element): string | null {
  const resumed = (written: NameSet): Array<readonly [Visit, Closure]> =>
    conditionalCatches(program).filter((visit) => mayMakeTrue(program, written, visit))
      .map((visit) => [visit, pathOf(reading, program, [visit])] as const);
  const written = runs(reading, program, element).footprint.writes;
  const scope = elementScope(element);
  const inside = scope !== null && scopeKindStart(scope[1].kind) !== null ? enteredChildren(program, scope[0].id).map(toEnter) : [];
  const own = (): string | null => {
    if (written.names.length === 0 && !written.all) return null;
    const next = continuation(reading, program, element);
    const begun = pathOf(reading, program, inside);
    return firstOf(resumed(written).filter(([visit]) => !preempts(reading, program, visit, element)),
      ([, wake]) => conflict(program, next, wake) ?? conflict(program, begun, wake));
  };
  const fired = (): string | null => firstOf(elementEnvelope(element)?.boundaries ?? [], (attached) => {
    const names = reading.fires(attached);
    if (names.length === 0) return null;
    const next = closureWalk(reading, program, { stop: branchStop, ascends: true }, flowTargets(program, attached.outgoing).map(toEnter));
    return firstOf(resumed({ names, all: false }), ([, wake]) => conflict(program, next, wake));
  });
  const reads = (visit: Visit): NameSet => {
    const subscription = visitSubscription(visit);
    const trigger = subscription === null ? null : triggerCondition(subscription.trigger);
    return trigger === null ? { names: [], all: false } : expressionReads(trigger.condition);
  };
  const together = (left: Visit) => (right: Visit): boolean =>
    visitKey(left) !== visitKey(right) && !contested(reading, program, left, right) &&
    (program.options.conditionalRetrigger === ConditionalRetrigger.EachWrite || meets(reads(left), reads(right)));
  const rivals = (): string | null => firstOf(catching(conditional, element), (visit) => {
    const wake = pathOf(reading, program, [visit]);
    return againstItself(reading, program, visit, wake) ??
      firstOf(conditionalCatches(program).filter(together(visit)), (other) => conflict(program, wake, pathOf(reading, program, [other])));
  });
  return own() ?? fired() ?? rivals();
}

/**
 * Under `BranchSchedule.OrderInvariant`, the compensation handlers one Compensation throw or Cancel End may begin
 * together may not conflict: a handler's own run, without the resumption of the trigger once it completes, which comes
 * after every handler it races. `feature/compensation.ts` `precedes` orders two records by Sequence Flow from one
 * subject or its boundary Events to the other's, by data or by one subject; handlers it leaves unordered begin together,
 * in declaration order, an order no input states (BPMN 2.0.2 §13.5.5; issue #81). A pair of handlers counts as ordered
 * only when `precedes` orders every pair of their records in every run (P1 track review, change 1), which holds for two
 * subjects that are one, ordered by completion; or a path leads from one's boundary Events to the other, ordered
 * whatever the completion; or a path leads from `a` to `b`, which orders every record of `a` before a later one of `b`,
 * and a record of `a` after one of `b` is ordered too or cannot exist: a path leads back from `b` to `a`, so their
 * completion orders that pair the same way, or `a` runs once along one token's path (`runsOnce`) and no way a token can
 * go from `b` (`reaches`, which passes Activities and follows boundary flows, unlike `flowReaches`) returns to `a`.
 * Without `runsOnce` a second token completes `a` after `b` (a conditioned path from `a` to `b` beside a fork, the
 * review's witness; a fork sending a second token to `a`, though every path to `b` passes `a`); without `reaches` one
 * token returns to `a` through an Activity or a boundary flow; and a Scope around `a` entered again hands its parent the
 * records of two occurrences, which meet in one run. A data dependency is not counted, a conservative reading.
 */
function compensationFanOut(reading: Reading, program: Program, element: Element): string | null {
  if (!reading.compensates(element)) return null;
  const unit = (handlerElement: Element): Closure => {
    const id = elementHeader(handlerElement).id;
    const begun = closureWalk(reading, program, { stop: (other) => elementHeader(other).id === id || branchStop(other), ascends: false },
      [toEnter(handlerElement)]);
    if (branchStop(handlerElement)) return begun;
    const run = runs(reading, program, handlerElement);
    return { ...begun, footprint: joined(begun.footprint, run.footprint), withdraws: [...run.withdraws, ...begun.withdraws],
      completed: [id, ...begun.completed] };
  };
  const boundariesOf = (id: ElementId): ElementId[] => {
    const found = programElement(program, id);
    return (found === null ? [] : elementEnvelope(found)?.boundaries ?? []).map((attached) => attached.id);
  };
  const follows = (first: ElementId, second: ElementId): boolean => {
    const subject = programElement(program, first);
    return flowReaches(program, [first], second) && (flowReaches(program, [second], first) ||
      (!reaches(program, [second], first) && subject !== null && runsOnce(reading, program, subject)));
  };
  const joinedBy = (first: ElementId, second: ElementId): boolean =>
    flowReaches(program, boundariesOf(first), second) || follows(first, second);
  const ordered = (left: Element, right: Element): boolean =>
    subjectsOf(program, left).every((first) => subjectsOf(program, right).every((second) =>
      first === second || joinedBy(first, second) || joinedBy(second, first)));
  const handlers = handlersOf(reading, program, element);
  for (const [index, handlerElement] of handlers.entries()) {
    const found = firstOf(handlers.slice(index + 1).filter((other) => !ordered(handlerElement, other)),
      (other) => conflict(program, unit(handlerElement), unit(other)));
    if (found !== null) return found;
  }
  return null;
}

/** The fan-outs of one element's run besides a split's and a loop's, under `BranchSchedule.OrderInvariant`. */
export function fanOutConflict(reading: Reading, program: Program, element: Element): string | null {
  switch (program.options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return null;
    case BranchSchedule.OrderInvariant:
      return signalFanOut(reading, program, element) ?? escalationFanOut(reading, program, element) ??
        writeFanOut(reading, program, element) ?? compensationFanOut(reading, program, element);
  }
  return assertNever(program.options.branchSchedule);
}

/**
 * What the instances of a looping element do in the closure that begins them, which
 * `concurrentInstances` (`admission/multi-instance.ts`) reads: `races` when one instance writes a name before it waits,
 * removes the body, or resumes what a sibling instance opens, there or after one broadcast resumes them all, since every
 * instance has the same closure and so meets its own, and `completes` when an instance may complete in either.
 */
export type InstanceClosure = Readonly<{ races: boolean; completes: boolean }>;

/**
 * A Sub-Process instance runs from its `enteredChildren` and continues past a join, which the instance's own branches reach
 * in that closure; a task instance is its work, which completes at once unless it awaits a stimulus. `completes`
 * over-approximates: a token reaching an element that neither waits nor continues, ignoring that a sibling branch of a
 * Parallel split may wait, which flows a condition selects and whether a nested Call waits.
 */
export function instanceClosure(reading: Reading, program: Program, element: Element): InstanceClosure {
  const walk = (begun: readonly Visit[]): Closure => closureWalk(reading, program, { stop: awaitsStimulus, ascends: false }, begun);
  const id = elementHeader(element).id;
  // An instance meets a sibling when it may remove the body, which holds them all, or act on what the sibling opens or
  // completes.
  const meetsSibling = (closure: Closure): boolean =>
    closure.withdraws.some((withdrawal) => removesElement(program, withdrawal, program.elements.length + 1, id)) ||
    closure.resumes.some((resumedId) => closure.begun.includes(resumedId)) ||
    closure.compensates.some((subject) => closure.completed.includes(subject));
  const conflicts = (closure: Closure): boolean => races(closure.footprint, closure.footprint) || meetsSibling(closure);
  const scope = elementScope(element);
  if (scope !== null) {
    const closure = walk(enteredChildren(program, scope[0].id).map(toEnter));
    // A broadcast resumes every instance's subscription in one closure, which completes the idle instances in scope
    // order (`step.ts` `settle`), so an instance completing there meets the completion condition in an order no input
    // states.
    const woken = closure.wakes.length === 0 ? null : walk(closure.wakes);
    return { races: conflicts(closure) || (woken !== null && conflicts(woken)), completes: closure.ends || (woken?.ends ?? false) };
  }
  if (awaitsStimulus(element)) return { races: false, completes: false };
  // The instance's run counts as every path counts a run (`runs`), its unhandled Error's withdrawal included.
  const run = runs(reading, program, element);
  const beside = walk(beyond(reading, program, element, true));
  return { races: races(run.footprint, run.footprint) || meetsSibling({ ...beside, withdraws: [...run.withdraws, ...beside.withdraws] }), completes: true };
}
