import { VariableValueKind } from "./contract.js";
import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { FlowNodeOccurrenceTerminalKind, SemanticFlowNodeOccurrenceAnchorKind } from "./flow-node-occurrence-lifecycle.js";
import type { UnnumberedFlowNodeOccurrenceEnd } from "./flow-node-occurrence-lifecycle.js";
import { ParallelScopeRetirementKind, retireParallelScopeIteration } from "./parallel-scope-population.js";
import { parallelScopeBinding } from "./parallel-scope-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { isScopeOccurrenceQuiescent } from "./semantic-process-scope-runtime.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeScopeOccurrence, RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

/** PMIS-END-01/PMIS-CANCEL-01 classify exact predecessor membership, never disappearance in a state difference. */
export function parallelScopeRetirementEnds(
  program: SemanticProcessProgram, before: RuntimeState,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteParallelMultiInstanceScope }>,
  owner: ScopeOccurrenceId,
  cancelledRegion: (scope: RuntimeScopeOccurrence) => UnnumberedFlowNodeOccurrenceEnd[],
): UnnumberedFlowNodeOccurrenceEnd[] | null {
  const entries = program.operations.filter(candidate => candidate.id === operation.entryOperationId);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.kind !== SemanticOperationKind.EnterParallelMultiInstanceScope ||
      !sameJson(entry.origin, operation.origin) || entry.childScopeId !== owner.definitionScopeId ||
      !operationIsSelectedFromProgram(program, operation, owner)) return null;
  const completions = program.operations.filter(candidate => candidate.kind === SemanticOperationKind.CompleteParallelMultiInstanceScope &&
    candidate.entryOperationId === entry.id);
  const definitions = program.definitionScopes.filter(({ id }) => id === entry.childScopeId);
  const descriptor = { ...entry, elementId: entry.origin.elementId };
  const binding = parallelScopeBinding(descriptor, before, owner);
  if (completions.length !== 1 || completions[0]?.id !== operation.id || binding === null ||
      definitions.length !== 1 || definitions[0]?.originElementId !== entry.origin.elementId ||
      definitions[0]?.parentScopeId !== binding.activity.owner.definitionScopeId ||
      !operationIsSelectedFromProgram(program, entry, binding.activity.owner) ||
      candidateProcessId(program, before, owner) === null ||
      before.scopeOccurrences.filter(({ id }) => id.definitionScopeId === entry.childScopeId).length !== binding.iterations.length ||
      before.variables.scopes.filter(({ owner: frame }) => frame.definitionScopeId === entry.childScopeId).length !== binding.iterations.length ||
      before.activityOccurrences.filter(({ id }) => id.activityElementId === entry.origin.elementId).length !== 1 ||
      (before.parallelScopeControllers ?? []).filter(({ id }) => id.activityElementId === entry.origin.elementId).length !== 1 ||
      !isScopeOccurrenceQuiescent(before, binding.body)) return null;
  let condition = false;
  if (entry.completionBooleanName !== null) {
    const values = before.variables.process.bindings.filter(({ name }) => name === entry.completionBooleanName);
    const value = values[0]?.value;
    if (values.length !== 1 || value?.kind !== VariableValueKind.Boolean) return null;
    condition = value.value;
  }
  const retirement = retireParallelScopeIteration(binding.controller, binding.iterations, owner, condition);
  if (retirement === null) return null;
  const completed: UnnumberedFlowNodeOccurrenceEnd = {
    anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: owner },
    terminal: FlowNodeOccurrenceTerminalKind.Completed,
  };
  switch (retirement.kind) {
    case ParallelScopeRetirementKind.Remaining:
    case ParallelScopeRetirementKind.NaturalCompletion:
      return [completed];
    case ParallelScopeRetirementKind.EarlyCompletion: {
      const cancelled: UnnumberedFlowNodeOccurrenceEnd[] = [];
      for (const { scope } of retirement.cancelled) {
        const body = binding.bodies.find(({ id }) => sameScopeOccurrence(id, scope));
        if (body === undefined) return null;
        cancelled.push(...cancelledRegion(body));
      }
      return [completed, ...cancelled];
    }
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
