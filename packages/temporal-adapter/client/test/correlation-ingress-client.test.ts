import assert from "node:assert/strict";
import { test } from "node:test";
import { enrollmentFixture } from "./worker-deployment-enrollment-fixture.ts";
import type { EnrollmentFixtureOptions } from "./worker-deployment-enrollment-fixture.ts";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import {
  CorrelationIngressEnsureResultKind,
  ensureCorrelationIngress,
} from "@bpmn-lean/temporal-client/correlation-ingress";
import {
  bpmnCorrelationIngressConfigurationQueryName,
  bpmnCorrelationIngressProtocolVersion,
  bpmnCorrelationIngressWorkflowType,
  correlationIngressWorkflowId,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";

const address: CorrelatedMessageAddress = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "message-key-correlation-checkpoint",
    sourceId: "settlement-confirmation",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_SettlementConfirmation",
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Settlement",
    interfaceOperationId: "Operation_ConfirmSettlement",
    messageId: "Message_SettlementConfirmed",
  },
  correlationKeyId: "CorrelationKey_Settlement",
};
const taskQueue = "correlation-ingress";
const exactEcho = {
  address,
  protocolVersion: bpmnCorrelationIngressProtocolVersion,
  configuration: productionCorrelationIngressConfiguration,
};

test("starts with reject-duplicate and accepts only after the unconditional exact echo Query", async () => {
  const calls: unknown[] = [];
  const result = await ensureCorrelationIngress(
    fakeClient(calls, exactEcho),
    { address, configuration: productionCorrelationIngressConfiguration, taskQueue },
  );

  assert.deepEqual(result, {
    kind: CorrelationIngressEnsureResultKind.Ready,
    workflowId: correlationIngressWorkflowId(address),
  });
  assert.deepEqual(calls, [
    {
      operation: "start",
      workflowType: bpmnCorrelationIngressWorkflowType,
      options: {
        taskQueue,
        workflowId: correlationIngressWorkflowId(address),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        workflowIdConflictPolicy: "FAIL",
        args: [address, productionCorrelationIngressConfiguration],
      },
    },
    {
      operation: "query",
      workflowId: correlationIngressWorkflowId(address),
      query: bpmnCorrelationIngressConfigurationQueryName,
    },
  ]);
});

test("recovers both a concurrent collision and a lost start response through the same exact Query", async () => {
  const workflowId = correlationIngressWorkflowId(address);
  const failures = [
    new WorkflowExecutionAlreadyStartedError(
      "already started",
      workflowId,
      bpmnCorrelationIngressWorkflowType,
    ),
    new Error("start response lost"),
  ];
  for (const failure of failures) {
    const calls: unknown[] = [];
    assert.deepEqual(
      await ensureCorrelationIngress(
        fakeClient(calls, exactEcho, failure),
        { address, configuration: productionCorrelationIngressConfiguration, taskQueue },
      ),
      {
        kind: CorrelationIngressEnsureResultKind.Ready,
        workflowId,
      },
    );
    assert.equal(calls.length, 2);
  }
});

test("refuses every changed capacity, cross-definition echo, and unqueryable ingress", async () => {
  const echoes: unknown[] = Object.keys(productionCorrelationIngressConfiguration)
    .map((key) => {
      const changed = structuredClone(exactEcho) as {
        configuration: Record<string, number>;
      };
      changed.configuration[key] = (changed.configuration[key] ?? 0) + 1;
      return changed;
    });
  const crossDefinition = structuredClone(exactEcho);
  crossDefinition.address.definition.sourceSha256 = "b".repeat(64);
  echoes.push(crossDefinition);

  for (const echo of echoes) {
    const result = await ensureCorrelationIngress(
      fakeClient([], echo, new Error("response lost")),
      { address, configuration: productionCorrelationIngressConfiguration, taskQueue },
    );
    assert.equal(result.kind, CorrelationIngressEnsureResultKind.Unavailable);
    assert.equal(JSON.stringify(result).includes("privateHandle"), false);
  }

  const unavailable = await ensureCorrelationIngress(
    fakeClient([], exactEcho, new Error("response lost"), new Error("query down")),
    { address, configuration: productionCorrelationIngressConfiguration, taskQueue },
  );
  assert.equal(unavailable.kind, CorrelationIngressEnsureResultKind.Unavailable);
});

function fakeClient(
  calls: unknown[],
  echo: unknown,
  startError?: Error,
  queryError?: Error,
  enrollment: EnrollmentFixtureOptions = {},
): never {
  return {
    ...enrollmentFixture(taskQueue, enrollment),
    start: async (workflowType: string, options: unknown) => {
      calls.push({ operation: "start", workflowType, options });
      if (startError !== undefined) {
        throw startError;
      }
      return { privateHandle: "must-not-escape" };
    },
    getHandle: (workflowId: string) => ({
      privateHandle: "must-not-escape",
      query: async (query: string) => {
        calls.push({ operation: "query", workflowId, query });
        if (queryError !== undefined) {
          throw queryError;
        }
        return echo;
      },
    }),
  } as never;
}

test("an existing exact ingress stays ready without Current and no start is submitted", async () => {
  const calls: unknown[] = [];
  const nativeCalls: string[] = [];
  const result = await ensureCorrelationIngress(
    fakeClient(calls, exactEcho, undefined, undefined, { absentCurrent: "workflow", calls: nativeCalls }),
    { address, configuration: productionCorrelationIngressConfiguration, taskQueue },
  );
  assert.deepEqual(result, { kind: "ready", workflowId: correlationIngressWorkflowId(address) });
  assert.deepEqual(nativeCalls, ["current:workflow"]);
  assert.deepEqual(calls, [{ operation: "query", workflowId: correlationIngressWorkflowId(address), query: bpmnCorrelationIngressConfigurationQueryName }]);
});

test("missing Current preserves unqueryable and mismatched ingress refusal without creation", async () => {
  for (const queryError of [undefined, new Error("no retained ingress")]) {
    const calls: unknown[] = [];
    const result = await ensureCorrelationIngress(
      fakeClient(calls, { ...exactEcho, protocolVersion: "wrong" }, undefined, queryError, { absentCurrent: "workflow" }),
      { address, configuration: productionCorrelationIngressConfiguration, taskQueue },
    );
    assert.deepEqual(result, {
      kind: "unavailable", workflowId: correlationIngressWorkflowId(address),
      failure: { kind: queryError === undefined ? "echoMismatch" : "unqueryable" },
    });
    assert.equal(calls.length, 1);
    assert.equal((calls[0] as { operation: string }).operation, "query");
  }
});

test("ingress snapshots the address and queue before enrollment yields", async () => {
  const calls: unknown[] = [];
  const request = structuredClone({ address, configuration: productionCorrelationIngressConfiguration, taskQueue });
  const pending = ensureCorrelationIngress(fakeClient(calls, exactEcho), request);
  (request.address as { processId: string }).processId = "changed";
  request.taskQueue = "changed";
  assert.deepEqual(await pending, { kind: "ready", workflowId: correlationIngressWorkflowId(address) });
  const startCall = calls[0] as { options: { taskQueue: string; args: unknown[] } };
  assert.equal(startCall.options.taskQueue, taskQueue);
  assert.deepEqual(startCall.options.args, [address, productionCorrelationIngressConfiguration]);
});

test("invalid ingress identity performs no native I/O", async () => {
  const calls: unknown[] = [];
  const nativeCalls: string[] = [];
  await assert.rejects(ensureCorrelationIngress(fakeClient(calls, exactEcho, undefined, undefined, { calls: nativeCalls }), {
    address: { ...address, processId: "" }, configuration: productionCorrelationIngressConfiguration, taskQueue,
  }), TypeError);
  assert.deepEqual(calls, []);
  assert.deepEqual(nativeCalls, []);
});
