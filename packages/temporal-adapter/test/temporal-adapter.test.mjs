import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  BpmnCompilationStatus,
  compileSequentialUserTaskBpmn,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  runScenario,
} from "@bpmn-lean/semantic-core";

import { TemporalScenarioRunner } from "../dist/index.js";

const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);
const scenarioUrls = [
  "scenario.json",
  "wrong-activation.scenario.json",
  "stale-completion.scenario.json",
].map((relativePath) => new URL(relativePath, capsuleUrl));
const bpmnUrl = new URL("process.bpmn", capsuleUrl);
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const expectedTemporalIdentity = "bpmn-lean-test-runtime";

let runner;

function withDeadline(promise, timeoutMs, operation) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function loadJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function collectTemporalIdentities(value, identities = new Set()) {
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

function requiredHistoryEvent(history, attributesName) {
  const matches = history.events.filter(
    (event) => {
      const attributes = event[attributesName];
      return (
        attributes !== undefined &&
        attributes !== null &&
        Object.keys(attributes).length > 0
      );
    },
  );
  assert.equal(
    matches.length,
    1,
    `expected exactly one history event with ${attributesName}`,
  );
  return matches[0];
}

function decodeJsonPayload(payload) {
  assert.notEqual(payload?.data, undefined);
  const bytes =
    typeof payload.data === "string"
      ? Buffer.from(payload.data, "base64")
      : Buffer.from(payload.data);
  return JSON.parse(bytes.toString("utf8"));
}

function temporalInt64ToBigInt(value) {
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

function assertExactCompletionUpdateHistory(
  history,
  { scenario, executableIr },
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
  assert.deepEqual(decodeJsonPayload(workflowInputs[0]), scenario);
  assert.deepEqual(decodeJsonPayload(workflowInputs[1]), executableIr);

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
  assert.deepEqual(
    decodeJsonPayload(
      workflowCompleted.workflowExecutionCompletedEventAttributes
        .result.payloads[0],
    ),
    runScenario(scenario, executableIr),
  );
}

async function loadExecutionInput(selectedScenarioUrl) {
  const scenario = await loadJson(selectedScenarioUrl);
  const compilation = await compileSequentialUserTaskBpmn({
    bytes: await readFile(bpmnUrl),
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
    executableIr: compilation.executableIr,
  };
}

before(async () => {
  runner = await withDeadline(
    TemporalScenarioRunner.create({
      cliVersion: "v1.8.1",
      downloadDirectory: temporalCacheDirectory,
    }),
    45_000,
    "Temporal runner startup",
  );
});

after(async () => {
  if (runner !== undefined) {
    await withDeadline(runner.shutdown(), 10_000, "Temporal runner shutdown");
  }
});

test("one clean server executes, captures, and replays the current capsule", async () => {
  const inputs = await Promise.all(scenarioUrls.map(loadExecutionInput));
  const batchItems = inputs.map(
    ({ scenario, executableIr }, index) => ({
      scenario,
      executableIr,
      options: {
        workflowId: `user-task-batch-${index}`,
        duplicateFirstCompletionUpdateId:
          index === 2 ? "duplicate-first-completion-transport" : undefined,
      },
    }),
  );

  const executions = await withDeadline(
    runner.runScenarios(batchItems),
    15_000,
    "Temporal interaction batch",
  );

  assert.equal(executions.length, inputs.length);
  assertExactCompletionUpdateHistory(executions[0].history, inputs[0]);
  for (const [index, execution] of executions.entries()) {
    const input = inputs[index];
    const semanticCoreResult = runScenario(
      input.scenario,
      input.executableIr,
    );
    const waitingState = semanticCoreResult.trace.find(
      (observation) =>
        observation.kind === CanonicalObservationKind.State &&
        observation.status === "running",
    );
    const completionCommandIds = new Set(
      input.scenario.stimuli.slice(1).map(({ commandId }) => commandId),
    );
    const expectedCompletionOutcomes = semanticCoreResult.trace.flatMap(
      (observation) =>
        observation.kind === CanonicalObservationKind.Command &&
        completionCommandIds.has(observation.commandId)
          ? [observation.outcome]
          : [],
    );

    assert.notEqual(waitingState, undefined);
    assert.deepEqual(
      execution.waitTrace,
      semanticCoreResult.trace.slice(0, 3),
    );
    assert.deepEqual(
      execution.interactionEvidence.openUserTasksAtWait,
      waitingState.openUserTasks,
    );
    assert.deepEqual(
      execution.interactionEvidence.completionOutcomes,
      expectedCompletionOutcomes,
    );
    assert.equal(
      execution.interactionEvidence.duplicateCompletionOutcome,
      index === 2 ? CommandOutcome.Committed : null,
    );
    assert.deepEqual(execution.result, semanticCoreResult);
    assert.deepEqual(
      collectTemporalIdentities(execution.history),
      new Set([expectedTemporalIdentity]),
    );
  }

  await withDeadline(
    runner.replayHistories(
      executions.map((execution, index) => ({
        history: execution.history,
        workflowId: `user-task-batch-${index}`,
      })),
    ),
    10_000,
    "current history batch replay",
  );
});

test("batch execution rejects duplicate Workflow identities before start", async () => {
  const input = await loadExecutionInput(scenarioUrls[0]);
  const duplicate = {
    ...input,
    options: { workflowId: "duplicate-workflow-id" },
  };

  await assert.rejects(
    runner.runScenarios([duplicate, duplicate]),
    /Workflow IDs must be unique/u,
  );
});
