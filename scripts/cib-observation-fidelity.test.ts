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

type ScenarioSchema = JsonSchema & Readonly<{
  $defs: Readonly<Record<string, JsonSchema>>;
}>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fidelityHeading = "## Canonical CIB observation fidelity";

test("classifies every canonical CIB state field at schema depth", async () => {
  const [schemaSource, testingSpec] = await Promise.all([
    readFile(
      `${projectRoot}/contracts/schemas/scenario.schema.json`,
      "utf8",
    ),
    readFile(`${projectRoot}/docs/TESTING-SPEC.md`, "utf8"),
  ]);
  const schema = JSON.parse(schemaSource) as ScenarioSchema;
  const stateObservation = requiredDefinition(schema, "stateObservation");
  assert.equal(
    Object.keys(stateObservation.properties ?? {}).length,
    12,
    "stateObservation must retain its reviewed twelve-field denominator",
  );

  const expectedPaths = collectFieldPaths(schema, stateObservation);
  const sectionStart = testingSpec.indexOf(fidelityHeading);
  assert.notEqual(
    sectionStart,
    -1,
    "TESTING-SPEC must own the canonical CIB fidelity table",
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
  schema: ScenarioSchema,
  name: string,
): JsonSchema {
  const definition = schema.$defs[name];
  if (definition === undefined) {
    throw new Error(`scenario schema omits definition ${name}`);
  }
  return definition;
}

function collectFieldPaths(
  schema: ScenarioSchema,
  node: JsonSchema,
  path = "",
  paths = new Set<string>(),
): ReadonlySet<string> {
  if (node.$ref !== undefined) {
    const prefix = "#/$defs/";
    if (!node.$ref.startsWith(prefix)) {
      throw new Error(`unsupported schema reference ${node.$ref}`);
    }
    return collectFieldPaths(
      schema,
      requiredDefinition(schema, node.$ref.slice(prefix.length)),
      path,
      paths,
    );
  }
  for (const variant of node.oneOf ?? []) {
    collectFieldPaths(schema, variant, path, paths);
  }
  if (node.items !== undefined) {
    collectFieldPaths(schema, node.items, `${path}[]`, paths);
  }
  for (const [name, property] of Object.entries(
    node.properties ?? {},
  )) {
    const propertyPath = path.length === 0 ? name : `${path}.${name}`;
    paths.add(propertyPath);
    collectFieldPaths(schema, property, propertyPath, paths);
  }
  return paths;
}
