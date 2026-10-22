import type { VariableMappingCallData } from "./call-data-contract.js";
import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import {
  NestedScopeReadKind, readBindingOutcome, resolveNestedScopeRead, writeNestedScopeVariables,
} from "./nested-scope-data.js";
import type { NestedScopeRead } from "./nested-scope-data.js";
import {
  invokeCalledProcess, returnCalledProcess, selectCalledProcessInvocation, selectReturnCalledProcess,
} from "./semantic-process-call-runtime.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";
import type { InvokeProcessOperation, ReturnProcessOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { compareScopeOccurrenceIds, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { cloneVariableBinding } from "./variable-value.js";

/**
 * CIB `camunda:in`/`camunda:out` copies across the instance boundary (CVM-IN-01, CVM-OUT-01, CVM-RETIRE-01), an
 * independent transcription of the Lean `CallVariableMapping` evaluators. An absent source copies a present null, as
 * CIB's `VariableScope.getVariable` returns null for an unset name; a refused read disables the step.
 */

const nullValue = { kind: VariableValueKind.Null } as const;

/** Every target's value, read before any write so no mapping can observe another; `null` when a read is refused. */
function copyValues(mappings: readonly VariableMapping[], read: (name: string) => NestedScopeRead):
  readonly VariableBinding[] | null {
  const values: VariableBinding[] = [];
  for (const { target, expression } of mappings) {
    if (expression.kind === MappingExpressionKind.StringLiteral) return null;
    const outcome = read(expression.name);
    switch (outcome.kind) {
      case NestedScopeReadKind.Refused: return null;
      case NestedScopeReadKind.Absent: values.push({ name: target, value: nullValue }); break;
      case NestedScopeReadKind.Present: values.push(cloneVariableBinding({ name: target, value: outcome.value })); break;
    }
  }
  return values;
}

/** CVM-IN-01: the called-root frame's bindings, read along the Call's enclosing chain by NSD-READ-01. */
export function evaluateCallInputs(program: SemanticProcessProgram, state: RuntimeState, caller: ScopeOccurrenceId,
  data: VariableMappingCallData): readonly VariableBinding[] | null {
  return copyValues(data.inputs, name => resolveNestedScopeRead(program, state.variables, caller.processInstanceId,
    caller.definitionScopeId, name));
}

/** CVM-OUT-01: the output values, every source read from the called-root frame alone. */
export function evaluateCallOutputs(state: RuntimeState, calledRoot: ScopeOccurrenceId,
  data: VariableMappingCallData): readonly VariableBinding[] | null {
  const frames = state.variables.scopes.filter(frame => sameScopeOccurrence(frame.owner, calledRoot));
  const frame = frames.length === 1 ? frames[0] : undefined;
  return frame === undefined ? null : copyValues(data.outputs, name => readBindingOutcome(frame.bindings, name));
}

/** CVM-IN-01 and CVM-ISOLATE-01: the Call record, the called root and its frame are created by one rewrite. */
export function invokeCalledProcessWithMappings(program: SemanticProcessProgram, operation: InvokeProcessOperation,
  data: VariableMappingCallData, state: RuntimeState, caller: ScopeOccurrenceId): RuntimeState | null {
  const selected = selectCalledProcessInvocation(operation, state, caller);
  if (selected === null) return null;
  const bindings = evaluateCallInputs(program, state, caller, data);
  const invoked = bindings === null ? null : invokeCalledProcess(operation, state, caller);
  if (bindings === null || invoked === null) return null;
  const owner = selected.record.calledRoot;
  if (invoked.variables.scopes.some(frame => sameScopeOccurrence(frame.owner, owner))) return null;
  const insertion = invoked.variables.scopes.findIndex(frame => compareScopeOccurrenceIds(owner, frame.owner) < 0);
  const index = insertion < 0 ? invoked.variables.scopes.length : insertion;
  const frame = { owner: { ...owner }, bindings: mergeProcessVariableBindings([], bindings) };
  return { ...invoked, variables: { ...invoked.variables,
    scopes: [...invoked.variables.scopes.slice(0, index), frame, ...invoked.variables.scopes.slice(index)] } };
}

/**
 * CVM-OUT-01 and CVM-RETIRE-01: outputs are read before the called tree is disposed and written by NSD-WRITE-01 from
 * the Call's enclosing occurrence after it, so validation, writes, disposal and the caller token commit together.
 */
export function returnCalledProcessWithMappings(program: SemanticProcessProgram, operation: ReturnProcessOperation,
  data: VariableMappingCallData, state: RuntimeState): RuntimeState | null {
  const selected = selectReturnCalledProcess(operation, state);
  if (selected === null) return null;
  const values = evaluateCallOutputs(state, selected.record.calledRoot, data);
  const returned = values === null ? null : returnCalledProcess(operation, state);
  if (values === null || returned === null) return null;
  const { caller } = selected.record;
  const variables = writeNestedScopeVariables(program, returned.variables, caller.processInstanceId,
    caller.definitionScopeId, values);
  return variables === null ? null : { ...returned, variables };
}
