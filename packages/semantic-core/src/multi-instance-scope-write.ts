import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import { writeScopeVariables } from "./scope-variable-data.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState, ScopedVariables, ScopeOccurrenceId } from "./semantic-process-state.js";
import { isSerialBusinessIdentifier } from "./serial-business-task-policy.js";
import { compareCanonicalStrings } from "./wire.js";

export enum MultiInstanceScopeWriteKind { UserTask = "userTask", ServiceTask = "serviceTask" }

type BoundScopeWritePolicy = Readonly<{
  collectionName: string;
  itemName: string;
  completionBooleanName: string | null;
}>;

/** SMIS-DATA-01/PMIS-DATA-01 share write routing after the caller validates its complete live body binding. */
export function writeBoundMultiInstanceScopeValues(program: Pick<SemanticProcessProgram, "operations">,
  state: RuntimeState, owner: ScopeOccurrenceId, entry: BoundScopeWritePolicy,
  values: readonly VariableBinding[], kind: MultiInstanceScopeWriteKind): ScopedVariables | null {
  const handlers = new Set(program.operations.flatMap(operation => operation.kind === SemanticOperationKind.AwaitEffect
    ? [operation.effect.descriptor.operation] : []));
  const condition = entry.completionBooleanName;
  if (!values.every(({ name, value }, index) => isSerialBusinessIdentifier(name) && !handlers.has(name) &&
      name !== entry.collectionName && name !== entry.itemName &&
      (index === 0 || compareCanonicalStrings(values[index - 1]!.name, name) < 0) &&
      (name === condition ? kind === MultiInstanceScopeWriteKind.UserTask && value.kind === VariableValueKind.Boolean
        : value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null))) return null;
  const variables = writeScopeVariables(state.variables, owner, values.filter(({ name }) => name !== condition));
  if (variables === null) return null;
  return { ...variables, process: { bindings: mergeProcessVariableBindings(variables.process.bindings,
    values.filter(({ name }) => name === condition)) } };
}
