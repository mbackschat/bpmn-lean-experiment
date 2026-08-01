/**
 * Optional admission observation over the pinned BPMN MIWG interchange suite.
 *
 * The suite is a read-only external research input: this harness reads it in
 * place, requires the pinned revision, and records only how far each model gets
 * at the current source/profile boundary. It is not an execution-conformance
 * claim, so a rejected model is an expected classification rather than a
 * failure. Missing evidence is an infrastructure failure, never a skip.
 */
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ?? path.resolve(
  projectRoot,
  "../oss",
);
const defaultSuiteRoot = path.join(
  externalRoot,
  "bpmn-miwg/bpmn-miwg-test-suite",
);
const suiteRoot = process.env["BPMN_MIWG_ROOT"] ?? defaultSuiteRoot;
const expectedRevision = "cb2629519cee6280ab521f99dc46a9815a221a35";

try {
  await access(suiteRoot);
} catch {
  throw new Error(
    `pinned MIWG checkout is absent at ${suiteRoot}; run ./scripts/setup-external-sources.sh all or set BPMN_MIWG_ROOT`,
  );
}

const actualRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: suiteRoot,
  encoding: "utf8",
  timeout: 5_000,
}).trim();
assert.equal(actualRevision, expectedRevision);

const referenceDirectory = path.join(suiteRoot, "Reference");
const modelNames = (await readdir(referenceDirectory))
  .filter((name) => name.endsWith(".bpmn"))
  .sort();
assert.equal(modelNames.length, 21);

const forbiddenDiagnosticCodes = new Set<string>([
  BpmnSourceDiagnosticCode.SourceTooLarge,
  BpmnSourceDiagnosticCode.InvalidUtf8,
  BpmnSourceDiagnosticCode.DoctypeForbidden,
  BpmnSourceDiagnosticCode.ParserFailure,
  BpmnSourceDiagnosticCode.SourceIdentityMismatch,
]);
const outcomeCounts = new Map<string, number>();

for (const modelName of modelNames) {
  const bytes = await readFile(path.join(referenceDirectory, modelName));
  const result = await compileBpmnToSemanticProcess({
    bytes,
    sourceId: `miwg-${modelName}`,
    expectedSha256: undefined,
    semanticProfile: "miwg-interchange-observation-only",
    limits: {
      maxBytes: 10 * 1024 * 1024,
      parserDeadlineMs: 2_000,
    },
  });
  assert.deepEqual([...result.copyExactBytes()], [...bytes]);
  const outcome: string | undefined =
    result.status === BpmnCompilationStatus.Accepted
      ? result.status
      : result.diagnostics[0]?.code;
  assert.ok(
    outcome !== undefined,
    `${modelName} produced neither an accepted status nor a diagnostic`,
  );
  assert.equal(
    forbiddenDiagnosticCodes.has(outcome),
    false,
    `${modelName} failed before the expected interchange/profile boundary: ${JSON.stringify(result.diagnostics)}`,
  );
  outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);
}

console.log(
  `BPMN_MIWG_IMPORT ${JSON.stringify({
    revision: actualRevision,
    models: modelNames.length,
    outcomes: Object.fromEntries(
      [...outcomeCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  })}`,
);
