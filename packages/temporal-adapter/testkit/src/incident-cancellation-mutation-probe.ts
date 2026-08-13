/** Direct native-termination mutation against the incident cancellation live seam. */
import type {
  CanonicalObservation,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";

import type { BpmnProcessWorkflow } from "@bpmn-lean/temporal-protocol";

import type {
  EffectProbeActivityRegistry,
  TemporalHistory,
} from "./contracts.js";
import { withDeadline } from "./contracts.js";
import { EffectExecutionSchedule, EffectProbeStore } from "./effect-probe.js";
import {
  cancellationEffectRequest,
  requirePublishedCancellation,
} from "./incident-cancellation-live-evidence.js";
import { requireStartStimulus } from "./runner-support.js";
import { startScenarioWorkflow } from "./runner-workflow-start.js";

const operationDeadlineMs = 5_000;
const workflowDeadlineMs = 10_000;

export type TemporalIncidentTerminationMutation = Readonly<{
  waitTrace: ReadonlyArray<CanonicalObservation>;
  history: TemporalHistory;
}>;

export async function runIncidentTerminationMutation(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<TemporalIncidentTerminationMutation> {
  const effectRequest = cancellationEffectRequest(scenario, semanticProcess);
  const store = new EffectProbeStore();
  store.requireEmpty();
  registry.register(
    effectRequest,
    (request) => store.execute(
      request,
      EffectExecutionSchedule.IncidentReportCancel,
    ),
  );
  try {
    const start = requireStartStimulus(scenario);
    const handle = await startScenarioWorkflow(
      environment.client.workflow,
      start,
      semanticProcess,
      workflowId,
      operationDeadlineMs,
    );
    const waitTrace = await withDeadline(
      waitForTrace(handle, 5),
      workflowDeadlineMs,
      "incident termination mutation state observation",
    );
    requirePublishedCancellation(waitTrace);
    await withDeadline(
      handle.terminate("incident cancellation native-termination mutation"),
      operationDeadlineMs,
      "native Workflow termination mutation",
    );
    await withDeadline(
      handle.result().then(
        () => {
          throw new TypeError("Terminated Workflow unexpectedly returned a receipt");
        },
        () => undefined,
      ),
      operationDeadlineMs,
      "native termination result rejection",
    );
    const historyValue = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "native termination history fetch",
    );
    if (!Array.isArray(historyValue.events)) {
      throw new TypeError("Native termination history has no events array");
    }
    return { waitTrace, history: historyValue as TemporalHistory };
  } finally {
    registry.unregister(effectRequest.idempotencyKey);
  }
}
