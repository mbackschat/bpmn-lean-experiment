/**
 * The compensation order of one closure's records, transcribed from `Kernel/Admission/Flow/Order.lean`.
 *
 * Under `BranchSchedule.OrderInvariant` `feature/compensation.ts`'s `completedBefore` orders two records completed in
 * one closure by the structural order of their subjects (`structurallyBefore`), never by the order the closure ran them
 * in, which no input states (COMPENSATION-SEMANTICS-SPEC I1 (d), DC15 (c)). So admission refuses a model in which one
 * Compensation throw or Cancel End may meet two records of one closure whose order `precedes` needs and the structural
 * order cannot give: a subject that may complete again after itself in the closure it completed in
 * (`compensation.repeatsInClosure`), a sequential Multi-Instance Sub-Process whose instances may complete in one closure
 * (`compensation.sequentialInstancesInClosure`), and two dependent subjects that may complete in one closure unless one
 * completes after the other there and not the other way round, as the structural order has it
 * (`compensation.unorderedDependency`). Records of one closure that §13.5.5 leaves unordered, parallel instances and
 * independent subjects, stay admitted. This is a forward-compatible restriction: a later causal order may admit these
 * models by ordering their records within the closure.
 *
 * A closure begins where an input begins one: the process starting, a waiting element completing, a boundary firing,
 * an Event Sub-Process starting. Its walk passes a Scope or a Call as it enters it, so the completion it records counts
 * only for one that may complete without waiting (`quick`), or that holds the element the closure began at.
 */
import {
  BranchSchedule,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementHeader,
  elementIncoming,
  elementIsCompensationActivity,
  elementScope,
  programCalledProcessFor,
  programCallerDeployment,
  programElement,
  programProcessChildren,
  scopeKindStart,
  workCall,
  type Element,
  type ElementId,
  type Program,
} from "../../il/types.js";
import { meets, programInterior, subjectData } from "../../il/footprint.js";
import { flowReaches, programEnteredChildren, structurallyBefore } from "../../il/paths.js";
import { awaitsStimulus } from "../flow.js";
import {
  VisitTag,
  after,
  ancestors,
  closureWalk,
  declaredIn,
  handlersOf,
  subjectsOf,
  toEnter,
  type Closure,
  type Reading,
  type Visit,
  type Walk,
} from "./closure.js";
import { anchorOf, instanceClosure } from "./concurrency.js";

/** A refusal: its code, the subject it names and the other subject of a pair. */
export type Unordered = readonly [string, ElementId, readonly ElementId[]];

/** Whether `element` names a compensation handler. */
function compensable(element: Element): boolean {
  return (elementEnvelope(element)?.compensationHandlers ?? []).length > 0;
}

/** Whether `element` is a Multi-Instance Sub-Process or Transaction, whose body keeps its instances' records. */
function multiInstanceScope(element: Element): boolean {
  return elementScope(element) !== null && (elementEnvelope(element)?.multiInstance ?? null) !== null;
}

/**
 * A Multi-Instance Sub-Process without a handler of its own holding compensable work: each instance leaves one group
 * record of the records inside it (I9).
 */
function group(program: Program, element: Element): boolean {
  return multiInstanceScope(element) && !compensable(element) && programInterior(program, element).some(compensable);
}

/** The subjects of compensation records: the compensable elements, then the groups, each in program order. */
function subjects(program: Program): Element[] {
  return [...program.elements.filter(compensable), ...program.elements.filter((element) => group(program, element))];
}

/**
 * Where `element`'s records are kept while a trigger may meet them: the nearest enclosing Scope that keeps records as
 * its children, one with a handler or a Multi-Instance body; `null` at the process level.
 */
function home(program: Program, element: Element): ElementId | null {
  const scope = ancestors(program, elementHeader(element).parent).find((entry) => compensable(entry) || multiInstanceScope(entry));
  return scope === undefined ? null : elementHeader(scope).id;
}

/**
 * Whether one Compensation throw or Cancel End may compensate records of both subjects: a group's are found through
 * the records inside it.
 */
function together(reading: Reading, program: Program, first: Element, second: Element): boolean {
  const covers = (covered: readonly ElementId[], subject: Element): boolean =>
    covered.includes(elementHeader(subject).id) ||
    (group(program, subject) && programInterior(program, subject).some((inner) => covered.includes(elementHeader(inner).id)));
  return program.elements.filter(reading.compensates).some((thrower) => {
    const covered = handlersOf(reading, program, thrower).flatMap((handlerElement) => subjectsOf(program, handlerElement));
    return covers(covered, first) && covers(covered, second);
  });
}

/**
 * The visits an input may begin a closure with: a root start, a waiting element's completion, an Event Sub-Process
 * start, and a boundary's firing other than a Compensation start's.
 */
function closureStarts(reading: Reading, program: Program): Visit[][] {
  return program.elements.flatMap((element) => {
    const scope = elementScope(element);
    const eventSubProcess = scope !== null && scopeKindStart(scope[1].kind) !== null;
    const root = elementHeader(element).parent === null && elementIncoming(element).length === 0 && !eventSubProcess &&
      !elementIsCompensationActivity(element);
    return [
      ...(root || eventSubProcess ? [[toEnter(element)]] : []),
      ...(awaitsStimulus(element) ? [[{ tag: VisitTag.Completes, element } as Visit]] : []),
      ...(elementEnvelope(element)?.boundaries ?? []).filter((boundary) => !reading.compensationStart(boundary.subscription))
        .map((boundary): Visit[] => [{ tag: VisitTag.Fires, boundary }]),
    ];
  });
}

/**
 * Whether `element` may complete in the closure that begins it: a Scope whose entered children may end without
 * waiting, a Call whose called processes hold nothing that waits, and every other element, since a waiting one's
 * completion begins a closure of its own.
 */
function quick(reading: Reading, program: Program, element: Element): boolean {
  const scope = elementScope(element);
  if (scope !== null) {
    return closureWalk(reading, program, { stop: awaitsStimulus, ascends: false },
      programEnteredChildren(program, scope[0].id).map(toEnter)).ends;
  }
  const activity = elementActivity(element);
  const work = activity === null ? null : workCall(activity[1].work);
  if (work === null) return true;
  const called = programCalledProcessFor(program, program.options.calledElementResolution,
    programCallerDeployment(program, elementHeader(element)), work);
  return called.length > 0 && called.every((process) =>
    !declaredIn(program, program.elements.length, programProcessChildren(program, process)).some(awaitsStimulus));
}

/** The elements `closure` completes, a Scope or Call only when it is `quick` or holds `anchor`, where the closure began. */
function completedIn(program: Program, quickOnes: ReadonlySet<ElementId>, closure: Closure, anchor: Element | null): ElementId[] {
  const holds = (id: ElementId): boolean => anchor !== null &&
    (elementHeader(anchor).id === id || ancestors(program, elementHeader(anchor).parent).some((entry) => elementHeader(entry).id === id));
  return closure.completed.filter((id) => programElement(program, id) === null || quickOnes.has(id) || holds(id));
}

/** The walk of one closure: it stops where an element waits and ascends into the completions a token's end allows. */
const closureOrder: Walk = { stop: awaitsStimulus, ascends: true };

/** What may complete after `element` completes, in the closure it completed in. */
function following(reading: Reading, program: Program, quickOnes: ReadonlySet<ElementId>, element: Element): ElementId[] {
  return completedIn(program, quickOnes, closureWalk(reading, program, closureOrder, after(reading, program, closureOrder, element)), null);
}

/**
 * The refusal of two subjects, `first` declared before `second`, when one trigger may meet their records completed in
 * one closure, `precedes` needs their order (a Sequence Flow path or a data dependency either way), and that one
 * completes after the other there and not the other way round is not what the structural order has.
 */
function unorderedPair(reading: Reading, program: Program, quickOnes: ReadonlySet<ElementId>,
  sameClosure: (first: ElementId, second: ElementId) => boolean, first: Element, second: Element): Unordered | null {
  const a = elementHeader(first).id;
  const b = elementHeader(second).id;
  const enclosing = (inner: Element, outer: Element): boolean =>
    ancestors(program, elementHeader(inner).parent).some((entry) => elementHeader(entry).id === elementHeader(outer).id);
  if (enclosing(first, second) || enclosing(second, first) || home(program, first) !== home(program, second) ||
    !together(reading, program, first, second) || !sameClosure(a, b)) return null;
  const dependent = flowReaches(program, [a], b) || flowReaches(program, [b], a) ||
    meets(subjectData(program, b).reads, subjectData(program, a).writes) ||
    meets(subjectData(program, a).reads, subjectData(program, b).writes);
  const ab = following(reading, program, quickOnes, first).includes(b);
  const ba = following(reading, program, quickOnes, second).includes(a);
  if (!dependent || (ab && !ba && structurallyBefore(program, a, b)) || (ba && !ab && structurallyBefore(program, b, a))) return null;
  return ["compensation.unorderedDependency", a, [b]];
}

/** The first pair of `candidates` `unorderedPair` refuses. */
function unorderedPairs(reading: Reading, program: Program, quickOnes: ReadonlySet<ElementId>,
  sameClosure: (first: ElementId, second: ElementId) => boolean, candidates: readonly Element[]): Unordered | null {
  for (let index = 0; index < candidates.length; index += 1) {
    for (const second of candidates.slice(index + 1)) {
      const refused = unorderedPair(reading, program, quickOnes, sameClosure, candidates[index]!, second);
      if (refused !== null) return refused;
    }
  }
  return null;
}

/**
 * Under `BranchSchedule.OrderInvariant`, the first refusal of a model whose records of one closure the structural order
 * cannot order where `precedes` needs it: its code, the subject it names and the other subject of a pair.
 */
export function unorderedRecords(reading: Reading, program: Program): Unordered | null {
  switch (program.options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return null;
    case BranchSchedule.OrderInvariant: {
      const quickOnes = new Set(program.elements.filter((element) => quick(reading, program, element)).map((element) => elementHeader(element).id));
      const closures = closureStarts(reading, program).map((begun) => completedIn(program, quickOnes,
        closureWalk(reading, program, closureOrder, begun), begun[0] === undefined ? null : anchorOf(program, begun[0])));
      const sameClosure = (first: ElementId, second: ElementId): boolean =>
        closures.some((completed) => completed.includes(first) && completed.includes(second));
      for (const subject of subjects(program)) {
        const id = elementHeader(subject).id;
        if (!awaitsStimulus(subject) && quickOnes.has(id) && following(reading, program, quickOnes, subject).includes(id)) {
          return ["compensation.repeatsInClosure", id, []];
        }
        if (multiInstanceScope(subject) && reading.nextInstance(subject) && instanceClosure(reading, program, subject).completes) {
          return ["compensation.sequentialInstancesInClosure", id, []];
        }
      }
      return unorderedPairs(reading, program, quickOnes, sameClosure, subjects(program));
    }
  }
  return assertNever(program.options.branchSchedule);
}
