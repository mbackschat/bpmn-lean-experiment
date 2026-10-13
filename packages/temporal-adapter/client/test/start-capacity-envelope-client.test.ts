/**
 * Both client start paths refuse a portable handoff Start whose capacity envelope is exceeded, with one typed failure
 * and before any Workflow-creation SDK call, while a Start that fits and every other profile start as before.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionFailureCode,
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  assessBpmnProcessAdmission,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";
import {
  TemporalDefinitionStartPreparationResultKind,
  TemporalPreparedDefinitionStartResultKind,
  prepareTemporalDefinitionStart,
  startPreparedTemporalDefinition,
} from "@bpmn-lean/temporal-client/definition-start";
import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  fullAllowanceValue,
  startCapacityEnvelopeEvidence,
} from "@bpmn-lean/temporal-protocol";

import {
  portableHandoffProgram,
  portableHandoffStart,
} from "../../protocol/test/portable-handoff-capacity-fixture.ts";
import { enrollmentFixture } from "./worker-deployment-enrollment-fixture.ts";

const taskQueue = "capacity-envelope-queue";
const workflowId = "capacity-envelope-direct-address";

async function overCapacityStart() {
  const program = await portableHandoffProgram();
  const start = portableHandoffStart("I".repeat(4_000), fullAllowanceValue());
  const envelope = assessStartCapacityEnvelope(start, program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.Exceeded);
  return {
    program,
    start,
    failure: {
      code: BpmnProcessAdmissionFailureCode.StartCapacityEnvelopeExceeded,
      evidence: startCapacityEnvelopeEvidence(envelope.failure),
    },
  };
}

test("assesses an over-capacity portable handoff Start as one typed refusal naming budget, bound and estimate", async () => {
  const { program, start, failure } = await overCapacityStart();
  assert.deepEqual(assessBpmnProcessAdmission(start, program), {
    kind: BpmnProcessAdmissionResultKind.Rejected,
    failure,
  });
  assert.match(failure.evidence, /\d+ canonical UTF-8 bytes for \w+Bytes, above its \d+-byte bound/u);
});

test("startBpmnProcess refuses an over-capacity Start before any SDK call and starts one that fits", async () => {
  const { program, start, failure } = await overCapacityStart();
  const refusedCalls: unknown[] = [];
  assert.deepEqual(await startBpmnProcess(fakeClient(refusedCalls), start, program, { taskQueue }),
    { kind: BpmnProcessStartResultKind.Rejected, failure });
  assert.equal(refusedCalls.length, 0);

  const fitting = portableHandoffStart("Order_1", fullAllowanceValue());
  const startedCalls: unknown[] = [];
  assert.deepEqual(await startBpmnProcess(fakeClient(startedCalls), fitting, program, { taskQueue }),
    { kind: BpmnProcessStartResultKind.Started, processInstanceId: "Order_1" });
  assert.equal(startedCalls.length, 1);
});

test("the direct definition start path refuses the same Start at preparation and at the prepared start", async () => {
  const { program, start, failure } = await overCapacityStart();
  assert.deepEqual(prepareTemporalDefinitionStart({ start, semanticProcess: program, workflowId, taskQueue }),
    { kind: TemporalDefinitionStartPreparationResultKind.Rejected, failure });

  const calls: unknown[] = [];
  assert.deepEqual(await startPreparedTemporalDefinition(fakeClient(calls), {
    start, semanticProcess: program, workflowId, taskQueue,
    expectedIntent: { protocol: "bpmn-direct-start-v1", intentSha256: "0".repeat(64) },
  }), { kind: TemporalPreparedDefinitionStartResultKind.Rejected, failure });
  assert.equal(calls.length, 0);

  const fitting = prepareTemporalDefinitionStart({
    start: portableHandoffStart("Order_1", fullAllowanceValue()), semanticProcess: program, workflowId, taskQueue });
  assert.equal(fitting.kind, TemporalDefinitionStartPreparationResultKind.Admitted);
});

test("leaves every other profile to the unchanged admission", async () => {
  const program = await portableHandoffProgram();
  const older: SemanticProcessProgram = { ...program, identity: { ...program.identity,
    semanticProfile: SemanticProfileId.StructuredProcessComposition } };
  const refusal = assessBpmnProcessAdmission(
    portableHandoffStart("I".repeat(4_000), fullAllowanceValue()), older);
  assert.ok(refusal.kind === BpmnProcessAdmissionResultKind.Rejected);
  assert.equal(refusal.failure.code, BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported);
});

function fakeClient(calls: unknown[]): never {
  return {
    ...enrollmentFixture(taskQueue),
    start: async (workflowType: string, options: unknown) => {
      calls.push({ workflowType, options });
      return { firstExecutionRunId: "private-run-id", client: {}, result: async () => undefined, describe: async () => undefined };
    },
  } as never;
}
