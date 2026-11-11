import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

type JsonSchema = Readonly<{
  $ref?: string;
  oneOf?: ReadonlyArray<JsonSchema>;
  properties?: Readonly<Record<string, JsonSchema>>;
  items?: JsonSchema;
}>;

type SchemaDocument = JsonSchema & Readonly<{
  $id: string;
  $defs: Readonly<Record<string, JsonSchema>>;
}>;

/** The schema files a state field can reference, keyed by `$id`; a reference stays within one of them. */
type SchemaSet = ReadonlyMap<string, SchemaDocument>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fidelityHeading = "## Canonical CIB observation fidelity";
const populationHeading = "## Population evidence";
/**
 * The recursive portable member type. Expanding it never terminates, so its members take the fidelity of the field that
 * carries them and only that carrying field is classified.
 */
const recursiveMemberDefinition = "businessValue";

test("classifies every canonical CIB state field at schema depth", async () => {
  const [resultSource, scenarioSource, testingSpec] = await Promise.all([
    readFile(
      `${projectRoot}/contracts/schemas/canonical-result.schema.json`,
      "utf8",
    ),
    readFile(
      `${projectRoot}/contracts/schemas/scenario.schema.json`,
      "utf8",
    ),
    readFile(`${projectRoot}/docs/CIB-OBSERVATION-POLICY.md`, "utf8"),
  ]);
  const result = JSON.parse(resultSource) as SchemaDocument;
  const schemas: SchemaSet = new Map(
    [result, JSON.parse(scenarioSource) as SchemaDocument].map((document) => [document.$id, document]),
  );
  const state = requiredDefinition(result, "state");
  const expectedPaths = collectFieldPaths(schemas, result, state);
  const classifiedPaths = classifiedRows(testingSpec, fidelityHeading);
  assert.deepEqual(
    classifiedPaths.toSorted(),
    [...expectedPaths].toSorted(),
  );
});

test("classifies every field of retained CIB population evidence with the comparator's treatment", async () => {
  const [populationSource, scenarioSource, policy] = await Promise.all([
    readFile(`${projectRoot}/contracts/schemas/cibseven-population-evidence.schema.json`, "utf8"),
    readFile(`${projectRoot}/contracts/schemas/scenario.schema.json`, "utf8"),
    readFile(`${projectRoot}/docs/CIB-OBSERVATION-POLICY.md`, "utf8"),
  ]);
  const population = JSON.parse(populationSource) as SchemaDocument;
  // A reference into any other schema is a leaf: the canonical state and outcome are classified by the canonical
  // table, and the evidence envelope's identities by the evidence script that binds them.
  const schemas: SchemaSet = new Map(
    [population, JSON.parse(scenarioSource) as SchemaDocument].map((document) => [document.$id, document]),
  );
  const expectedPaths = collectFieldPaths(schemas, population, population);
  assert.deepEqual(classifiedRows(policy, populationHeading).toSorted(), [...expectedPaths].toSorted());
  const section = policy.slice(policy.indexOf(populationHeading));
  const treated = Array.from(section.matchAll(/^\| `[^`]+` \| `[^`]+` \| [^|]*\S[^|]* \| [^|]*\S[^|]* \|$/gmu));
  assert.equal(treated.length, expectedPaths.size, "each population field row states the comparator's treatment and its reason");
});

/** The field paths a policy section classifies, each exactly once. */
function classifiedRows(policy: string, heading: string): string[] {
  const sectionStart = policy.indexOf(heading);
  assert.notEqual(sectionStart, -1, `CIB-OBSERVATION-POLICY must own the section ${heading}`);
  const nextHeading = policy.indexOf("\n## ", sectionStart + 1);
  const section = policy.slice(sectionStart, nextHeading === -1 ? undefined : nextHeading);
  const rows = Array.from(
    section.matchAll(
      /^\| `([^`]+)` \| `(engine-observed|adapter-derived|adapter-decided|not-claimed)` \|/gmu,
    ),
  );
  const classifiedPaths = rows.map((row) => row[1] as string);
  assert.equal(
    new Set(classifiedPaths).size,
    classifiedPaths.length,
    `each field path of ${heading} must have exactly one fidelity row`,
  );
  return classifiedPaths;
}

function requiredDefinition(
  schema: SchemaDocument,
  name: string,
): JsonSchema {
  const definition = schema.$defs[name];
  if (definition === undefined) {
    throw new Error(`schema ${schema.$id} omits definition ${name}`);
  }
  return definition;
}

/**
 * Resolves a `#/$defs/<name>` or `<schema id>#/$defs/<name>` reference to its schema file and definition; null for a
 * reference into a schema outside `schemas`, which the caller classifies as a leaf.
 */
function resolveReference(
  schemas: SchemaSet,
  owner: SchemaDocument,
  reference: string,
): Readonly<{ document: SchemaDocument; name: string }> | null {
  const [id, fragment] = reference.split("#") as [string, string];
  const prefix = "/$defs/";
  const document = id === "" ? owner : schemas.get(id);
  if (document === undefined) return null;
  if (!fragment.startsWith(prefix)) {
    throw new Error(`unsupported schema reference ${reference}`);
  }
  return { document, name: fragment.slice(prefix.length) };
}

function collectFieldPaths(
  schemas: SchemaSet,
  owner: SchemaDocument,
  node: JsonSchema,
  path = "",
  paths = new Set<string>(),
): ReadonlySet<string> {
  if (node.$ref !== undefined) {
    const resolved = resolveReference(schemas, owner, node.$ref);
    if (resolved === null) {
      return paths;
    }
    const { document, name } = resolved;
    if (name === recursiveMemberDefinition) {
      return paths;
    }
    return collectFieldPaths(
      schemas,
      document,
      requiredDefinition(document, name),
      path,
      paths,
    );
  }
  for (const variant of node.oneOf ?? []) {
    collectFieldPaths(schemas, owner, variant, path, paths);
  }
  if (node.items !== undefined) {
    collectFieldPaths(schemas, owner, node.items, `${path}[]`, paths);
  }
  for (const [name, property] of Object.entries(
    node.properties ?? {},
  )) {
    const propertyPath = path.length === 0 ? name : `${path}.${name}`;
    paths.add(propertyPath);
    collectFieldPaths(schemas, owner, property, propertyPath, paths);
  }
  return paths;
}
