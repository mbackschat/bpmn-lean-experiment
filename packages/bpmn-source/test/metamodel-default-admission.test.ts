/**
 * Locks the rule that admission depends on an attribute's resolved value, never on whether the
 * source happened to write it.
 *
 * `bpmn-moddle` exposes a defaulted attribute through the element descriptor when the source omits
 * it, and as an own key when the source writes it. A reader that decides admission from own keys
 * therefore sees two different shapes for one meaning, and the `xs:boolean` or `xs:string` default
 * is exactly the case where writing the attribute changes nothing a profile could care about.
 *
 * The oracle is every registered scenario paired with the profile its own scenario document names,
 * so a new scenario or profile joins this guard without being listed here. For each defaulted
 * property the metamodel manifest declares, the corresponding element is rewritten to carry that
 * property's default explicitly; admission must not move. A property the fixture already writes is
 * skipped, because injecting it would duplicate the attribute and test XML well-formedness instead.
 *
 * Only `Boolean` defaults are in scope, excluded here by declared type rather than by name and from
 * the same recorded fact [the resolver](../src/metamodel-defaults.ts) reads, so neither side can
 * drift into covering a case the other refuses. That module owns why the other two are out.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });

type MetamodelManifest = Readonly<{
  classes: ReadonlyArray<
    Readonly<{ name: string; directSuperClasses?: ReadonlyArray<string> }>
  >;
  properties: ReadonlyArray<
    Readonly<{ owner: string; name: string; type: string; default?: unknown }>
  >;
}>;

/** Kept identical to the resolver's own covered type; see the module header. */
const lexicallySettledType = "Boolean";

type DefaultedAttribute = Readonly<{
  tags: ReadonlyArray<string>;
  name: string;
  lexeme: string;
}>;

type RegisteredScenario = Readonly<{
  id: string;
  profile: string;
  relativePath: string;
}>;

const manifest: MetamodelManifest = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      "packages/bpmn-source/src/bpmn-2.0.2-semantic-process-metamodel.json",
    ),
    "utf8",
  ),
);

/** Concrete class names whose ancestry reaches `owner`, including `owner` itself. */
function concreteHeirs(owner: string): ReadonlyArray<string> {
  const reaches = (name: string, seen: ReadonlySet<string>): boolean => {
    if (name === owner) {
      return true;
    }
    if (seen.has(name)) {
      return false;
    }
    const declared = manifest.classes.find((entry) => entry.name === name);
    const next = new Set([...seen, name]);
    return (declared?.directSuperClasses ?? []).some((parent) =>
      reaches(parent, next),
    );
  };
  return manifest.classes
    .map(({ name }) => name)
    .filter((name) => reaches(name, new Set()));
}

function elementTag(className: string): string {
  return `bpmn:${className.charAt(0).toLowerCase()}${className.slice(1)}`;
}

const defaultedAttributes: ReadonlyArray<DefaultedAttribute> = manifest.properties
  .filter(
    (property) =>
      property.default !== undefined && property.type === lexicallySettledType,
  )
  .map((property) => ({
    tags: concreteHeirs(property.owner).map(elementTag),
    name: property.name,
    lexeme: String(property.default),
  }));

async function registeredScenarios(): Promise<ReadonlyArray<RegisteredScenario>> {
  const scenarioRoot = path.join(projectRoot, "scenarios");
  const directories = await readdir(scenarioRoot, { withFileTypes: true });
  const collected: RegisteredScenario[] = [];
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const contents = await readdir(path.join(scenarioRoot, directory.name));
    for (const file of contents.filter((name) => name.endsWith(".scenario.json"))) {
      const document = JSON.parse(
        await readFile(path.join(scenarioRoot, directory.name, file), "utf8"),
      );
      collected.push({
        id: document.id,
        profile: document.profile,
        relativePath: document.bpmn.relativePath,
      });
    }
  }
  return collected;
}

async function admits(xml: string, semanticProfile: string): Promise<boolean> {
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId: "metamodel-default-admission",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
  return result.status === BpmnCompilationStatus.Accepted;
}

/** Every occurrence of `tag`, matched to the end of its start tag so attributes can be appended. */
function startTags(xml: string, tag: string): RegExp {
  return new RegExp(`<${tag}\\b[^>]*?\\s*/?>`, "gu");
}

const scenarios = await registeredScenarios();

test("the registry reaches every profile this guard claims to cover", () => {
  assert.ok(scenarios.length > 0, "no registered scenario documents were found");
  assert.ok(
    defaultedAttributes.length > 0,
    "the manifest declares no defaulted property",
  );
});

for (const { id, profile, relativePath } of scenarios) {
  for (const attribute of defaultedAttributes) {
    test(`admits ${id} with an explicit ${attribute.name}`, async () => {
      const source = await readFile(path.join(projectRoot, relativePath), "utf8");
      const present = attribute.tags.filter((tag) =>
        startTags(source, tag).test(source),
      );
      const writable = present.filter(
        (tag) =>
          !(source.match(startTags(source, tag)) ?? []).some((occurrence) =>
            new RegExp(`\\b${attribute.name}\\s*=`, "u").test(occurrence),
          ),
      );
      if (writable.length === 0) {
        return;
      }
      const injected = writable.reduce(
        (xml, tag) =>
          xml.replace(startTags(xml, tag), (occurrence) =>
            occurrence.replace(
              /(\s*\/?>)$/u,
              ` ${attribute.name}="${attribute.lexeme}"$1`,
            ),
          ),
        source,
      );

      assert.equal(await admits(source, profile), true, "baseline");
      assert.equal(await admits(injected, profile), true, "explicit default");
    });
  }
}
