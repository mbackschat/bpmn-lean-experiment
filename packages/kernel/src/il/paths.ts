/**
 * Sequence Flow paths, transcribed from `Kernel/IL/Paths.lean`: where a token goes on from an element, and whether a
 * Sequence Flow path leads from one element to another through nodes that are no Activity and leave no record.
 * `feature/compensation.ts` orders handlers along such paths (BPMN 2.0.2 §13.5.5, issue #96) and `admission/scopes.ts`
 * refuses a model whose records could not show the path a token took, so the order the kernel runs and the models
 * admission accepts derive from this one relation.
 */
import {
  Placement,
  elementEvent,
  elementGateway,
  elementOutgoing,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programBoundary,
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
