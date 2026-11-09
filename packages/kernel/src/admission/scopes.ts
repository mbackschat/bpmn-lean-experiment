/** Admission of Scopes, transcribed from `Kernel/Admission/Scopes.lean`. A refusal carries a stable code. */
import {
  ScopeKindTag,
  TransactionMethodTag,
  assertNever,
  elementActivity,
  elementHeader,
  elementScope,
  elementStart,
  programBeginsImplicitly,
  programChildren,
  type Header,
  type Program,
  type ScopePayload,
  type Subscription,
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

/**
 * A Transaction's method is carried only by BPMN; the kernel runs the compensate method (`BpmnParse#parseTransaction`
 * reads no such attribute).
 */
function transaction(payload: ScopePayload): string | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.Transaction:
      return kind.payload.method.tag === TransactionMethodTag.Compensate ? null : "scope.transaction.method";
    case ScopeKindTag.Embedded:
    case ScopeKindTag.EventSubProcess:
      return null;
  }
  return assertNever(kind);
}

/** The start subscription of an interrupting Event Sub-Process, `null` for any other Scope. */
export function interruptingStart(payload: ScopePayload): Subscription | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return kind.interrupting ? kind.start : null;
    case ScopeKindTag.Embedded:
    case ScopeKindTag.Transaction:
      return null;
  }
  return assertNever(kind);
}

/** A local variable is declared by an input mapping; a declared local without one has no initial value the kernel could choose. */
export function scope(program: Program, header: Header, payload: ScopePayload): string | null {
  const declared = payload.envelope.inputs.map((mapping) => mapping.target);
  if (payload.envelope.multiInstance !== null) return "scope.multiInstance";
  if (payload.localVariables.some((name) => !declared.includes(name))) return "scope.localVariableWithoutInput";
  return transaction(payload) ?? implicitStart(program, header);
}
