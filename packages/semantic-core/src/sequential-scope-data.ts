import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import { evaluateInputMappings, mergeProcessVariableBindings, projectActivityVariableScopeResult } from "./semantic-process-data.js";
import { writeScopeVariables } from "./scope-variable-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState, ScopedVariables, ScopeOccurrenceId } from "./semantic-process-state.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { VariableMapping } from "./semantic-value-contract.js";
import { isSerialBusinessIdentifier } from "./serial-business-task-policy.js";
import { sequentialScopeBindingForOwner } from "./sequential-scope-binding.js";
import type { SequentialScopeBinding } from "./sequential-scope-binding.js";
import { compareCanonicalStrings } from "./wire.js";

export enum SequentialScopeWriteKind { UserTask = "userTask", ServiceTask = "serviceTask" }

/** SMIS-DATA-01 snapshots only declared inputs; inherited Process data is never copied into the body frame. */
export function evaluateSequentialScopeInputs(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId, mappings: readonly VariableMapping[]): readonly VariableBinding[] | null {
  const binding = sequentialScopeBindingForOwner(program, state, owner);
  if (binding === undefined) return null;
  const handlers = handlerNames(program);
  const enclosing: VariableBinding[] = [];
  for (const mapping of mappings) {
    switch (mapping.expression.kind) {
      case MappingExpressionKind.StringLiteral: break;
      case MappingExpressionKind.LocalVariable: return null;
      case MappingExpressionKind.EnclosingVariable: {
        const name = mapping.expression.name;
        if (handlers.has(name)) return null;
        if (enclosing.some(binding => binding.name === name)) break;
        const value = readEnclosing(binding, state, name);
        if (value === undefined) return null;
        enclosing.push(value);
        break;
      }
    }
  }
  return evaluateInputMappings(mappings, enclosing);
}

/** SMIS-DATA-01 routes declared names locally; SMIS-EARLY-01 reserves the Process condition for Boolean human writes. */
export function writeSequentialScopeValues(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId, values: readonly VariableBinding[],
  kind: SequentialScopeWriteKind): ScopedVariables | null {
  const binding = sequentialScopeBindingForOwner(program, state, owner);
  if (binding === undefined) return null;
  const handlers = handlerNames(program);
  const condition = binding.entry.completionBooleanName;
  if (!values.every(({ name, value }, index) => isSerialBusinessIdentifier(name) && !handlers.has(name) &&
      name !== binding.entry.collectionName && name !== binding.entry.itemName &&
      (index === 0 || compareCanonicalStrings(values[index - 1]!.name, name) < 0) &&
      (name === condition ? kind === SequentialScopeWriteKind.UserTask && value.kind === VariableValueKind.Boolean
        : value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null))) return null;
  const variables = writeScopeVariables(state.variables, owner, values.filter(({ name }) => name !== condition));
  if (variables === null) return null;
  return { ...variables, process: { bindings: mergeProcessVariableBindings(variables.process.bindings,
    values.filter(({ name }) => name === condition)) } };
}

function handlerNames(program: Pick<SemanticProcessProgram, "operations">): ReadonlySet<string> {
  return new Set(program.operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect
    ? [operation.effect.descriptor.operation] : []));
}

function readEnclosing(binding: SequentialScopeBinding, state: RuntimeState, name: string): VariableBinding | undefined {
  const locals = binding.locals.bindings.filter(value => value.name === name);
  if (locals.length > 1) return undefined;
  const local = locals[0];
  if (local !== undefined) return scalar(local) ? local : undefined;
  if (name === binding.entry.itemName) return { name, value: { kind: VariableValueKind.String, value: binding.controller.currentItem } };
  const candidates = state.variables.process.bindings.filter(value => value.name === name);
  const value = candidates[0];
  return candidates.length === 1 && value !== undefined && scalar(value) ? value : undefined;
}

function scalar(binding: VariableBinding): boolean {
  return binding.value.kind === VariableValueKind.String || binding.value.kind === VariableValueKind.Null;
}


/** SMIS-DATA-01 commits explicit effect results through the live body binding and disposes their local frame atomically. */
export function completeSequentialScopeEffectData(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, wait: RuntimeState["effectWaits"][number],
  localPatch: readonly VariableBinding[]): ScopedVariables | null {
  const result = projectActivityVariableScopeResult(state.variables, wait.id, wait.outputMappings, localPatch, true);
  return result === null ? null : writeSequentialScopeValues(program,
    { ...state, variables: result.variables }, wait.owner, result.outputs, SequentialScopeWriteKind.ServiceTask);
}
