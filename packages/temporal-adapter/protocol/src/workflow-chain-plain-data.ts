/** Rejects executable, cyclic, sparse, symbolic, and non-plain input before field access. */
export function requireWorkflowChainPlainDataTree(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new TypeError("Workflow-chain value must be an acyclic plain-data tree");
  }
  seen.add(value);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== (array ? Array.prototype : Object.prototype) &&
    prototype !== null
  ) {
    throw new TypeError("Workflow-chain value contains a non-plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key === "symbol") ||
    (array && (
      keys.length !== value.length + 1 ||
      !Array.from({ length: value.length }, (_, index) => String(index))
        .every((key) => Object.hasOwn(descriptors, key))
    ))
  ) {
    throw new TypeError("Workflow-chain value contains non-JSON properties");
  }
  for (const key of keys) {
    const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor | undefined;
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      (!array && !descriptor.enumerable) ||
      (array && key !== "length" && !descriptor.enumerable)
    ) {
      throw new TypeError("Workflow-chain value contains an executable property");
    }
    if (key !== "length") {
      requireWorkflowChainPlainDataTree(descriptor.value, seen);
    }
  }
  seen.delete(value);
}
