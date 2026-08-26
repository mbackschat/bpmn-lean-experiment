import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import { prepareGuidedDemo } from "../src/demo-preparation.ts";
import { DemoScenario, guidedDemoPlan } from "../src/demo-plan.ts";

test("deploys, starts, drives, and publishes the entire plan in declared order", async () => {
  const events: string[] = [];
  const instances = new Map<DemoScenario, PublicProcessInstanceIdentity>();
  const result = await prepareGuidedDemo(guidedDemoPlan, {
    readSource: async (sourceFile) => {
      events.push(`read:${sourceFile}`);
      return new TextEncoder().encode(sourceFile);
    },
    deploy: async (entry, bytes) => {
      events.push(`deploy:${entry.scenario}:${new TextDecoder().decode(bytes)}`);
      return definition(entry.sourceId, entry.semanticProfile);
    },
    start: async (entry, deployed) => {
      events.push(`start:${entry.scenario}:${entry.initialVariables.length}`);
      const instance = {
        processInstanceId: `Instance_${entry.scenario}`,
        definition: deployed,
      };
      instances.set(entry.scenario, instance);
      return instance;
    },
    drive: async (entry, instance) => {
      events.push(`drive:${entry.scenario}:${entry.responses.length}:${instance.processInstanceId}`);
    },
    waitForAudienceState: async (prepared) => {
      events.push(`publish:${prepared.map(({ scenario }) => scenario).join(",")}`);
    },
  });

  assert.deepEqual(result.map(({ scenario, instance }) => ({
    scenario,
    processInstanceId: instance.processInstanceId,
  })), guidedDemoPlan.map(({ scenario }) => ({
    scenario,
    processInstanceId: `Instance_${scenario}`,
  })));
  assert.equal(events.filter((event) => event.startsWith("read:")).length, 3);
  assert.equal(events.filter((event) => event.startsWith("deploy:")).length, 5);
  assert.equal(events.filter((event) => event.startsWith("start:")).length, 5);
  assert.deepEqual(events.filter((event) => event.startsWith("drive:")), [
    "drive:purchaseOrderReview:3:Instance_purchaseOrderReview",
    "drive:deadlineEscalation:2:Instance_deadlineEscalation",
  ]);
  assert.match(events.at(-1) ?? "", /^publish:expenseException,purchaseOrderReview,/u);
  assert.equal(instances.size, 5);
});

test("does not publish a partial audience state when one actor fails", async () => {
  let published = false;
  await assert.rejects(prepareGuidedDemo(guidedDemoPlan, {
    readSource: async () => new Uint8Array([1]),
    deploy: async (entry) => definition(entry.sourceId, entry.semanticProfile),
    start: async (entry, deployed) => ({
      processInstanceId: `Instance_${entry.scenario}`,
      definition: deployed,
    }),
    drive: async (entry) => {
      if (entry.scenario === DemoScenario.DeadlineEscalation) {
        throw new Error("deadline actor failed");
      }
    },
    waitForAudienceState: async () => { published = true; },
  }), /deadline actor failed/u);
  assert.equal(published, false);
});

function definition(sourceId: string, semanticProfile: string): DeployedDefinitionVersion {
  return {
    processId: "Process_Test",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: sourceId,
      sha256: "a".repeat(64),
      byteLength: 1,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile,
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
}
