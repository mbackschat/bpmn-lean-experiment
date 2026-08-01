import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseStrictJson } from "./strict-json.ts";

/**
 * The bounded CMOF facts this calibration re-derives from the normative file.
 *
 * Only the fields compared against `BPMN20.cmof` are decoded. The manifest also
 * carries provenance, coverage prose, and the compiler projection that this
 * check does not interpret.
 */
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
  coverage: Readonly<{ status: string }>;
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
    coverage: {
      status: requiredMember(
        requireRecord(record["coverage"], "manifest.coverage"),
        "status",
        "manifest.coverage",
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

const manifest = decodeMetamodelManifest(await readFile(manifestPath, "utf8"));
assert.equal(manifest.kind, "boundedCmofFactManifest");
assert.equal(manifest.extraction, "bounded-cmof-fact-extraction");
const cmofBytes = await readFile(cmofPath);
const actualSha256 = createHash("sha256").update(cmofBytes).digest("hex");
assert.equal(actualSha256, manifest.source.sha256);

function xpath(expression: string): string {
  return execFileSync("xmllint", ["--xpath", expression, cmofPath], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 5_000,
  }).trim();
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

for (const propertyFact of manifest.properties) {
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
    classes: manifest.classes.length,
    properties: manifest.properties.length,
    coverage: manifest.coverage.status,
  })}`,
);
