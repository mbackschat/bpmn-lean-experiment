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

import { readKernelProgram, ReadRefusalCode } from "@bpmn-lean/bpmn-source";
import { externalRoot } from "../../../scripts/external-root.ts";

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

// Refusals before the interchange boundary: the suite is valid interchange, so a size, DOCTYPE or parser refusal is an
// infrastructure defect, while an unknown element, attribute or extension is the expected boundary. `source.encoding`
// stays admissible because it also names a declared non-UTF-8 encoding, which the suite uses and the reader refuses by
// design (the earlier compile path classified it apart from malformed UTF-8 for the same reason).
const forbiddenRefusalCodes = new Set<string>([
  ReadRefusalCode.SourceTooLarge,
  ReadRefusalCode.SourceDoctype,
  ReadRefusalCode.ParserFailure,
  ReadRefusalCode.SourceIdentityMismatch,
]);
const outcomeCounts = new Map<string, number>();

for (const modelName of modelNames) {
  const bytes = await readFile(path.join(referenceDirectory, modelName));
  const result = await readKernelProgram({
    bytes,
    overlay: null,
    profile: "miwg-interchange-observation-only",
    limits: {
      maxBytes: 10 * 1024 * 1024,
      parserDeadlineMs: 2_000,
    },
  });
  const outcome = result.kind === "read" ? result.kind : result.code;
  assert.equal(
    forbiddenRefusalCodes.has(outcome),
    false,
    `${modelName} failed before the expected interchange boundary: ${JSON.stringify(result)}`,
  );
  outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);
}

/** UTF-16 code-unit order, host-independent; the outcome names are ASCII, so it equals scalar order. */
const compareCodePoints = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

console.log(
  `BPMN_MIWG_IMPORT ${JSON.stringify({
    revision: actualRevision,
    models: modelNames.length,
    outcomes: Object.fromEntries(
      [...outcomeCounts.entries()].sort(([left], [right]) =>
        compareCodePoints(left, right)),
    ),
  })}`,
);
