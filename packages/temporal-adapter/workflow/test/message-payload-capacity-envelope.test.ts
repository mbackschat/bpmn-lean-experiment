/**
 * Settles the structured Message-payload capacity envelope of `PBV-MSG-03` against the real Workflow encoders.
 *
 * The oracle is the encoders themselves: the shipment-manifest intake, its payload delivery at the full allowance and
 * the Review completion are driven through the candidate preflight, publication, successor (carrying the completed
 * delivery record), Query, terminal, recovery and retention owners, and every measured budget must stay within the
 * envelope's estimate and the production limit. The stimuli are built here from the model's element IDs, not taken
 * from the envelope's journey.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { MessageChannelKind, StimulusKind, isSingletonBusinessItem } from "@bpmn-lean/semantic-core";
import type { BusinessValue, SemanticProcessProgram, StartProcessStimulus, Stimulus } from "@bpmn-lean/semantic-core";
import {
  StartCapacityEnvelopeResultKind,
  assessStartCapacityEnvelope,
  fullAllowanceValue,
  productionStartCapacityEnvelopeLimits,
  reservedFutureCommandIdBytes,
  runStartCapacityJourney,
  startCapacityEnvelopeBudgets,
} from "@bpmn-lean/temporal-protocol";
import type { StartCapacityEstimates } from "@bpmn-lean/temporal-protocol";

import { manifestStart, shipmentManifestProgram } from "../../protocol/test/message-payload-capacity-fixture.ts";
import { escapeHeavyAllowanceValue, measureWithWorkflowEncoders, nodeHeavyValue } from "./start-capacity-encoder-measurement.ts";
import type { MeasuredStartCapacity } from "./start-capacity-encoder-measurement.ts";

const production = productionStartCapacityEnvelopeLimits();
const reserved = (ordinal: number) => `${"c".repeat(reservedFutureCommandIdBytes - 1)}${ordinal}`;

function manifestCompletions(start: StartProcessStimulus, payload: BusinessValue = fullAllowanceValue()): Stimulus[] {
  const occurrence = (elementId: string) => ({ processInstanceId: start.instanceId, elementId, activation: 1 });
  return [
    {
      kind: StimulusKind.DeliverPayloadMessage, commandId: reserved(1), subscriptionId: occurrence("MessageCatch_ManifestReceived"),
      channel: { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface_Carrier",
        interfaceOperationId: "Operation_SubmitManifest", messageId: "Message_ManifestReceived" },
      payload,
    },
    { kind: StimulusKind.CompleteUserTaskInstance, commandId: reserved(2), taskId: occurrence("UserTask_ReviewManifest"), submittedValues: [] },
  ];
}

function assertWithinEstimates(actual: MeasuredStartCapacity, estimates: StartCapacityEstimates, label: string): void {
  for (const budget of startCapacityEnvelopeBudgets) {
    assert.ok(actual[budget] > 0, `${label}, ${budget} was exercised`);
    assert.ok(actual[budget] <= estimates[budget], `${label}, ${budget}: actual ${actual[budget]} exceeds estimate ${estimates[budget]}`);
    assert.ok(actual[budget] <= production[budget], `${label}, ${budget}: actual ${actual[budget]} exceeds production`);
  }
}

function admitted(start: StartProcessStimulus, program: SemanticProcessProgram): StartCapacityEstimates {
  const envelope = assessStartCapacityEnvelope(start, program);
  assert.ok(envelope.kind === StartCapacityEnvelopeResultKind.WithinCapacity, JSON.stringify(envelope));
  return envelope.estimates;
}

test("the envelope's journey submits exactly the stimuli an independent drive of the model uses", async () => {
  const program = await shipmentManifestProgram();
  const start = manifestStart(program, "Manifest_1");
  assert.deepEqual(runStartCapacityJourney(start, program).steps.map(({ stimulus }) => stimulus),
    [start, ...manifestCompletions(start)]);
});

for (const [label, instanceId, startCommandId] of [
  ["short identifiers", "Manifest_1", "start-manifest"],
  ["long instance ID", "I".repeat(512), "start-manifest"],
  ["long Start command ID", "Manifest_1", "S".repeat(2_048)],
] as const) {
  test(`the envelope bounds every Workflow encoder for the maximal manifest delivery, ${label}`, async (context) => {
    const program = await shipmentManifestProgram();
    const start = manifestStart(program, instanceId, startCommandId);
    const estimates = admitted(start, program);
    const actual = measureWithWorkflowEncoders(program, start, manifestCompletions(start));
    for (const budget of startCapacityEnvelopeBudgets) {
      context.diagnostic(`${budget}: actual ${actual[budget]}, estimate ${estimates[budget]}, limit ${production[budget]}`);
    }
    assertWithinEstimates(actual, estimates, label);
  });
}

test("payloads of other shapes within the allowance stay inside the envelope reserved by the sentinel", async () => {
  const program = await shipmentManifestProgram();
  const start = manifestStart(program, "Manifest_1");
  const estimates = admitted(start, program);
  for (const payload of [escapeHeavyAllowanceValue("\""), escapeHeavyAllowanceValue("\u0001"), nodeHeavyValue()]) {
    assert.ok(isSingletonBusinessItem(payload));
    assertWithinEstimates(measureWithWorkflowEncoders(program, start, manifestCompletions(start, payload)), estimates, "shape");
  }
});
