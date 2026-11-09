import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type { APIRequestContext } from "@playwright/test";
import {
  decodeDefinitionDeployResult, decodeProcessInstanceStartResult,
  definitionVersionStartPath, definitionsCollectionPath,
} from "@bpmn-lean/platform-contracts";
import type { DeployedDefinitionVersion, PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import type { EngineStateObservation } from "@bpmn-lean/engine-api";
import type { ProcessClient } from "@bpmn-lean/temporal-host/client";
import { EffectResultKind } from "@bpmn-lean/temporal-host/worker";

import type { EffectHandler } from "../src/host-worker.ts";
import { processWorkflowId } from "../src/process-address.ts";

export const compensationProfile = "bpmn-2.0.2";
export const compensationSourceSha256 = "516073af27fbe95c319918b248c2563c2505263e7542db6f3e8d981f82d8dc93";
export const failureCode = "undo-failed";
export const failureMessage = "Travel cancellation handler failed — réservation 😀";
const failedTravelDetails = "Decline ground-travel cancellation TRAVEL-4711";

/** Explicit test effect configuration; the retained Sub-Process snapshot supplies its published input. */
export const compensationTestEffects: EffectHandler = async (request) => {
  assert.equal(request.protocol, "urn:bpmn-lean:effect-protocol:activity-v1");
  assert.equal(request.operation, "urn:bpmn-lean:effect-operation:compensation-single-effect-v1");
  const value = request.arguments.find(({ name }) => name === "DataInput_TravelDetails")?.value as
    Readonly<{ kind?: unknown; value?: unknown }> | null | undefined;
  if (value?.kind === "string" && value.value === failedTravelDetails) {
    return { kind: EffectResultKind.BusinessFailure, code: failureCode, message: failureMessage, outputs: [] };
  }
  return { kind: EffectResultKind.Success, outputs: [] };
};

export async function deployCompensation(request: APIRequestContext): Promise<DeployedDefinitionVersion> {
  const bytes = await readFile(new URL("../../../scenarios/compensation/travel-cancellation.bpmn", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), compensationSourceSha256);
  const query = new URLSearchParams({ sourceId: "travel-cancellation", semanticProfile: compensationProfile });
  const response = await request.post(`${definitionsCollectionPath()}?${query}`, {
    headers: { "content-type": "application/xml" }, data: bytes,
  });
  assert.equal(response.status(), 201, await response.text());
  const result = decodeDefinitionDeployResult(await response.json());
  assert.equal(result.status, "deployed");
  if (result.status !== "deployed") throw new Error("Compensation source was rejected");
  assert.equal(result.definition.source.sha256, compensationSourceSha256);
  return result.definition;
}

export async function startCompensation(
  request: APIRequestContext,
  definition: DeployedDefinitionVersion,
  failed: boolean,
): Promise<PublicProcessInstanceIdentity> {
  const response = await request.post(definitionVersionStartPath(definition.processId, definition.version), {
    data: { initialVariables: [{ name: "Property_TravelDetails", value: {
      kind: "string", value: failed ? failedTravelDetails : "Confirmed itinerary TRAVEL-4711",
    } }] },
  });
  assert.equal(response.status(), 201, await response.text());
  const result = decodeProcessInstanceStartResult(await response.json());
  assert.equal(result.status, "started");
  if (result.status !== "started") throw new Error("Compensation start was rejected");
  assert.deepEqual(result.instance.definition, definition);
  return result.instance;
}

/** Labelled test actor uses current published identities; these tasks have no Product 2 Human Work metadata. */
export async function completeCompensationTasks(processes: ProcessClient, instance: PublicProcessInstanceIdentity): Promise<void> {
  const workflowId = processWorkflowId(instance.processInstanceId);
  for (const elementId of ["Task_ReserveHotel", "Task_ArrangeGroundTravel", "Task_IssueInsurance"]) {
    const deadline = Date.now() + 10_000;
    while (true) {
      const state = await processes.observation(workflowId) as unknown as EngineStateObservation;
      const task = state.openWaits.find(({ id, detail }) => detail.kind === "userTask" && id.elementId === elementId);
      if (task !== undefined) {
        assert.equal(task.id.processInstanceId, instance.processInstanceId);
        const result = await processes.command(workflowId, {
          kind: "command",
          commandId: `failed-process-test-actor:${elementId}`,
          occurrence: task.id,
          action: { kind: "completeUserTask", values: [] },
        });
        assert.equal(result.outcome, "committed");
        break;
      }
      if (Date.now() >= deadline) throw new Error(`Published task did not appear: ${elementId}`);
      await delay(25);
    }
  }
}
