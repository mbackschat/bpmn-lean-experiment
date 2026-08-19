/**
 * Structural readers over JSON Schema documents and TypeScript enum declarations.
 *
 * These exist so the contract guards can ask what a schema *accepts* and what the code *declares*
 * without depending on built output: the contracts gate deliberately does not build the packages, so
 * resolving either through `dist/` would make a guard report on stale artifacts.
 */
import assert from "node:assert/strict";

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function localDefinitionReferences(value: unknown): Set<string> {
  const references = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const reference of localDefinitionReferences(item)) {
        references.add(reference);
      }
    }
    return references;
  }
  if (!isRecord(value)) {
    return references;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") {
      const match = /^#\/\$defs\/(.+)$/u.exec(child);
      if (match?.[1] !== undefined) {
        references.add(match[1]);
      }
      continue;
    }
    for (const reference of localDefinitionReferences(child)) {
      references.add(reference);
    }
  }
  return references;
}

/**
 * Collects the `kind` discriminators a schema actually *accepts*.
 *
 * Reachability is the whole point, so this credits a discriminator only from the root schema and from
 * `$defs` entries reachable from it. A document-wide scan would also credit a definition that no
 * union references — which is exactly the half-landed shape this guard exists to catch, because
 * writing the definition is the bulk of the work and the one-line wiring into the union is what gets
 * forgotten.
 */
export function reachableDiscriminators(
  root: Readonly<Record<string, unknown>>,
  definitions: Readonly<Record<string, unknown>>,
): Set<string> {
  const reachable = new Set<string>();
  const pending = [...localDefinitionReferences(root)];
  while (pending.length > 0) {
    const name = pending.pop();
    assert.ok(name !== undefined);
    if (reachable.has(name)) {
      continue;
    }
    reachable.add(name);
    pending.push(...localDefinitionReferences(definitions[name]));
  }
  const found = new Set<string>();
  collectDiscriminators(root, found);
  for (const name of reachable) {
    collectDiscriminators(definitions[name], found);
  }
  return found;
}

function collectDiscriminators(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectDiscriminators(item, found);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  const properties = node.properties;
  if (isRecord(properties)) {
    const kind = properties.kind;
    if (isRecord(kind) && typeof kind.const === "string") {
      found.add(kind.const);
    }
  }
  for (const value of Object.values(node)) {
    collectDiscriminators(value, found);
  }
}

/**
 * Reads an enum's declared string values straight from the semantic-core source.
 *
 * The contracts gate deliberately does not build the packages, so resolving the enum through
 * `dist/` would make this guard report on stale output. Source text has no such dependency; the
 * caller asserts a plausible member count so a declaration-shape change fails loudly instead of
 * silently yielding an empty set.
 */
/** One declared member, keeping the TypeScript name beside the wire value it maps to. */
export type DeclaredEnumMember = Readonly<{ name: string; value: string }>;

/**
 * Both halves of each member, because a guard that reads case arms sees names while a guard that
 * reads a schema sees values, and pairing them here keeps one parser rather than two.
 */
export function declaredEnumMembers(
  source: string,
  enumName: string,
): ReadonlyArray<DeclaredEnumMember> {
  const start = source.indexOf(`export enum ${enumName} {`);
  assert.notEqual(start, -1, `${enumName} is not declared as an enum`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${enumName} has no closing brace`);
  return [
    ...source.slice(start, end).matchAll(/^\s+([A-Za-z0-9_]+) = "([a-zA-Z0-9_]+)",$/gmu),
  ].map((match) => {
    const [, name, value] = match;
    assert.ok(name !== undefined && value !== undefined);
    return { name, value };
  });
}

export function declaredEnumValues(source: string, enumName: string): ReadonlyArray<string> {
  return declaredEnumMembers(source, enumName).map(({ value }) => value);
}
