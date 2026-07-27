/**
 * Adapter-local witness for a successful Activity result whose BPMN Error code has no route.
 */
import type {
  CanonicalObservation,
  EffectExecutionResult,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionResultKind,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  WorkflowFailedError,
} from "@temporalio/client";
import type {
  TestWorkflowEnvironment,
} from "@temporalio/testing";

import {
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
  TemporalUnhandledBpmnErrorExecution,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./effect-probe.js";
import {
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import {
  requireOptionalEffectExecution,
  requireStartStimulus,
  withDeadline,
} from "./runner-support.js";

const operationDeadlineMs = 5_000;
const workflowResultDeadlineMs = 10_000;

export async function runUnhandledBpmnError(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: (
    handle: import("@temporalio/client").WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<TemporalUnhandledBpmnErrorExecution> {
  const effectExecution = requireOptionalEffectExecution(
    scenario,
    semanticProcess,
    {
      workflowId,
      completionDelivery: TemporalCompletionDelivery.Ordered,
      executionSchedule: TemporalExecutionSchedule.Normal,
      effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
    },
  );
  if (effectExecution === undefined) {
    throw new TypeError(
      "Unhandled BPMN Error witness requires one committed effect intent",
    );
  }
  const store = new EffectProbeStore();
  store.requireEmpty();
  let returnedResult: EffectExecutionResult | undefined;
  registry.register(
    effectExecution.request,
    async (request) => {
      const admittedResult = await store.execute(
        request,
        EffectExecutionSchedule.PlainSuccess,
      );
      if (
        admittedResult.kind !== EffectExecutionResultKind.BpmnError
      ) {
        throw new TypeError(
          "Unhandled BPMN Error witness requires a BPMN Error probe result",
        );
      }
      returnedResult = {
        ...admittedResult,
        code: "RelationshipLinkageError",
        message: "Relationship linkage failed",
      };
      return returnedResult;
    },
  );
  try {
    const handle = await withDeadline(
      environment.client.workflow.start<BpmnProcessWorkflow>(
        bpmnProcessWorkflowType,
        {
          taskQueue: bpmnSemanticTaskQueue,
          workflowId,
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [requireStartStimulus(scenario), semanticProcess],
        },
      ),
      operationDeadlineMs,
      "unhandled BPMN Error Workflow start",
    );
    const lastCommittedTrace = await waitForTrace(handle, 3);
    const failureType = await requireFailureType(handle);
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "unhandled BPMN Error Workflow history",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError(
        "Unhandled BPMN Error history did not contain an events array",
      );
    }
    reconcileHarnessTraceEvidence(
      lastCommittedTrace,
      null,
      history as TemporalHistory,
    );
    if (returnedResult === undefined) {
      throw new TypeError(
        "Unhandled BPMN Error Activity returned no typed result",
      );
    }
    return {
      failureType,
      lastCommittedTrace,
      history: history as TemporalHistory,
      effectProbeEvidence: store.evidence(),
      returnedResult,
    };
  } finally {
    registry.unregister(effectExecution.request.idempotencyKey);
  }
}

async function requireFailureType(
  handle: import("@temporalio/client").WorkflowHandle<BpmnProcessWorkflow>,
): Promise<"BPMN_UNHANDLED_BPMN_ERROR"> {
  try {
    await withDeadline(
      handle.result(),
      workflowResultDeadlineMs,
      "unhandled BPMN Error Workflow failure",
    );
    throw new Error(
      "Unhandled BPMN Error Workflow unexpectedly completed",
    );
  } catch (error: unknown) {
    if (
      error instanceof WorkflowFailedError &&
      error.cause instanceof ApplicationFailure &&
      error.cause.type === "BPMN_UNHANDLED_BPMN_ERROR"
    ) {
      return error.cause.type;
    }
    throw error;
  }
}
