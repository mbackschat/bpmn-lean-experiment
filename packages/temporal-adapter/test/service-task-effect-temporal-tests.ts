/**
 * Service Task Activity execution, retry, failure, bypass, and key-isolation tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  requireDurableEffectActivityHistory,
  requireExhaustedEffectActivityHistory,
} from "@bpmn-lean/temporal-adapter";
import {
  serviceTaskEffectInput,
  serviceTaskEffectKey,
  serviceTaskEffectRequest,
} from "./service-task-effect-fixture.ts";
import type { TemporalScenarioRunner } from "@bpmn-lean/temporal-adapter";
import {
  requireCompletedReceipt,
  withDeadline,
} from "./temporal-test-support.ts";

export function registerServiceTaskEffectTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("effect Activity retries one lost completion without changing canonical semantics", async () => {
    const input = serviceTaskEffectInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const plain = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "service-task-effect-plain",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
      }),
      15_000,
      "Service Task plain Activity execution",
    );
    const retried = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "service-task-effect-retried",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule:
          EffectExecutionSchedule.FailAfterMutationOnce,
      }),
      15_000,
      "Service Task retried Activity execution",
    );

    assert.deepEqual(plain.result, expected);
    assert.deepEqual(retried.result, expected);
    assert.deepEqual(plain.result, retried.result);
    assert.deepEqual(plain.effectProbeEvidence, {
      invocations: 1,
      mutations: 1,
      keys: [serviceTaskEffectKey(input)],
    });
    assert.deepEqual(retried.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [serviceTaskEffectKey(input)],
    });
    requireDurableEffectActivityHistory(
      plain.history,
      serviceTaskEffectRequest(input),
      1,
    );
    requireDurableEffectActivityHistory(
      retried.history,
      serviceTaskEffectRequest(input),
      2,
    );
    await withDeadline(
      getRunner().replayHistories([
        {
          history: plain.history,
          workflowId: "service-task-effect-plain-replay",
        },
        {
          history: retried.history,
          workflowId: "service-task-effect-retried-replay",
        },
      ]),
      10_000,
      "Service Task Activity history replay",
    );
  });

  test("effect Activity survives Worker replacement with one external mutation", async () => {
    const input = serviceTaskEffectInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "service-task-effect-worker-replacement",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule:
          TemporalExecutionSchedule.WorkerDownAtEffectPending,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
      }),
      15_000,
      "Service Task Worker-replacement execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [serviceTaskEffectKey(input)],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      serviceTaskEffectRequest(input),
      2,
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "service-task-effect-worker-replacement-replay",
      ),
      10_000,
      "Service Task Worker-replacement replay",
    );
  });

  test("exhausted effect Activity fails with a typed adapter reason and unchanged intent", async () => {
    const input = serviceTaskEffectInput();
    const expectedWaitingTrace = runScenario(
      {
        ...input.scenario,
        stimuli: input.scenario.stimuli.slice(0, 1),
      },
      input.semanticProcess,
    ).trace;
    const execution = await withDeadline(
      getRunner().probes.runEffectExhaustion(
        input.scenario,
        input.semanticProcess,
        "service-task-effect-exhausted",
      ),
      15_000,
      "Service Task exhausted Activity execution",
    );

    assert.equal(
      execution.failureType,
      "BPMN_EFFECT_EXECUTION_EXHAUSTED",
    );
    assert.deepEqual(execution.lastCommittedTrace, expectedWaitingTrace);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 0,
      keys: [],
    });
    requireExhaustedEffectActivityHistory(
      execution.history,
      serviceTaskEffectRequest(input),
    );
  });

  test("effect Activity bypass preserves pure output but fails durable evidence", async () => {
    const input = serviceTaskEffectInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().probes.runEffectBypassMutation(
        input.scenario,
        input.semanticProcess,
        "service-task-effect-bypass",
      ),
      15_000,
      "Service Task Activity-bypass mutation",
    );

    assert.deepEqual(execution.result, expected);
    assert.throws(
      () =>
        requireDurableEffectActivityHistory(
          execution.history,
          serviceTaskEffectRequest(input),
          1,
        ),
      /scheduled\/attempt\/completed effect Activity shape/u,
    );
  });

  test("two semantic Process instances execute with distinct keys in one shared store", async () => {
    const first = serviceTaskEffectInput("Instance_1");
    const second = serviceTaskEffectInput("Instance_2");
    const result = await withDeadline(
      getRunner().probes.runEffectScenariosWithSharedStore([
        {
          ...first,
          options: {
            workflowId: "service-task-effect-shared-store-1",
            completionDelivery: TemporalCompletionDelivery.Ordered,
            executionSchedule: TemporalExecutionSchedule.Normal,
            effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
          },
        },
        {
          ...second,
          options: {
            workflowId: "service-task-effect-shared-store-2",
            completionDelivery: TemporalCompletionDelivery.Ordered,
            executionSchedule: TemporalExecutionSchedule.Normal,
            effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
          },
        },
      ]),
      15_000,
      "Service Task shared-store executions",
    );

    assert.deepEqual(
      result.executions.map(({ result: executionResult }) => executionResult),
      [
        runScenario(first.scenario, first.semanticProcess),
        runScenario(second.scenario, second.semanticProcess),
      ],
    );
    assert.deepEqual(result.effectProbeEvidence, {
      invocations: 2,
      mutations: 2,
      keys: [
        serviceTaskEffectKey(first),
        serviceTaskEffectKey(second),
      ].sort(),
    });
  });
}
