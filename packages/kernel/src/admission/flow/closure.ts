/**
 * The closure walk, transcribed from `Kernel/Admission/Flow/Closure.lean`: the work a token, a firing or a raise reaches
 * before it waits, joins or ends, read by the order checks of `admission/flow/concurrency.ts` and the registry's
 * `closureReach`. It builds on `admission/flow.ts`'s structural reading of flows and Scopes.
 */
import {
  assertNever,
  elementActivity,
  elementIsCompensationActivity,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementOutgoing,
  elementScope,
  eventPayloadCatch,
  eventPayloadThrow,
  definitionRefEquals,
  programBoundary,
  programCalledProcessFor,
  programCallerDeployment,
  programChildren,
  programProcessChildren,
  programElement,
  programProcessOf,
  programSiblings,
  scopeKindStart,
  throwView,
  triggerCondition,
  triggerView,
  UnhandledError,
  workCall,
  type Boundary,
  type CalledProcess,
  type DefinitionRef,
  type Element,
  type ElementId,
  type Program,
  type Subscription,
} from "../../il/types.js";
import { beginReads, footprint, joined, noNames, union, type Footprint, type NameSet } from "../../il/footprint.js";
import { onward } from "../../il/paths.js";
import { enteredChildren, flowTargets, leaving, routing } from "../flow.js";

/**
 * What a closure walk reads of an element beyond the IL, filled by `admission-registry.ts` `reading` from the
 * admissions that own each part, since this module matches none of `Trigger`, `Throw` or `Work`: what an element writes
 * when it runs through its closure beyond its envelope's outputs and a Call's (its work's result, its catch's outputs
 * and variables, what its Signal's receivers install, a loop's output collection), the names a looping element writes
 * into scope occurrences of its own (its counters and each instance's items), what a boundary writes when it fires,
 * whether an element's run may raise an Error, Escalation or Cancel in its closure, whether a subscription catches such
 * a raise, whether an element begins compensation handlers, whether a subscription starts a Compensation Event
 * Sub-Process, whether a looping element may run no instance and whether completing one of its instances may begin
 * another in the same closure, whether beginning an element removes everything else in its parent's interior (an
 * interrupting Event Sub-Process), the code of an Error an element's run may raise in its closure (`{ code }` for a
 * thrown Error, `{ code: null }` for one of any code a work may raise, `null` for none; a Call's codes are what its
 * called processes let escape, `raisedCodes`, so this reading is not consulted for one), whether a subscription takes
 * every Error of a code (`null`: of any code), and whether an element's run raises an Escalation, after which its
 * thrower goes on unless the catcher interrupts it.
 */
export type Reading = Readonly<{
  writes: (element: Element) => NameSet;
  locals: (element: Element) => readonly string[];
  fires: (attached: Boundary) => readonly string[];
  raises: (element: Element) => boolean;
  catchesRaise: (subscription: Subscription) => boolean;
  compensates: (element: Element) => boolean;
  compensationStart: (subscription: Subscription) => boolean;
  mayRunNone: (element: Element) => boolean;
  nextInstance: (element: Element) => boolean;
  interrupts: (element: Element) => boolean;
  errorCode: (element: Element) => Readonly<{ code: string | null }> | null;
  catchesError: (subscription: Subscription, code: string | null) => boolean;
  escalates: (element: Element) => boolean;
}>;

/**
 * One step of a closure walk: an element a token begins, one that completes, a boundary that fires, or an element a
 * raise passes, which writes its outputs (`interruptedOutputs`, a Call's raised outputs) and goes no further.
 */
export enum VisitTag { Enters = "enters", Completes = "completes", Fires = "fires", Passes = "passes" }

export type Visit =
  | { readonly tag: VisitTag.Enters; readonly element: Element }
  | { readonly tag: VisitTag.Completes; readonly element: Element }
  | { readonly tag: VisitTag.Fires; readonly boundary: Boundary }
  | { readonly tag: VisitTag.Passes; readonly element: Element };

export const toEnter = (element: Element): Visit => ({ tag: VisitTag.Enters, element });
const toComplete = (element: Element): Visit => ({ tag: VisitTag.Completes, element });
const toFire = (attached: Boundary): Visit => ({ tag: VisitTag.Fires, boundary: attached });
const toPass = (element: Element): Visit => ({ tag: VisitTag.Passes, element });

/**
 * A region a closure may remove at once with all the work in it: the interior of `root`, its own occurrence included
 * when `inclusive` (an interrupting boundary's host), else only what it holds (an interrupting Event Sub-Process's or a
 * Terminate End's Scope); `root = null` is the process level of `source`, the element whose run removes it.
 * `everything` is the whole process instance, its callers and called instances included: an Error no catcher takes ends
 * it under `UnhandledError.FailsInstance`.
 */
export type Withdrawal = Readonly<{ source: ElementId; root: ElementId | null; inclusive: boolean; everything: boolean }>;

/**
 * What a walk found: the footprint of the shared names, whether a token may end, every element and boundary it reached
 * (walked through, stopped at or fired), and the names written into scope occurrences of their own; and what it may do
 * to other work in the instance (`interferes`): the elements it begins and completes, the regions it may remove, the
 * elements whose open Signal subscriptions (`resumes`) or compensation records (`compensates`) it may act on, and the
 * resumptions of the Signal subscriptions it leaves open (`wakes`).
 */
export type Closure = Readonly<{
  footprint: Footprint;
  ends: boolean;
  reached: readonly ElementId[];
  locals: readonly string[];
  begun: readonly ElementId[];
  completed: readonly ElementId[];
  withdraws: readonly Withdrawal[];
  resumes: readonly ElementId[];
  compensates: readonly ElementId[];
  wakes: readonly Visit[];
}>;

/** The elements enclosing the element whose parent is `parent`, innermost first. */
export function ancestors(program: Program, parent: ElementId | null): Element[] {
  const found: Element[] = [];
  let id = parent;
  for (let fuel = program.elements.length; fuel > 0 && id !== null; fuel -= 1) {
    const element = programElement(program, id);
    if (element === null) break;
    found.push(element);
    id = elementHeader(element).parent;
  }
  return found;
}

const eventSubProcessStart = (element: Element): Subscription | null => {
  const scope = elementScope(element);
  return scope === null ? null : scopeKindStart(scope[1].kind);
};

/** The Event Sub-Processes among `level` whose start `starts` takes. */
const startingSubProcesses = (level: readonly Element[], starts: (subscription: Subscription) => boolean): Element[] =>
  level.filter((element) => {
    const start = eventSubProcessStart(element);
    return start !== null && starts(start);
  });

/** The Call Activities whose called process is `process`. */
export function callers(program: Program, process: CalledProcess): Element[] {
  return program.elements.filter((element) => {
    const activity = elementActivity(element);
    const work = activity === null ? null : workCall(activity[1].work);
    return work !== null && programCalledProcessFor(program, program.options.calledElementResolution,
      programCallerDeployment(program, elementHeader(element)), work).some((called) => definitionRefEquals(called.definition, process.definition));
  });
}

/**
 * Where a raise from `element` may be caught: a boundary of the element itself, if it is an Activity or Scope, or of an
 * enclosing one, whose host it interrupts and passes, an Event Sub-Process of an enclosing Scope or of the process
 * level, and from a called process's level a Call's catchers in its caller. Any raised kind and code counts.
 */
export function catchers(reading: Reading, program: Program, element: Element, fuel: number): Visit[] {
  if (fuel === 0) return [];
  const chain = [...(elementEnvelope(element) === null ? [] : [element]), ...ancestors(program, elementHeader(element).parent)];
  const atHost = (host: Element): Visit[] => {
    const scope = elementScope(host);
    return [
      ...(elementEnvelope(host)?.boundaries ?? []).filter((attached) => reading.catchesRaise(attached.subscription))
        .flatMap((attached) => [toFire(attached), toPass(host)]),
      ...(scope === null ? [] : startingSubProcesses(programChildren(program, scope[0].id), reading.catchesRaise).map(toEnter)),
    ];
  };
  const top = chain.at(-1) ?? element;
  const level = startingSubProcesses(programSiblings(program, elementHeader(top)), reading.catchesRaise).map(toEnter);
  const process = programProcessOf(program, elementHeader(top));
  const caller = process === null ? [] : callers(program, process).flatMap((call) => [toPass(call), ...catchers(reading, program, call, fuel - 1)]);
  return [...chain.flatMap(atHost), ...level, ...caller];
}

/** Whether an element is a compensation handler: a Compensation Activity (`elementIsCompensationActivity`) or a Compensation Event Sub-Process. */
function handler(reading: Reading, element: Element): boolean {
  const start = eventSubProcessStart(element);
  return elementIsCompensationActivity(element) || (start !== null && reading.compensationStart(start));
}

/** Every element declared in `level` and the Scopes it holds. */
export function declaredIn(program: Program, fuel: number, level: readonly Element[]): Element[] {
  if (fuel === 0) return [];
  return level.flatMap((element) => {
    const scope = elementScope(element);
    return [element, ...(scope === null ? [] : declaredIn(program, fuel - 1, programChildren(program, scope[0].id)))];
  });
}

/**
 * The handlers a Compensation throw or Cancel End may begin: every handler declared under the nearest Scope enclosing it
 * that is no Event Sub-Process, or under its process level. Which records it finds is the run's; any may be there.
 */
export function handlersOf(reading: Reading, program: Program, thrower: Element): Element[] {
  const enclosing = ancestors(program, elementHeader(thrower).parent);
  const scope = enclosing.find((candidate) => eventSubProcessStart(candidate) === null) ?? null;
  const level = scope === null ? programSiblings(program, elementHeader(enclosing.at(-1) ?? thrower)) : programChildren(program, elementHeader(scope).id);
  return declaredIn(program, program.elements.length, level).filter((element) => handler(reading, element));
}

/**
 * The subscriptions a Signal or Conditional catch, boundary or Event Sub-Process start of `element` holds, as visits: a
 * catch completes, a boundary fires, an Event Sub-Process begins.
 */
export function catching(picks: (subscription: Subscription) => boolean, element: Element): Visit[] {
  const event = elementEvent(element);
  const caught = event === null ? null : eventPayloadCatch(event[1]);
  const start = eventSubProcessStart(element);
  return [
    ...(caught !== null && picks(caught) ? [toComplete(element)] : []),
    ...(elementEnvelope(element)?.boundaries ?? []).filter((attached) => picks(attached.subscription)).map(toFire),
    ...(start !== null && picks(start) ? [toEnter(element)] : []),
  ];
}

export const signalled = (subscription: Subscription): boolean => triggerView(subscription.trigger).signal !== null;
export const conditional = (subscription: Subscription): boolean => triggerCondition(subscription.trigger) !== null;

/** Every Conditional catch, boundary and Event Sub-Process start of the program, which a write may resume. */
export function conditionalCatches(program: Program): Visit[] {
  return program.elements.flatMap((element) => catching(conditional, element));
}

/**
 * The visits a token's leaving `element` makes in the same closure beside its flows: the catchers of its raise, the
 * handlers its Compensation throw or Cancel End begins and, when it is a handler that completes, the other handlers of
 * every trigger that may begin it and that trigger's continuation; and every Signal catch a Signal throw resumes in the
 * instance (CIB-OP-0019).
 */
export function beyond(reading: Reading, program: Program, element: Element, completes: boolean): Visit[] {
  const raised = reading.raises(element) ? catchers(reading, program, element, program.elements.length + 1) : [];
  const compensated = reading.compensates(element) ? handlersOf(reading, program, element).map(toEnter) : [];
  const id = elementHeader(element).id;
  const continued = completes && handler(reading, element)
    ? program.elements.filter((thrower) => reading.compensates(thrower) &&
        handlersOf(reading, program, thrower).some((other) => elementHeader(other).id === id))
      .flatMap((thrower) => [...handlersOf(reading, program, thrower).map(toEnter), toComplete(thrower)])
    : [];
  const event = elementEvent(element);
  const thrown = event === null ? null : eventPayloadThrow(event[1]);
  const signals = thrown !== null && throwView(thrown).signal !== null ? program.elements.flatMap((other) => catching(signalled, other)) : [];
  return [...raised, ...compensated, ...continued, ...signals];
}

/** The elements `element`'s outgoing flows and throwing Link lead to. */
function continuing(program: Program, element: Element): readonly Element[] {
  return flowTargets(program, onward(program, element));
}

/**
 * How a walk proceeds: `stop` names the elements that only begin, and `ascends` whether a token ending in a Scope may
 * complete it, a called process's end its Calls, and a looping element's instance begin the next (`Reading.nextInstance`).
 * A branch walk does not ascend: completing the Scope that holds the split waits for every branch.
 */
export type Walk = Readonly<{ stop: (element: Element) => boolean; ascends: boolean }>;

/**
 * The visits a token leaving `element` makes on its own way: its flows and Link, and under `ascends` its parent's
 * completion or, at a called process's level, its Calls'; a handler completes no parent.
 */
export function onwardVisits(reading: Reading, program: Program, walk: Walk, element: Element): Visit[] {
  const next = continuing(program, element).map(toEnter);
  let ascent: Visit[] = [];
  if (walk.ascends && next.length === 0 && !handler(reading, element)) {
    const parent = elementHeader(element).parent;
    if (parent !== null) {
      const enclosing = programElement(program, parent);
      ascent = enclosing === null ? [] : [toComplete(enclosing)];
    } else {
      const process = programProcessOf(program, elementHeader(element));
      ascent = process === null ? [] : callers(program, process).map(toComplete);
    }
  }
  return [...next, ...ascent];
}

/** The visits after `element` completes: its own way on (`onwardVisits`) and what it makes beside it (`beyond`). */
function after(reading: Reading, program: Program, walk: Walk, element: Element): Visit[] {
  return [...onwardVisits(reading, program, walk, element), ...beyond(reading, program, element, true)];
}

/**
 * The visits beginning `element` makes: a Scope's entered children and, as before it completes, its flows; a loop that
 * may run no instance completes at once; a Conditional boundary, an Event Sub-Process Conditional start and an
 * Event-Based Gateway's Conditional arm may fire on entry.
 */
function entering(reading: Reading, program: Program, element: Element): Visit[] {
  const conditions = (elementEnvelope(element)?.boundaries ?? []).filter((attached) => conditional(attached.subscription)).map(toFire);
  const gateway = elementGateway(element);
  const arms = gateway !== null && routing(gateway[1]).waits
    ? flowTargets(program, elementOutgoing(element)).flatMap((arm) => {
      const event = elementEvent(arm);
      const caught = event === null ? null : eventPayloadCatch(event[1]);
      return caught !== null && conditional(caught) ? [toComplete(arm)] : [];
    })
    : [];
  const scope = elementScope(element);
  const nested = scope === null ? [] : [
    ...enteredChildren(program, scope[0].id).map(toEnter),
    ...startingSubProcesses(programChildren(program, scope[0].id), conditional).map(toEnter),
  ];
  return [...conditions, ...arms, ...nested, ...(reading.mayRunNone(element) ? [toComplete(element)] : [])];
}

/** Whether a stop runs through anyway: a loop that may run no instance, or a Conditional catch whose condition may hold on arrival. */
function runsThrough(reading: Reading, element: Element): boolean {
  const event = elementEvent(element);
  const caught = event === null ? null : eventPayloadCatch(event[1]);
  return reading.mayRunNone(element) || (caught !== null && conditional(caught));
}

/** The subscription a visit resumes or catches with: a catch's, a boundary's, an Event Sub-Process's start. */
export function visitSubscription(visit: Visit): Subscription | null {
  switch (visit.tag) {
    case VisitTag.Completes: {
      const event = elementEvent(visit.element);
      return event === null ? null : eventPayloadCatch(event[1]);
    }
    case VisitTag.Fires:
      return visit.boundary.subscription;
    case VisitTag.Enters:
      return eventSubProcessStart(visit.element);
    case VisitTag.Passes:
      return null;
  }
  return assertNever(visit);
}

/**
 * Whether a catcher of `element`'s own process level surely takes an Error of `code` (`null`: any code): a boundary of
 * it or of an enclosing Activity, or an Event Sub-Process of an enclosing Scope or of the process level, whose trigger
 * takes the code (`Reading.catchesError`). A catcher in a caller is not counted, since another caller may lack it.
 */
function caughtWithin(reading: Reading, program: Program, element: Element, code: string | null): boolean {
  return catchers(reading, program, element, 1).some((visit) => {
    const subscription = visitSubscription(visit);
    return subscription !== null && reading.catchesError(subscription, code);
  });
}

/**
 * The codes of the Errors `element`'s run may raise, `null` standing for any code: a thrown Error's and a raising
 * work's (`Reading.errorCode`), and for a Call what its called processes let escape, an Error raised at any depth there
 * that no catcher of that process's level surely takes (`caughtWithin`). A called process already on the path (`seen`)
 * adds nothing a first visit does not, since its codes are only filtered further on the way back.
 */
function raisedCodes(reading: Reading, program: Program, fuel: number, seen: readonly DefinitionRef[], element: Element): (string | null)[] {
  if (fuel === 0) return [null];
  const activity = elementActivity(element);
  const work = activity === null ? null : workCall(activity[1].work);
  if (work === null) {
    const raised = reading.errorCode(element);
    return raised === null ? [] : [raised.code];
  }
  const called = programCalledProcessFor(program, program.options.calledElementResolution,
    programCallerDeployment(program, elementHeader(element)), work);
  return called.filter((process) => !seen.some((definition) => definitionRefEquals(definition, process.definition)))
    .flatMap((process) => declaredIn(program, program.elements.length, programProcessChildren(program, process))
      .flatMap((inner) => raisedCodes(reading, program, fuel - 1, [process.definition, ...seen], inner)
        .filter((code) => !caughtWithin(reading, program, inner, code))));
}

/** Whether an Error `element`'s run may raise is one no catcher of its own process level surely takes. */
function escapes(reading: Reading, program: Program, element: Element): boolean {
  return raisedCodes(reading, program, program.processes.length + 1, [], element).some((code) => !caughtWithin(reading, program, element, code));
}

/**
 * The whole instance an Error that no catcher takes ends under `UnhandledError.FailsInstance` (BPMN 2.0.2 Table 10.88,
 * "termination of the Process instance"; `feature/propagation.ts` `unhandledError`), which removes every sibling
 * branch's and instance's work as an interruption does (issue #81).
 */
function unhandled(reading: Reading, program: Program, element: Element): Withdrawal[] {
  return program.options.unhandledError === UnhandledError.FailsInstance && escapes(reading, program, element)
    ? [{ source: elementHeader(element).id, root: null, inclusive: false, everything: true }]
    : [];
}

/**
 * What `element` contributes when it runs: its reads, its shared and own writes, and the regions its run may remove
 * beyond its flows, the whole instance when it may raise an Error no catcher takes (`unhandled`). Every path that counts
 * a run counts all three.
 */
export type Contribution = Readonly<{ footprint: Footprint; locals: readonly string[]; withdraws: readonly Withdrawal[] }>;

export function runs(reading: Reading, program: Program, element: Element): Contribution {
  const own = footprint(program, element);
  return {
    footprint: { reads: own.reads, writes: union(own.writes, reading.writes(element)) },
    locals: reading.locals(element),
    withdraws: unhandled(reading, program, element),
  };
}

/** A visit's identity: its kind and the element or boundary it visits. */
export function visitKey(visit: Visit): string {
  switch (visit.tag) {
    case VisitTag.Enters:
      return `0:${elementHeader(visit.element).id}`;
    case VisitTag.Completes:
      return `1:${elementHeader(visit.element).id}`;
    case VisitTag.Fires:
      return `2:${visit.boundary.id}`;
    case VisitTag.Passes:
      return `3:${elementHeader(visit.element).id}`;
  }
  return assertNever(visit);
}

/** Whether `element` is a Terminate End, which ends everything in the Scope or process level it sits in. */
function terminates(element: Element): boolean {
  const event = elementEvent(element);
  const thrown = event === null ? null : eventPayloadThrow(event[1]);
  return thrown !== null && throwView(thrown).terminates;
}

/** The region beginning `element` removes: an interrupting Event Sub-Process's and a Terminate End's parent. */
export function removal(reading: Reading, element: Element): Withdrawal[] {
  const header = elementHeader(element);
  return reading.interrupts(element) || terminates(element) ? [{ source: header.id, root: header.parent, inclusive: false, everything: false }] : [];
}

/** The region an interrupting boundary's firing removes: its host with everything in it. */
export function interruption(program: Program, attached: Boundary): Withdrawal[] {
  const found = attached.interrupting ? programBoundary(program, attached.id) : null;
  if (found === null) return [];
  const host = elementHeader(found[0]).id;
  return [{ source: host, root: host, inclusive: true, everything: false }];
}

/**
 * The element a resumed Signal subscription waits on: a catch and the Event-Based Gateway it is an arm of, a boundary's
 * host, an Event Sub-Process's Scope.
 */
export function anchors(program: Program, visit: Visit): ElementId[] {
  switch (visit.tag) {
    case VisitTag.Completes: {
      const id = elementHeader(visit.element).id;
      return [id, ...program.flows.filter((entry) => entry.target === id).flatMap((entry) => {
        const source = programElement(program, entry.source);
        const gateway = source === null ? null : elementGateway(source);
        return gateway !== null && routing(gateway[1]).waits ? [entry.source] : [];
      })];
    }
    case VisitTag.Fires: {
      const found = programBoundary(program, visit.boundary.id);
      return found === null ? [] : [elementHeader(found[0]).id];
    }
    case VisitTag.Enters: {
      const parent = elementHeader(visit.element).parent;
      return parent === null ? [] : [parent];
    }
    case VisitTag.Passes:
      return [];
  }
  return assertNever(visit);
}

/**
 * The elements whose open Signal subscriptions a Signal throw of `element` resumes: they are open only once the work
 * that opens them began.
 */
function resumed(program: Program, element: Element): ElementId[] {
  const event = elementEvent(element);
  const thrown = event === null ? null : eventPayloadThrow(event[1]);
  return thrown !== null && throwView(thrown).signal !== null
    ? program.elements.flatMap((other) => catching(signalled, other)).flatMap((visit) => anchors(program, visit))
    : [];
}

/**
 * The Activities and Scopes whose records a handler compensates: the Activities naming it, and a Compensation Event
 * Sub-Process's Scope.
 */
export function subjectsOf(program: Program, handlerElement: Element): ElementId[] {
  const header = elementHeader(handlerElement);
  const subjects = program.elements.filter((subject) => (elementEnvelope(subject)?.compensationHandlers ?? []).includes(header.id))
    .map((subject) => elementHeader(subject).id);
  return elementIsCompensationActivity(handlerElement) || header.parent === null ? subjects : [...subjects, header.parent];
}

/**
 * The Activities and Scopes whose records a Compensation throw or Cancel End of `element` may compensate: a handler's
 * subject is the Activity naming it, a Compensation Event Sub-Process's its Scope. A record exists only once its subject
 * completed.
 */
function compensated(reading: Reading, program: Program, element: Element): ElementId[] {
  return reading.compensates(element) ? handlersOf(reading, program, element).flatMap((found) => subjectsOf(program, found)) : [];
}

/**
 * The resumptions of the Signal subscriptions beginning `element` opens and leaves waiting: its catch and its boundaries
 * when it `stops` there, an Event-Based Gateway's Signal arms, and a Scope's Signal Event Sub-Process starts.
 */
function opened(program: Program, element: Element, stops: boolean): Visit[] {
  const event = elementEvent(element);
  const caught = event === null ? null : eventPayloadCatch(event[1]);
  const gateway = elementGateway(element);
  const scope = elementScope(element);
  return [
    ...(stops && caught !== null && signalled(caught) ? [toComplete(element)] : []),
    ...(stops ? (elementEnvelope(element)?.boundaries ?? []).filter((attached) => signalled(attached.subscription)).map(toFire) : []),
    ...(gateway !== null && routing(gateway[1]).waits
      ? flowTargets(program, elementOutgoing(element)).filter((arm) => {
        const armEvent = elementEvent(arm);
        const armCatch = armEvent === null ? null : eventPayloadCatch(armEvent[1]);
        return armCatch !== null && signalled(armCatch);
      }).map(toComplete)
      : []),
    ...(scope === null ? [] : startingSubProcesses(programChildren(program, scope[0].id), signalled).map(toEnter)),
  ];
}

/**
 * Walk one closure from `begun`. Every element, boundary and passed host is taken at most once per kind of visit; a
 * write arms every Conditional of the program once, since it may resume one in the same closure (CIB-EXT-0035).
 */
export function closureWalk(reading: Reading, program: Program, walk: Walk, begun: readonly Visit[]): Closure {
  const boundaries = program.elements.reduce((count, element) => count + (elementEnvelope(element)?.boundaries.length ?? 0), 0);
  const size = program.elements.length + program.flows.length + boundaries + 1;
  let frontier: Visit[] = [...begun];
  const seen = new Set<string>();
  let found: Footprint = { reads: noNames, writes: noNames };
  let ends = false;
  const reached: ElementId[] = [];
  const locals: string[] = [];
  const begunIds: ElementId[] = [];
  const completed: ElementId[] = [];
  const withdraws: Withdrawal[] = [];
  const resumes: ElementId[] = [];
  const compensates: ElementId[] = [];
  const wakes: Visit[] = [];
  let armed = false;
  const add = (part: Contribution): void => {
    found = joined(found, part.footprint);
    locals.unshift(...part.locals);
    withdraws.unshift(...part.withdraws);
  };
  const acts = (element: Element): void => {
    completed.unshift(elementHeader(element).id);
    resumes.unshift(...resumed(program, element));
    compensates.unshift(...compensated(reading, program, element));
  };
  // What one visit adds to the walk, and the visits it leads to.
  const visited = (visit: Visit): Visit[] => {
    switch (visit.tag) {
      case VisitTag.Fires:
        reached.unshift(visit.boundary.id);
        add({ footprint: { reads: noNames, writes: { names: reading.fires(visit.boundary), all: false } }, locals: [], withdraws: [] });
        withdraws.unshift(...interruption(program, visit.boundary));
        return flowTargets(program, visit.boundary.outgoing).map(toEnter);
      case VisitTag.Passes: {
        reached.unshift(elementHeader(visit.element).id);
        const own = footprint(program, visit.element);
        add({ footprint: { reads: own.reads, writes: union(own.writes, reading.writes(visit.element)) }, locals: [], withdraws: [] });
        return [];
      }
      case VisitTag.Completes:
        reached.unshift(elementHeader(visit.element).id);
        add(runs(reading, program, visit.element));
        acts(visit.element);
        return [...after(reading, program, walk, visit.element),
          ...(walk.ascends && reading.nextInstance(visit.element) ? [toEnter(visit.element)] : [])];
      case VisitTag.Enters: {
        const element = visit.element;
        reached.unshift(elementHeader(element).id);
        const stops = walk.stop(element) && !runsThrough(reading, element);
        begunIds.unshift(elementHeader(element).id);
        withdraws.unshift(...removal(reading, element));
        wakes.push(...opened(program, element, stops));
        if (stops) {
          found = joined(found, { reads: beginReads(element), writes: noNames });
          return entering(reading, program, element);
        }
        const scope = elementScope(element);
        const onward = [...continuing(program, element), ...(scope === null ? [] : enteredChildren(program, scope[0].id))];
        add(runs(reading, program, element));
        acts(element);
        ends ||= onward.length === 0;
        return [...entering(reading, program, element), ...after(reading, program, walk, element)];
      }
    }
    return assertNever(visit);
  };
  // The fuel bounds every visit and every visit's successors, so it is never exhausted; running out answers what was found.
  for (let fuel = 4 * size * size; fuel > 0; fuel -= 1) {
    const [visit, ...rest] = frontier;
    if (visit === undefined) break;
    frontier = rest;
    const key = visitKey(visit);
    if (seen.has(key)) continue;
    seen.add(key);
    const next = visited(visit);
    const arms: boolean = !armed && (found.writes.names.length > 0 || found.writes.all);
    frontier = arms ? [...rest, ...next, ...conditionalCatches(program)] : [...rest, ...next];
    armed ||= arms;
  }
  return { footprint: found, ends, reached, locals, begun: begunIds, completed, withdraws, resumes, compensates, wakes };
}
