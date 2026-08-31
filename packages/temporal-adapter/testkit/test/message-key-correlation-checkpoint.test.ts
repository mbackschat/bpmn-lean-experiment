import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CorrelatedMessageInteractionKind,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  ScenarioStepKind,
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  UnnumberedCommittedExecutionPublication,
} from "@bpmn-lean/semantic-core";
import {
  requireExecutionPublicationPage,
} from "@bpmn-lean/temporal-testkit";

test("publishes the correlated wait only as its complete global interaction", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/message-key-correlation/process.bpmn",
      import.meta.url,
    )),
    sourceId: "message-key-correlation-publication",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Message key-correlation fixture was not admitted");
  }
  const program = compilation.semanticProcess;
  const instanceId = "CorrelationPublication_1";
  const started = advanceScenario(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-correlation-publication",
    processId: program.processId,
    instanceId,
    initialVariables: [],
  });
  assert.equal(started.kind, ScenarioStepKind.Committed);
  if (started.kind !== ScenarioStepKind.Committed ||
    started.publication === null) {
    throw new Error("Message key-correlation start did not publish");
  }
  const initialWait = started.state.messageWaits[0];
  const direct = program.operations.find((operation) =>
    operation.kind === SemanticOperationKind.AwaitPayloadMessage &&
    operation.message.elementId === initialWait?.id.elementId
  );
  assert.ok(initialWait !== undefined &&
    direct?.kind === SemanticOperationKind.AwaitPayloadMessage);
  const initialized = advanceScenario(program, started.state, {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "initialize-correlation-publication",
    subscriptionId: initialWait.id,
    channel: direct.message.channel,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  });
  assert.equal(initialized.kind, ScenarioStepKind.Committed);
  if (initialized.kind !== ScenarioStepKind.Committed ||
    initialized.publication === null) {
    throw new Error("Message key-correlation initialization did not publish");
  }

  const first = numberBatch(
    "start-correlation-publication",
    0,
    started.publication,
  );
  const second = numberBatch(
    "initialize-correlation-publication",
    first.throughRevision,
    initialized.publication,
  );
  const page = {
    definition: program.identity,
    processId: program.processId,
    processInstanceId: instanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: second.throughRevision,
    headRevision: second.throughRevision,
    batches: [first, second],
    current: {
      revision: second.throughRevision,
      ...initialized.publication.current,
    },
  };
  assert.deepEqual(
    requireExecutionPublicationPage(page, {
      program,
      processInstanceId: instanceId,
      limit: 2,
    }),
    page,
  );
  assert.equal(
    page.current.state.enabledInteractions[0]?.kind,
    CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage,
  );

  const crossDefinition = structuredClone(page);
  const interaction = crossDefinition.current.state.enabledInteractions[0];
  assert.ok(interaction?.kind ===
    CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage);
  Object.assign(interaction.address.definition, {
    sourceSha256: "b".repeat(64),
  });
  assert.throws(
    () => requireExecutionPublicationPage(crossDefinition, {
      program,
      processInstanceId: instanceId,
      limit: 2,
    }),
    /malformed execution publication page/u,
  );
});

function numberBatch(
  commandId: string,
  fromRevision: number,
  publication: UnnumberedCommittedExecutionPublication,
) {
  return {
    commandId,
    fromRevision,
    throughRevision: fromRevision + publication.transitions.length,
    transitions: publication.transitions.map((record, index) => ({
      revision: fromRevision + index + 1,
      ...record,
    })),
  };
}
