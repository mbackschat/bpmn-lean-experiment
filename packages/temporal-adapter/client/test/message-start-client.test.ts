/** Message Start construction binds one exact semantic dispatch to one handle-free SDK request. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
  TriggerMessageStartStimulus,
} from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";

import {
  TemporalMessageStartDescriptionResultKind,
  TemporalMessageStartPreparationResultKind,
  TemporalMessageStartResultKind,
  describeTemporalMessageStart,
  prepareTemporalMessageStart,
  startTemporalMessageStart,
} from "@bpmn-lean/temporal-client/message-start";
import type {
  TemporalMessageStartClient,
  TemporalMessageStartIntent,
} from "@bpmn-lean/temporal-client/message-start";

const channel = {
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface arbitrary ✓",
  interfaceOperationId: "Operation second / exact",
  messageId: "Message arbitrary 42",
} as const;
const start = {
  kind: StimulusKind.TriggerMessageStart,
  commandId: "command arbitrary 42",
  processId: "Process arbitrary 42",
  instanceId: "Instance arbitrary 42",
  startEventId: "Start arbitrary 42",
  channel,
} as const satisfies TriggerMessageStartStimulus;
const workflowId = "private-workflow-address-42";
const taskQueue = "semantic-message-start-queue";

test("constructs one exact request and rejects correct-Memo request mutations", async () => {
  const calls: CapturedStartCall[] = [];
  const client = fakeClient({ calls });
  const prepared = prepareTemporalMessageStart({
    start,
    semanticProcess: program,
    workflowId,
    taskQueue,
  });
  assert.equal(
    prepared.kind,
    TemporalMessageStartPreparationResultKind.Admitted,
  );
  if (prepared.kind !== TemporalMessageStartPreparationResultKind.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  const result = await startTemporalMessageStart(client, {
    start,
    semanticProcess: program,
    workflowId,
    taskQueue,
    expectedIntent: prepared.intent,
  });

  assert.deepEqual(result, { kind: TemporalMessageStartResultKind.Started });
  assert.equal(calls.length, 1);
  const captured = calls[0]!;
  assertExactStartCall(captured, prepared.intent);

  for (const mutation of correctMemoMutations(captured)) {
    assert.deepEqual(mutation.options.memo, captured.options.memo);
    assert.throws(
      () => assertExactStartCall(mutation, prepared.intent),
      /exact Message Start request/u,
      mutation.label,
    );
  }
});

test("snapshots the exact stimulus and program before the SDK promise settles", async () => {
  const calls: CapturedStartCall[] = [];
  const mutableStart = structuredClone(start) as Mutable<
    TriggerMessageStartStimulus
  >;
  const mutableProgram = structuredClone(program) as Mutable<
    SemanticProcessProgram
  >;
  const prepared = prepareTemporalMessageStart({
    start: mutableStart,
    semanticProcess: mutableProgram,
    workflowId,
    taskQueue,
  });
  assert.equal(
    prepared.kind,
    TemporalMessageStartPreparationResultKind.Admitted,
  );
  if (prepared.kind !== TemporalMessageStartPreparationResultKind.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  const pending = startTemporalMessageStart(fakeClient({ calls }), {
    start: mutableStart,
    semanticProcess: mutableProgram,
    workflowId,
    taskQueue,
    expectedIntent: prepared.intent,
  });
  mutableStart.startEventId = "mutated-after-call";
  mutableProgram.processId = "mutated-after-call";

  assert.deepEqual(await pending, {
    kind: TemporalMessageStartResultKind.Started,
  });
  assertExactStartCall(calls[0]!, prepared.intent);
});

test("fails an expected-marker mismatch before SDK invocation", async () => {
  const calls: CapturedStartCall[] = [];
  const result = await startTemporalMessageStart(fakeClient({ calls }), {
    start,
    semanticProcess: program,
    workflowId,
    taskQueue,
    expectedIntent: {
      protocol: "bpmn-message-start-v1",
      intentSha256: "0".repeat(64),
    },
  });

  assert.equal(result.kind, TemporalMessageStartResultKind.IntegrityFailure);
  assert.equal(calls.length, 0);
});

test("classifies production construction failure before SDK invocation", async () => {
  const calls: CapturedStartCall[] = [];
  const malformedProgram = {
    ...program,
    uncloneable: () => "outside the wire contract",
  } as unknown as SemanticProcessProgram;
  const result = await startTemporalMessageStart(fakeClient({ calls }), {
    start,
    semanticProcess: malformedProgram,
    workflowId,
    taskQueue,
    expectedIntent: {
      protocol: "bpmn-message-start-v1",
      intentSha256: "0".repeat(64),
    },
  });

  assert.equal(result.kind, TemporalMessageStartResultKind.IntegrityFailure);
  assert.equal(calls.length, 0);
});

test("propagates a post-invocation start failure for describe-only recovery", async () => {
  const calls: CapturedStartCall[] = [];
  const prepared = prepareTemporalMessageStart({
    start,
    semanticProcess: program,
    workflowId,
    taskQueue,
  });
  assert.equal(
    prepared.kind,
    TemporalMessageStartPreparationResultKind.Admitted,
  );
  if (prepared.kind !== TemporalMessageStartPreparationResultKind.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  await assert.rejects(
    startTemporalMessageStart(fakeClient({
      calls,
      startError: new Error("possibly transmitted"),
    }), {
      start,
      semanticProcess: program,
      workflowId,
      taskQueue,
      expectedIntent: prepared.intent,
    }),
    /possibly transmitted/u,
  );
  assert.equal(calls.length, 1);
});

test("describes retained identity and Memo without a Worker or SDK handle leak", async () => {
  const prepared = prepareTemporalMessageStart({
    start,
    semanticProcess: program,
    workflowId,
    taskQueue,
  });
  assert.equal(
    prepared.kind,
    TemporalMessageStartPreparationResultKind.Admitted,
  );
  if (prepared.kind !== TemporalMessageStartPreparationResultKind.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }
  const client = fakeClient({
    description: {
      workflowId,
      runId: "private-run-must-not-escape",
      type: "runBpmnProcess",
      taskQueue,
      status: { code: 1, name: "RUNNING" },
      memo: { bpmnMessageStartIntent: prepared.intent },
      historyLength: 1,
      startTime: new Date(0),
      searchAttributes: {},
      typedSearchAttributes: {},
      raw: { privateRawSentinel: true },
      staticDetails: async () => undefined,
      staticSummary: async () => undefined,
    },
  });

  const result = await describeTemporalMessageStart(client, workflowId);

  assert.deepEqual(result, {
    kind: TemporalMessageStartDescriptionResultKind.Found,
    description: {
      workflowId,
      workflowType: "runBpmnProcess",
      taskQueue,
      status: "RUNNING",
      intent: prepared.intent,
    },
  });
  assert.equal(JSON.stringify(result).includes("private-run-must-not-escape"), false);
  assert.equal(JSON.stringify(result).includes("privateRawSentinel"), false);
});

test("separates missing retained evidence from unavailable description", async () => {
  const missing = await describeTemporalMessageStart(
    fakeClient({ describeError: new WorkflowNotFoundError("missing", workflowId, undefined) }),
    workflowId,
  );
  const unavailable = await describeTemporalMessageStart(
    fakeClient({ describeError: new Error("credential secret must not escape") }),
    workflowId,
  );

  assert.deepEqual(missing, {
    kind: TemporalMessageStartDescriptionResultKind.Missing,
  });
  assert.deepEqual(unavailable, {
    kind: TemporalMessageStartDescriptionResultKind.Unavailable,
  });
});

type Mutable<Value> = {
  -readonly [Key in keyof Value]: Value[Key] extends object
    ? Mutable<Value[Key]>
    : Value[Key];
};

type CapturedStartCall = Readonly<{
  label?: string;
  workflowType: unknown;
  options: Readonly<{
    taskQueue?: unknown;
    workflowId?: unknown;
    workflowIdReusePolicy?: unknown;
    workflowIdConflictPolicy?: unknown;
    retry?: unknown;
    args?: readonly unknown[];
    memo?: unknown;
  }>;
}>;

function fakeClient(options: Readonly<{
  calls?: CapturedStartCall[];
  description?: unknown;
  describeError?: Error;
  startError?: Error;
}>): TemporalMessageStartClient {
  return {
    start: async (workflowType: unknown, startOptions: unknown) => {
      options.calls?.push({
        workflowType,
        options: startOptions as CapturedStartCall["options"],
      });
      if (options.startError !== undefined) {
        throw options.startError;
      }
      return {};
    },
    getHandle: () => ({
      describe: async () => {
        if (options.describeError !== undefined) {
          throw options.describeError;
        }
        return options.description;
      },
    }),
  } as unknown as TemporalMessageStartClient;
}

function assertExactStartCall(
  call: CapturedStartCall,
  intent: TemporalMessageStartIntent,
): void {
  assert.deepEqual(
    {
      workflowType: call.workflowType,
      taskQueue: call.options.taskQueue,
      workflowId: call.options.workflowId,
      workflowIdReusePolicy: call.options.workflowIdReusePolicy,
      workflowIdConflictPolicy: call.options.workflowIdConflictPolicy,
      hasRetry: Object.hasOwn(call.options, "retry"),
      retry: call.options.retry,
      args: call.options.args,
      memo: call.options.memo,
    },
    {
      workflowType: "runBpmnProcess",
      taskQueue,
      workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      workflowIdConflictPolicy: "FAIL",
      hasRetry: false,
      retry: undefined,
      args: [start, program],
      memo: { bpmnMessageStartIntent: intent },
    },
    "expected exact Message Start request",
  );
}

function correctMemoMutations(
  captured: CapturedStartCall,
): CapturedStartCall[] {
  const base = structuredClone(captured) as Mutable<CapturedStartCall>;
  const mutate = (
    label: string,
    change: (candidate: Mutable<CapturedStartCall>) => void,
  ) => {
    const candidate = structuredClone(base);
    change(candidate);
    candidate.label = label;
    return candidate;
  };
  return [
    mutate("wrong stimulus", (candidate) => {
      (candidate.options.args![0] as Mutable<TriggerMessageStartStimulus>)
        .startEventId = "Wrong_Start";
    }),
    mutate("wrong program", (candidate) => {
      (candidate.options.args![1] as Mutable<SemanticProcessProgram>).processId =
        "Wrong_Process";
    }),
    mutate("wrong retry", (candidate) => {
      candidate.options.retry = { maximumAttempts: 2 };
    }),
    mutate("wrong reuse", (candidate) => {
      candidate.options.workflowIdReusePolicy = "ALLOW_DUPLICATE";
    }),
    mutate("wrong conflict", (candidate) => {
      candidate.options.workflowIdConflictPolicy = "USE_EXISTING";
    }),
  ];
}

const rootScopeId = `scope:${start.processId}`;
const operationIds = [
  "operation:Complete",
  `operation:${start.startEventId}`,
  "operation:Wait",
  `operation:complete-scope:${rootScopeId}`,
] as const;
const program: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-message-start-event-draft",
    sourceId: "arbitrary-source-42",
    sourceSha256: "7".repeat(64),
    sourceOverlay: null,
  },
  processId: start.processId,
  definitionScopes: [{
    id: rootScopeId,
    parentScopeId: null,
    originElementId: start.processId,
  }],
  operationScopes: operationIds.map((operationId) => ({
    operationId,
    scopeId: rootScopeId,
  })),
  controlPlaceScopes: ["place:Flow_End", "place:Flow_Start"].map(
    (controlPlaceId) => ({ controlPlaceId, scopeId: rootScopeId }),
  ),
  controlPlaces: [
    { id: "place:Flow_End", origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_End" } },
    { id: "place:Flow_Start", origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_Start" } },
  ],
  operations: [
    {
      id: "operation:Complete",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Complete" },
      input: "place:Flow_End",
    },
    {
      id: `operation:${start.startEventId}`,
      kind: SemanticOperationKind.InitiateMessage,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: start.startEventId },
      channel,
      outputs: ["place:Flow_Start"],
    },
    {
      id: "operation:Wait",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Wait" },
      input: "place:Flow_Start",
      output: "place:Flow_End",
      task: { elementId: "Wait", name: "Wait" },
    },
    {
      id: `operation:complete-scope:${rootScopeId}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: start.processId },
      scopeId: rootScopeId,
      parentOutput: null,
    },
  ],
};
