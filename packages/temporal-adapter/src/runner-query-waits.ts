import { setTimeout as delay } from "node:timers/promises";

import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";

import {
  bpmnOpenUserTasksQueryName,
  bpmnTraceQueryName,
} from "./contracts.js";
import type { BpmnProcessWorkflow } from "./contracts.js";
import { normalizeError, withDeadline } from "./async-boundary.js";

const queryDeadlineMs = 5_000;
const maximumAttempts = 100;
const pollingIntervalMs = 50;

export async function waitForTraceLength(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  minimumLength: number,
  assertHealthy: () => void,
): Promise<ReadonlyArray<CanonicalObservation>> {
  let latestError: unknown;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    assertHealthy();
    try {
      const trace = await withDeadline(
        handle.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
        queryDeadlineMs,
        "Workflow trace Query",
      );
      if (trace.length >= minimumLength) {
        return trace;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(pollingIntervalMs);
  }
  throw normalizeError(
    latestError,
    `Workflow trace did not reach ${minimumLength} observations`,
  );
}

export async function waitForOpenUserTask(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  completion: CompleteUserTaskInstanceStimulus,
  assertHealthy: () => void,
): Promise<void> {
  let latestError: unknown;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    assertHealthy();
    try {
      const openUserTasks = await withDeadline(
        handle.query<ReadonlyArray<OpenUserTask>>(
          bpmnOpenUserTasksQueryName,
        ),
        queryDeadlineMs,
        "Workflow open User Tasks Query",
      );
      if (openUserTasks.some(({ id }) =>
        id.processInstanceId === completion.taskId.processInstanceId &&
        id.elementId === completion.taskId.elementId &&
        id.activation === completion.taskId.activation
      )) {
        return;
      }
    } catch (error: unknown) {
      latestError = error;
    }
    await delay(pollingIntervalMs);
  }
  throw normalizeError(
    latestError,
    `Workflow did not expose User Task ${completion.taskId.elementId} activation ${completion.taskId.activation}`,
  );
}
