/**
 * Order invariance of concurrent branches and instances, transcribed from `Kernel/Admission/Flow/Concurrency.lean`.
 * Under `BranchSchedule.orderInvariant` a closure takes its queued tokens first in, first out, and BPMN 2.0.2 lets the
 * branches of a split and the instances of a parallel Multi-Instance Activity interleave in any order (Table 13.1,
 * §13.3.1, §13.3.7). These checks compare the closures `admission/flow.ts` `closureWalk` finds for them and refuse a
 * model whose committed result would depend on that order: `flow.concurrentWrite` and `flow.concurrentInterference`
 * for a split's branches, and the `races` `admission/multi-instance.ts` `concurrentInstances` reads for instances.
 */
import {
  BranchSchedule,
  assertNever,
  definitionRefEquals,
  elementGateway,
  elementHeader,
  elementScope,
  programElement,
  programProcessOf,
  type CalledProcess,
  type Element,
  type ElementId,
  type Flow,
  type FlowId,
  type Header,
  type Program,
} from "../../il/types.js";
import { footprint, races, union, type Footprint } from "../../il/footprint.js";
import {
  ancestors,
  awaitsStimulus,
  beyond,
  branchStop,
  callers,
  closureWalk,
  enteredChildren,
  flowTargets,
  leaving,
  routing,
  toEnter,
  type Closure,
  type Reading,
  type Visit,
  type Withdrawal,
} from "../flow.js";

/** The closure a token on `start` runs in: the work it reaches, stopping where it waits or joins. */
const branchClosure = (reading: Reading, program: Program, start: FlowId): Closure =>
  closureWalk(reading, program, { stop: branchStop, ascends: false }, flowTargets(program, [start]).map(toEnter));

/** The closure the resumptions in `wakes` run in, which one Signal broadcast may start together. */
const wakeClosure = (reading: Reading, program: Program, wakes: readonly Visit[]): Closure =>
  closureWalk(reading, program, { stop: branchStop, ascends: false }, wakes);

/** Whether `withdrawal` removes the element `id`: `id` lies in its region, or in a called process a Call in it calls. */
function removesElement(program: Program, withdrawal: Withdrawal, fuel: number, id: ElementId): boolean {
  if (fuel === 0) return false;
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

/**
 * What the instances of a looping element do in the closure that begins them, which
 * `concurrentInstances` (`admission/multi-instance.ts`) reads: `races` when one instance writes a name before it waits,
 * removes the body, or resumes what a sibling instance opens, there or after one broadcast resumes them all, since every
 * instance has the same closure and so meets its own, and `completes` when an instance may complete there.
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
    return { races: conflicts(closure) || (closure.wakes.length > 0 && conflicts(walk(closure.wakes))), completes: closure.ends };
  }
  if (awaitsStimulus(element)) return { races: false, completes: false };
  const own = footprint(program, element);
  const run: Footprint = { reads: own.reads, writes: union(own.writes, reading.writes(element)) };
  return { races: races(run, run) || meetsSibling(walk(beyond(reading, program, element, true))), completes: true };
}
