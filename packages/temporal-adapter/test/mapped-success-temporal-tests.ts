/**
 * Mapped-success Activity data, retry, replacement, replay, and bypass locks.
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
  "../../../scenarios/mapped-success-service-task/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/mapped-success-service-task/process.bpmn",
  import.meta.url,
);

export function registerMappedSuccessTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("mapped success carries committed arguments and maps the typed result under retry", async () => {
    const input = await mappedSuccessInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "mapped-success-retry",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule:
          EffectExecutionSchedule.FailAfterMutationOnce,
      }),
      15_000,
      "mapped-success retried Activity execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(
      requireCompletedReceipt(execution.receipt).finalState.variables,
      [
        {
          name: "resultValue",
          value: { kind: "string", value: "example-result" },
        },
      ],
    );
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [mappedSuccessRequest(input).idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      mappedSuccessRequest(input),
      2,
      completeEffectStimulusAt(input.scenario, 1).result,
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "mapped-success-retry-replay",
      ),
      10_000,
      "mapped-success retry replay",
    );
  });

  test("mapped success survives Worker replacement without changing Process data", async () => {
    const input = await mappedSuccessInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "mapped-success-worker-replacement",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule:
          TemporalExecutionSchedule.WorkerDownAtEffectPending,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
      }),
      15_000,
      "mapped-success Worker-replacement execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [mappedSuccessRequest(input).idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      mappedSuccessRequest(input),
      2,
      completeEffectStimulusAt(input.scenario, 1).result,
    );
  });

  test("mapped-success Activity bypass preserves semantics but fails durable evidence", async () => {
    const input = await mappedSuccessInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().probes.runEffectBypassMutation(
        input.scenario,
        input.semanticProcess,
        "mapped-success-bypass",
      ),
      15_000,
      "mapped-success Activity-bypass mutation",
    );

    assert.deepEqual(execution.result, expected);
    assert.throws(
      () =>
        requireDurableEffectActivityHistory(
          execution.history,
          mappedSuccessRequest(input),
          1,
          completeEffectStimulusAt(input.scenario, 1).result,
        ),
      /scheduled\/attempt\/completed effect Activity shape/u,
    );
  });
}

async function mappedSuccessInput(): Promise<TemporalExecutionInput> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function mappedSuccessRequest(
  { scenario, semanticProcess }: TemporalExecutionInput,
): EffectRequest {
  const descriptor = effectOperation(semanticProcess).effect.descriptor;
  const arguments_ = [
    {
      name: "requestValue",
      value: {
        kind: VariableValueKind.String,
        value: "example-input",
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
