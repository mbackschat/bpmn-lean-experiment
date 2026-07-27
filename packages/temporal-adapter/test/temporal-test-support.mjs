/**
 * Shared fixture construction and durable-history assertions for one Temporal integration suite.
 */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ObservationRequestKind,
  ScenarioDocumentKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  isCompletedProcessReceipt,
} from "../dist/index.js";

export const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);
export const scenarioUrls = [
  "scenario.json",
  "wrong-activation.scenario.json",
  "stale-completion.scenario.json",
].map((relativePath) => new URL(relativePath, capsuleUrl));
export const bpmnUrl = new URL("process.bpmn", capsuleUrl);
export const parallelBpmnUrl = new URL(
  "../../../scenarios/parallel-fork-join/process.bpmn",
  import.meta.url,
);
export const timerScenarioUrl = new URL(
  "../../../scenarios/intermediate-catch-timer/scenario.json",
  import.meta.url,
);
export const timerBpmnUrl = new URL(
  "../../../scenarios/intermediate-catch-timer/process.bpmn",
  import.meta.url,
);
export const parallelSourceSha256 =
  "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6";
export const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
export const expectedTemporalIdentity = "bpmn-lean-test-runtime";

export function withDeadline(promise, timeoutMs, operation) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export async function loadJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

export function collectTemporalIdentities(value, identities = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTemporalIdentities(item, identities);
    }
    return identities;
  }
  if (value === null || typeof value !== "object") {
    return identities;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "identity" && typeof item === "string") {
      identities.add(item);
    } else {
      collectTemporalIdentities(item, identities);
    }
  }
  return identities;
}

export function requiredHistoryEvent(history, attributesName) {
  const matches = historyEvents(history, attributesName);
  assert.equal(
    matches.length,
    1,
    `expected exactly one history event with ${attributesName}`,
  );
  return matches[0];
}

export function historyEvents(history, attributesName) {
  return history.events.filter(
    (event) => {
      const attributes = event[attributesName];
      return (
        attributes !== undefined &&
        attributes !== null &&
        Object.keys(attributes).length > 0
      );
    },
  );
}

export function decodeJsonPayload(payload) {
  assert.notEqual(payload?.data, undefined);
  const bytes =
    typeof payload.data === "string"
      ? Buffer.from(payload.data, "base64")
      : Buffer.from(payload.data);
  return JSON.parse(bytes.toString("utf8"));
}

export function temporalInt64ToBigInt(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.low !== "number" ||
    typeof value.high !== "number"
  ) {
    return BigInt(value);
  }
  const low = BigInt(value.low >>> 0);
  const high = BigInt(value.high >>> 0);
  const unsigned = (high << 32n) | low;
  return value.unsigned === true || value.high >= 0
    ? unsigned
    : unsigned - (1n << 64n);
}

export function assertExactCompletionUpdateHistory(
  history,
  { scenario, semanticProcess },
) {
  const accepted = requiredHistoryEvent(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  const updateCompleted = requiredHistoryEvent(
    history,
    "workflowExecutionUpdateCompletedEventAttributes",
  );
  assert.deepEqual(
    collectTemporalIdentities(history),
    new Set([expectedTemporalIdentity]),
  );
  assert.equal(
    history.events.some(
      (event) => {
        const attributes = event.workflowExecutionSignaledEventAttributes;
        return (
          attributes !== undefined &&
          attributes !== null &&
          Object.keys(attributes).length > 0
        );
      },
    ),
    false,
  );

  const started = requiredHistoryEvent(
    history,
    "workflowExecutionStartedEventAttributes",
  );
  const workflowInputs =
    started.workflowExecutionStartedEventAttributes.input.payloads;
  assert.deepEqual(
    decodeJsonPayload(workflowInputs[0]),
    scenario.stimuli[0],
  );
  assert.deepEqual(decodeJsonPayload(workflowInputs[1]), semanticProcess);

  const acceptedAttributes =
    accepted.workflowExecutionUpdateAcceptedEventAttributes;
  assert.equal(
    acceptedAttributes.acceptedRequest.input.name,
    "bpmn-complete-user-task",
  );
  assert.deepEqual(
    decodeJsonPayload(
      acceptedAttributes.acceptedRequest.input.args.payloads[0],
    ),
    scenario.stimuli[1],
  );

  const updateCompletedAttributes =
    updateCompleted.workflowExecutionUpdateCompletedEventAttributes;
  assert.equal(
    temporalInt64ToBigInt(updateCompletedAttributes.acceptedEventId),
    temporalInt64ToBigInt(accepted.eventId),
  );
  assert.equal(
    decodeJsonPayload(
      updateCompletedAttributes.outcome.success.payloads[0],
    ),
    CommandOutcome.Committed,
  );

  const workflowCompleted = requiredHistoryEvent(
    history,
    "workflowExecutionCompletedEventAttributes",
  );
  assert.equal(
    isCompletedProcessReceipt(
      decodeJsonPayload(
        workflowCompleted.workflowExecutionCompletedEventAttributes
          .result.payloads[0],
      ),
    ),
    true,
  );
}

export async function loadExecutionInput(selectedScenarioUrl) {
  const scenario = await loadJson(selectedScenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

export async function compileExecutionInput(scenario, selectedBpmnUrl) {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(selectedBpmnUrl),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  return {
    scenario,
    semanticProcess: compilation.semanticProcess,
  };
}

export function parallelScenario(firstElementId, secondElementId) {
  return {
    kind: ScenarioDocumentKind.Scenario,
    id: `parallel-fork-join-${firstElementId}-then-${secondElementId}`,
    profile: "parallel-fork-join-draft",
    bpmn: {
      id: "parallel-two-user-tasks-process",
      relativePath: "scenarios/parallel-fork-join/process.bpmn",
      sha256: parallelSourceSha256,
    },
    stimuli: [
      {
        kind: StimulusKind.StartProcess,
        commandId: "start-process",
        processId: "Process_ParallelForkJoin",
        instanceId: "Instance_1",
      },
      completionStimulus(firstElementId),
      completionStimulus(secondElementId),
    ],
    observations: [
      ObservationRequestKind.Deployment,
      ObservationRequestKind.CommandResults,
      ObservationRequestKind.ProcessStatus,
      ObservationRequestKind.ActiveWaits,
      ObservationRequestKind.OpenUserTasks,
      ObservationRequestKind.OpenTimers,
      ObservationRequestKind.OpenEffects,
      ObservationRequestKind.EnabledInteractions,
      ObservationRequestKind.LogicalTime,
    ],
    provenance: {
      normativeRefs: [
        "BPMN 2.0.2 §10.6.4",
        "BPMN 2.0.2 §13.4.1",
      ],
      cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
      cibRefs: [
        "engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/ParallelGatewayActivityBehavior.java",
      ],
    },
  };
}

export function completionStimulus(elementId) {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: {
      processInstanceId: "Instance_1",
      elementId,
      activation: 1,
    },
  };
}

export function stateObservations(result) {
  return result.trace.filter(
    (observation) =>
      observation.kind === CanonicalObservationKind.State,
  );
}

export function semanticPrefixThroughCompletion(result) {
  const completedStateIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === "completed",
  );
  assert.notEqual(completedStateIndex, -1);
  return {
    outcome: {
      kind: "semantic",
      outcome: CommandOutcome.Committed,
    },
    trace: result.trace.slice(0, completedStateIndex + 1),
  };
}

export function completionCommandOrder(result) {
  return result.trace.flatMap((observation) =>
    observation.kind === CanonicalObservationKind.Command &&
    observation.commandId !== "start-process"
      ? [observation.commandId]
      : [],
  );
}

export function acceptedCompletionOrder(history) {
  return historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  ).map((event) => {
    const attributes =
      event.workflowExecutionUpdateAcceptedEventAttributes;
    return decodeJsonPayload(
      attributes.acceptedRequest.input.args.payloads[0],
    ).commandId;
  });
}

export function assertUpdatesCompleteBeforeWorkflow(history, expectedCount) {
  const accepted = historyEvents(
    history,
    "workflowExecutionUpdateAcceptedEventAttributes",
  );
  const completed = historyEvents(
    history,
    "workflowExecutionUpdateCompletedEventAttributes",
  );
  const workflowCompleted = requiredHistoryEvent(
    history,
    "workflowExecutionCompletedEventAttributes",
  );
  assert.equal(accepted.length, expectedCount);
  assert.equal(completed.length, expectedCount);
  const acceptedIds = new Set(
    accepted.map((event) => temporalInt64ToBigInt(event.eventId)),
  );
  for (const event of completed) {
    const attributes =
      event.workflowExecutionUpdateCompletedEventAttributes;
    assert.equal(
      acceptedIds.has(
        temporalInt64ToBigInt(attributes.acceptedEventId),
      ),
      true,
    );
    assert.equal(
      temporalInt64ToBigInt(event.eventId) <
        temporalInt64ToBigInt(workflowCompleted.eventId),
      true,
    );
  }
}
