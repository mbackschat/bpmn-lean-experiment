/** Projects raw CIB Process-variable carriers into the closed semantic wire. */
import type {
  VariableBinding,
} from "../packages/semantic-core/src/index.ts";
import type {
  ProcessVariableSnapshot,
} from "./contract-cib-evidence.ts";
import { requireUnicodeScalarString } from "./strict-json.ts";

export function projectCibProcessVariable(
  variable: ProcessVariableSnapshot,
): VariableBinding {
  const value = projectCibValue(variable.value);
  return { name: variable.name, value } as VariableBinding;
}

function projectCibValue(value: ProcessVariableSnapshot["value"]): unknown {
  switch (typeof value) {
    case "string":
      return { kind: "string", value };
    case "boolean":
      return { kind: "boolean", value };
    case "number":
      if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
        throw new TypeError("unsupported raw CIB integer variable");
      }
      return { kind: "integer", value };
    case "object":
      if (value === null) return { kind: "null" };
      if (!Array.isArray(value)) {
        throw new TypeError("unsupported raw CIB variable object");
      }
      return projectStringList(value);
    default: {
      const unsupported: never = value;
      throw new TypeError(
        `unsupported raw CIB variable: ${String(unsupported)}`,
      );
    }
  }
}

function projectStringList(value: ReadonlyArray<string>): unknown {
  if (value.length > 32) {
    throw new TypeError("raw CIB string list has more than 32 members");
  }
  for (const member of value) {
    requireUnicodeScalarString(member, "raw CIB string-list member");
    if (Buffer.byteLength(member, "utf8") > 1_024) {
      throw new TypeError("raw CIB string-list member exceeds 1024 UTF-8 bytes");
    }
  }
  const projected = { kind: "stringList", value: [...value] };
  if (Buffer.byteLength(JSON.stringify(projected), "utf8") > 16_384) {
    throw new TypeError("raw CIB string-list value exceeds 16384 UTF-8 bytes");
  }
  return projected;
}
