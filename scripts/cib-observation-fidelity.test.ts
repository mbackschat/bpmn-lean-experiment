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
  const sectionStart = testingSpec.indexOf(fidelityHeading);
  assert.notEqual(
    sectionStart,
    -1,
    "CIB-OBSERVATION-POLICY must own the canonical CIB fidelity table",
  );
  const nextHeading = testingSpec.indexOf("\n## ", sectionStart + 1);
  const section = testingSpec.slice(
    sectionStart,
    nextHeading === -1 ? undefined : nextHeading,
  );
  const rows = Array.from(
    section.matchAll(
      /^\| `([^`]+)` \| `(engine-observed|adapter-derived|adapter-decided|not-claimed)` \|/gmu,
    ),
  );
  const classifiedPaths = rows.map((row) => row[1] as string);

  assert.equal(
    new Set(classifiedPaths).size,
    classifiedPaths.length,
    "each canonical field path must have exactly one fidelity row",
  );
  assert.deepEqual(
    classifiedPaths.toSorted(),
    [...expectedPaths].toSorted(),
  );
});

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

/** Resolves a `#/$defs/<name>` or `<schema id>#/$defs/<name>` reference to its schema file and definition. */
function resolveReference(
  schemas: SchemaSet,
  owner: SchemaDocument,
  reference: string,
): Readonly<{ document: SchemaDocument; name: string }> {
  const [id, fragment] = reference.split("#") as [string, string];
  const prefix = "/$defs/";
  const document = id === "" ? owner : schemas.get(id);
  if (document === undefined || !fragment.startsWith(prefix)) {
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
    const { document, name } = resolveReference(schemas, owner, node.$ref);
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
