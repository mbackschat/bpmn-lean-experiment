/**
 * CreateDocument Activity data, retry, replacement, replay, and bypass locks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  effectTransportKey,
  requireDurableEffectActivityHistory,
} from "../dist/index.js";
import {
  compileExecutionInput,
  loadJson,
  withDeadline,
} from "./temporal-test-support.mjs";

const scenarioUrl = new URL(
  "../../../scenarios/create-document-data/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/create-document-data/process.bpmn",
  import.meta.url,
);

export function registerCreateDocumentDataTemporalTests(getRunner) {
  test("CreateDocument carries committed arguments and maps the typed result under retry", async () => {
    const input = await createDocumentInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "create-document-data-retry",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        effectExecutionSchedule:
          EffectExecutionSchedule.FailAfterMutationOnce,
      }),
      15_000,
      "CreateDocument retried Activity execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(
      execution.receipt.finalState.variables,
      [
        {
          name: "myDocumentReference",
          value: { kind: "string", value: "Document:42" },
        },
      ],
    );
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [createDocumentRequest(input).idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      createDocumentRequest(input),
      2,
      input.scenario.stimuli[1].result,
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "create-document-data-retry-replay",
      ),
      10_000,
      "CreateDocument retry replay",
    );
  });

  test("CreateDocument survives Worker replacement without changing mapped Process data", async () => {
    const input = await createDocumentInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "create-document-data-worker-replacement",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
        workerDownAtEffectPending: true,
      }),
      15_000,
      "CreateDocument Worker-replacement execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [createDocumentRequest(input).idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      createDocumentRequest(input),
      2,
      input.scenario.stimuli[1].result,
    );
  });

  test("CreateDocument Activity bypass preserves semantics but fails durable evidence", async () => {
    const input = await createDocumentInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runEffectBypassMutation(
        input.scenario,
        input.semanticProcess,
        "create-document-data-bypass",
      ),
      15_000,
      "CreateDocument Activity-bypass mutation",
    );

    assert.deepEqual(execution.result, expected);
    assert.throws(
      () =>
        requireDurableEffectActivityHistory(
          execution.history,
          createDocumentRequest(input),
          1,
          input.scenario.stimuli[1].result,
        ),
      /scheduled\/attempt\/completed effect Activity shape/u,
    );
  });
}

async function createDocumentInput() {
  const scenario = await loadJson(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function createDocumentRequest({ scenario, semanticProcess }) {
  const operation = semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitEffect,
  );
  const effectId = scenario.stimuli[1]?.effectId;
  if (
    operation?.kind !== SemanticOperationKind.AwaitEffect ||
    effectId === undefined
  ) {
    throw new Error("CreateDocument fixture omitted its effect contract");
  }
  const arguments_ = [
    {
      name: "documentModelName",
      value: { kind: "string", value: "MyDocumentModel" },
    },
  ];
  const material = {
    definition: {
      semanticProfile: semanticProcess.identity.semanticProfile,
      sourceId: semanticProcess.identity.sourceId,
      sourceSha256: semanticProcess.identity.sourceSha256,
      processId: semanticProcess.processId,
    },
    occurrence: effectId,
    descriptor: operation.effect.descriptor,
    arguments: arguments_,
  };
  return {
    ...operation.effect.descriptor,
    idempotencyKey: effectTransportKey(material),
    arguments: arguments_,
  };
}
