import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Contract for the external, non-redistributed OMG BPMN 2.0.2 corpus.
 *
 * The test never contacts OMG. It keeps the official fetch inventory equal to
 * the tracked digest inventory and locks the overrideable external defaults
 * used by the two executable consumers.
 */
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = path.join(
  projectRoot,
  "docs/reference/bpmn-2.0.2/LOCAL-CORPUS.sha256",
);

function manifestFiles(manifest: string): ReadonlyArray<string> {
  return manifest
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(line.indexOf("  ") + 2))
    .sort();
}

test("keeps the official fetch set equal to the verified corpus manifest", async () => {
  const [manifest, fetchScript] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(path.join(projectRoot, "scripts/fetch-bpmn-corpus.sh"), "utf8"),
  ]);
  const fetches = [...fetchScript.matchAll(/^fetch_file "([^"]+)" "(https:\/\/www\.omg\.org\/[^"]+)"$/gmu)];

  assert.deepEqual(
    fetches.map((match) => match[1]).sort(),
    manifestFiles(manifest),
  );
  assert.equal(fetches.length, 15);
});

test("defaults executable consumers to the external corpus with explicit overrides", async () => {
  const [validator, metamodelCheck, referenceReadme, verifyScript] =
    await Promise.all([
      readFile(path.join(projectRoot, "scripts/validate-bpmn-xml.sh"), "utf8"),
      readFile(
        path.join(projectRoot, "scripts/check-bpmn-semantic-process-metamodel.ts"),
        "utf8",
      ),
      readFile(
        path.join(projectRoot, "docs/reference/bpmn-2.0.2/README.md"),
        "utf8",
      ),
      readFile(path.join(projectRoot, "scripts/verify-bpmn-corpus.sh"), "utf8"),
    ]);

  assert.match(validator, /BPMN_XSD_PATH/u);
  assert.match(validator, /BPMN_EXTERNAL_ROOT/u);
  assert.match(metamodelCheck, /BPMN_CMOF_PATH/u);
  assert.match(metamodelCheck, /BPMN_EXTERNAL_ROOT/u);
  assert.match(referenceReadme, /\.\.\/\.\.\/\.\.\/\.\.\/oss\/omg-bpmn-2\.0\.2/u);
  assert.match(referenceReadme, /scripts\/fetch-bpmn-corpus\.sh/u);
  assert.match(verifyScript, /LOCAL-CORPUS\.sha256/u);
});

test("the CMOF calibration fails rather than skipping missing evidence", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-bpmn-semantic-process-metamodel.ts"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BPMN_CMOF_PATH: path.join(tmpdir(), "absent-bpmn20.cmof"),
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /setup-external-sources\.sh verify/u);
  assert.doesNotMatch(result.stdout, /skipped/iu);
});

test("the Semantic XSD calibration fails rather than skipping missing evidence", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-bpmn-semantic-process-metamodel.ts"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BPMN_CMOF_PATH: path.resolve(
          projectRoot,
          "../oss/omg-bpmn-2.0.2/machine-readable/BPMN20.cmof",
        ),
        BPMN_EXTERNAL_ROOT: path.join(tmpdir(), "absent-bpmn-corpus"),
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /normative Semantic XSD is absent/u);
  assert.doesNotMatch(result.stdout, /skipped/iu);
});
