/** Live cancellation, retained-result, normal-completion, replay, and native-termination evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProcessStatus,
  VariableValueKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  ProcessCommandResultKind,
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  isCancelledProcessReceipt,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalScenarioRunner } from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  withDeadline,
} from "./temporal-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/service-task-incident-cancellation/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);

export function registerServiceTaskIncidentCancellationTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("cancellation survives Worker replacement, retains its Update, and completes normally", async () => {
    const input = await cancellationInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "service-task-incident-cancellation",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: EffectExecutionSchedule.IncidentReportCancel,
      }),
      20_000,
      "Service Task incident cancellation execution",
    );

    assert.deepEqual(execution.waitTrace, expected.trace.slice(0, 5));
    assert.deepEqual(execution.result, expected);
    assert.equal(isCancelledProcessReceipt(execution.receipt), true);
    if (!isCancelledProcessReceipt(execution.receipt)) {
      throw new TypeError("Cancellation execution has no cancelled receipt");
    }
    assert.deepEqual(execution.receipt.finalState.variables, [{
      name: "preserved",
      value: { kind: VariableValueKind.String, value: "before-cancel" },
    }]);
    assert.equal(execution.effectProbeEvidence?.invocations, 1);
    assert.equal(execution.effectProbeEvidence?.mutations, 1);
    assert.equal(execution.effectProbeEvidence?.keys.length, 1);
    assert.equal(
      execution.interactionEvidence.postTerminalResult?.kind,
      ProcessCommandResultKind.ProcessClosed,
    );
    const postTerminal = execution.interactionEvidence.postTerminalResult;
    if (postTerminal?.kind === ProcessCommandResultKind.ProcessClosed) {
      assert.deepEqual(postTerminal.receipt, execution.receipt);
    }
    assert.equal(
      historyEvents(
        execution.history,
        "workflowExecutionCompletedEventAttributes",
      ).length,
      1,
    );
    for (const attributesName of [
      "workflowExecutionCancelRequestedEventAttributes",
      "workflowExecutionCanceledEventAttributes",
      "workflowExecutionTerminatedEventAttributes",
    ]) {
      assert.equal(historyEvents(execution.history, attributesName).length, 0);
    }

    const completedMutation = {
      ...execution.receipt,
      finalState: {
        ...execution.receipt.finalState,
        status: ProcessStatus.Completed,
      },
    } as unknown as typeof execution.receipt;
    assert.equal(isCancelledProcessReceipt(completedMutation), false);

    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "service-task-incident-cancellation-replay",
      ),
      10_000,
      "Service Task incident cancellation history replay",
    );
  });

  test("native Workflow termination cannot masquerade as semantic incident cancellation", async () => {
    const input = await cancellationInput();
    const mutation = await withDeadline(
      getRunner().probes.runIncidentTerminationMutation(
        input.scenario,
        input.semanticProcess,
        "service-task-incident-native-termination-mutation",
      ),
      20_000,
      "Service Task incident native termination mutation",
    );

    assert.deepEqual(
      mutation.waitTrace,
      runScenario(input.scenario, input.semanticProcess).trace.slice(0, 5),
    );
    assert.equal(
      historyEvents(
        mutation.history,
        "workflowExecutionTerminatedEventAttributes",
      ).length,
      1,
    );
    assert.equal(
      historyEvents(
        mutation.history,
        "workflowExecutionCompletedEventAttributes",
      ).length,
      0,
    );
    assert.equal(
      historyEvents(
        mutation.history,
        "workflowExecutionUpdateAcceptedEventAttributes",
      ).length,
      0,
    );
  });
}

async function cancellationInput() {
  return compileExecutionInput(
    await loadJson<Scenario>(scenarioUrl),
    bpmnUrl,
  );
}
