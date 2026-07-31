import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const verifyScriptPath = fileURLToPath(
  new URL("./verify.sh", import.meta.url),
);
const cibOracleScriptPath = fileURLToPath(
  new URL("./test-cibseven-oracle.sh", import.meta.url),
);
const contributorGuidePath = fileURLToPath(
  new URL("../CLAUDE.md", import.meta.url),
);
const testingSpecPath = fileURLToPath(
  new URL("../docs/TESTING-SPEC.md", import.meta.url),
);
const checkedSourceRelationMainPath = fileURLToPath(
  new URL(
    "../BpmnSemantics/Experiments/CheckedSourceRelationMain.lean",
    import.meta.url,
  ),
);
const checkedSourceFrontierConformancePath = fileURLToPath(
  new URL(
    "../BpmnSemantics/Experiments/CheckedSourceFrontierConformance.lean",
    import.meta.url,
  ),
);

async function readNonemptyLines(path: string): Promise<readonly string[]> {
  const source = await readFile(path, "utf8");
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function assertLineOccursOnce(
  path: string,
  expected: string,
): Promise<void> {
  const lines = await readNonemptyLines(path);
  assert.equal(
    lines.filter((candidate) => candidate === expected).length,
    1,
  );
}

test("default verification includes the focused Temporal history gate", async () => {
  await assertLineOccursOnce(
    verifyScriptPath,
    "./scripts/pnpm.sh run test:temporal",
  );
});

test("managed-sandbox guidance preauthorizes every Temporal server gate", async () => {
  const contributorGuide = await readFile(contributorGuidePath, "utf8");
  const testingSpec = await readFile(testingSpecPath, "utf8");
  for (const source of [contributorGuide, testingSpec]) {
    assert.match(source, /managed sandbox/i);
    assert.match(source, /before (?:the )?first attempt/i);
    assert.match(source, /`\.\/scripts\/verify\.sh`/);
    assert.match(source, /`\.\/scripts\/pnpm\.sh run test:temporal`/);
    assert.match(source, /`\.\/scripts\/pnpm\.sh run test:pipeline`/);
  }
});

test("verification scripts validate BPMN XML through one preflighting owner", async () => {
  for (const path of [verifyScriptPath, cibOracleScriptPath]) {
    const source = await readFile(path, "utf8");
    assert.equal(
      source.includes("xmllint"),
      false,
      `${path} must not invoke xmllint directly: only the shared validator preflights that host tool and declares whether it established schema conformance`,
    );
    assert.match(source, /scripts\/validate-bpmn-xml\.sh/u);
  }
});

test("default verification builds and executes the checked-source proof experiment", async () => {
  await assertLineOccursOnce(
    verifyScriptPath,
    "lake build checkCheckedSourceRelationExperiment",
  );
  await assertLineOccursOnce(
    verifyScriptPath,
    "lake exe checkCheckedSourceRelationExperiment",
  );
});

test("the checked-source proof target imports both Stage 3a frontier modules", async () => {
  await assertLineOccursOnce(
    checkedSourceRelationMainPath,
    "import BpmnSemantics.Experiments.CheckedSourceFrontier",
  );
  await assertLineOccursOnce(
    checkedSourceRelationMainPath,
    "import BpmnSemantics.Experiments.CheckedSourceFrontierConformance",
  );
});

test("frontier conformance imports the Stage 3b parallel-frontier module", async () => {
  await assertLineOccursOnce(
    checkedSourceFrontierConformancePath,
    "import BpmnSemantics.Experiments.CheckedSourceParallelFrontier",
  );
});
