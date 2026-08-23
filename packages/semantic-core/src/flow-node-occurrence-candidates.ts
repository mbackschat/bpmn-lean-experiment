/**
 * Which BPMN element and Process a selected operation or element occurrence belongs to.
 *
 * Three occurrence owners must answer the same two questions before they can name a flow node: is
 * this operation the one the Program selected for this runtime owner, and which Process does that
 * owner belong to. The answers live here rather than beside any one caller because one of those
 * callers is reached *from* another, so holding them in either would make the two modules import
 * each other.
 *
 * Both answers fail closed, and a `null` is never "not applicable": it means the runtime state and
 * the Program disagree about a binding the projection is about to publish. Every caller must refuse
 * rather than substitute a default, because a published occurrence naming the wrong Process is
 * indistinguishable downstream from a correct one.
 */
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export type CandidateFlowNodeOccurrence = Readonly<{
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

/** Binds an instantaneous operation-origin start to its exact selected owner. */
export function candidateOperationOccurrence(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
): CandidateFlowNodeOccurrence | null {
  return operationIsSelectedFromProgram(program, operation, owner)
    ? candidateElementOccurrence(program, state, operation.origin.elementId, owner)
    : null;
}

/** Binds a route-selected BPMN element to an exact runtime owner. */
export function candidateElementOccurrence(
  program: SemanticProcessProgram,
  state: RuntimeState,
  elementId: string,
  owner: ScopeOccurrenceId,
): CandidateFlowNodeOccurrence | null {
  const processId = candidateProcessId(program, state, owner);
  return processId === null || elementId.length === 0
    ? null
    : { processId, elementId, owner };
}

/**
 * Whether this exact operation is the one the Program binds to this owner's definition scope.
 *
 * Identity alone is not enough, which is why the whole operation is compared and not just its `id`:
 * a caller holding a stale copy of an operation that has since changed would otherwise project a
 * start from a definition the Program no longer carries. Exactly one scope binding is required for
 * the same reason the wait joins require exactly one match, an ambiguous binding being a state no
 * projection may silently resolve.
 */
export function operationIsSelectedFromProgram(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId,
): boolean {
  const bindings = program.operationScopes.filter(({ operationId }) => operationId === operation.id);
  return program.operations.filter((candidate) =>
    candidate.id === operation.id && sameJson(candidate, operation)
  ).length === 1 && bindings.length === 1 && bindings[0]?.scopeId === owner.definitionScopeId;
}

/**
 * Walks one scope occurrence to its root and answers which Process it executes.
 *
 * The walk is guarded against a cycle in `parent` rather than trusting the state to be acyclic,
 * because this runs on states a projection has not yet validated. Every step re-checks that the
 * Program's parent scope and the state's parent occurrence agree and that the Process instance does
 * not change, so a subtree spliced under a foreign parent fails here instead of publishing its
 * elements under the wrong Process. A root that is not the started instance must be a called
 * Process, and its declared origin must match the recorded call.
 */
export function candidateProcessId(
  program: SemanticProcessProgram,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): string | null {
  if (state.control.kind === ControlStateKind.NotStarted) return null;
  let record = only(state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner)));
  const seen = new Set<string>();
  if (record === undefined) return null;
  while (record.parent !== null) {
    if (seen.has(scopeKey(record.id))) return null;
    seen.add(scopeKey(record.id));
    const definition = only(program.definitionScopes.filter(({ id }) => id === record!.id.definitionScopeId));
    const parent = only(state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, record!.parent!)));
    if (definition === undefined || parent === undefined ||
        definition.parentScopeId !== parent.id.definitionScopeId ||
        parent.id.processInstanceId !== record.id.processInstanceId) return null;
    record = parent;
  }
  const root = only(program.definitionScopes.filter(({ id, parentScopeId }) =>
    id === record!.id.definitionScopeId && parentScopeId === null
  ));
  if (root === undefined) return null;
  if (record.id.processInstanceId === state.control.instanceId) {
    return root.originElementId === program.processId ? program.processId : null;
  }
  const call = only(state.calledProcessOccurrences.filter(({ calledRoot }) =>
    sameScopeOccurrence(calledRoot, record!.id)
  ));
  return call !== undefined && call.calledProcessId === root.originElementId
    ? call.calledProcessId
    : null;
}

function scopeKey(id: ScopeOccurrenceId): string {
  return JSON.stringify([id.processInstanceId, id.definitionScopeId, id.activation]);
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
