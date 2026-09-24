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
import { CommandOutcome, EffectExecutionResultKind, EffectOperation, EffectProtocol, StimulusKind } from "@bpmn-lean/semantic-core";
import {
  listOpenUserTasks, submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { EffectActivityImplementations, TemporalWorkflowClient } from "@bpmn-lean/temporal-testkit";

export const compensationProfile = "bpmn-2.0.2-compensation-source-checkpoint-draft";
export const compensationSourceSha256 = "516073af27fbe95c319918b248c2563c2505263e7542db6f3e8d981f82d8dc93";
export const failureCode = "undo-failed";
export const failureMessage = "Travel cancellation handler failed — réservation 😀";
const failedTravelDetails = "Decline ground-travel cancellation TRAVEL-4711";

/** Explicit test Activity configuration; the retained Sub-Process snapshot supplies its published input. */
export const compensationTestActivities: EffectActivityImplementations = {
  executeBpmnEffect: async (request) => {
    assert.equal(request.protocol, EffectProtocol.Activity);
    assert.equal(request.operation, EffectOperation.CompensationSingleEffect);
    const argument = request.arguments.find(({ name }) => name === "DataInput_TravelDetails");
    if (argument?.value.kind === "string" && argument.value.value === failedTravelDetails) {
      return { kind: EffectExecutionResultKind.BpmnError, code: failureCode, message: failureMessage, localPatch: [] };
    }
    return { kind: EffectExecutionResultKind.Success, localPatch: [] };
  },
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
export async function completeCompensationTasks(client: TemporalWorkflowClient, instance: PublicProcessInstanceIdentity): Promise<void> {
  for (const elementId of ["Task_ReserveHotel", "Task_ArrangeGroundTravel", "Task_IssueInsurance"]) {
    const deadline = Date.now() + 10_000;
    while (true) {
      const tasks = await listOpenUserTasks(client, instance.processInstanceId);
      const task = tasks.find(({ id }) => id.elementId === elementId);
      if (task !== undefined) {
        assert.equal(task.id.processInstanceId, instance.processInstanceId);
        const result = await submitUserTaskCompletion(client, instance.processInstanceId, {
          kind: StimulusKind.CompleteUserTaskInstance,
          commandId: `failed-process-test-actor:${elementId}`,
          taskId: task.id,
          submittedValues: [],
        });
        assert.equal(result.kind, "semantic");
        assert.equal(result.kind === "semantic" && result.outcome, CommandOutcome.Committed);
        break;
      }
      if (Date.now() >= deadline) throw new Error(`Published task did not appear: ${elementId}`);
      await delay(25);
    }
  }
}
