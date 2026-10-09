import { decodeDefinitionVersionStartCommand, VariableValueKind } from "@bpmn-lean/platform-contracts";
import type { DefinitionVersionStartCommand } from "@bpmn-lean/platform-contracts";

export type DefinitionStartInput = Readonly<{ name: string; value: string }>;

/** Preserves an exact preset or validates copied explicit String rows as the public Start command. */
export function prepareDefinitionStartCommand(
  inputs: readonly DefinitionStartInput[],
  preset: DefinitionVersionStartCommand | null,
): DefinitionVersionStartCommand {
  if (preset !== null) return preset;
  if (new Set(inputs.map(({ name }) => name)).size !== inputs.length) {
    throw new TypeError("Input names must be unique.");
  }
  const initialVariables = inputs.map(({ name, value }) => ({
    name, value: { kind: VariableValueKind.String, value },
  })).toSorted((left, right) => compareScalarNames(left.name, right.name));
  return decodeDefinitionVersionStartCommand({ initialVariables });
}

function compareScalarNames(left: string, right: string): number {
  const leftScalars = Array.from(left, (scalar) => scalar.codePointAt(0) ?? 0);
  const rightScalars = Array.from(right, (scalar) => scalar.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftScalars.length, rightScalars.length); index += 1) {
    const difference = (leftScalars[index] ?? 0) - (rightScalars[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}
