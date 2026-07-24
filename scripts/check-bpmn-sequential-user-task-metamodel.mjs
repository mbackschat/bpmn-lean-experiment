import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = fileURLToPath(
  new URL(
    "../packages/bpmn-source/src/bpmn-2.0.2-sequential-user-task-metamodel.json",
    import.meta.url,
  ),
);
const cmofPath = fileURLToPath(
  new URL(
    "../docs/reference/bpmn-2.0.2/machine-readable/BPMN20.cmof",
    import.meta.url,
  ),
);

try {
  await access(cmofPath);
} catch {
  console.log("BPMN_SEQUENTIAL_USER_TASK_METAMODEL_CHECK skipped: local normative CMOF is absent");
  process.exit(0);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.kind, "boundedCmofFactManifest");
assert.equal(manifest.extraction, "bounded-cmof-fact-extraction");
const cmofBytes = await readFile(cmofPath);
const actualSha256 = createHash("sha256").update(cmofBytes).digest("hex");
assert.equal(actualSha256, manifest.source.sha256);

function xpath(expression) {
  return execFileSync("xmllint", ["--xpath", expression, cmofPath], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 5_000,
  }).trim();
}

function elementById(id) {
  return `//*[@*[local-name()="id"]="${id}"]`;
}

function attribute(id, name, fallback = "") {
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
  if ("default" in propertyFact) {
    assert.equal(
      attribute(id, "default"),
      String(propertyFact.default),
      `CMOF default changed for ${id}`,
    );
  }
}

console.log(
  `BPMN_SEQUENTIAL_USER_TASK_METAMODEL_CHECK ${JSON.stringify({
    sourceSha256: actualSha256,
    classes: manifest.classes.length,
    properties: manifest.properties.length,
    coverage: manifest.coverage.status,
  })}`,
);
