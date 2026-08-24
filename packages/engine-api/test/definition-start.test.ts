/**
 * Exact-definition start binds stored identity before the concrete Temporal client is called and
 * keeps every host-private start detail inside product 1.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  EngineDefinitionStartIntegrityCode,
  EngineDefinitionStartDescriptionStatus,
  EngineDefinitionStartStatus,
  EngineVariableValueKind,
  describeBpmnDefinitionVersionStart,
  prepareBpmnDefinitionVersionStart,
  serializeEngineProcessWorkLocator,
  startBpmnDefinitionVersion,
  startPreparedBpmnDefinitionVersion,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionStartRequest,
} from "@bpmn-lean/engine-api";

const admittedSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const semanticProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";
const processId = "Process_SequentialUserTask";
const limits = {
  maxBytes: 1_048_576,
  parserDeadlineMs: 1_000,
} as const;

test("prepares a durable intent and canonical locator with zero SDK calls", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const request = requestFor(bytes, fakeClient(calls));
  const { temporalClient: _unused, ...preparationRequest } = request;
  const prepared = await prepareBpmnDefinitionVersionStart(preparationRequest);

  assert.equal(prepared.status, EngineDefinitionStartStatus.Admitted);
  assert.equal(calls.length, 0);
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) {
    throw new TypeError("Expected admitted Direct Start preparation");
  }
  assert.match(
    serializeEngineProcessWorkLocator(prepared.locator),
    /^bpmn-process-work-v1:/u,
  );
  assert.equal(prepared.intent.protocol, "bpmn-direct-start-v1");
  assert.match(prepared.intent.intentSha256, /^[0-9a-f]{64}$/u);

  assert.equal((await startPreparedBpmnDefinitionVersion({
    ...request,
    expectedIntent: prepared.intent,
  })).status, EngineDefinitionStartStatus.Started);
  assert.equal(calls.length, 1);
});

test("classifies retained type and Task Queue drift as divergent", async () => {
  const bytes = await readFile(admittedSource);
  const request = requestFor(bytes, fakeClient([]));
  const { temporalClient: _unused, ...preparationRequest } = request;
  const prepared = await prepareBpmnDefinitionVersionStart(preparationRequest);
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) {
    throw new TypeError("Expected admitted Direct Start preparation");
  }
  for (const [type, taskQueue, expected] of [
    ["runBpmnProcess", "m1-start-queue", EngineDefinitionStartDescriptionStatus.Matching],
    ["wrongWorkflow", "m1-start-queue", EngineDefinitionStartDescriptionStatus.Divergent],
    ["runBpmnProcess", "wrong-queue", EngineDefinitionStartDescriptionStatus.Divergent],
  ] as const) {
    const temporalClient = {
      getHandle: () => ({
        describe: async () => ({
          workflowId: decodeLocatorWorkflowId(serializeEngineProcessWorkLocator(prepared.locator)),
          type,
          taskQueue,
          status: { name: "RUNNING" },
          memo: { bpmnLeanDirectStartIntentSha256: prepared.intent.intentSha256 },
        }),
      }),
    } as unknown as EngineDefinitionStartRequest["temporalClient"];
    assert.deepEqual(
      await describeBpmnDefinitionVersionStart({
        temporalClient,
        processInstanceId: request.processInstanceId,
        taskQueue: request.taskQueue,
        expectedIntent: prepared.intent,
      }),
      { status: expected },
    );
  }
});

test("rejects stored process identity drift before calling Temporal start", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const result = await startBpmnDefinitionVersion({
    ...requestFor(bytes, fakeClient(calls)),
    expectedProcessId: "Different_Process",
  });

  assert.equal(result.status, EngineDefinitionStartStatus.IntegrityFailure);
  assert.equal(
    result.failure.code,
    EngineDefinitionStartIntegrityCode.IdentityDrift,
  );
  assert.equal(calls.length, 0);
});

test("starts one empty-variable instance and projects no private handle field", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const privateHandleSentinel = { privateHandleSentinel: "must-not-escape" };
  const result = await startBpmnDefinitionVersion(
    requestFor(bytes, fakeClient(calls, privateHandleSentinel)),
  );

  assert.deepEqual(result, {
    status: EngineDefinitionStartStatus.Started,
    source: {
      kind: "bpmnSource",
      id: "stored-definition-source",
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    definition: { processId, semanticProfile },
    processInstanceId: "semantic-instance-42",
  });
  assert.equal(calls.length, 1);
  const call = requireStartCall(calls[0]);
  assert.equal(call.options.taskQueue, "m1-start-queue");
  assert.deepEqual(call.options.args[0], {
    kind: "startProcess",
    commandId: "start:semantic-instance-42",
    processId,
    instanceId: "semantic-instance-42",
    initialVariables: [],
  });
  assert.equal(
    JSON.stringify(result).includes(privateHandleSentinel.privateHandleSentinel),
    false,
  );
});

test("binds detached canonical initial variables into the direct-start intent and stimulus", async () => {
  const bytes = await readFile(new URL(
    "../../../scenarios/sequential-multi-instance/process.bpmn",
    import.meta.url,
  ));
  const calls: unknown[] = [];
  const initialVariables = [{
    name: "DataObjectReference_InputItems",
    value: {
      kind: EngineVariableValueKind.StringList,
      value: ["contract", "invoice", "receipt"],
    },
  }] as const;
  const request = {
    ...requestFor(bytes, fakeClient(calls)),
    sourceId: "sequential-multi-instance-review",
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    expectedProcessId: "Process_SequentialMultiInstanceReview",
    initialVariables,
  } satisfies EngineDefinitionStartRequest;
  const pending = startBpmnDefinitionVersion(request);

  (initialVariables[0].value.value as unknown as string[])[0] = "mutated";

  const result = await pending;
  assert.equal(result.status, EngineDefinitionStartStatus.Started);
  const call = requireStartCall(calls[0]);
  assert.deepEqual(call.options.args[0], {
    kind: "startProcess",
    commandId: "start:semantic-instance-42",
    processId: "Process_SequentialMultiInstanceReview",
    instanceId: "semantic-instance-42",
    initialVariables: [{
      name: "DataObjectReference_InputItems",
      value: {
        kind: "stringList",
        value: ["contract", "invoice", "receipt"],
      },
    }],
  });

  const { temporalClient: _unused, ...preparationRequest } = request;
  const original = await prepareBpmnDefinitionVersionStart({
    ...preparationRequest,
    initialVariables: [{
      name: "DataObjectReference_InputItems",
      value: {
        kind: EngineVariableValueKind.StringList,
        value: ["contract"],
      },
    }],
  });
  const changed = await prepareBpmnDefinitionVersionStart({
    ...preparationRequest,
    initialVariables: [{
      name: "DataObjectReference_InputItems",
      value: {
        kind: EngineVariableValueKind.StringList,
        value: ["invoice"],
      },
    }],
  });
  assert.equal(original.status, EngineDefinitionStartStatus.Admitted);
  assert.equal(changed.status, EngineDefinitionStartStatus.Admitted);
  if (
    original.status !== EngineDefinitionStartStatus.Admitted ||
    changed.status !== EngineDefinitionStartStatus.Admitted
  ) {
    throw new TypeError("Expected both Direct Start preparations to be admitted");
  }
  assert.notEqual(original.intent.intentSha256, changed.intent.intentSha256);
});

test("rejects a noncanonical initial-variable patch before Temporal start", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  await assert.rejects(
    startBpmnDefinitionVersion({
      ...requestFor(bytes, fakeClient(calls)),
      initialVariables: [
        { name: "zeta", value: { kind: EngineVariableValueKind.Null } },
        { name: "alpha", value: { kind: EngineVariableValueKind.Null } },
      ],
    }),
    /initialVariables must be a canonical variable patch/u,
  );
  assert.equal(calls.length, 0);
});

test("snapshots caller-owned bytes and scalars before asynchronous compilation", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const request = requestFor(bytes, fakeClient(calls)) as MutableStartRequest;
  const pending = startBpmnDefinitionVersion(request);

  bytes.fill(0);
  request.sourceId = "mutated-source";
  request.expectedSha256 = "0".repeat(64);
  request.semanticProfile = "mutated-profile";
  request.expectedProcessId = "Mutated_Process";
  request.processInstanceId = "mutated-instance";
  request.taskQueue = "mutated-queue";
  (request.limits as { maxBytes: number }).maxBytes = 1;
  (request.limits as { parserDeadlineMs: number }).parserDeadlineMs = 1;

  const result = await pending;
  assert.equal(result.status, EngineDefinitionStartStatus.Started);
  assert.equal(result.source.id, "stored-definition-source");
  assert.equal(result.definition.processId, processId);
  assert.equal(result.processInstanceId, "semantic-instance-42");
  const call = requireStartCall(calls[0]);
  assert.equal(call.options.taskQueue, "m1-start-queue");
  assert.equal(call.options.args[0].instanceId, "semantic-instance-42");
  assert.equal(call.options.args[1].identity.sourceId, "stored-definition-source");
  assert.equal(call.options.args[1].identity.semanticProfile, semanticProfile);
});

test("classifies stored digest rejection as integrity failure without starting", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const result = await startBpmnDefinitionVersion({
    ...requestFor(bytes, fakeClient(calls)),
    expectedSha256: "0".repeat(64),
  });

  assert.equal(result.status, EngineDefinitionStartStatus.IntegrityFailure);
  assert.equal(
    result.failure.code,
    EngineDefinitionStartIntegrityCode.CompilationRejected,
  );
  assert.equal(calls.length, 0);
});

test("rejects malformed semantic instance identity before compilation or start", async () => {
  const bytes = await readFile(admittedSource);
  for (const processInstanceId of ["", "\ud800"] as const) {
    const calls: unknown[] = [];
    await assert.rejects(
      startBpmnDefinitionVersion({
        ...requestFor(bytes, fakeClient(calls)),
        processInstanceId,
      }),
      /processInstanceId must be a nonempty well-formed Unicode string/u,
    );
    assert.equal(calls.length, 0);
  }
});

type MutableStartRequest = {
  -readonly [Key in keyof EngineDefinitionStartRequest]:
    EngineDefinitionStartRequest[Key];
};

type CapturedStartCall = Readonly<{
  options: Readonly<{
    taskQueue: string;
    args: readonly [
      Readonly<{ instanceId: string }>,
      Readonly<{
        identity: Readonly<{ sourceId: string; semanticProfile: string }>;
      }>,
    ];
  }>;
}>;

function requestFor(
  bytes: Uint8Array,
  temporalClient: EngineDefinitionStartRequest["temporalClient"],
): EngineDefinitionStartRequest {
  return {
    bytes,
    sourceId: "stored-definition-source",
    expectedSha256: sha256(bytes),
    semanticProfile,
    expectedProcessId: processId,
    processInstanceId: "semantic-instance-42",
    initialVariables: [],
    limits: { ...limits },
    temporalClient,
    taskQueue: "m1-start-queue",
  };
}

function fakeClient(
  calls: unknown[],
  handle: unknown = {},
): EngineDefinitionStartRequest["temporalClient"] {
  return {
    start: async (_workflowType: unknown, options: unknown) => {
      calls.push({ options });
      return handle;
    },
  } as unknown as EngineDefinitionStartRequest["temporalClient"];
}

function requireStartCall(value: unknown): CapturedStartCall {
  assert.ok(typeof value === "object" && value !== null);
  return value as CapturedStartCall;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeLocatorWorkflowId(locator: string): string {
  return decodeURIComponent(locator.slice("bpmn-process-work-v1:".length));
}
