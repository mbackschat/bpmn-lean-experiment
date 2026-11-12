import { compareCanonicalStrings } from "./strict-json.ts";

type Json = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): Json | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;

/**
 * Whether `list` is a name-value list of the scenario schemas: a variable binding list (`$defs/bindings`) or a Map
 * value's entries, the only arrays whose items are objects of exactly `name` and `value`. The wire contract keeps every
 * such list canonically ordered (contracts/README.md), so it is recognised by shape rather than listed by field.
 */
function isNameValueList(list: ReadonlyArray<unknown>): boolean {
  return list.length > 0 && list.every((item) => {
    const record = asRecord(item);
    return record !== undefined && Object.keys(record).length === 2 && "name" in record && "value" in record;
  });
}

function verifyNode(node: unknown, field: string): void {
  if (Array.isArray(node)) {
    if (isNameValueList(node)) {
      const names = node.map((binding) => String(asRecord(binding)?.["name"]));
      for (let index = 1; index < names.length; index++) {
        if (compareCanonicalStrings(names[index - 1]!, names[index]!) >= 0) {
          throw new TypeError(`${field} names must be unique and canonically ordered`);
        }
      }
    }
    for (const item of node) verifyNode(item, field);
    return;
  }
  const record = asRecord(node);
  if (record === undefined) return;
  for (const [key, value] of Object.entries(record)) verifyNode(value, key);
}

/**
 * Refuses a scenario or population scenario holding a name-value list, at any depth, that repeats a name or is out of
 * strict ascending Unicode scalar order. The kernel would run such a scenario while the CIB runner refuses it
 * (`ScenarioVariableBindings.requireCanonical`), so its evidence would silently become a harness failure.
 */
export function verifyCanonicalBindingOrder(document: unknown): void {
  verifyNode(document, "document");
}
