/**
 * IL queries, transcribed from `Kernel/IL/Query.lean`: read-only projections of a `Program` that every layer may
 * use. They project; they never dispatch on what an element means, so matching here does not compete with the
 * dispatch owners. A feature that needs one kind of element uses the projection for it instead of matching
 * `Element` or `EventRole`, which only `step.ts` dispatches on.
 *
 * A Lean function `T.f` is exported as `tF` (`Element.envelope?` is `elementEnvelope`), with `?` dropped and
 * `none` as `null`.
 */
import {
  ElementTag,
  EventRoleTag,
  ValueSourceTag,
  assertNever,
  type ActivityPayload,
  type Boundary,
  type CalledProcess,
  type Element,
  type ElementId,
  type Envelope,
  type EventPayload,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
  type ScopePayload,
  type ValueSource,
  type StartPayload,
  type Subscription,
} from "./types.js";

export function elementHeader(element: Element): Header {
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

/** The envelope of an Activity or Scope; other elements have none. */
export function elementEnvelope(element: Element): Envelope | null {
  switch (element.tag) {
    case ElementTag.Activity:
      return element.payload.envelope;
    case ElementTag.Scope:
      return element.payload.envelope;
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return null;
  }
  return assertNever(element);
}

export function elementActivity(element: Element): readonly [Header, ActivityPayload] | null {
  switch (element.tag) {
    case ElementTag.Activity:
      return [element.header, element.payload];
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return null;
  }
  return assertNever(element);
}

export function elementScope(element: Element): readonly [Header, ScopePayload] | null {
  switch (element.tag) {
    case ElementTag.Scope:
      return [element.header, element.payload];
    case ElementTag.Activity:
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return null;
  }
  return assertNever(element);
}

export function elementEvent(element: Element): readonly [Header, EventPayload] | null {
  switch (element.tag) {
    case ElementTag.Event:
      return [element.header, element.payload];
    case ElementTag.Activity:
    case ElementTag.Scope:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return null;
  }
  return assertNever(element);
}

export function elementGateway(element: Element): readonly [Header, GatewayPayload] | null {
  switch (element.tag) {
    case ElementTag.Gateway:
      return [element.header, element.payload];
    case ElementTag.Activity:
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Start:
      return null;
  }
  return assertNever(element);
}

export function elementStart(element: Element): readonly [Header, StartPayload] | null {
  switch (element.tag) {
    case ElementTag.Start:
      return [element.header, element.payload];
    case ElementTag.Activity:
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
      return null;
  }
  return assertNever(element);
}

/** The subscription of a catch Event. */
export function eventPayloadCatch(payload: EventPayload): Subscription | null {
  const role = payload.role;
  switch (role.tag) {
    case EventRoleTag.Catch:
      return role.subscription;
    case EventRoleTag.Throw:
    case EventRoleTag.LinkCatch:
    case EventRoleTag.LinkThrow:
      return null;
  }
  return assertNever(role);
}

/** The Link name of a throwing Link Event. */
export function eventPayloadLinkThrow(payload: EventPayload): string | null {
  const role = payload.role;
  switch (role.tag) {
    case EventRoleTag.LinkThrow:
      return role.name;
    case EventRoleTag.Catch:
    case EventRoleTag.Throw:
    case EventRoleTag.LinkCatch:
      return null;
  }
  return assertNever(role);
}

/** The Link name of a catching Link Event. */
export function eventPayloadLinkCatch(payload: EventPayload): string | null {
  const role = payload.role;
  switch (role.tag) {
    case EventRoleTag.LinkCatch:
      return role.name;
    case EventRoleTag.Catch:
    case EventRoleTag.Throw:
    case EventRoleTag.LinkThrow:
      return null;
  }
  return assertNever(role);
}

/** The incoming flows of an element; a start Event has none. */
export function elementIncoming(element: Element): readonly FlowId[] {
  switch (element.tag) {
    case ElementTag.Activity:
      return element.payload.envelope.incoming;
    case ElementTag.Scope:
      return element.payload.envelope.incoming;
    case ElementTag.Event:
      return element.payload.incoming;
    case ElementTag.Gateway:
      return element.payload.incoming;
    case ElementTag.Start:
      return [];
  }
  return assertNever(element);
}

export function programElement(program: Program, id: ElementId): Element | null {
  return program.elements.find((element) => elementHeader(element).id === id) ?? null;
}

export function programTarget(program: Program, flow: FlowId): ElementId | null {
  return program.flows.find((candidate) => candidate.id === flow)?.target ?? null;
}

export function programSource(program: Program, flow: FlowId): ElementId | null {
  return program.flows.find((candidate) => candidate.id === flow)?.source ?? null;
}

/** Whether `element` is a process-level element of a called process. */
export function programInCalledProcess(program: Program, element: ElementId): boolean {
  return program.processes.some((process) => process.children.includes(element));
}

/** The elements whose parent is `parent`; `null` is the root process level. */
export function programChildren(program: Program, parent: ElementId | null): readonly Element[] {
  return program.elements.filter((element) => {
    const header = elementHeader(element);
    return header.parent === parent && !(parent === null && programInCalledProcess(program, header.id));
  });
}

export function programCalledProcess(program: Program, id: string): CalledProcess | null {
  return program.processes.find((process) => process.id === id) ?? null;
}

/** The process-level elements of a called process. */
export function programProcessChildren(program: Program, process: CalledProcess): readonly Element[] {
  return process.children.flatMap((child) => {
    const element = programElement(program, child);
    return element === null ? [] : [element];
  });
}

/** A boundary by its id, with the element it is attached to. */
export function programBoundary(program: Program, id: ElementId): readonly [Element, Boundary] | null {
  for (const element of program.elements) {
    const boundary = elementEnvelope(element)?.boundaries.find((candidate) => candidate.id === id);
    if (boundary !== undefined) {
      return [element, boundary];
    }
  }
  return null;
}

export function valueSourceLiteral(value: ValueSource): string | null {
  switch (value.tag) {
    case ValueSourceTag.Literal:
      return value.value;
    case ValueSourceTag.Expression:
      return null;
  }
  return assertNever(value);
}
