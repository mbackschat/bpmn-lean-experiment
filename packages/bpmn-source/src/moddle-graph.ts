import { carriesDeclaredDefault } from "./metamodel-defaults.js";

export type ElementRecord = Record<string, unknown>;

export function asElement(value: unknown): ElementRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as ElementRecord)
    : undefined;
}

export function asElementArray(
  value: unknown,
): ReadonlyArray<ElementRecord> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const elements = value.map(asElement);
  return elements.every((element) => element !== undefined)
    ? (elements as ReadonlyArray<ElementRecord>)
    : undefined;
}

/**
 * Whether every own key of `element` is either listed in `allowedKeys` or carries no information.
 *
 * An own key holding its declared metamodel default is admitted without being listed, because the
 * parser resolves that same value when the source omits the attribute; see
 * [the default resolver](./metamodel-defaults.ts). Every other unlisted key is foreign and refuses.
 */
export function hasOnlyModelledKeys(
  element: ElementRecord,
  allowedKeys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(element).every(
    (key) => allowed.has(key) || carriesDeclaredDefault(element, key),
  );
}

export function readId(element: ElementRecord): string | undefined {
  return typeof element.id === "string" && element.id.length > 0
    ? element.id
    : undefined;
}

/**
 * Expands parser-retained foreign attributes by namespace URI.
 *
 * The imported moddle graph stores extension attributes in `$attrs` and
 * namespace declarations on Definitions. Expansion is the admission trust
 * boundary: unknown prefixes, duplicate expanded names, and non-string values
 * reject rather than being silently ignored.
 */
export function readForeignAttributes(
  element: ElementRecord,
  definitions: ElementRecord,
): ReadonlyMap<string, string> | undefined {
  const rawAttributes = asElement(element.$attrs);
  const namespaceAttributes = asElement(definitions.$attrs);
  if (rawAttributes === undefined || namespaceAttributes === undefined) {
    return undefined;
  }
  const expanded = new Map<string, string>();
  for (const [qualifiedName, value] of Object.entries(rawAttributes)) {
    const separator = qualifiedName.indexOf(":");
    if (
      separator <= 0 ||
      separator === qualifiedName.length - 1 ||
      typeof value !== "string"
    ) {
      return undefined;
    }
    const prefix = qualifiedName.slice(0, separator);
    const localName = qualifiedName.slice(separator + 1);
    const namespace = namespaceAttributes[`xmlns:${prefix}`];
    if (typeof namespace !== "string") {
      return undefined;
    }
    const expandedName = `${namespace}#${localName}`;
    if (expanded.has(expandedName)) {
      return undefined;
    }
    expanded.set(expandedName, value);
  }
  return expanded;
}
