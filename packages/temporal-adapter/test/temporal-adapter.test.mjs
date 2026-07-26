import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { isDeepStrictEqual } from "node:util";

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
  runScenario,
} from "@bpmn-lean/semantic-core";

import {
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
  TemporalScenarioRunner,
  isCompletedProcessReceipt,
} from "../dist/index.js";

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
const parallelBpmnUrl = new URL(
  "../../../scenarios/parallel-fork-join/process.bpmn",
  import.meta.url,
);
const parallelSourceSha256 =
  "e68382dfa9125fbecd6f717578e5ec8bc59a4b33b62671d9794919ec8b52bcc6";
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
  const matches = historyEvents(history, attributesName);
  assert.equal(
    matches.length,
    1,
    `expected exactly one history event with ${attributesName}`,
  );
  return matches[0];
}

function historyEvents(history, attributesName) {
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

async function loadExecutionInput(selectedScenarioUrl) {
  const scenario = await loadJson(selectedScenarioUrl);
  return compileExecutionInput(scenario, bpmnUrl);
}

async function compileExecutionInput(scenario, selectedBpmnUrl) {
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

function parallelScenario(firstElementId, secondElementId) {
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

function completionStimulus(elementId) {
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

function stateObservations(result) {
  return result.trace.filter(
    (observation) =>
      observation.kind === CanonicalObservationKind.State,
  );
}

function semanticPrefixThroughCompletion(result) {
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

function completionCommandOrder(result) {
  return result.trace.flatMap((observation) =>
    observation.kind === CanonicalObservationKind.Command &&
    observation.commandId !== "start-process"
      ? [observation.commandId]
      : [],
  );
}

function acceptedCompletionOrder(history) {
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

function assertUpdatesCompleteBeforeWorkflow(history, expectedCount) {
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
    ({ scenario, semanticProcess }, index) => ({
      scenario,
      semanticProcess,
      options: {
        workflowId: `user-task-batch-${index}`,
        completionDelivery:
          index === 2
            ? TemporalCompletionDelivery.PostTerminal
            : TemporalCompletionDelivery.Ordered,
        duplicateFirstCompletion: index === 2,
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
      input.semanticProcess,
    );
    const waitingState = semanticCoreResult.trace.find(
      (observation) =>
        observation.kind === CanonicalObservationKind.State &&
        observation.status === "running",
    );
    const completionCommandIds = new Set(
      input.scenario.stimuli.slice(1).map(({ commandId }) => commandId),
    );
    const allExpectedCompletionOutcomes = semanticCoreResult.trace.flatMap(
      (observation) =>
        observation.kind === CanonicalObservationKind.Command &&
        completionCommandIds.has(observation.commandId)
          ? [observation.outcome]
          : [],
    );
    const expectedCompletionOutcomes =
      index === 2
        ? allExpectedCompletionOutcomes.slice(0, -1)
        : allExpectedCompletionOutcomes;

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
    assert.deepEqual(
      execution.result,
      index === 2
        ? semanticPrefixThroughCompletion(semanticCoreResult)
        : semanticCoreResult,
    );
    assert.equal(
      execution.interactionEvidence.postTerminalResult?.kind ?? null,
      index === 2
        ? ProcessCommandResultKind.ProcessClosed
        : null,
    );
    if (index === 2) {
      assert.equal(
        execution.interactionEvidence.postTerminalResult.commandId,
        input.scenario.stimuli.at(-1).commandId,
      );
    }
    assert.equal(
      execution.receipt === null,
      index === 1,
    );
    if (execution.receipt !== null) {
      assert.equal(isCompletedProcessReceipt(execution.receipt), true);
    }
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

test("concurrent distinct commands retain an unordered completion race witness", async () => {
  const input = await loadExecutionInput(scenarioUrls[2]);
  const execution = await withDeadline(
    runner.runScenario(input.scenario, input.semanticProcess, {
      workflowId: "user-task-concurrent-race",
      completionDelivery: TemporalCompletionDelivery.AcceptedBatch,
    }),
    15_000,
    "User Task concurrent completion race",
  );

  assert.deepEqual(
    [...execution.interactionEvidence.completionOutcomes].sort(),
    [CommandOutcome.Committed, CommandOutcome.Rejected].sort(),
  );
  const terminalStates = stateObservations(execution.result).slice(-2);
  assert.equal(terminalStates.length, 2);
  assert.deepEqual(terminalStates[0], terminalStates[1]);
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);
  assertUpdatesCompleteBeforeWorkflow(execution.history, 2);

  await withDeadline(
    runner.replayHistory(
      execution.history,
      "user-task-concurrent-race-replay",
    ),
    10_000,
    "User Task concurrent race history replay",
  );
});

test("parallel waits and both completion orders refine through Query, Update, and replay", async () => {
  const scenarios = [
    parallelScenario("UserTask_A", "UserTask_B"),
    parallelScenario("UserTask_B", "UserTask_A"),
  ];
  const inputs = await Promise.all(
    scenarios.map((scenario) =>
      compileExecutionInput(scenario, parallelBpmnUrl),
    ),
  );
  const executions = await withDeadline(
    runner.runScenarios(
      inputs.map(({ scenario, semanticProcess }, index) => ({
        scenario,
        semanticProcess,
        options: {
          workflowId: `parallel-ordered-${index}`,
          completionDelivery: TemporalCompletionDelivery.Ordered,
          duplicateFirstCompletion: index === 0,
        },
      })),
    ),
    15_000,
    "parallel ordered interaction batch",
  );

  assert.equal(executions.length, 2);
  for (const [index, execution] of executions.entries()) {
    const expected = runScenario(
      inputs[index].scenario,
      inputs[index].semanticProcess,
    );
    const states = stateObservations(expected);
    assert.equal(states.length, 3);
    assert.deepEqual(
      execution.interactionEvidence.openUserTasksAtWait,
      states[0].openUserTasks,
    );
    assert.deepEqual(
      execution.interactionEvidence.openUserTasksAfterCompletions,
      [states[1].openUserTasks],
    );
    assert.deepEqual(
      execution.interactionEvidence.completionOutcomes,
      [CommandOutcome.Committed, CommandOutcome.Committed],
    );
    assert.equal(
      execution.interactionEvidence.duplicateCompletionOutcome,
      index === 0 ? CommandOutcome.Committed : null,
    );
    assert.deepEqual(execution.result, expected);
    assert.equal(isCompletedProcessReceipt(execution.receipt), true);
    assertUpdatesCompleteBeforeWorkflow(
      execution.history,
      2,
    );
  }

  await withDeadline(
    runner.replayHistories(
      executions.map((execution, index) => ({
        history: execution.history,
        workflowId: `parallel-ordered-${index}`,
      })),
    ),
    10_000,
    "parallel ordered history replay",
  );
});

test("concurrent parallel completion submission realizes and replays one permitted order", async () => {
  const aThenB = parallelScenario("UserTask_A", "UserTask_B");
  const bThenA = parallelScenario("UserTask_B", "UserTask_A");
  const input = await compileExecutionInput(aThenB, parallelBpmnUrl);
  const expectedResults = [
    runScenario(aThenB, input.semanticProcess),
    runScenario(bThenA, input.semanticProcess),
  ];
  const execution = await withDeadline(
    runner.runScenario(input.scenario, input.semanticProcess, {
      workflowId: "parallel-concurrent",
      completionDelivery: TemporalCompletionDelivery.Concurrent,
    }),
    15_000,
    "parallel concurrent interaction",
  );

  assert.deepEqual(
    execution.interactionEvidence.openUserTasksAfterCompletions,
    [],
  );
  assert.deepEqual(
    execution.interactionEvidence.completionOutcomes,
    [CommandOutcome.Committed, CommandOutcome.Committed],
  );
  assert.equal(
    expectedResults.some((expected) =>
      isDeepStrictEqual(execution.result, expected)
    ),
    true,
  );
  assert.deepEqual(
    acceptedCompletionOrder(execution.history),
    completionCommandOrder(execution.result),
  );
  assertUpdatesCompleteBeforeWorkflow(execution.history, 2);
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);

  await withDeadline(
    runner.replayHistory(execution.history, "parallel-concurrent"),
    10_000,
    "parallel concurrent history replay",
  );
});

test("batch execution rejects duplicate Workflow identities before start", async () => {
  const input = await loadExecutionInput(scenarioUrls[0]);
  const duplicate = {
    ...input,
    options: {
      workflowId: "duplicate-workflow-id",
      completionDelivery: TemporalCompletionDelivery.Ordered,
    },
  };

  await assert.rejects(
    runner.runScenarios([duplicate, duplicate]),
    /Workflow IDs must be unique/u,
  );
});
