/** Admission of Scopes and scope membership, transcribed from `Kernel/Admission/Scopes.lean`. A refusal carries a stable code. */
import {
  ScopeKindTag,
  TransactionMethodTag,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementHeader,
  elementScope,
  elementStart,
  programBeginsImplicitly,
  programBoundary,
  programChildren,
  programElement,
  type CalledProcess,
  type Element,
  type ElementId,
  type Envelope,
  type Header,
  type Program,
  type ScopePayload,
  type Subscription,
  type TransactionScope,
} from "../il/types.js";

/** Whether the Activity is begun by its parent Scope's implicit start. */
export function implicitChild(program: Program, header: Header): boolean {
  if (header.parent === null) return false;
  const children = programChildren(program, header.parent);
  return !children.some((child) => elementStart(child) !== null) &&
    children.some((child) => elementHeader(child).id === header.id && programBeginsImplicitly(program, child));
}

/**
 * A Scope without a none start Event begins its Activities without incoming flow; a Gateway or Event without one would
 * also begin (§13.3.4), which the kernel has no token for.
 */
function implicitStart(program: Program, header: Header): string | null {
  const children = programChildren(program, header.id);
  if (children.some((child) => elementStart(child) !== null)) return null;
  const tokenless = children.some((child) =>
    programBeginsImplicitly(program, child) && elementActivity(child) === null && elementScope(child) === null);
  return tokenless ? "scope.implicitStart" : null;
}

/** The Transaction a Scope is, `null` for any other Scope. */
function transactionOf(payload: ScopePayload): TransactionScope | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.Transaction:
      return kind.payload;
    case ScopeKindTag.Embedded:
    case ScopeKindTag.EventSubProcess:
      return null;
  }
  return assertNever(kind);
}

/** The start subscription of an Event Sub-Process and whether it interrupts, `null` for any other Scope. */
export function eventSubProcessOf(payload: ScopePayload): readonly [Subscription, boolean] | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return [kind.start, kind.interrupting];
    case ScopeKindTag.Embedded:
    case ScopeKindTag.Transaction:
      return null;
  }
  return assertNever(kind);
}

/**
 * A Transaction's method is carried only by BPMN; the kernel runs the compensate method (`BpmnParse#parseTransaction`
 * reads no such attribute).
 */
function transaction(payload: ScopePayload): string | null {
  const record = transactionOf(payload);
  return record === null || record.method.tag === TransactionMethodTag.Compensate ? null : "scope.transaction.method";
}

export function isTransaction(payload: ScopePayload): boolean {
  return transactionOf(payload) !== null;
}

/** Whether an element is a Transaction. */
export function transactionElement(program: Program, id: ElementId): boolean {
  const element = programElement(program, id);
  const scope = element === null ? null : elementScope(element);
  return scope !== null && isTransaction(scope[1]);
}

/** The start subscription of an interrupting Event Sub-Process, `null` for any other Scope. */
export function interruptingStart(payload: ScopePayload): Subscription | null {
  const subProcess = eventSubProcessOf(payload);
  return subProcess !== null && subProcess[1] ? subProcess[0] : null;
}


/**
 * An Event Sub-Process is outside normal flow (BPMN 2.0.2 §10.3.5); a boundary on it would lead its exception flow into
 * the parent's normal flow, which §13.5.4 does not give.
 */
function eventSubProcessBoundary(payload: ScopePayload): string | null {
  return eventSubProcessOf(payload) !== null && payload.envelope.boundaries.length > 0 ? "scope.eventSubProcess.boundary" : null;
}

/** A local variable is declared by an input mapping; a declared local without one has no initial value the kernel could choose. */
export function scope(program: Program, header: Header, payload: ScopePayload): string | null {
  const declared = payload.envelope.inputs.map((mapping) => mapping.target);
  if (payload.envelope.multiInstance !== null) return "scope.multiInstance";
  if (payload.localVariables.some((name) => !declared.includes(name))) return "scope.localVariableWithoutInput";
  return eventSubProcessBoundary(payload) ?? transaction(payload) ?? implicitStart(program, header);
}

/**
 * Every parent is a Scope that lists the element as a child, every child a Scope lists, an element or a boundary of one,
 * sits in that Scope, a called process lists only process-level children, and a compensation handler names an element:
 * an element outside its parent's list, or listed by a Scope it does not sit in, would be begun or cleared by one owner
 * and not the other.
 */
export function references(program: Program): string | null {
  const parentOf = (id: ElementId): ElementId | null | undefined => {
    const element = programElement(program, id);
    if (element !== null) return elementHeader(element).parent;
    const boundary = programBoundary(program, id);
    return boundary === null ? undefined : elementHeader(boundary[0]).parent;
  };
  const member = (element: Element): boolean => {
    const header = elementHeader(element);
    if (header.parent === null) return true;
    const parent = programElement(program, header.parent);
    const scope = parent === null ? null : elementScope(parent);
    return scope !== null && scope[1].children.includes(header.id);
  };
  const lists = (element: Element): boolean => {
    const scope = elementScope(element);
    return scope === null || scope[1].children.every((child) => parentOf(child) === scope[0].id);
  };
  const handler = (element: Element): boolean => {
    const id = elementEnvelope(element)?.compensationHandler ?? null;
    return id === null || programElement(program, id) !== null;
  };
  const called = (process: CalledProcess): boolean => process.children.every((child) => parentOf(child) === null);
  const resolved = program.elements.every(member) && program.elements.every(lists) && program.elements.every(handler) &&
    program.processes.every(called);
  return resolved ? null : "il.reference";
}

/** Whether `id` lies in the subtree of `ancestor`, itself included. */
function within(program: Program, ancestor: ElementId, fuel: number, id: ElementId | null): boolean {
  if (fuel === 0 || id === null) return false;
  if (id === ancestor) return true;
  const element = programElement(program, id);
  return within(program, ancestor, fuel - 1, element === null ? null : elementHeader(element).parent);
}

/**
 * When a Sub-Process completes, the records retained in it pass to its compensation handler or, without one, to its
 * parent (BPMN 2.0.2 §13.5.5); that implicit and recursive compensation is contradictory while BPMN21-403 is open. A
 * subject is refused when the Scope retaining it can hand its records on: to the parent occurrence, where a Compensation
 * throw shares that parent, or to the Scope's handler, whose body throws Compensation (PC-COMPENSATION-03). `throws`
 * lists the Compensation throws.
 */
function handOn(program: Program, throws: readonly Element[], fuel: number, scope: ElementId | null): string | null {
  if (fuel === 0 || scope === null) return null;
  const retaining = programElement(program, scope);
  if (retaining === null) return null;
  const handler = elementEnvelope(retaining)?.compensationHandler ?? null;
  if (handler !== null) {
    return throws.some((thrower) => within(program, handler, program.elements.length + 1, elementHeader(thrower).id))
      ? "compensation.recursive"
      : null;
  }
  const parent = elementHeader(retaining).parent;
  if (throws.some((thrower) => elementHeader(thrower).parent === parent)) return "compensation.implicit";
  return handOn(program, throws, fuel - 1, parent);
}

export function nestedCompensation(program: Program, throws: readonly Element[], header: Header, envelope: Envelope): string | null {
  return envelope.compensationHandler === null ? null : handOn(program, throws, program.elements.length + 1, header.parent);
}
