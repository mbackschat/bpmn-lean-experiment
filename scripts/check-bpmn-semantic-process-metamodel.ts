import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseStrictJson } from "./strict-json.ts";

/** The bounded machine-readable facts this calibration re-derives from OMG artifacts. */
type ClassFact = Readonly<{
  name: string;
  directSuperClasses: ReadonlyArray<string>;
}>;

type PropertyFact = Readonly<{
  owner: string;
  name: string;
  type: string;
  lower: number;
  /** An exact count, or the unbounded CMOF `*`. */
  upper: number | "*";
  containment: boolean;
  default?: boolean | string;
}>;

type MetamodelManifest = Readonly<{
  kind: string;
  extraction: string;
  source: Readonly<{ sha256: string }>;
  schemaSource: Readonly<{ sha256: string }>;
  coverage: Readonly<{ status: string }>;
  compilerProjection: Readonly<{
    terminateEventDefinitionType: string;
  }>;
  classes: ReadonlyArray<ClassFact>;
  properties: ReadonlyArray<PropertyFact>;
}>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = fileURLToPath(
  new URL(
    "../packages/bpmn-source/src/bpmn-2.0.2-semantic-process-metamodel.json",
    import.meta.url,
  ),
);
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ?? path.resolve(
  projectRoot,
  "../oss",
);
const cmofPath = process.env["BPMN_CMOF_PATH"] ?? path.join(
  externalRoot,
  "omg-bpmn-2.0.2/machine-readable/BPMN20.cmof",
);
const semanticXsdPath = process.env["BPMN_SEMANTIC_XSD_PATH"] ?? path.join(
  externalRoot,
  "omg-bpmn-2.0.2/machine-readable/Semantic.xsd",
);

function requireRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  return Object.freeze({ ...value });
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean`);
  }
  return value;
}

function requireArray(value: unknown, label: string): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON array`);
  }
  return value;
}

function requiredMember(
  record: Readonly<Record<string, unknown>>,
  member: string,
  label: string,
): string {
  return requireString(record[member], `${label}.${member}`);
}

function decodeClassFact(value: unknown, label: string): ClassFact {
  const record = requireRecord(value, label);
  return {
    name: requiredMember(record, "name", label),
    directSuperClasses: requireArray(
      record["directSuperClasses"],
      `${label}.directSuperClasses`,
    ).map((entry, index) =>
      requireString(entry, `${label}.directSuperClasses[${index}]`),
    ),
  };
}

function decodePropertyFact(value: unknown, label: string): PropertyFact {
  const record = requireRecord(value, label);
  const upper = record["upper"];
  const fact = {
    owner: requiredMember(record, "owner", label),
    name: requiredMember(record, "name", label),
    type: requiredMember(record, "type", label),
    lower: requireSafeInteger(record["lower"], `${label}.lower`),
    upper: upper === "*"
      ? upper
      : requireSafeInteger(upper, `${label}.upper`),
    containment: requireBoolean(record["containment"], `${label}.containment`),
  } satisfies PropertyFact;
  if (!("default" in record)) {
    return fact;
  }
  const defaultValue = record["default"];
  if (typeof defaultValue !== "boolean" && typeof defaultValue !== "string") {
    throw new TypeError(`${label}.default must be a boolean or a string`);
  }
  return { ...fact, default: defaultValue };
}

function decodeMetamodelManifest(text: string): MetamodelManifest {
  const record = requireRecord(
    parseStrictJson(text, "metamodel manifest"),
    "metamodel manifest",
  );
  return {
    kind: requiredMember(record, "kind", "manifest"),
    extraction: requiredMember(record, "extraction", "manifest"),
    source: {
      sha256: requiredMember(
        requireRecord(record["source"], "manifest.source"),
        "sha256",
        "manifest.source",
      ),
    },
    schemaSource: {
      sha256: requiredMember(
        requireRecord(record["schemaSource"], "manifest.schemaSource"),
        "sha256",
        "manifest.schemaSource",
      ),
    },
    coverage: {
      status: requiredMember(
        requireRecord(record["coverage"], "manifest.coverage"),
        "status",
        "manifest.coverage",
      ),
    },
    compilerProjection: {
      terminateEventDefinitionType: requiredMember(
        requireRecord(
          record["compilerProjection"],
          "manifest.compilerProjection",
        ),
        "terminateEventDefinitionType",
        "manifest.compilerProjection",
      ),
    },
    classes: requireArray(record["classes"], "manifest.classes").map(
      (entry, index) => decodeClassFact(entry, `manifest.classes[${index}]`),
    ),
    properties: requireArray(record["properties"], "manifest.properties").map(
      (entry, index) =>
        decodePropertyFact(entry, `manifest.properties[${index}]`),
    ),
  };
}

try {
  await access(cmofPath);
} catch {
  console.error(
    `BPMN normative CMOF is absent at ${cmofPath}; run ./scripts/setup-external-sources.sh verify or set BPMN_CMOF_PATH`,
  );
  process.exit(1);
}
try {
  await access(semanticXsdPath);
} catch {
  console.error(
    `BPMN normative Semantic XSD is absent at ${semanticXsdPath}; run ./scripts/setup-external-sources.sh verify or set BPMN_SEMANTIC_XSD_PATH`,
  );
  process.exit(1);
}

const manifest = decodeMetamodelManifest(await readFile(manifestPath, "utf8"));
assert.equal(manifest.kind, "boundedBpmnMetamodelFactManifest");
assert.equal(manifest.extraction, "bounded-machine-readable-fact-extraction");
const cmofBytes = await readFile(cmofPath);
const actualSha256 = createHash("sha256").update(cmofBytes).digest("hex");
assert.equal(actualSha256, manifest.source.sha256);
const semanticXsdBytes = await readFile(semanticXsdPath);
const actualSchemaSha256 = createHash("sha256")
  .update(semanticXsdBytes)
  .digest("hex");
assert.equal(actualSchemaSha256, manifest.schemaSource.sha256);

function xpathIn(sourcePath: string, expression: string): string {
  return execFileSync("xmllint", ["--xpath", expression, sourcePath], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 5_000,
  }).trim();
}

function xpath(expression: string): string {
  return xpathIn(cmofPath, expression);
}

function elementById(id: string): string {
  return `//*[@*[local-name()="id"]="${id}"]`;
}

function attribute(id: string, name: string, fallback = ""): string {
  const value = xpath(`string(${elementById(id)}/@${name})`);
  return value.length === 0 ? fallback : value;
}

for (const classFact of manifest.classes) {
  const superClasses = attribute(classFact.name, "superClass")
    .split(/\s+/u)
    .filter(Boolean);
  assert.deepEqual(
    superClasses,
    classFact.directSuperClasses,
    `CMOF generalizations changed for ${classFact.name}`,
  );
}

const terminateEventDefinitionFacts = manifest.classes.filter(
  ({ name }) => name === "TerminateEventDefinition",
);
assert.equal(
  terminateEventDefinitionFacts.length,
  1,
  "the bounded manifest must contain one calibrated TerminateEventDefinition class",
);
assert.equal(
  manifest.compilerProjection.terminateEventDefinitionType,
  `bpmn:${terminateEventDefinitionFacts[0]?.name}`,
  "the compiler Terminate Event Definition type must derive from the calibrated CMOF class",
);

const extensionElementsFacts = manifest.properties.filter(
  ({ owner, name }) => owner === "BaseElement" && name === "extensionElements",
);
assert.equal(
  extensionElementsFacts.length,
  1,
  "the bounded manifest must contain one BaseElement.extensionElements schema fact",
);
const extensionElementsFact = extensionElementsFacts[0];
assert.deepEqual(extensionElementsFact, {
  owner: "BaseElement",
  name: "extensionElements",
  type: "ExtensionElements",
  lower: 0,
  upper: 1,
  containment: true,
});

const xsdBaseElementExtension =
  '//*[local-name()="complexType" and @name="tBaseElement"]' +
  '/*[local-name()="sequence"]/*[local-name()="element" and @ref="extensionElements"]';
assert.equal(
  xpathIn(semanticXsdPath, `string(${xsdBaseElementExtension}/@minOccurs)`),
  String(extensionElementsFact?.lower),
  "Semantic XSD lower multiplicity changed for BaseElement.extensionElements",
);
assert.equal(
  xpathIn(semanticXsdPath, `string(${xsdBaseElementExtension}/@maxOccurs)`),
  String(extensionElementsFact?.upper),
  "Semantic XSD upper multiplicity changed for BaseElement.extensionElements",
);
assert.equal(
  xpathIn(
    semanticXsdPath,
    'string(//*[local-name()="element" and @name="extensionElements"]/@type)',
  ),
  `t${extensionElementsFact?.type}`,
  "Semantic XSD type changed for BaseElement.extensionElements",
);
const xsdExtensionWildcard =
  '//*[local-name()="complexType" and @name="tExtensionElements"]' +
  '/*[local-name()="sequence"]/*[local-name()="any"]';
assert.deepEqual(
  {
    namespace: xpathIn(
      semanticXsdPath,
      `string(${xsdExtensionWildcard}/@namespace)`,
    ),
    processContents: xpathIn(
      semanticXsdPath,
      `string(${xsdExtensionWildcard}/@processContents)`,
    ),
    minOccurs: xpathIn(
      semanticXsdPath,
      `string(${xsdExtensionWildcard}/@minOccurs)`,
    ),
    maxOccurs: xpathIn(
      semanticXsdPath,
      `string(${xsdExtensionWildcard}/@maxOccurs)`,
    ),
  },
  {
    namespace: "##other",
    processContents: "lax",
    minOccurs: "0",
    maxOccurs: "unbounded",
  },
  "Semantic XSD extensionElements wildcard changed",
);

for (const propertyFact of manifest.properties.filter(
  ({ owner, name }) => owner !== "BaseElement" || name !== "extensionElements",
)) {
  const id = `${propertyFact.owner}-${propertyFact.name}`;
  const directType = attribute(id, "type");
  const nestedType =
    directType.length === 0
      ? xpath(`substring-after(string(${elementById(id)}/*[local-name()="type"]/@href), "#")`)
      : directType;
  assert.equal(nestedType, propertyFact.type, `CMOF type changed for ${id}`);
  assert.equal(
    Number(attribute(id, "lower", "1")),
    propertyFact.lower,
    `CMOF lower multiplicity changed for ${id}`,
  );
  const upper = attribute(id, "upper", "1");
  assert.equal(
    upper === "*" ? upper : Number(upper),
    propertyFact.upper,
    `CMOF upper multiplicity changed for ${id}`,
  );
  assert.equal(
    attribute(id, "isComposite", "false") === "true",
    propertyFact.containment,
    `CMOF containment changed for ${id}`,
  );
  if (propertyFact.default !== undefined) {
    assert.equal(
      attribute(id, "default"),
      String(propertyFact.default),
      `CMOF default changed for ${id}`,
    );
  }
}

console.log(
  `BPMN_SEMANTIC_PROCESS_METAMODEL_CHECK ${JSON.stringify({
    sourceSha256: actualSha256,
    schemaSha256: actualSchemaSha256,
    classes: manifest.classes.length,
    properties: manifest.properties.length,
    coverage: manifest.coverage.status,
  })}`,
);
