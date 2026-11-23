/**
 * Sequence Flow paths, transcribed from `Kernel/IL/Paths.lean`: where a token goes on from an element, and whether a
 * Sequence Flow path leads from one element to another through nodes that are no Activity and leave no record.
 * `feature/compensation.ts` orders handlers along such paths (BPMN 2.0.2 §13.5.5, issue #96) and `admission/scopes.ts`
 * refuses a model whose records could not show the path a token took, so the order the kernel runs and the models
 * admission accepts derive from this one relation.
 *
 * The structural order (`structurallyBefore`) is the order of compensation records completed in one closure under
 * `BranchSchedule.OrderInvariant` (DC15 (c), candidate (iii)): it reads the program only, so no schedule changes it. A
 * later causal order may refine it only where it leaves records unordered.
 */
import {
  Placement,
  elementBeginsImplicitly,
  elementEnvelope,
  elementEvent,
  elementWaitsForInput,
  elementGateway,
  elementHeader,
  elementOutgoing,
  elementScope,
  elementStart,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programBoundary,
  programChildren,
  programElement,
  programSiblings,
  programTarget,
  type Element,
  type ElementId,
  type FlowId,
  type Program,
} from "./types.js";

/**
 * The flows a token continues on after `element`: its outgoing flows and, for a throwing Link, the outgoing flows of
 * the catching Link of its name among its siblings (`admission/flow.ts`'s `link` admits exactly one).
 */
export function onward(program: Program, element: Element): readonly FlowId[] {
  const event = elementEvent(element);
  const name = event === null ? null : eventPayloadLinkThrow(event[1]);
  const link = event === null || name === null ? [] : programSiblings(program, event[0]).flatMap((other) => {
    const caught = elementEvent(other);
    return caught !== null && eventPayloadLinkCatch(caught[1]) === name ? elementOutgoing(other) : [];
  });
  return [...elementOutgoing(element), ...link];
}

/**
 * Whether a path runs through the element: a Gateway or an intermediate Event, which is no Activity and leaves no
 * record. An Activity ends a path, since its own record, if any, carries the order on.
 */
export function transits(program: Program, id: ElementId): boolean {
  const element = programElement(program, id);
  return element !== null && (elementGateway(element) !== null || elementEvent(element)?.[1].placement === Placement.Intermediate);
}

/**
 * Whether a Sequence Flow path leads from one of `sources`, elements or boundary Events, to `target` through elements
 * that `transits` only. A Link pair continues the path like a flow. Each round visits only elements not visited before,
 * so the element count bounds the walk and a cycle of transit elements ends it.
 */
export function flowReaches(program: Program, sources: readonly ElementId[], target: ElementId): boolean {
  const leaving = (id: ElementId): readonly FlowId[] => {
    const element = programElement(program, id);
    if (element !== null) return onward(program, element);
    return programBoundary(program, id)?.[1].outgoing ?? [];
  };
  const seen = new Set<ElementId>();
  let frontier: readonly ElementId[] = sources;
  for (let fuel = program.elements.length + 1; fuel > 0; fuel -= 1) {
    const next = frontier.flatMap(leaving).flatMap((flow) => {
      const reached = programTarget(program, flow);
      return reached === null ? [] : [reached];
    });
    if (next.includes(target)) return true;
    const fresh = [...new Set(next.filter((id) => transits(program, id) && !seen.has(id)))];
    if (fresh.length === 0) return false;
    for (const id of fresh) seen.add(id);
    frontier = fresh;
  }
  return false;
}

/**
 * The children an occurrence of the Scope `id` begins on entry: its start Events, or, without one, the children that
 * begin implicitly (`elementBeginsImplicitly`), as `feature/scopes.ts`'s implicit start begins them.
 */
export function programEnteredChildren(program: Program, id: ElementId): readonly Element[] {
  const children = programChildren(program, id);
  return children.some((child) => elementStart(child) !== null)
    ? children.filter((child) => elementStart(child) !== null)
    : children.filter(elementBeginsImplicitly);
}

/** A point of the structural order's walk, keyed for a set: a token entering an element, or an element completing. */
type StructuralNode = `enters:${ElementId}` | `completes:${ElementId}`;

const enters = (id: ElementId): StructuralNode => `enters:${id}`;
const completes = (id: ElementId): StructuralNode => `completes:${id}`;

/**
 * Where the structural order's walk goes from `node`, within one closure as far as the program shows it: an element
 * that completes passes its token on along its onward flows, or, ending it there, completes its enclosing Scope once
 * idle; an element entered that waits for an input stops the walk, a Scope begins its entered children and completes
 * once they end, every other element completes, and the boundary Events of an element entered may fire. Signal,
 * Conditional and Error or Escalation Event Sub-Process paths are not followed: admission's exact closure reach covers
 * them and refuses where they could reverse this order.
 */
function structuralNext(program: Program, node: StructuralNode): readonly StructuralNode[] {
  const separator = node.indexOf(":");
  const id = node.slice(separator + 1) as ElementId;
  const element = programElement(program, id);
  if (element === null) return [];
  const targets = (flows: readonly FlowId[]): ElementId[] => flows.flatMap((flow) => {
    const target = programTarget(program, flow);
    return target === null ? [] : [target];
  });
  if (node.startsWith("completes:")) {
    const next = onward(program, element);
    if (next.length > 0) return targets(next).map(enters);
    const parent = elementHeader(element).parent;
    return parent === null ? [] : [completes(parent)];
  }
  if (elementWaitsForInput(element)) return [];
  const fired = targets((elementEnvelope(element)?.boundaries ?? []).flatMap((boundary) => boundary.outgoing)).map(enters);
  const entered = elementScope(element) === null ? [] : programEnteredChildren(program, id);
  return [...fired, ...(entered.length === 0 ? [completes(id)] : entered.map((child) => enters(elementHeader(child).id)))];
}

/**
 * Whether `later` may complete after `earlier` completes, in the closure `earlier` completed in, as far as the program's
 * structure shows (`structuralNext`): a path of at least one step leads from `earlier`'s completion to `later`'s.
 */
export function structurallyFollows(program: Program, earlier: ElementId, later: ElementId): boolean {
  const target = completes(later);
  const seen = new Set<StructuralNode>();
  const frontier: StructuralNode[] = [...structuralNext(program, completes(earlier))];
  while (frontier.length > 0) {
    const node = frontier.shift() as StructuralNode;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    frontier.push(...structuralNext(program, node));
  }
  return false;
}

/**
 * The structural order of two compensation subjects whose records completed in one closure: `later` follows `earlier`
 * and not the other way round, a strict partial order (`Kernel.Laws.IL.structurallyBefore_trans`).
 */
export function structurallyBefore(program: Program, earlier: ElementId, later: ElementId): boolean {
  return structurallyFollows(program, earlier, later) && !structurallyFollows(program, later, earlier);
}

/**
 * Whether the element's occurrences are published: a Link Event, throw or catch, publishes none, since its token passes
 * on as if the Sequence Flow connected the elements around it (`onward`), the observation contract's Link exception
 * ([publication](../../../../docs/kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md#flow-node-occurrences),
 * CIB-AGR-0018).
 */
export function programPublishesOccurrences(program: Program, id: ElementId): boolean {
  const element = programElement(program, id);
  const event = element === null ? null : elementEvent(element);
  return event === null || (eventPayloadLinkThrow(event[1]) === null && eventPayloadLinkCatch(event[1]) === null);
}
