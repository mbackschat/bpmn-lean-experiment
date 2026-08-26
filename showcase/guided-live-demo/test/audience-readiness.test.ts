import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ProcessInstanceSearchPage,
  PublicIncidentSnapshot,
  PublicProcessInstanceIdentity,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";

import { isAudienceStateReady } from "../src/audience-readiness.ts";
import type { AudienceExecutionEvidence } from "../src/audience-readiness.ts";
import type { PreparedDemoScenario } from "../src/demo-preparation.ts";
import { DemoScenario } from "../src/demo-plan.ts";

test("accepts only the complete public presenter state", () => {
  const prepared = preparedScenarios();
  const expense = instanceFor(prepared, DemoScenario.ExpenseException);
  const natural = instanceFor(prepared, DemoScenario.PurchaseOrderReview);
  const deadline = instanceFor(prepared, DemoScenario.DeadlineEscalation);
  const retry = instanceFor(prepared, DemoScenario.RetryableIncident);
  const cancellation = instanceFor(prepared, DemoScenario.CancellableIncident);
  const work = {
    tasks: [{
      task: {
        id: { processInstanceId: expense.processInstanceId, elementId: "ReviewException", activation: 1 },
        name: "Review exception",
        state: "active",
      },
      hostingInstance: expense,
      claimGeneration: 1,
      claim: null,
      claimableByCurrentActor: true,
    }],
  } satisfies WorkTaskSnapshot;
  const incidents = {
    incidents: [
      incident(retry, ["retryIncident"]),
      incident(cancellation, ["retryIncident", "cancelIncidentProcess"]),
    ],
  } satisfies PublicIncidentSnapshot;
  const batch = {
    instances: [deadline, natural],
    nextCursor: null,
  } satisfies ProcessInstanceSearchPage;
  const executions = [{
    processInstanceId: natural.processInstanceId,
    status: "completed",
    timerFirings: 0,
    terminalOutput: ["accepted", "flagged", "archived"],
  }, {
    processInstanceId: deadline.processInstanceId,
    status: "completed",
    timerFirings: 1,
    terminalOutput: null,
  }] satisfies ReadonlyArray<AudienceExecutionEvidence>;

  assert.equal(isAudienceStateReady(prepared, work, incidents, batch, executions), true);
  assert.equal(isAudienceStateReady(prepared, { tasks: [] }, incidents, batch, executions), false);
  assert.equal(isAudienceStateReady(prepared, work, { incidents: [incidents.incidents[0]!] }, batch, executions), false);
  assert.equal(isAudienceStateReady(prepared, work, incidents, {
    instances: [natural],
    nextCursor: null,
  }, executions), false);
  assert.equal(isAudienceStateReady(prepared, work, incidents, batch, [executions[0]!]), false);
  assert.equal(isAudienceStateReady(prepared, work, incidents, batch, [{
    ...executions[1]!,
    timerFirings: 0,
  }, executions[0]!]), false);
});

function preparedScenarios(): ReadonlyArray<PreparedDemoScenario> {
  return [
    DemoScenario.ExpenseException,
    DemoScenario.PurchaseOrderReview,
    DemoScenario.DeadlineEscalation,
    DemoScenario.RetryableIncident,
    DemoScenario.CancellableIncident,
  ].map((scenario) => ({ scenario, instance: instance(scenario) }));
}

function instanceFor(
  prepared: ReadonlyArray<PreparedDemoScenario>,
  scenario: DemoScenario,
): PublicProcessInstanceIdentity {
  const found = prepared.find((candidate) => candidate.scenario === scenario)?.instance;
  if (found === undefined) throw new Error(`missing ${scenario}`);
  return found;
}

function instance(scenario: DemoScenario): PublicProcessInstanceIdentity {
  const sourceId = scenario === DemoScenario.PurchaseOrderReview
    ? "demo-purchase-order-review.bpmn"
    : scenario === DemoScenario.DeadlineEscalation
    ? "demo-deadline-escalation.bpmn"
    : `demo-${scenario}.bpmn`;
  return {
    processInstanceId: `Instance_${scenario}`,
    definition: {
      processId: scenario === DemoScenario.PurchaseOrderReview ||
          scenario === DemoScenario.DeadlineEscalation
        ? "Process_SequentialMultiInstanceReview"
        : `Process_${scenario}`,
      version: 1,
      source: {
        kind: "bpmnSource",
        id: sourceId,
        sha256: "a".repeat(64),
        byteLength: 1,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8",
      },
      semanticProfile: "profile",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  };
}

function incident(
  hostingInstance: PublicProcessInstanceIdentity,
  interactions: readonly ["retryIncident"] | readonly ["retryIncident", "cancelIncidentProcess"],
): PublicIncidentSnapshot["incidents"][number] {
  const incidentId = {
    effectId: {
      processInstanceId: hostingInstance.processInstanceId,
      elementId: "ServiceTask_Record",
      activation: 1,
    },
    generation: 1 as const,
  };
  const retry = { kind: "retryIncident" as const, incidentId };
  const availableInteractions = interactions.length === 1
    ? [retry] as const
    : [retry, {
        kind: "cancelIncidentProcess" as const,
        incidentId,
        processInstanceId: hostingInstance.processInstanceId,
      }] as const;
  return {
    hostingInstance,
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: incidentId.effectId,
        descriptor: { protocol: "bpmn-lean-effect", operation: "probe-v1" },
        arguments: [],
      },
    },
    availableInteractions,
  };
}
