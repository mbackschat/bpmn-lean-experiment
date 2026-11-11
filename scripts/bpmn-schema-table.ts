/**
 * The BPMN 2.0.2 schema table, `packages/bpmn-source/src/bpmn-2.0.2-schema-table.json`, generated from the pinned OMG
 * `BPMN20.xsd` and the `Semantic.xsd` it includes: every global element with its type and substitution group, every
 * complex type as declared (its extension base, attributes, attribute wildcard, mixed content and content model), and
 * every enumerated simple type. The kernel reader's `source.schema` check reads it so that an admitted
 * model is valid against `BPMN20.xsd` without a runtime XSD validator (PC-BASIC-04).
 *
 * Usage: `node scripts/bpmn-schema-table.ts --write` rewrites the table; `--check` exits 1 when the committed file
 * differs. `scripts/bpmn-schema-table.test.ts` runs the check in the fast suite, so the file is never edited by hand.
 * The schemas are the external OMG corpus (`BPMN_EXTERNAL_ROOT`, default `../oss`); their absence is fatal.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ComplexType, Occurs, Particle, SchemaTable } from "../packages/bpmn-source/src/kernel-reader/schema.ts";
import { externalRoot } from "./external-root.ts";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const tablePath = "packages/bpmn-source/src/bpmn-2.0.2-schema-table.json";
const schemaDirectory = path.join(externalRoot, "omg-bpmn-2.0.2/machine-readable");
const schemaFiles = ["BPMN20.xsd", "Semantic.xsd"] as const;

const bpmnNamespace = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const diNamespace = "http://www.omg.org/spec/BPMN/20100524/DI";

type Node = { name: string; attributes: Record<string, string>; children: Node[] };

/** The two schemas use neither comments, CDATA nor text content, so a tag scan reads them completely. */
function parseSchema(text: string): Node {
  const root: Node = { name: "#root", attributes: {}, children: [] };
  const stack: Node[] = [root];
  for (const match of text.matchAll(/<(\/?)xsd:(\w+)((?:\s+[\w:]+\s*=\s*"[^"]*")*)\s*(\/?)>/gu)) {
    const [, closing, name = "", attributeText = "", selfClosing] = match;
    if (closing === "/") {
      stack.pop();
      continue;
    }
    const attributes: Record<string, string> = {};
    for (const [, key = "", value = ""] of attributeText.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/gu)) attributes[key] = value;
    const node: Node = { name, attributes, children: [] };
    stack.at(-1)?.children.push(node);
    if (selfClosing !== "/") stack.push(node);
  }
  return root;
}

const occurs = (node: Node): Occurs => ({
  min: Number(node.attributes["minOccurs"] ?? "1"),
  max: node.attributes["maxOccurs"] === "unbounded" ? null : Number(node.attributes["maxOccurs"] ?? "1"),
});

function particle(node: Node): Particle | null {
  switch (node.name) {
    case "element": {
      const reference = node.attributes["ref"];
      if (reference === undefined) {
        return { kind: "element", name: node.attributes["name"] ?? "", type: node.attributes["type"] ?? "", ...occurs(node) };
      }
      const separator = reference.indexOf(":");
      return separator < 0
        ? { kind: "element", name: reference, ...occurs(node) }
        : { kind: "element", name: reference.slice(separator + 1), namespace: diNamespace, ...occurs(node) };
    }
    case "sequence":
    case "choice":
      return { kind: node.name, items: node.children.flatMap((child) => particle(child) ?? []), ...occurs(node) };
    case "any":
      return { kind: "any", namespace: node.attributes["namespace"] ?? "##any", ...occurs(node) };
    default:
      return null;
  }
}

const byName = <T>(entries: ReadonlyArray<readonly [string, T]>): Record<string, T> =>
  Object.fromEntries([...entries].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));

/** Generates the table; `directory` holds the pinned schemas. */
export function renderTable(directory: string = schemaDirectory): string {
  const texts = schemaFiles.map((file) => readFileSync(path.join(directory, file), "utf8"));
  const tops = texts.flatMap((text) => parseSchema(text).children.flatMap((schema) => schema.children));
  const types = byName(tops.filter((node) => node.name === "complexType").map((node) => {
    const extension = node.children.find((child) => child.name === "complexContent")?.children
      .find((child) => child.name === "extension");
    const body = extension ?? node;
    const type: ComplexType = {
      base: extension?.attributes["base"] ?? null,
      abstract: node.attributes["abstract"] === "true",
      mixed: node.attributes["mixed"] === "true",
      anyAttribute: body.children.some((child) => child.name === "anyAttribute"),
      attributes: byName(body.children.filter((child) => child.name === "attribute").map((child) =>
        [child.attributes["name"] ?? "", { type: child.attributes["type"] ?? "xsd:anySimpleType",
          required: child.attributes["use"] === "required" }] as const)),
      content: body.children.flatMap((child) => particle(child) ?? []),
    };
    return [node.attributes["name"] ?? "", type] as const;
  }));
  const elements = byName(tops.filter((node) => node.name === "element").map((node) => [node.attributes["name"] ?? "", {
    type: node.attributes["type"] ?? "",
    abstract: node.attributes["abstract"] === "true",
    substitutionGroup: node.attributes["substitutionGroup"] ?? null,
  }] as const));
  // An enumeration restricts `xsd:string`; a union with `xsd:anyURI` admits every URI, so its listed values bound nothing.
  const enumerations = byName(tops.filter((node) => node.name === "simpleType").map((node) => {
    const restriction = node.children.find((child) => child.name === "restriction");
    const values = restriction?.children.filter((child) => child.name === "enumeration").map((child) => child.attributes["value"] ?? "");
    return [node.attributes["name"] ?? "", values ?? null] as const;
  }));
  const table: SchemaTable & Readonly<{ kind: string; source: ReadonlyArray<Readonly<{ artifact: string; sha256: string }>> }> = {
    kind: "bpmnSchemaTable",
    namespace: bpmnNamespace,
    source: schemaFiles.map((file, index) => ({ artifact: file,
      sha256: createHash("sha256").update(texts[index] ?? "").digest("hex") })),
    elements,
    types,
    enumerations,
  };
  // One type, element or enumeration per line keeps the committed table reviewable as a diff.
  const lines = (entries: Readonly<Record<string, unknown>>): string =>
    Object.entries(entries).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n");
  return `{
  "kind": ${JSON.stringify(table.kind)},
  "namespace": ${JSON.stringify(table.namespace)},
  "source": ${JSON.stringify(table.source)},
  "elements": {
${lines(table.elements)}
  },
  "types": {
${lines(table.types)}
  },
  "enumerations": {
${lines(table.enumerations)}
  }
}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = path.join(projectRoot, tablePath);
  const rendered = renderTable();
  if (process.argv.includes("--write")) writeFileSync(target, rendered);
  else if (rendered !== readFileSync(target, "utf8")) {
    console.error(`${tablePath} is not the generator's output; run node scripts/bpmn-schema-table.ts --write`);
    process.exit(1);
  }
}
