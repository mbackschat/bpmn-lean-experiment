import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import {
  compareScopeOccurrenceIds,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  ProcessInterfaceScope,
  ScopedVariables,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";

/** Selects ownership before port availability, so a partially populated duplicate cannot hide ambiguity (CDATA-OWNER-01). */
export function selectProcessInterface(
  variables: ScopedVariables,
  owner: ScopeOccurrenceId,
): ProcessInterfaceScope | undefined {
  const matching = variables.processInterfaces.filter((scope) =>
    sameScopeOccurrence(scope.owner, owner)
  );
  return matching.length === 1 ? matching[0] : undefined;
}

export function readProcessInterfaceInput(
  variables: ScopedVariables,
  owner: ScopeOccurrenceId,
  portId: string,
): VariableBinding | undefined {
  return readScalarPort(selectProcessInterface(variables, owner)?.inputs, portId);
}

export function readProcessInterfaceOutput(
  variables: ScopedVariables,
  owner: ScopeOccurrenceId,
  portId: string,
): VariableBinding | undefined {
  return readScalarPort(selectProcessInterface(variables, owner)?.outputs, portId);
}

/** Snapshots the required input; outputs stay unavailable until the called task writes them (CDATA-INPUT-01). */
export function addProcessInterface(
  variables: ScopedVariables,
  owner: ScopeOccurrenceId,
  input: VariableBinding,
): ScopedVariables | null {
  if (!scalar(input) || variables.processInterfaces.some((scope) =>
    sameScopeOccurrence(scope.owner, owner)
  )) {
    return null;
  }
  const index = variables.processInterfaces.findIndex((scope) =>
    compareScopeOccurrenceIds(owner, scope.owner) < 0
  );
  const insertion = index < 0 ? variables.processInterfaces.length : index;
  return {
    ...variables,
    processInterfaces: [
      ...variables.processInterfaces.slice(0, insertion),
      { owner: { ...owner }, inputs: [cloneVariableBinding(input)], outputs: [] },
      ...variables.processInterfaces.slice(insertion),
    ],
  };
}

/** Keeps input snapshots and caller Properties untouched while filling the exact singleton output (CDATA-OUTPUT-01). */
export function writeProcessInterfaceOutput(
  variables: ScopedVariables,
  owner: ScopeOccurrenceId,
  output: VariableBinding,
): ScopedVariables | null {
  const selected = selectProcessInterface(variables, owner);
  if (
    selected === undefined || !scalar(output) ||
    selected.outputs.length > 1 ||
    (selected.outputs.length === 1 && selected.outputs[0]?.name !== output.name)
  ) {
    return null;
  }
  return {
    ...variables,
    processInterfaces: variables.processInterfaces.map((scope) =>
      scope === selected ? { ...scope, outputs: [cloneVariableBinding(output)] } : scope
    ),
  };
}

function readScalarPort(
  bindings: ReadonlyArray<VariableBinding> | undefined,
  portId: string,
): VariableBinding | undefined {
  const matching = bindings?.filter(({ name }) => name === portId);
  const binding = matching?.[0];
  return matching?.length === 1 && binding !== undefined && scalar(binding)
    ? binding
    : undefined;
}

function scalar(binding: VariableBinding): boolean {
  switch (binding.value.kind) {
    case VariableValueKind.String:
    case VariableValueKind.Null:
      return true;
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.StringList:
      return false;
  }
}
