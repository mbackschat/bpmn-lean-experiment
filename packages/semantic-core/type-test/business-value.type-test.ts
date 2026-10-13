import { VariableValueKind } from "../src/contract.js";
import type { BusinessValue, VariableValue } from "../src/contract.js";

declare const business: BusinessValue;
declare const variable: VariableValue;

// Every business arm is also a variable-value arm, but the legacy StringList arm is not a business arm at any depth.
export const widened: VariableValue = business;
// @ts-expect-error the wider variable-value union includes the legacy StringList arm
export const narrowed: BusinessValue = variable;
// @ts-expect-error a root StringList literal is not a BusinessValue
export const legacy: BusinessValue = { kind: VariableValueKind.StringList, value: ["a"] };
export const nestedLegacy: BusinessValue = {
  kind: VariableValueKind.List,
  // @ts-expect-error a StringList member is not a BusinessValue
  value: [{ kind: VariableValueKind.StringList, value: ["a"] }],
};

// A concrete recursive literal keeps its exact shape through the Decimal, List and Map arms.
export const order = {
  kind: VariableValueKind.Map,
  value: [
    { name: "items", value: { kind: VariableValueKind.List, value: [{ kind: VariableValueKind.Null }] } },
    { name: "total", value: { kind: VariableValueKind.Decimal, coefficient: "12345", scale: 2 } },
  ],
} as const satisfies BusinessValue;

switch (business.kind) {
  case VariableValueKind.Decimal:
    // @ts-expect-error Decimal components are immutable
    business.scale = 1;
    break;
  case VariableValueKind.List: {
    // @ts-expect-error List storage is immutable
    business.value.push(business);
    // @ts-expect-error List members are deeply immutable
    business.value[0]!.kind = VariableValueKind.Null;
    // The recursion is closed: a member is again a BusinessValue.
    const member: BusinessValue = business.value[0]!;
    void member;
    break;
  }
  case VariableValueKind.Map: {
    // @ts-expect-error Map entry names are immutable
    business.value[0]!.name = "changed";
    // @ts-expect-error Map entry values are deeply immutable
    business.value[0]!.value.kind = VariableValueKind.Null;
    break;
  }
  case VariableValueKind.Boolean:
  case VariableValueKind.Integer:
  case VariableValueKind.String:
  case VariableValueKind.Null:
    break;
  default: {
    // Exhaustive over exactly the seven business arms; a new arm fails here before it reaches a consumer.
    const unreachable: never = business;
    void unreachable;
  }
}
