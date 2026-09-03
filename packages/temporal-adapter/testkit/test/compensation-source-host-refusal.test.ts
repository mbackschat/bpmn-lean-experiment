import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  canonicalCompensationExecutionStateUtf8Bytes,
  canonicalCompensationParentContextRetentionsUtf8Bytes,
  projectCompensationStartCapacity,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionFailureCode,
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  assessBpmnProcessAdmission,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";
import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-protocol";

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

test("admits only the exact Compensation checkpoint through both Product 1 start paths", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../bpmn-source/test/fixtures/compensation-source-checkpoint.bpmn",
      import.meta.url,
    )),
    sourceId: "compensation-source-host-admission",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
    limits,
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Compensation source checkpoint was not admitted");
  }
  const program = compilation.semanticProcess;
  const valid = start(program, "CompensationSourceHostAdmission_1", "frozen itinerary");
  const trigger = program.operations.find(
    (operation) => operation.kind === SemanticOperationKind.TriggerCompensation,
  );
  assert.equal(trigger?.kind, SemanticOperationKind.TriggerCompensation);
  if (trigger?.kind !== SemanticOperationKind.TriggerCompensation) {
    throw new Error("Compensation source checkpoint lost its trigger");
  }
  assert.equal(
    program.operations.filter(({ kind }) => kind === SemanticOperationKind.Duplicate).length,
    1,
  );
  const unsupportedFailure = {
    code: BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported,
    evidence: "Workflow start requires one admitted Semantic Process execution.",
  } as const;

  assert.equal(supportsSemanticProcessExecution(valid, program), true);
  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
  assert.deepEqual(assessBpmnProcessAdmission(valid, program), {
    kind: BpmnProcessAdmissionResultKind.Admitted,
  });

  const snapshotLimit = program.compensationEventSubProcessSnapshots?.limits.maxCanonicalBytes;
  const executionLimit = program.compensationExecution?.limits.maxCanonicalBytes;
  assert.equal(snapshotLimit, 8_192);
  assert.equal(executionLimit, 20_480);
  if (snapshotLimit === undefined || executionLimit === undefined) {
    throw new TypeError("Compensation source checkpoint lost its capacity declarations");
  }
  const valueCandidate = (length: number) =>
    start(program, "CompensationValueCapacity_1", "v".repeat(length));
  const largestValue = largestFittingLength(
    valueCandidate,
    (candidate) => snapshotBytes(program, candidate),
    snapshotLimit,
  );
  const identityCandidate = (length: number) => ({
    ...valid,
    commandId: `identity-capacity:${length}`,
    instanceId: `I${"d".repeat(length)}`,
  });
  const largestIdentity = largestFittingLength(
    identityCandidate,
    (candidate) => executionBytes(program, candidate),
    executionLimit,
  );
  const valueOver = valueCandidate(largestValue + 1);
  const identityOver = identityCandidate(largestIdentity + 1);
  assert.ok(snapshotBytes(program, valueCandidate(largestValue)) <= snapshotLimit);
  assert.ok(snapshotBytes(program, valueOver) > snapshotLimit);
  assert.ok(executionBytes(program, valueOver) <= executionLimit);
  assert.ok(executionBytes(program, identityCandidate(largestIdentity)) <= executionLimit);
  assert.ok(executionBytes(program, identityOver) > executionLimit);
  assert.ok(snapshotBytes(program, identityOver) <= snapshotLimit);

  const malformed: ReadonlyArray<StartProcessStimulus> = [
    { ...valid, initialVariables: [] },
    {
      ...valid,
      initialVariables: [{
        name: "DataInput_TravelDetails",
        value: { kind: VariableValueKind.String, value: "wrong name" },
      }],
    },
    {
      ...valid,
      initialVariables: [
        ...valid.initialVariables,
        { name: "Unrelated", value: { kind: VariableValueKind.String, value: "extra" } },
      ],
    },
    { ...valid, initialVariables: [...valid.initialVariables, ...valid.initialVariables] },
    {
      ...valid,
      initialVariables: [{
        name: "Property_TravelDetails",
        value: { kind: VariableValueKind.Null },
      }],
    },
    valueOver,
    identityOver,
  ];

  const starts: unknown[] = [];
  const client = {
    start: async (...arguments_: unknown[]) => {
      starts.push(arguments_);
      return Object.freeze({ workflowId: "recorded-compensation-workflow" });
    },
  } as never;
  assert.deepEqual(
    await startBpmnProcess(client, valid, program, { taskQueue: "compensation-source-host-admission" }),
    {
      kind: BpmnProcessStartResultKind.Started,
      processInstanceId: valid.instanceId,
    },
  );
  assert.equal(starts.length, 1);
  for (const candidate of malformed) {
    assert.equal(supportsSemanticProcessExecution(candidate, program), false);
    assert.deepEqual(assessBpmnProcessAdmission(candidate, program), {
      kind: BpmnProcessAdmissionResultKind.Rejected,
      failure: unsupportedFailure,
    });
    assert.deepEqual(
      await startBpmnProcess(
        client,
        candidate,
        program,
        { taskQueue: "compensation-source-host-admission" },
      ),
      { kind: BpmnProcessStartResultKind.Rejected, failure: unsupportedFailure },
    );
  }
  assert.equal(starts.length, 1);

  const compensationFailure = {
    kind: TemporalHostCapabilityResultKind.Rejected,
    failure: {
      code: TemporalHostAdmissionFailureCode.CompensationSchedulerUnavailable,
      evidence:
        "The Temporal host admits Compensation scheduling only for the exact well-formed source checkpoint without another host-driven wait.",
    },
  } as const;
  const declaration = program.compensationExecution;
  assert.ok(declaration !== undefined);
  const passive = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.ok(passive !== undefined);
  const malformedEffect = {
    ...passive,
    id: `${passive.id}:ordinary-wait`,
    kind: SemanticOperationKind.AwaitEffect,
  } as unknown as SemanticOperation;
  const malformedManagedRace = {
    ...passive,
    id: `${passive.id}:managed-race`,
    kind: SemanticOperationKind.AwaitEventRace,
  } as unknown as SemanticOperation;
  const { compensationExecution: _missing, ...withoutDeclaration } = program;
  const adversarial: ReadonlyArray<readonly [string, SemanticProcessProgram]> = [
    ["ordinary host wait", withOperations(program, [...program.operations, malformedEffect])],
    ["another managed claimant", withOperations(program, [...program.operations, malformedManagedRace])],
    ["second trigger", withOperations(program, [
      ...program.operations,
      { ...trigger, id: `${trigger.id}:second` },
    ])],
    ["wrong profile", {
      ...program,
      identity: { ...program.identity, semanticProfile: "wrong-profile" },
    }],
    ["missing declaration", withoutDeclaration as SemanticProcessProgram],
    ["mismatched declaration", {
      ...program,
      compensationExecution: {
        ...declaration,
        triggerOperationId: `${declaration.triggerOperationId}:mismatch`,
      },
    }],
  ];
  for (const [name, candidate] of adversarial) {
    assert.equal(supportsSemanticProcessExecution(valid, candidate), false, name);
    assert.deepEqual(assessTemporalHostCapability(candidate), compensationFailure, name);
  }
});

function start(
  program: SemanticProcessProgram,
  instanceId: string,
  value: string,
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `start:${instanceId}`,
    processId: program.processId,
    instanceId,
    initialVariables: [{
      name: "Property_TravelDetails",
      value: { kind: VariableValueKind.String, value },
    }],
  };
}

function largestFittingLength(
  candidate: (length: number) => StartProcessStimulus,
  canonicalBytes: (candidate: StartProcessStimulus) => number,
  limit: number,
): number {
  let low = 0;
  let high = 30_000;
  assert.ok(canonicalBytes(candidate(low)) <= limit);
  assert.ok(canonicalBytes(candidate(high)) > limit);
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (canonicalBytes(candidate(middle)) <= limit) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

function snapshotBytes(
  program: SemanticProcessProgram,
  candidate: StartProcessStimulus,
): number {
  const projection = projectCompensationStartCapacity(program, candidate);
  assert.ok(projection !== null);
  assert.equal(
    projection.snapshotCanonicalBytes,
    canonicalCompensationParentContextRetentionsUtf8Bytes(projection.retentions),
  );
  return projection.snapshotCanonicalBytes;
}

function executionBytes(
  program: SemanticProcessProgram,
  candidate: StartProcessStimulus,
): number {
  const projection = projectCompensationStartCapacity(program, candidate);
  assert.ok(projection !== null);
  assert.equal(
    projection.executionCanonicalBytes,
    canonicalCompensationExecutionStateUtf8Bytes([projection.trigger], projection.waits),
  );
  return projection.executionCanonicalBytes;
}

function withOperations(
  program: SemanticProcessProgram,
  operations: ReadonlyArray<SemanticOperation>,
): SemanticProcessProgram {
  return { ...program, operations: [...operations] };
}
