/**
 * Typed BPMN Error Activity result, boundary routing, replay, and unhandled-error locks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
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
  "../../../scenarios/mapped-boundary-error-service-task/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
  import.meta.url,
);

export function registerMappedBoundaryErrorTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("typed BPMN Error result maps null, opens the boundary route, and replays", async () => {
    const input = await boundaryErrorInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "mapped-boundary-error-caught",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
      }),
      15_000,
      "caught BPMN Error Activity execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(requireCompletedReceipt(execution.receipt).finalState.variables, [
      {
        name: "resultValue",
        value: { kind: "null" },
      },
    ]);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 1,
      mutations: 1,
      keys: [boundaryErrorRequest(input).idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      boundaryErrorRequest(input),
      1,
      completeEffectStimulusAt(input.scenario, 1).result,
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "mapped-boundary-error-caught-replay",
      ),
      10_000,
      "caught BPMN Error replay",
    );
  });

  test("unmatched typed BPMN Error fails the Workflow without semantic rejection", async () => {
    const input = await boundaryErrorInput();
    const expectedWaitingTrace = runScenario(
      {
        ...input.scenario,
        stimuli: input.scenario.stimuli.slice(0, 1),
      },
      input.semanticProcess,
    ).trace;
    const execution = await withDeadline(
      getRunner().probes.runUnhandledBpmnError(
        input.scenario,
        input.semanticProcess,
        "mapped-boundary-error-unhandled",
      ),
      15_000,
      "unhandled BPMN Error adapter failure",
    );

    assert.equal(
      execution.failureType,
      "BPMN_UNHANDLED_BPMN_ERROR",
    );
    assert.deepEqual(execution.lastCommittedTrace, expectedWaitingTrace);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 1,
      mutations: 1,
      keys: [boundaryErrorRequest(input).idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      boundaryErrorRequest(input),
      1,
      execution.returnedResult,
    );
    assert.deepEqual(execution.returnedResult, {
      kind: EffectExecutionResultKind.BpmnError,
      code: "UnmatchedMappedBusinessError",
      message: "unmatched mapped business error",
      localPatch: [
        {
          name: "result",
          value: { kind: "null" },
        },
      ],
    });
  });

  test("mapped-boundary-error Activity bypass preserves semantics but loses durable evidence", async () => {
    const input = await boundaryErrorInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().probes.runEffectBypassMutation(
        input.scenario,
        input.semanticProcess,
        "mapped-boundary-error-bypass",
      ),
      15_000,
      "mapped-boundary-error Activity-bypass mutation",
    );

    assert.deepEqual(execution.result, expected);
    assert.throws(
      () =>
        requireDurableEffectActivityHistory(
          execution.history,
          boundaryErrorRequest(input),
          1,
          completeEffectStimulusAt(input.scenario, 1).result,
        ),
      /scheduled\/attempt\/completed effect Activity shape/u,
    );
  });
}

async function boundaryErrorInput(): Promise<TemporalExecutionInput> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function boundaryErrorRequest(
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
