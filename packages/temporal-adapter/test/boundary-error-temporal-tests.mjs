/**
 * Typed BPMN Error Activity result, boundary routing, replay, and unhandled-error locks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
  SemanticOperationKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  effectTransportKey,
  requireDurableEffectActivityHistory,
} from "../dist/index.js";
import {
  compileExecutionInput,
  loadJson,
  withDeadline,
} from "./temporal-test-support.mjs";

const scenarioUrl = new URL(
  "../../../scenarios/boundary-error/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/boundary-error/process.bpmn",
  import.meta.url,
);

export function registerBoundaryErrorTemporalTests(getRunner) {
  test("typed BPMN Error result maps null, opens the boundary route, and replays", async () => {
    const input = await boundaryErrorInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "boundary-error-caught",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
      }),
      15_000,
      "caught BPMN Error Activity execution",
    );

    assert.deepEqual(execution.result, expected);
    assert.deepEqual(execution.receipt.finalState.variables, [
      {
        name: "relationshipLinkId",
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
      input.scenario.stimuli[1].result,
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "boundary-error-caught-replay",
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
      getRunner().runUnhandledBpmnError(
        input.scenario,
        input.semanticProcess,
        "boundary-error-unhandled",
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
      code: "RelationshipLinkageError",
      message: "Relationship linkage failed",
      localPatch: [
        {
          name: "newLinkId",
          value: { kind: "null" },
        },
      ],
    });
  });

  test("boundary-error Activity bypass preserves semantics but loses durable evidence", async () => {
    const input = await boundaryErrorInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runEffectBypassMutation(
        input.scenario,
        input.semanticProcess,
        "boundary-error-bypass",
      ),
      15_000,
      "boundary-error Activity-bypass mutation",
    );

    assert.deepEqual(execution.result, expected);
    assert.throws(
      () =>
        requireDurableEffectActivityHistory(
          execution.history,
          boundaryErrorRequest(input),
          1,
          input.scenario.stimuli[1].result,
        ),
      /scheduled\/attempt\/completed effect Activity shape/u,
    );
  });
}

async function boundaryErrorInput() {
  const scenario = await loadJson(scenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

function boundaryErrorRequest({ scenario, semanticProcess }) {
  const operation = semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitEffect,
  );
  const effectId = scenario.stimuli[1]?.effectId;
  if (
    operation?.kind !== SemanticOperationKind.AwaitEffect ||
    effectId === undefined
  ) {
    throw new Error("Boundary Error fixture omitted its effect contract");
  }
  const arguments_ = [
    {
      name: "relationshipModel",
      value: { kind: "string", value: "RelationshipModel" },
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
