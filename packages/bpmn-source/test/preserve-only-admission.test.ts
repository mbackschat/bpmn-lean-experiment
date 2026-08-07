/**
 * Preserve-only admission: material the compiler retains without executing must not change execution.
 *
 * The contract under test is [the preserve-only admission proposal](../../../docs/PRESERVE-ONLY-ADMISSION-PROPOSAL.md).
 * Its oracle is the pair of sources below: `scenarios/user-task-discovery-completion/process.bpmn`
 * carries no notation and is admitted by the executed-only profile today, and the fixture beside this
 * suite is the same Process with a modeler's Diagram Interchange added. The preserve-enabled profile
 * must admit the second and reach the checked graph the first reaches.
 *
 * Equality is asserted on the execution projection, not on the checked graph, because
 * `CheckedProcessIdentity` carries `sourceSha256` and the two sources are different bytes by
 * construction. Digest fidelity is therefore asserted separately, so normalizing identity for the
 * comparison does not quietly stop anyone from checking it.
 *
 * The twin is a tracked hand-written source that predates the classifier rather than a stripped copy
 * the classifier produced, so agreement here is evidence about the classifier and not a restatement
 * of it.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { BpmnCompilationResult } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const preservedNotationSource = new URL(
  "./fixtures/preserved-notation-user-task.bpmn",
  import.meta.url,
);
const executedOnlyTwin = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);

async function compile(
  source: URL,
  sourceId: string,
  semanticProfile: string,
): Promise<BpmnCompilationResult> {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId,
    expectedSha256: undefined,
    semanticProfile,
    limits: semanticProcessTestLimits,
  });
}

/** The checked graph with exact-source identity normalized away, and nothing else normalized. */
function executionProjection(
  checkedProcess: CheckedProcess,
): Omit<CheckedProcess, "identity"> & Readonly<{ semanticProfile: string }> {
  const { identity, ...execution } = checkedProcess;
  return { ...execution, semanticProfile: identity.semanticProfile };
}

test("admits a modeler's Diagram Interchange under the preserve-enabled profile", async () => {
  const admitted = await compile(
    preservedNotationSource,
    "preserved-notation-user-task",
    SemanticProfileId.UserTaskPreservedNotation,
  );

  assert.equal(
    admitted.status,
    BpmnCompilationStatus.Accepted,
    `preserved notation was rejected: ${JSON.stringify(admitted.diagnostics)}`,
  );
});

test("reaches the executed-only twin's execution projection", async () => {
  const [preserved, executedOnly] = await Promise.all([
    compile(
      preservedNotationSource,
      "preserved-notation-user-task",
      SemanticProfileId.UserTaskPreservedNotation,
    ),
    compile(
      executedOnlyTwin,
      "sequential-user-task-process",
      SemanticProfileId.UserTask,
    ),
  ]);
  assert.equal(preserved.status, BpmnCompilationStatus.Accepted);
  assert.equal(executedOnly.status, BpmnCompilationStatus.Accepted);
  assert.ok(preserved.checkedProcess !== undefined);
  assert.ok(executedOnly.checkedProcess !== undefined);

  const { semanticProfile: _preservedProfile, ...preservedExecution } =
    executionProjection(preserved.checkedProcess);
  const { semanticProfile: _executedProfile, ...executedExecution } =
    executionProjection(executedOnly.checkedProcess);
  assert.deepEqual(preservedExecution, executedExecution);

  assert.notEqual(
    preserved.checkedProcess.identity.sourceSha256,
    executedOnly.checkedProcess.identity.sourceSha256,
    "the two sources must retain distinct digests, or the comparison has nothing to normalize",
  );
});

test("keeps the executed-only profile refusing preserved notation", async () => {
  const refused = await compile(
    preservedNotationSource,
    "preserved-notation-user-task",
    SemanticProfileId.UserTask,
  );

  assert.equal(
    refused.status,
    BpmnCompilationStatus.Rejected,
    "widening admission for one profile must not widen it for the executed-only profile",
  );
});

/**
 * Each case perturbs the admitted fixture at one point and must reject.
 *
 * Perturbing the admitted source keeps every other property of the file constant, so a rejection
 * here is attributable to the named construct rather than to some other difference between two
 * separately authored files.
 */
const refusedPerturbations: ReadonlyArray<
  Readonly<{ name: string; find: string; replace: string }>
> = [
  {
    name: "a preserved container holding a descendant that carries execution meaning",
    find: '<bpmn:participant id="Participant_Reviewers" name="Reviewers" processRef="Process_SequentialUserTask"/>',
    replace:
      '<bpmn:participant id="Participant_Reviewers" name="Reviewers" processRef="Process_SequentialUserTask">' +
      '<bpmn:participantMultiplicity minimum="1" maximum="5"/></bpmn:participant>',
  },
  {
    name: "a second executable Process no profile QName binds",
    find: "</bpmn:definitions>",
    replace:
      '<bpmn:process id="Process_Unrelated" isExecutable="true">' +
      '<bpmn:startEvent id="StartEvent_Unrelated"/></bpmn:process></bpmn:definitions>',
  },
  {
    name: "a foreign attribute on a preserved shape",
    find: '<bpmndi:BPMNShape id="StartEvent_1_di"',
    replace:
      '<bpmndi:BPMNShape xmlns:camunda="http://camunda.org/schema/1.0/bpmn"' +
      ' camunda:candidateGroups="managers" id="StartEvent_1_di"',
  },
  {
    name: "a Diagram Interchange reference with no target",
    find: 'bpmnElement="EndEvent_1"',
    replace: 'bpmnElement="NoSuchElement"',
  },
];

for (const { name, find, replace } of refusedPerturbations) {
  test(`refuses ${name}`, async () => {
    const admitted = await readFile(preservedNotationSource, "utf8");
    assert.ok(admitted.includes(find), `the fixture no longer contains ${find}`);

    const refused = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(admitted.replace(find, replace)),
      sourceId: "preserved-notation-perturbation",
      expectedSha256: undefined,
      semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
      limits: semanticProcessTestLimits,
    });

    assert.equal(refused.status, BpmnCompilationStatus.Rejected);
  });
}
