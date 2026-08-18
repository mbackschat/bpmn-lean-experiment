/** The platform gateway exposes incident facts without leaking private hosting addresses. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineIncidentOperationKind,
} from "@bpmn-lean/engine-api";

import {
  BpmnProcessOperationsGateway,
  ProcessIncidentObservationStatus,
} from "@bpmn-lean/platform-engine-gateway";

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
const retry = {
  kind: EngineIncidentOperationKind.RetryIncident,
  incidentId: incident.id,
} as const;

test("uses the retained locator and omits private address material from observation", async () => {
  const calls: string[] = [];
  const gateway = new BpmnProcessOperationsGateway({
    getHandle: (workflowId: string) => {
      calls.push(workflowId);
      return {
        query: async () => ({
          instanceId,
          status: "running",
          incidents: [{ incident, interactions: [retry] }],
        }),
      };
    },
  } as never);
  const locator = "bpmn-process-work-v1:execution-workflow";

  const result = await gateway.observeIncidents({
    locator,
    hostingProcessInstanceId: instanceId,
  });

  assert.equal(result.status, ProcessIncidentObservationStatus.Observed);
  assert.deepEqual(calls, ["execution-workflow"]);
  assert.equal("locator" in result, false);
  assert.equal("workflowId" in result, false);
});

test("rejects a noncanonical locator before an SDK lookup", async () => {
  let calls = 0;
  const gateway = new BpmnProcessOperationsGateway({
    getHandle: () => {
      calls += 1;
      return {};
    },
  } as never);

  assert.throws(
    () => gateway.observeIncidents({
      locator: "execution-workflow",
      hostingProcessInstanceId: instanceId,
    }),
    /canonical v1 token/u,
  );
  assert.equal(calls, 0);
});

test("submits the exact published action without returning its private address", async () => {
  const calls: unknown[] = [];
  const gateway = new BpmnProcessOperationsGateway({
    getHandle: (workflowId: string) => ({
      executeUpdate: async (name: string, options: unknown) => {
        calls.push({ workflowId, name, options });
        return "committed";
      },
    }),
  } as never);
  const locator = "bpmn-process-work-v1:execution-workflow";
  const stimulus = { ...retry, commandId: "retry-action" } as const;

  const result = await gateway.submitIncidentOperation({
    locator,
    hostingProcessInstanceId: instanceId,
    stimulus,
  });

  assert.deepEqual(result, {
    kind: "semantic",
    commandId: "retry-action",
    outcome: "committed",
  });
  assert.equal(JSON.stringify(calls).includes("execution-workflow"), true);
  assert.equal(JSON.stringify(calls).includes("retry-action"), true);
  assert.equal("locator" in result, false);
  assert.equal("workflowId" in result, false);
});
