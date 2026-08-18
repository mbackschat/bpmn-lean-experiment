/** Product 1 incident operations preserve the exact hosting locator and closed result union. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ProcessStatus, StimulusKind } from "@bpmn-lean/semantic-core";

import {
  EngineIncidentObservationStatus,
  observeEngineProcessIncidents,
  parseEngineProcessLocator,
  submitEngineIncidentOperation,
} from "@bpmn-lean/engine-api";

const instanceId = "semantic-instance";
const incident = {
  kind: "effectExecutionFailed",
  id: {
    effectId: { processInstanceId: instanceId, elementId: "Task", activation: 1 },
    generation: 1,
  },
  effect: {
    id: { processInstanceId: instanceId, elementId: "Task", activation: 1 },
    descriptor: { protocol: "protocol", operation: "operation" },
    arguments: [],
  },
} as const;
const retry = { kind: StimulusKind.RetryIncident, incidentId: incident.id } as const;

test("uses the exact execution locator and maps every observation status", async () => {
  const client = fakeClient({
    execution: {
      query: async () => ({
        instanceId,
        status: ProcessStatus.Running,
        incidents: [{ incident, interactions: [retry] }],
      }),
    },
    unavailable: { query: async () => ({ nope: true }) },
  });

  assert.deepEqual(
    await observeEngineProcessIncidents({
      temporalClient: client,
      locator: parseEngineProcessLocator("bpmn-process-work-v1:execution"),
      hostingProcessInstanceId: instanceId,
    }),
    {
      status: EngineIncidentObservationStatus.Observed,
      incidents: [{ incident, interactions: [retry] }],
    },
  );
  assert.deepEqual(
    await observeEngineProcessIncidents({
      temporalClient: client,
      locator: parseEngineProcessLocator("bpmn-process-work-v1:unavailable"),
      hostingProcessInstanceId: instanceId,
    }),
    { status: EngineIncidentObservationStatus.Unavailable },
  );
});

test("submits the exact command at the decoded private address", async () => {
  const calls: unknown[] = [];
  const client = fakeClient({
    execution: {
      executeUpdate: async (name, options) => {
        calls.push({ name, options });
        return "committed";
      },
    },
  });
  const stimulus = { ...retry, commandId: "action-1" } as const;

  assert.deepEqual(
    await submitEngineIncidentOperation({
      temporalClient: client,
      locator: parseEngineProcessLocator("bpmn-process-work-v1:execution"),
      hostingProcessInstanceId: instanceId,
      stimulus,
    }),
    { kind: "semantic", commandId: "action-1", outcome: "committed" },
  );
  assert.equal(JSON.stringify(calls).includes("action-1"), true);
  assert.equal(JSON.stringify(calls).includes("execution"), false);
});

type FakeHandle = Readonly<{
  query?: (name: string) => Promise<unknown>;
  executeUpdate?: (name: string, options: unknown) => Promise<unknown>;
  getUpdateHandle?: (updateId: string) => Readonly<{ result: () => Promise<unknown> }>;
  result?: () => Promise<unknown>;
}>;

function fakeClient(handles: Readonly<Record<string, FakeHandle>>): never {
  return {
    getHandle: (workflowId: string) => handles[workflowId] ?? {},
  } as never;
}
