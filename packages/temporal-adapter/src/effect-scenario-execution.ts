/**
 * Temporal Activity schedules and failure witnesses for the Service Task effect capsule.
 *
 * This module owns probe registration and adapter-local evidence. The caller retains Workflow
 * environment lifecycle and ordinary scenario execution.
 */
import { setTimeout as delay } from "node:timers/promises";

import type {
  CanonicalObservation,
  Scenario,
  SemanticProcessProgram,
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
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  TemporalEffectFailureExecution,
  TemporalHistory,
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalSharedEffectExecutions,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./effect-probe.js";
import {
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import type {
  PreparedEffectExecution,
} from "./runner-support.js";
import {
  requireOptionalEffectExecution,
  requireStartStimulus,
  withDeadline,
} from "./runner-support.js";

const operationDeadlineMs = 5_000;
const waitTraceDeadlineMs = 10_000;
const workflowResultDeadlineMs = 10_000;
const workerLossActivityDelayMs = 2_500;

type RegisteredScenarioExecution = (
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  options: TemporalScenarioExecutionOptions,
  effectProbeStore?: EffectProbeStore,
) => Promise<TemporalScenarioExecution>;

export async function runEffectScenario(
  registry: EffectProbeActivityRegistry,
  effectExecution: PreparedEffectExecution,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  options: TemporalScenarioExecutionOptions,
  runRegisteredScenario: RegisteredScenarioExecution,
): Promise<TemporalScenarioExecution> {
  const store = new EffectProbeStore();
  store.requireEmpty();
  let firstInvocation = true;
  registry.register(
    effectExecution.request,
    async (request) => {
      const result = await store.execute(
        request,
        effectExecution.schedule,
      );
      if (
        options.workerDownAtEffectPending === true &&
        firstInvocation
      ) {
        firstInvocation = false;
        // The first attempt has performed the external mutation but remains unacknowledged past
        // start-to-close. The replacement Worker must reconcile the same transport key.
        await delay(workerLossActivityDelayMs);
      }
      return result;
    },
  );
  try {
    const execution = await runRegisteredScenario(
      scenario,
      semanticProcess,
      options,
      store,
    );
    return {
      ...execution,
      effectProbeEvidence: store.evidence(),
    };
  } finally {
    registry.unregister(
      effectExecution.request.idempotencyKey,
    );
  }
}

export async function runEffectExhaustion(
  environment: TestWorkflowEnvironment,
  registry: EffectProbeActivityRegistry,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: (
    handle: import("@temporalio/client").WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<TemporalEffectFailureExecution> {
  const options: TemporalScenarioExecutionOptions = {
    workflowId,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
  };
  const effectExecution = requireOptionalEffectExecution(
    scenario,
    semanticProcess,
    options,
  );
  if (effectExecution === undefined) {
    throw new TypeError(
      "Effect exhaustion requires one committed effect intent",
    );
  }
  let invocations = 0;
  registry.register(
    effectExecution.request,
    async () => {
      invocations += 1;
      await delay(25);
      throw new Error("scripted effect execution failure");
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
      "exhausted effect Workflow start",
    );
    const lastCommittedTrace = await withDeadline(
      waitForTrace(handle, 3),
      waitTraceDeadlineMs,
      "exhausted effect committed-intent observation",
    );
    let failureType: string | undefined;
    try {
      await withDeadline(
        handle.result(),
        workflowResultDeadlineMs,
        "exhausted effect Workflow failure",
      );
      throw new Error(
        "Exhausted effect Workflow unexpectedly completed",
      );
    } catch (error: unknown) {
      if (
        error instanceof WorkflowFailedError &&
        error.cause instanceof ApplicationFailure
      ) {
        failureType = error.cause.type ?? undefined;
      } else {
        throw error;
      }
    }
    if (failureType !== "BPMN_EFFECT_EXECUTION_EXHAUSTED") {
      throw new TypeError(
        `Exhausted effect Workflow failed as ${String(failureType)}`,
      );
    }
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "exhausted effect Workflow history",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError(
        "Exhausted effect history did not contain an events array",
      );
    }
    reconcileHarnessTraceEvidence(
      lastCommittedTrace,
      null,
      history as TemporalHistory,
    );
    return {
      failureType,
      lastCommittedTrace,
      history: history as TemporalHistory,
      effectProbeEvidence: {
        invocations,
        mutations: 0,
        keys: [],
      },
    };
  } finally {
    registry.unregister(
      effectExecution.request.idempotencyKey,
    );
  }
}

export async function runEffectScenariosWithSharedStore(
  registry: EffectProbeActivityRegistry,
  items: ReadonlyArray<TemporalScenarioBatchItem>,
  runRegisteredScenario: RegisteredScenarioExecution,
): Promise<TemporalSharedEffectExecutions> {
  if (items.length !== 2) {
    throw new TypeError(
      "The cross-instance discriminator requires exactly two executions",
    );
  }
  const store = new EffectProbeStore();
  store.requireEmpty();
  const executions: TemporalScenarioExecution[] = [];
  const keys = new Set<string>();
  for (const item of items) {
    const effectExecution = requireOptionalEffectExecution(
      item.scenario,
      item.semanticProcess,
      item.options,
    );
    if (
      effectExecution === undefined ||
      effectExecution.schedule !== EffectExecutionSchedule.PlainSuccess
    ) {
      throw new TypeError(
        "Shared-store discrimination requires plain-success effect executions",
      );
    }
    if (keys.has(effectExecution.request.idempotencyKey)) {
      throw new TypeError(
        "Shared-store semantic instances produced the same transport key",
      );
    }
    keys.add(effectExecution.request.idempotencyKey);
    registry.register(
      effectExecution.request,
      (request) =>
        store.execute(request, EffectExecutionSchedule.PlainSuccess),
    );
    try {
      const execution = await runRegisteredScenario(
        item.scenario,
        item.semanticProcess,
        item.options,
        store,
      );
      executions.push({
        ...execution,
        effectProbeEvidence: store.evidence(),
      });
    } finally {
      registry.unregister(
        effectExecution.request.idempotencyKey,
      );
    }
  }
  return {
    executions,
    effectProbeEvidence: store.evidence(),
  };
}
