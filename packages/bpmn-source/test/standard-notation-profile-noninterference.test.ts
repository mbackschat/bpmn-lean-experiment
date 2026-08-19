/** Complete registered-profile guard for the standard-notation preservation capability. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type {
  CheckedProcess,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const standardNotationProfiles = Object.freeze([
  SemanticProfileId.UserTaskPreservedNotation,
  SemanticProfileId.UserTaskProcessDataPreservedNotation,
]);
const standardNotationProfileSet = new Set<string>(standardNotationProfiles);
const notationSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const executedOnlySource = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);

async function compile(source: URL, profile: string, sourceId: string) {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId,
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

function normalizeCheckedSource(
  checked: CheckedProcess,
): CheckedProcess {
  return {
    ...checked,
    identity: {
      ...checked.identity,
      sourceId: "normalized-source",
      sourceSha256: "0".repeat(64),
    },
  };
}

function normalizeProgramSource(
  program: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...program,
    identity: {
      ...program.identity,
      sourceId: "normalized-source",
      sourceSha256: "0".repeat(64),
    },
  };
}

test("admits standard notation under exactly the independently enumerated profiles", async () => {
  for (const profile of Object.values(SemanticProfileId)) {
    const result = await compile(notationSource, profile, `notation-${profile}`);
    assert.equal(
      result.status,
      standardNotationProfileSet.has(profile)
        ? BpmnCompilationStatus.Accepted
        : BpmnCompilationStatus.Rejected,
      profile,
    );
  }
});

for (const profile of standardNotationProfiles) {
  test(`${profile} keeps standard notation out of both execution projections`, async () => {
    const [notation, executedOnly] = await Promise.all([
      compile(notationSource, profile, `notation-${profile}`),
      compile(executedOnlySource, profile, `executed-${profile}`),
    ]);
    assert.ok(notation.checkedProcess !== undefined);
    assert.ok(executedOnly.checkedProcess !== undefined);
    assert.ok(notation.semanticProcess !== undefined);
    assert.ok(executedOnly.semanticProcess !== undefined);
    assert.deepEqual(
      normalizeCheckedSource(notation.checkedProcess),
      normalizeCheckedSource(executedOnly.checkedProcess),
    );
    assert.deepEqual(
      normalizeProgramSource(notation.semanticProcess),
      normalizeProgramSource(executedOnly.semanticProcess),
    );
  });
}
