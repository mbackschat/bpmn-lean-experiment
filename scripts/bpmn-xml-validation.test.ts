import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Behavioral contract of the shared BPMN XML validator.
 *
 * The oracle is the validator's own exit status and announcement, exercised
 * against a temporary schema rather than the pinned OMG corpus: that corpus is
 * Git-ignored, so a test bound to it would silently stop checking anything
 * wherever it is absent — the exact failure this gate exists to prevent.
 */
const validatorPath = fileURLToPath(
  new URL("./validate-bpmn-xml.sh", import.meta.url),
);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const scenarioBpmnPath = "scenarios/user-task-discovery-completion/process.bpmn";

const probeSchema = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="probe"/>
</xs:schema>
`;

type ValidationRun = Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
}>;

function runValidator(
  paths: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
): ValidationRun {
  const result = spawnSync(validatorPath, [...paths], {
    cwd: projectRoot,
    encoding: "utf8",
    env: environment,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function withWorkspace(body: (workspace: string) => void): void {
  const workspace = mkdtempSync(join(tmpdir(), "bpmn-xml-validation-"));
  try {
    body(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("absent xmllint fails with an actionable installation message", () => {
  // An empty PATH removes every external command, so the validator can only
  // report the tool it needs. `ubuntu-latest` ships without libxml2-utils.
  const run = runValidator([scenarioBpmnPath], { PATH: "" });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /xmllint/u);
  assert.match(run.stderr, /libxml2-utils/u);
});

test("an absent pinned schema announces reduced validation", () => {
  const run = runValidator([scenarioBpmnPath], {
    ...process.env,
    BPMN_XSD_PATH: join(tmpdir(), "absent-bpmn20.xsd"),
  });

  assert.equal(run.status, 0);
  assert.match(run.stdout, /well-formedness only/u);
  assert.match(run.stdout, /no schema conformance claim/u);
});

test("reduced validation still rejects malformed XML", () => {
  withWorkspace((workspace) => {
    const malformedPath = join(workspace, "malformed.bpmn");
    writeFileSync(malformedPath, "<definitions>\n", "utf8");

    const run = runValidator([malformedPath], {
      ...process.env,
      BPMN_XSD_PATH: join(workspace, "absent.xsd"),
    });

    assert.notEqual(run.status, 0);
  });
});

test("a present pinned schema is applied to every argument", () => {
  withWorkspace((workspace) => {
    const schemaPath = join(workspace, "probe.xsd");
    const conformingPath = join(workspace, "conforming.xml");
    const violatingPath = join(workspace, "violating.xml");
    writeFileSync(schemaPath, probeSchema, "utf8");
    writeFileSync(conformingPath, "<probe/>\n", "utf8");
    writeFileSync(violatingPath, "<other/>\n", "utf8");
    const schemaEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      BPMN_XSD_PATH: schemaPath,
    };

    const accepted = runValidator([conformingPath], schemaEnvironment);
    assert.equal(accepted.status, 0);
    assert.match(accepted.stdout, /schema-validated/u);

    // The violating document is the trailing argument, so a validator that
    // checked only its first input would pass this case.
    const rejected = runValidator(
      [conformingPath, violatingPath],
      schemaEnvironment,
    );
    assert.notEqual(rejected.status, 0);
  });
});
