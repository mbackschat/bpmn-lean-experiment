/**
 * CreateDocument Activity data, retry, replacement, replay, and bypass locks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  effectTransportKey,
  requireDurableEffectActivityHistory,
} from "@bpmn-lean/temporal-adapter";
import type {
  EffectRequest,
  TemporalScenarioRunner,
} from "@bpmn-lean/temporal-adapter";
import {
  compileExecutionInput,
  completeEffectStimulusAt,
  effectDefinitionKey,
  effectOperation,
  loadJson,
  requireCompletedReceipt,
  withDeadline,
} from "./temporal-test-support.ts";
import type { TemporalExecutionInput } from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../scenarios/create-document-data/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/create-document-data/process.bpmn",
  import.meta.url,
);

export function registerCreateDocumentDataTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("CreateDocument carries committed arguments and maps the typed result under retry", async () => {
    const input = await createDocumentInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "create-document-data-retry",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule:
          EffectExecutionSchedule.FailAfterMutationOnce,
      }),
      15_000,
      "CreateDocument retried Activity execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(
      requireCompletedReceipt(execution.receipt).finalState.variables,
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
      completeEffectStimulusAt(input.scenario, 1).result,
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
        executionSchedule:
          TemporalExecutionSchedule.WorkerDownAtEffectPending,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
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
      completeEffectStimulusAt(input.scenario, 1).result,
    );
  });

  test("CreateDocument Activity bypass preserves semantics but fails durable evidence", async () => {
    const input = await createDocumentInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().probes.runEffectBypassMutation(
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
          completeEffectStimulusAt(input.scenario, 1).result,
        ),
      /scheduled\/attempt\/completed effect Activity shape/u,
    );
  });
}

async function createDocumentInput(): Promise<TemporalExecutionInput> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function createDocumentRequest(
  { scenario, semanticProcess }: TemporalExecutionInput,
): EffectRequest {
  const descriptor = effectOperation(semanticProcess).effect.descriptor;
  const arguments_ = [
    {
      name: "documentModelName",
      value: {
        kind: VariableValueKind.String,
        value: "MyDocumentModel",
      },
    },
  ] as const;
  return {
    ...descriptor,
    idempotencyKey: effectTransportKey({
      definition: effectDefinitionKey(semanticProcess),
      occurrence: completeEffectStimulusAt(scenario, 1).effectId,
      descriptor,
      arguments: arguments_,
    }),
    arguments: arguments_,
  };
}
