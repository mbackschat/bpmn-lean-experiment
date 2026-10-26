/**
 * Locks the rule that admission depends on an attribute's resolved value, never on whether the
 * source happened to write it.
 *
 * `bpmn-moddle` exposes a defaulted attribute through the element descriptor when the source omits
 * it, and as an own key when the source writes it. A reader that decides admission from own keys
 * therefore sees two different shapes for one meaning, and the `xs:boolean` or `xs:string` default
 * is exactly the case where writing the attribute changes nothing a profile could care about unless
 * that profile expressly selects an omission-only source lexeme.
 *
 * The oracle is every registered scenario paired with the profile its own scenario document names,
 * so a new scenario or profile joins this guard without being listed here. For each defaulted
 * property the metamodel manifest declares, the corresponding element is rewritten to carry that
 * property's default explicitly; admission must not move unless the profile declares the generated
 * `explicit-<attribute-name>-lexeme` exclusion, in which case the same mutation must be refused. A
 * property the fixture already writes is skipped, because injecting it would duplicate the attribute
 * and test XML well-formedness instead.
 *
 * Each scenario is compiled with the source overlay its document declares, resolved by content hash
 * from the scenario's own directory, and its element tags are matched under whichever prefixes bind
 * the BPMN model namespace, including the default namespace. Every scenario must exercise at least
 * one defaulted attribute, so a model the matcher cannot see fails here instead of passing vacuously.
 *
 * Only `Boolean` defaults are in scope, excluded here by declared type rather than by name and from
 * the same recorded fact [the resolver](../src/metamodel-defaults.ts) reads, so neither side can
 * drift into covering a case the other refuses. That module owns why the other two are out.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const bpmnModelNamespace = "http://www.omg.org/spec/BPMN/20100524/MODEL";

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

type SourceOverlay = Readonly<{ id: string; sha256: string; bytes: Uint8Array }>;

type RegisteredScenario = Readonly<{
  id: string;
  profile: string;
  relativePath: string;
  sourceOverlay: SourceOverlay | null;
  excluded: ReadonlyArray<string>;
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
  return `${className.charAt(0).toLowerCase()}${className.slice(1)}`;
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
      const profile = JSON.parse(
        await readFile(
          path.join(projectRoot, "profiles", document.profile, "profile.json"),
          "utf8",
        ),
      );
      collected.push({
        id: document.id,
        profile: document.profile,
        relativePath: document.bpmn.relativePath,
        sourceOverlay: await declaredOverlay(
          path.join(scenarioRoot, directory.name),
          contents,
          document.bpmn.sourceOverlay ?? null,
        ),
        excluded: profile.excluded,
      });
    }
  }
  return collected;
}

/** The scenario directory's file whose bytes carry the declared overlay hash; scenario documents name an overlay only by ID and digest. */
async function declaredOverlay(
  directory: string,
  contents: ReadonlyArray<string>,
  declared: Readonly<{ id: string; sha256: string }> | null,
): Promise<SourceOverlay | null> {
  if (declared === null) {
    return null;
  }
  for (const file of contents.filter((name) => name.endsWith(".json") && !name.endsWith(".scenario.json"))) {
    const bytes = new Uint8Array(await readFile(path.join(directory, file)));
    if (createHash("sha256").update(bytes).digest("hex") === declared.sha256) {
      return { id: declared.id, sha256: declared.sha256, bytes };
    }
  }
  throw new Error(`${directory} holds no overlay with digest ${declared.sha256}`);
}

async function admits(
  xml: string,
  semanticProfile: string,
  sourceOverlay: SourceOverlay | null,
): Promise<boolean> {
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId: "metamodel-default-admission",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay,
    limits,
  });
  return result.status === BpmnCompilationStatus.Accepted;
}

/** The qualifiers (`""` for the default namespace) under which `xml` may write a BPMN model element. */
function bpmnQualifiers(xml: string): ReadonlyArray<string> {
  return [...xml.matchAll(/\bxmlns(?::([\w.-]+))?\s*=\s*"([^"]*)"/gu)]
    .filter((declaration) => declaration[2] === bpmnModelNamespace)
    .map((declaration) => (declaration[1] === undefined ? "" : `${declaration[1]}:`));
}

/** Every occurrence of `tag`, matched to the end of its start tag so attributes can be appended. */
function startTags(xml: string, tag: string): RegExp {
  const qualifiers = bpmnQualifiers(xml).join("|");
  return new RegExp(`<(?:${qualifiers})${tag}\\b[^>]*?\\s*/?>`, "gu");
}

function explicitLexemeExclusion(attributeName: string): string {
  const kebabName = attributeName.replace(
    /[A-Z]/gu,
    (letter) => `-${letter.toLowerCase()}`,
  );
  return `explicit-${kebabName}-lexeme`;
}

const scenarios = await registeredScenarios();

test("the registry reaches every profile this guard claims to cover", () => {
  assert.ok(scenarios.length > 0, "no registered scenario documents were found");
  assert.ok(
    defaultedAttributes.length > 0,
    "the manifest declares no defaulted property",
  );
});

for (const { id, profile, relativePath, sourceOverlay, excluded } of scenarios) {
  test(`${id} exercises at least one defaulted attribute`, async () => {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.equal(await admits(source, profile, sourceOverlay), true, "baseline");
    assert.ok(
      defaultedAttributes.some(({ tags }) => tags.some((tag) => startTags(source, tag).test(source))),
      "no defaulted attribute's element occurs in the model",
    );
  });
  for (const attribute of defaultedAttributes) {
    const exclusion = explicitLexemeExclusion(attribute.name);
    const expected = !excluded.includes(exclusion);
    test(`${expected ? "admits" : "refuses"} ${id} with an explicit ${attribute.name}`, async () => {
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

      assert.equal(
        await admits(injected, profile, sourceOverlay),
        expected,
        expected ? "explicit default" : `declared ${exclusion}`,
      );
    });
  }
}
