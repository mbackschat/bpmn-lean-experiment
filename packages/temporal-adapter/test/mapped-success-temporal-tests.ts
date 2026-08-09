/**
 * Mapped-success Activity data, retry, replacement, replay, and bypass locks.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { SourceOverlaySelection } from "@bpmn-lean/bpmn-source";
import {
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  EffectTransportMaterial,
  Scenario,
} from "@bpmn-lean/semantic-core";
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

  test("mapped success retains a non-null source overlay through Activity transport and replay", async () => {
    const baseline = await mappedSuccessInput();
    const input = await mappedSuccessOverlayInput(baseline);
    const expected = runScenario(input.scenario, input.semanticProcess);
    const transportMaterial = mappedSuccessTransportMaterial(input);
    const request = mappedSuccessRequest(input);
    const overlayIdentity = input.semanticProcess.identity.sourceOverlay;
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "mapped-success-source-overlay",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
      }),
      15_000,
      "mapped-success source-overlay execution",
    );

    assert.notEqual(overlayIdentity, null);
    assert.deepEqual(
      input.scenario.bpmn.sourceOverlay,
      overlayIdentity,
    );
    assert.deepEqual(
      expected,
      runScenario(baseline.scenario, baseline.semanticProcess),
    );
    assert.deepEqual(execution.result, expected);
    assert.deepEqual(
      requireCompletedReceipt(execution.receipt).definition,
      input.semanticProcess.identity,
    );
    assert.deepEqual(
      transportMaterial.definition.sourceOverlay,
      overlayIdentity,
    );
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 1,
      mutations: 1,
      keys: [request.idempotencyKey],
    });
    requireDurableEffectActivityHistory(
      execution.history,
      request,
      1,
      completeEffectStimulusAt(input.scenario, 1).result,
    );

    const alternateOverlayKey = effectTransportKey({
      ...transportMaterial,
      definition: {
        ...transportMaterial.definition,
        sourceOverlay: {
          id: "alternate-mapped-success-temporal-overlay",
          sha256: "f".repeat(64),
        },
      },
    });
    assert.notEqual(alternateOverlayKey, request.idempotencyKey);

    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "mapped-success-source-overlay-replay",
      ),
      10_000,
      "mapped-success source-overlay replay",
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

async function mappedSuccessOverlayInput(
  baseline: TemporalExecutionInput,
): Promise<TemporalExecutionInput> {
  const overlayId = "mapped-success-temporal-overlay";
  const alternateBinding = "${temporalMappedSuccessHandler}";
  const baselineSource = await readFile(bpmnUrl, "utf8");
  const sourceBytes = new TextEncoder().encode(
    baselineSource.replace("${mappedSuccessHandler}", alternateBinding),
  );
  const overlayBytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay",
    id: overlayId,
    semanticProfile: baseline.scenario.profile,
    effectBindings: [{
      source: {
        implementation: null,
        delegateExpression: alternateBinding,
      },
      descriptor: effectOperation(baseline.semanticProcess).effect.descriptor,
    }],
    inertAttributes: [],
  }));
  const sourceOverlay = {
    id: overlayId,
    sha256: sha256(overlayBytes),
    bytes: overlayBytes,
  } satisfies SourceOverlaySelection;
  const scenario = {
    ...baseline.scenario,
    bpmn: {
      ...baseline.scenario.bpmn,
      sha256: sha256(sourceBytes),
    },
  } satisfies Scenario;
  return compileExecutionInput(scenario, bpmnUrl, {
    sourceBytes,
    sourceOverlay,
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mappedSuccessRequest(
  input: TemporalExecutionInput,
): EffectRequest {
  const material = mappedSuccessTransportMaterial(input);
  return {
    ...material.descriptor,
    idempotencyKey: effectTransportKey(material),
    arguments: material.arguments,
  };
}

function mappedSuccessTransportMaterial(
  { scenario, semanticProcess }: TemporalExecutionInput,
): EffectTransportMaterial {
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
    definition: effectDefinitionKey(semanticProcess),
    occurrence: completeEffectStimulusAt(scenario, 1).effectId,
    descriptor,
    arguments: arguments_,
  };
}
