import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CheckedNodeKind,
  CommandOutcome,
  MessageChannelKind,
  ObservationRequestKind,
  ScenarioDocumentKind,
  ScenarioStepKind,
  SemanticGraphPolicyKind,
  SemanticOperationKind,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  TimerStartCheckpointProfileId,
  advanceScenario,
  applyInternalOperation,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedInitiateTimerOperation,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
  sameStimulus,
  semanticGraphPolicyForProfile,
  stimulusCommandId,
  supportsSemanticProcessExecution,
  supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  EnabledInteraction,
  InitiateTimerOperation,
  OccurrenceId,
  ProcessStartStimulus,
  Scenario,
  SemanticProcessProgram,
  StateObservation,
  TriggerMessageStartStimulus,
  TriggerTimerStartStimulus,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const timerProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: TimerStartCheckpointProfileId,
    sourceId: "timer-start-process",
    sourceOverlay: null,
    sourceSha256:
      "9999999999999999999999999999999999999999999999999999999999999999",
  },
  processId: "Process_TimerStart",
  controlPlaces: [
    controlPlace("Flow_StartToTask"),
    controlPlace("Flow_TaskToEnd"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_TaskToEnd",
    },
    {
      ...operationBase("StartEvent_Timer"),
      kind: SemanticOperationKind.InitiateTimer,
      timer: { durationMs: 1000 },
      outputs: ["place:Flow_StartToTask"],
    },
    {
      ...operationBase("UserTask_Review"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_StartToTask",
      output: "place:Flow_TaskToEnd",
      task: {
        elementId: "UserTask_Review",
        name: "Review order",
      },
    },
  ],
}) satisfies SemanticProcessProgram;

const timerTrigger = Object.freeze({
  kind: StimulusKind.TriggerTimerStart,
  commandId: "start-order-timer",
  processId: timerProgram.processId,
  instanceId: "TimerStartInstance_1",
  startEventId: "StartEvent_Timer",
}) satisfies TriggerTimerStartStimulus;

const noneProgram = replaceStart(timerProgram, {
  profile: SemanticProfileId.UserTask,
  processId: "Process_NoneStart",
  sourceId: "none-start-process",
  sourceSha256:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  operation: {
    ...operationBase("StartEvent_None"),
    kind: SemanticOperationKind.Initiate,
    output: "place:Flow_StartToTask",
  },
});

const noneStart = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-order-manually",
  processId: noneProgram.processId,
  instanceId: "NoneStartInstance_1",
  initialVariables: [],
});

const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_OrderMessages",
  interfaceOperationId: "Operation_StartOrder",
  messageId: "Message_OrderRequested",
});

const messageProgram = replaceStart(timerProgram, {
  profile: SemanticProfileId.MessageStart,
  processId: "Process_MessageStart",
  sourceId: "message-start-process",
  sourceSha256:
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  operation: {
    ...operationBase("StartEvent_Message"),
    kind: SemanticOperationKind.InitiateMessage,
    channel,
    outputs: ["place:Flow_StartToTask"],
  },
});

const messageTrigger = Object.freeze({
  kind: StimulusKind.TriggerMessageStart,
  commandId: "start-order-message",
  processId: messageProgram.processId,
  instanceId: "MessageStartInstance_1",
  startEventId: "StartEvent_Message",
  channel,
}) satisfies TriggerMessageStartStimulus;

test("closes an exact Timer Start occurrence in two unique internal steps", () => {
  assert.equal(isWellFormedSemanticProcessProgram(timerProgram), true);
  assert.equal(supportsSemanticProcessExecution(timerTrigger, timerProgram), true);

  const pending = applyStimulus(timerProgram, initialState, timerTrigger, 0);
  assert.equal(pending.outcome, CommandOutcome.Committed);
  assert.equal(pending.internalStepBoundExceeded, true);
  assert.equal(pending.state.initiationPending, true);
  assert.equal(enabledInternalOperationCount(timerProgram, pending.state), 1);

  const initiation = requireOperation(
    timerProgram,
    SemanticOperationKind.InitiateTimer,
  );
  const flowing = applyInternalOperation(timerProgram, initiation, pending.state);
  assert.notEqual(flowing, null);
  if (flowing === null) {
    throw new TypeError("Expected Timer initiation to advance");
  }
  assert.equal(flowing.initiationPending, false);
  assert.deepEqual(flowing.controlTokens, [{
    placeId: "place:Flow_StartToTask",
    owner: rootScopeOccurrence(timerProgram.processId, timerTrigger.instanceId),
    multiplicity: 1,
  }]);
  assert.equal(enabledInternalOperationCount(timerProgram, flowing), 1);

  const awaitUserTask = requireOperation(
    timerProgram,
    SemanticOperationKind.AwaitUserTask,
  );
  const waiting = applyInternalOperation(timerProgram, awaitUserTask, flowing);
  assert.notEqual(waiting, null);
  if (waiting === null) {
    throw new TypeError("Expected the downstream User Task to arm");
  }
  assert.equal(enabledInternalOperationCount(timerProgram, waiting), 0);
  assert.equal(isStableStateResumable(waiting), true);
  assert.deepEqual(waiting.timerWaits, []);
  assert.equal(waiting.logicalTimeMs, 0);

  const oneStep = applyStimulus(timerProgram, initialState, timerTrigger, 1);
  assert.equal(oneStep.internalStepBoundExceeded, true);
  assert.deepEqual(oneStep.state, flowing);
  const twoSteps = applyStimulus(timerProgram, initialState, timerTrigger, 2);
  assert.equal(twoSteps.internalStepBoundExceeded, false);
  assert.deepEqual(twoSteps.state, waiting);
  assert.deepEqual(twoSteps.state.variables, {
    process: { bindings: [] },
    activities: [],
  });
});

test("rejects every Timer Start identity and state mismatch by state identity", () => {
  const wrongRoot = {
    ...timerProgram,
    operationScopes: timerProgram.operationScopes.map((ownership) =>
      ownership.operationId === "operation:StartEvent_Timer"
        ? { ...ownership, scopeId: "scope:OtherProcess" }
        : ownership
    ),
  } satisfies SemanticProcessProgram;
  // Deliberately crosses the trusted static contract to exercise runtime fail-closed admission.
  const wrongDuration = {
    ...timerProgram,
    operations: timerProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.InitiateTimer
        ? { ...operation, timer: { durationMs: 999 } }
        : operation
    ),
  } as unknown as SemanticProcessProgram;
  const wrongProfile = {
    ...timerProgram,
    identity: {
      ...timerProgram.identity,
      semanticProfile: SemanticProfileId.UserTask,
    },
  } satisfies SemanticProcessProgram;
  const mismatches = [
    [timerProgram, { ...timerTrigger, processId: "OtherProcess" }],
    [timerProgram, { ...timerTrigger, startEventId: "OtherStart" }],
    [wrongRoot, timerTrigger],
    [wrongDuration, timerTrigger],
    [wrongProfile, timerTrigger],
  ] as const;

  for (const [candidateProgram, candidateTrigger] of mismatches) {
    const rejected = applyStimulus(
      candidateProgram,
      initialState,
      candidateTrigger,
    );
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.equal(rejected.state, initialState);
    assert.equal(rejected.internalStepBoundExceeded, false);
  }

  const started = applyStimulus(timerProgram, initialState, timerTrigger);
  const repeated = applyStimulus(timerProgram, started.state, {
    ...timerTrigger,
    commandId: "repeat-timer-start",
  });
  assert.equal(repeated.outcome, CommandOutcome.Rejected);
  assert.equal(repeated.state, started.state);
});

test("keeps None, Message, and Timer starts pairwise closed", () => {
  const cases = [
    [timerProgram, noneStart],
    [timerProgram, messageTrigger],
    [noneProgram, timerTrigger],
    [messageProgram, timerTrigger],
  ] as const;
  for (const [candidateProgram, candidateStart] of cases) {
    assert.equal(
      supportsSemanticProcessExecution(candidateStart, candidateProgram),
      false,
    );
    const rejected = applyStimulus(
      candidateProgram,
      initialState,
      candidateStart,
    );
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.equal(rejected.state, initialState);
  }
});

test("creates distinct root and User Task occurrences for distinct instances", () => {
  const first = applyStimulus(timerProgram, initialState, timerTrigger);
  const secondTrigger = {
    ...timerTrigger,
    commandId: "start-second-timer-instance",
    instanceId: "TimerStartInstance_2",
  } as const satisfies TriggerTimerStartStimulus;
  const second = applyStimulus(timerProgram, initialState, secondTrigger);

  assert.notDeepEqual(first.state.scopeOccurrences, second.state.scopeOccurrences);
  assert.deepEqual(first.state.userTaskWaits[0]?.owner, rootScopeOccurrence(
    timerProgram.processId,
    timerTrigger.instanceId,
  ));
  assert.deepEqual(second.state.userTaskWaits[0]?.owner, rootScopeOccurrence(
    timerProgram.processId,
    secondTrigger.instanceId,
  ));
});

test("matches complete downstream None and Message observations after identity normalization", () => {
  const timerState = stateObservation(timerProgram, timerTrigger);
  const noneState = stateObservation(noneProgram, noneStart);
  const messageState = stateObservation(messageProgram, messageTrigger);

  assert.deepEqual(
    normalizeSemanticInstanceIdentity(timerState),
    normalizeSemanticInstanceIdentity(noneState),
  );
  assert.deepEqual(
    normalizeSemanticInstanceIdentity(timerState),
    normalizeSemanticInstanceIdentity(messageState),
  );
  assert.deepEqual(timerState.openTimers, []);
  assert.deepEqual(timerState.openMessageSubscriptions, []);
  assert.equal(timerState.logicalTimeMs, 0);
});

test("admits generic canonical Timer initiation but keeps the checkpoint exact", () => {
  const genericOperation = {
    ...operationBase("StartEvent_Timer"),
    kind: SemanticOperationKind.InitiateTimer,
    timer: { durationMs: 1000 },
    outputs: ["place:Flow_A", "place:Flow_B"],
  } as const satisfies InitiateTimerOperation;
  const placeIds = new Set(genericOperation.outputs);
  assert.equal(
    isWellFormedInitiateTimerOperation(genericOperation, placeIds),
    true,
  );
  assert.equal(
    profileAllowsProgramShape(
      TimerStartCheckpointProfileId,
      timerProgram.operations.map((operation) =>
        operation.kind === SemanticOperationKind.InitiateTimer
          ? genericOperation
          : operation
      ),
      1,
    ),
    false,
  );

  for (const mutation of [
    { ...genericOperation, outputs: [] },
    { ...genericOperation, outputs: ["place:Flow_A", "place:Flow_A"] },
    { ...genericOperation, outputs: ["place:Flow_B", "place:Flow_A"] },
    { ...genericOperation, timer: { durationMs: 999 } },
    { ...genericOperation, input: "place:Flow_A" },
    { ...genericOperation, scheduleId: "Schedule_1" },
  ]) {
    assert.equal(
      isWellFormedInitiateTimerOperation(mutation, placeIds),
      false,
    );
  }
});

test("admits the exact checked profile without registering its checkpoint ID", () => {
  const nodes = [
    {
      kind: CheckedNodeKind.TimerStartEvent,
      id: "StartEvent_Timer",
      durationLiteral: "PT1S",
    },
    {
      kind: CheckedNodeKind.UserTask,
      id: "UserTask_Review",
      name: "Review order",
    },
    { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
  ] as const satisfies ReadonlyArray<CheckedNode>;
  assert.equal(
    profileAllowsCheckedProcessShape(TimerStartCheckpointProfileId, nodes, 1),
    true,
  );
  const wrongDuration = {
    ...nodes[0],
    durationLiteral: "PT2S",
  } as unknown as CheckedNode;
  assert.equal(
    profileAllowsCheckedProcessShape(
      TimerStartCheckpointProfileId,
      [wrongDuration, ...nodes.slice(1)],
      1,
    ),
    false,
  );
  assert.deepEqual(
    semanticGraphPolicyForProfile(TimerStartCheckpointProfileId),
    { kind: SemanticGraphPolicyKind.Acyclic },
  );
  assert.equal(
    new Set<string>(Object.values(SemanticProfileId)).has(
      TimerStartCheckpointProfileId,
    ),
    false,
  );
});

test("strictly validates Timer Start stimulus identity and first-only sequencing", () => {
  assert.equal(isWellFormedStimulus(timerTrigger), true);
  assert.equal(stimulusCommandId(timerTrigger), timerTrigger.commandId);
  assert.equal(sameStimulus(timerTrigger, { ...timerTrigger }), true);
  assert.equal(
    sameStimulus(timerTrigger, { ...timerTrigger, startEventId: "OtherStart" }),
    false,
  );
  assert.equal(isWellFormedStimulus({ ...timerTrigger, dueTimeMs: 1000 }), false);
  assert.equal(isWellFormedStimulus({ ...timerTrigger, startEventId: "" }), false);

  const scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: "timer-start-profile",
    profile: TimerStartCheckpointProfileId,
    bpmn: {
      id: timerProgram.identity.sourceId,
      relativePath: "timer-start.bpmn",
      sha256: timerProgram.identity.sourceSha256,
      sourceOverlay: null,
    },
    stimuli: [timerTrigger],
    observations: Object.values(ObservationRequestKind),
    provenance: {
      normativeRefs: [],
      cibRevision: "not-applicable",
      cibRefs: [],
    },
  } as const satisfies Scenario;
  assert.equal(supportsSemanticProcessScenario(scenario, timerProgram), true);
  for (const stimuli of [
    [noneStart],
    [messageTrigger],
    [timerTrigger, timerTrigger],
    [timerTrigger, noneStart],
  ] satisfies ReadonlyArray<ReadonlyArray<ProcessStartStimulus>>) {
    assert.equal(
      supportsSemanticProcessScenario({ ...scenario, stimuli }, timerProgram),
      false,
    );
  }
});

function replaceStart(
  source: SemanticProcessProgram,
  replacement: Readonly<{
    profile: string;
    processId: string;
    sourceId: string;
    sourceSha256: string;
    operation: SemanticProcessProgram["operations"][number];
  }>,
): SemanticProcessProgram {
  return rootScopedProgram({
    ...source,
    identity: {
      ...source.identity,
      semanticProfile: replacement.profile,
      sourceId: replacement.sourceId,
      sourceSha256: replacement.sourceSha256,
    },
    processId: replacement.processId,
    operations: source.operations.map((operation) =>
      operation.kind === SemanticOperationKind.InitiateTimer
        ? replacement.operation
        : operation
    ),
  });
}

function requireOperation<Kind extends SemanticOperationKind>(
  candidateProgram: SemanticProcessProgram,
  kind: Kind,
): Extract<SemanticProcessProgram["operations"][number], { kind: Kind }> {
  const operation = candidateProgram.operations.find(
    (candidate): candidate is Extract<
      SemanticProcessProgram["operations"][number],
      { kind: Kind }
    > => candidate.kind === kind,
  );
  if (operation === undefined) {
    throw new TypeError(`Expected ${kind} operation`);
  }
  return operation;
}

function stateObservation(
  candidateProgram: SemanticProcessProgram,
  start: ProcessStartStimulus,
): StateObservation {
  const step = advanceScenario(candidateProgram, initialState, start);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Expected a committed start");
  }
  const observation = step.observations.find(
    ({ kind }) => kind === CanonicalObservationKind.State,
  );
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new TypeError("Expected a state observation");
  }
  return observation;
}

function normalizeSemanticInstanceIdentity(
  observation: StateObservation,
): StateObservation {
  return {
    ...observation,
    instanceId: "NormalizedInstance",
    openUserTasks: observation.openUserTasks.map((task) => ({
      ...task,
      id: normalizeOccurrenceId(task.id),
    })),
    openMessageSubscriptions: observation.openMessageSubscriptions.map(
      (subscription) => ({
        ...subscription,
        id: normalizeOccurrenceId(subscription.id),
      }),
    ),
    openTimers: observation.openTimers.map((timer) => ({
      ...timer,
      id: normalizeOccurrenceId(timer.id),
    })),
    openEffects: observation.openEffects.map((effect) => ({
      ...effect,
      id: normalizeOccurrenceId(effect.id),
    })),
    enabledInteractions: observation.enabledInteractions.map(
      normalizeEnabledInteraction,
    ),
  };
}

function normalizeEnabledInteraction(
  interaction: EnabledInteraction,
): EnabledInteraction {
  switch (interaction.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      return { ...interaction, taskId: normalizeOccurrenceId(interaction.taskId) };
    case StimulusKind.DeliverMessage:
      return {
        ...interaction,
        subscriptionId: normalizeOccurrenceId(interaction.subscriptionId),
      };
    default:
      return assertNever(interaction);
  }
}

function normalizeOccurrenceId(id: OccurrenceId): OccurrenceId {
  return { ...id, processInstanceId: "NormalizedInstance" };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported interaction: ${JSON.stringify(value)}`);
}
