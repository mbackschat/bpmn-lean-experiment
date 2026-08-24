import type { DeepReadonly } from "@bpmn-lean/contract-types";

import {
  sameCanonicalJsonBytes,
  serializeCanonicalJsonValue,
} from "./canonical-json.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
} from "./decoder-primitives.js";
import { requirePublicationVariableValue } from "./execution-publication-variable-value-decoder.js";
import type { VariableBinding } from "./execution-publications.js";
import { parseStrictJson } from "./strict-json.js";

/** The exact Product 2 command for starting one immutable deployed definition version. */
export type DefinitionVersionStartCommand = DeepReadonly<{
  initialVariables: VariableBinding[];
}>;

/** Strictly validates the complete public start command without selecting BPMN meaning. */
export function decodeDefinitionVersionStartCommand(
  value: unknown,
): DefinitionVersionStartCommand {
  const label = "definition version start command";
  requireObject(value, label);
  requireExactKeys(value, label, ["initialVariables"]);
  const initialVariables = readOwn(value, "initialVariables");
  if (!isDenseArray(initialVariables)) {
    throw new TypeError(`${label}.initialVariables must be a dense array`);
  }
  const names = initialVariables.map((binding, index) => {
    const bindingLabel = `${label}.initialVariables[${index}]`;
    requireObject(binding, bindingLabel);
    requireExactKeys(binding, bindingLabel, ["name", "value"]);
    const name = requireNonemptyString(readOwn(binding, "name"), `${bindingLabel}.name`);
    requirePublicationVariableValue(readOwn(binding, "value"), `${bindingLabel}.value`);
    return name;
  });
  if (names.some((name, index) => index > 0 && compareScalarStrings(names[index - 1]!, name) >= 0)) {
    throw new TypeError(`${label}.initialVariables must use canonical strict ascending order`);
  }
  return value as DefinitionVersionStartCommand;
}

/** Validates and emits the sole canonical UTF-8 representation of one start command. */
export function serializeDefinitionVersionStartCommand(value: unknown): Uint8Array {
  return serializeCanonicalJsonValue(decodeDefinitionVersionStartCommand(value));
}

/** Accepts only strict JSON bytes already identical to the canonical start-command bytes. */
export function decodeCanonicalDefinitionVersionStartCommand(
  bytes: Uint8Array,
): DefinitionVersionStartCommand {
  try {
    const command = decodeDefinitionVersionStartCommand(parseStrictJson(bytes));
    const canonical = serializeCanonicalJsonValue(command);
    if (!sameCanonicalJsonBytes(bytes, canonical)) throw new TypeError("noncanonical bytes");
    return command;
  } catch (error: unknown) {
    throw new TypeError("malformed canonical definition start command", { cause: error });
  }
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) => key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length));
}

function compareScalarStrings(left: string, right: string): number {
  const a = Array.from(left, (scalar) => scalar.codePointAt(0)!);
  const b = Array.from(right, (scalar) => scalar.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}
