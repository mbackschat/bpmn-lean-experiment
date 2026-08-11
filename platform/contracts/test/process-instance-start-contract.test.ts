import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeProcessInstanceStartResult,
  ProcessInstanceStartStatus,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
  ProcessInstanceStartResult,
} from "@bpmn-lean/platform-contracts";

const source = {
  kind: "bpmnSource",
  id: "customer-order.bpmn",
  sha256: "c".repeat(64),
  byteLength: 3072,
  declaredEncoding: "UTF-8",
  decodedAs: "UTF-8",
} as const satisfies ExactPublicSourceIdentity;

const definition = {
  processId: "order-process",
  version: 2,
  source,
  semanticProfile: "cib-seven-2.2.0:sequential-user-task",
  startCapabilities: {
    timerStarts: [{ startEventId: "TimerStart_1", durationMs: 1000 }],
  },
} as const satisfies DeployedDefinitionVersion;

test("decodes a started instance while reconstructing its complete public identity", () => {
  const input = {
    status: ProcessInstanceStartStatus.Started,
    instance: {
      processInstanceId: "order-instance-42",
      definition,
    },
  } as const satisfies ProcessInstanceStartResult;

  const decoded = decodeProcessInstanceStartResult(input);

  assert.deepEqual(decoded, input);
  assert.notStrictEqual(decoded, input);
  assert.equal(decoded.status, ProcessInstanceStartStatus.Started);
  if (decoded.status === ProcessInstanceStartStatus.Started) {
    assert.notStrictEqual(decoded.instance, input.instance);
    assert.notStrictEqual(decoded.instance.definition, input.instance.definition);
    assert.notStrictEqual(
      decoded.instance.definition.source,
      input.instance.definition.source,
    );
  }
});

test("decodes one opaque pre-start rejection without interpreting its code", () => {
  const input = {
    status: ProcessInstanceStartStatus.Rejected,
    definition,
    failure: {
      code: "futureEngineOrHostFailure",
      evidence: "The exact version could not be started.",
    },
  } as const satisfies ProcessInstanceStartResult;

  const decoded = decodeProcessInstanceStartResult(input);

  assert.deepEqual(decoded, input);
  assert.notStrictEqual(decoded, input);
  assert.equal(decoded.status, ProcessInstanceStartStatus.Rejected);
  if (decoded.status === ProcessInstanceStartStatus.Rejected) {
    assert.notStrictEqual(decoded.definition, input.definition);
    assert.notStrictEqual(decoded.definition.source, input.definition.source);
    assert.notStrictEqual(decoded.failure, input.failure);
  }
});

test("rejects private Temporal and semantic fields that a naive cast would accept", () => {
  const privateValues = [
    {
      status: "started",
      instance: {
        processInstanceId: "order-instance-42",
        definition,
        workflowHandle: { workflowId: "private-workflow-id" },
      },
    },
    {
      status: "started",
      instance: {
        processInstanceId: "order-instance-42",
        definition,
      },
      semanticProcess: { operations: [] },
    },
  ] as const;

  for (const privateValue of privateValues) {
    assert.throws(
      () => decodeProcessInstanceStartResult(privateValue),
      /must contain exactly its public fields/u,
    );
  }
});

test("rejects malformed nested definition versions and source digests", () => {
  assert.throws(
    () => decodeProcessInstanceStartResult({
      status: "started",
      instance: {
        processInstanceId: "order-instance-42",
        definition: { ...definition, version: "2" },
      },
    }),
    /definition\.version must be a positive safe integer/u,
  );
  assert.throws(
    () => decodeProcessInstanceStartResult({
      status: "rejected",
      definition: {
        ...definition,
        source: { ...source, sha256: "ABC123" },
      },
      failure: { code: "admissionFailure", evidence: "Rejected." },
    }),
    /definition\.source\.sha256 must be a lowercase SHA-256 digest/u,
  );
});

test("rejects missing, extra, and malformed public identity fields", () => {
  const malformedValues = [
    {
      value: {
        status: "started",
        instance: { definition },
      },
      message: /instance must contain exactly its public fields/u,
    },
    {
      value: {
        status: "started",
        instance: { processInstanceId: "", definition },
      },
      message: /processInstanceId must not be empty/u,
    },
    {
      value: {
        status: "started",
        instance: { processInstanceId: "\uD800", definition },
      },
      message: /processInstanceId must contain well-formed Unicode/u,
    },
    {
      value: {
        status: "started",
        instance: { processInstanceId: "instance", definition, taskId: "private" },
      },
      message: /instance must contain exactly its public fields/u,
    },
    {
      value: {
        status: "rejected",
        definition: { ...definition, processId: "\uD800" },
        failure: { code: "failure", evidence: "Rejected." },
      },
      message: /definition\.processId must contain well-formed Unicode/u,
    },
  ];

  for (const { value, message } of malformedValues) {
    assert.throws(() => decodeProcessInstanceStartResult(value), message);
  }
});

test("rejects malformed opaque failures and unknown result discriminants", () => {
  const malformedValues = [
    {
      value: {
        status: "rejected",
        definition,
        failure: { code: "", evidence: "Rejected." },
      },
      message: /failure\.code must not be empty/u,
    },
    {
      value: {
        status: "rejected",
        definition,
        failure: { code: "failure", evidence: "\uD800" },
      },
      message: /failure\.evidence must contain well-formed Unicode/u,
    },
    {
      value: {
        status: "rejected",
        definition,
        failure: { code: "failure", evidence: "Rejected.", runId: "private" },
      },
      message: /failure must contain exactly its public fields/u,
    },
    {
      value: { status: "pending", definition },
      message: /status must be started or rejected/u,
    },
  ];

  for (const { value, message } of malformedValues) {
    assert.throws(() => decodeProcessInstanceStartResult(value), message);
  }
});
