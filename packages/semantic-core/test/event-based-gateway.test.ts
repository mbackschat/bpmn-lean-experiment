import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  Scenario,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { stateObservationAt } from "./canonical-observations.ts";
import {
  eventRaceProgram,
  eventRaceStart,
  messageDelivery,
  taskCompletion,
  timerFiring,
} from "./event-based-gateway-fixture.ts";

test("arms both complete waits atomically in exactly two start steps", () => {
  assert.equal(isWellFormedSemanticProcessProgram(eventRaceProgram), true);
  const exact = applyStimulus(eventRaceProgram, initialState, eventRaceStart, 2);
  const short = applyStimulus(eventRaceProgram, initialState, eventRaceStart, 1);

  assert.equal(exact.outcome, CommandOutcome.Committed);
  assert.equal(exact.internalStepBoundExceeded, false);
  assert.equal(short.internalStepBoundExceeded, true);
  assert.deepEqual(short.state.eventRaces, []);
  assert.deepEqual(exact.state.eventRaces, [{
    id: {
      processInstanceId: "event-race-instance",
      elementId: "Race",
      activation: 1,
    },
    owner: {
      processInstanceId: "event-race-instance",
      definitionScopeId: "scope:Process_EventRace",
      activation: 1,
    },
    messageSubscriptionId: {
      processInstanceId: "event-race-instance",
      elementId: "MessageCatch",
      activation: 1,
    },
    timerOccurrenceId: {
      processInstanceId: "event-race-instance",
      elementId: "TimerCatch",
      activation: 1,
    },
  }]);
  assert.deepEqual(exact.state.messageActivations, [{ elementId: "MessageCatch", count: 1 }]);
  assert.deepEqual(exact.state.timerActivations, [{ elementId: "TimerCatch", count: 1 }]);
  assert.deepEqual(exact.state.eventRaceActivations, [{ elementId: "Race", count: 1 }]);
});

test("projects the two existing public wait surfaces without exposing the race record", () => {
  const scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: "event-race-observation",
    profile: eventRaceProgram.identity.semanticProfile,
    bpmn: {
      id: eventRaceProgram.identity.sourceId,
      relativePath: "test-only/event-race.bpmn",
      sha256: eventRaceProgram.identity.sourceSha256,
      sourceOverlay: null,
    },
    stimuli: [eventRaceStart],
    observations: Object.values(ObservationRequestKind),
    provenance: {
      normativeRefs: ["BPMN 2.0.2 Clause 10.6.6"],
      cibRevision: "not-applicable",
      cibRefs: [],
    },
  } as const satisfies Scenario;
  const observation = stateObservationAt(runScenario(scenario, eventRaceProgram).trace, 2);

  assert.deepEqual(observation.activeWaits, [
    { elementId: "MessageCatch", kind: "message", multiplicity: 1 },
    { elementId: "TimerCatch", kind: "timer", multiplicity: 1 },
  ]);
  assert.equal(observation.openMessageSubscriptions.length, 1);
  assert.deepEqual(observation.openTimers, [{
    id: {
      processInstanceId: "event-race-instance",
      elementId: "TimerCatch",
      activation: 1,
    },
    deadlineMs: 1000,
  }]);
  assert.deepEqual(observation.enabledInteractions.map(({ kind }) => kind), [StimulusKind.DeliverMessage]);
  assert.equal(Object.hasOwn(observation, "eventRaces"), false);
});

test("commits Message first, withdraws Timer, and rejects the stale Timer exactly", () => {
  const armed = applyStimulus(eventRaceProgram, initialState, eventRaceStart).state;
  const won = applyStimulus(eventRaceProgram, armed, messageDelivery());
  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.userTaskWaits.map(({ id }) => id.elementId), ["MessageTask"]);
  assert.deepEqual(won.state.messageWaits, []);
  assert.deepEqual(won.state.timerWaits, []);
  assert.deepEqual(won.state.eventRaces, []);
  assert.equal(won.state.logicalTimeMs, 0);

  const stale = applyStimulus(eventRaceProgram, won.state, timerFiring("stale-timer"));
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, won.state);
  const completed = applyStimulus(eventRaceProgram, won.state, taskCompletion("MessageTask"));
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
});

test("commits Timer first, withdraws Message, and rejects the stale Message exactly", () => {
  const armed = applyStimulus(eventRaceProgram, initialState, eventRaceStart).state;
  const won = applyStimulus(eventRaceProgram, armed, timerFiring());
  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.userTaskWaits.map(({ id }) => id.elementId), ["TimerTask"]);
  assert.deepEqual(won.state.messageWaits, []);
  assert.deepEqual(won.state.timerWaits, []);
  assert.deepEqual(won.state.eventRaces, []);
  assert.equal(won.state.logicalTimeMs, 1000);

  const stale = applyStimulus(eventRaceProgram, won.state, messageDelivery("stale-message"));
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, won.state);
  const completed = applyStimulus(eventRaceProgram, won.state, taskCompletion("TimerTask"));
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
});

test("preserves the armed state for wrong identity, channel, deadline, and incomplete records", () => {
  const armed = applyStimulus(eventRaceProgram, initialState, eventRaceStart).state;
  const wrongMessage = {
    ...messageDelivery("wrong-message"),
    channel: { ...messageDelivery().channel, messageId: "Other" },
  };
  const wrongMessageOccurrence = {
    ...messageDelivery("wrong-message-occurrence"),
    subscriptionId: {
      ...messageDelivery().subscriptionId,
      activation: 2,
    },
  };
  const wrongTimer = { ...timerFiring("wrong-timer"), logicalTimeMs: 999 };
  const wrongTimerOccurrence = {
    ...timerFiring("wrong-timer-occurrence"),
    timerId: {
      ...timerFiring().timerId,
      activation: 2,
    },
  };
  for (const stimulus of [
    wrongMessage,
    wrongMessageOccurrence,
    wrongTimer,
    wrongTimerOccurrence,
  ]) {
    const result = applyStimulus(eventRaceProgram, armed, stimulus);
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, armed);
  }

  const incomplete = { ...armed, messageWaits: [] };
  assert.equal(isStableStateResumable(incomplete), false);
  assert.equal(isStableStateResumable({ ...incomplete, timerWaits: [] }), false);
  const result = applyStimulus(eventRaceProgram, incomplete, timerFiring("incomplete"));
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, incomplete);
  const missingRecord = { ...armed, eventRaces: [] };
  const unbound = applyStimulus(eventRaceProgram, missingRecord, timerFiring("unbound"));
  assert.equal(unbound.outcome, CommandOutcome.Rejected);
  assert.deepEqual(unbound.state, missingRecord);

  const race = armed.eventRaces[0];
  assert.ok(race !== undefined);
  const ambiguous = {
    ...armed,
    eventRaces: [
      race,
      { ...race, id: { ...race.id, activation: 2 } },
    ],
  };
  assert.equal(isStableStateResumable(ambiguous), false);
  const ambiguousResult = applyStimulus(
    eventRaceProgram,
    ambiguous,
    messageDelivery("ambiguous-association"),
  );
  assert.equal(ambiguousResult.outcome, CommandOutcome.Rejected);
  assert.deepEqual(ambiguousResult.state, ambiguous);
});

test("blocks scope quiescence around a hidden race and rejects malformed operation associations", () => {
  const armed = applyStimulus(eventRaceProgram, initialState, eventRaceStart).state;
  const completion = eventRaceProgram.operations.find(
    (operation) => operation.kind === SemanticOperationKind.CompleteScope,
  );
  assert.ok(completion?.kind === SemanticOperationKind.CompleteScope);
  const hiddenOnly = {
    ...armed,
    messageWaits: [],
    timerWaits: [],
  };
  assert.equal(applyInternalOperation(eventRaceProgram, completion, hiddenOnly), null);

  const race = eventRaceProgram.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitEventRace,
  );
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);
  const mutations: SemanticProcessProgram[] = [
    {
      ...eventRaceProgram,
      operations: eventRaceProgram.operations.map((operation) =>
        operation === race
          ? { ...race, message: { ...race.message, configurationOrigin: race.timer.configurationOrigin } }
          : operation
      ),
    },
    {
      ...eventRaceProgram,
      operations: eventRaceProgram.operations.map((operation) =>
        operation === race
          ? { ...race, timer: { ...race.timer, output: race.message.output } }
          : operation
      ),
    },
    {
      ...eventRaceProgram,
      operations: eventRaceProgram.operations.map((operation) =>
        operation === race
          ? {
              ...race,
              timer: {
                ...race.timer,
                configurationOrigin: {
                  ...race.timer.configurationOrigin,
                  elementId: "Flow_Start",
                },
              },
            }
          : operation
      ),
    },
  ];
  for (const mutation of mutations) {
    assert.equal(isWellFormedSemanticProcessProgram(mutation), false);
  }
});

test("binds each winner to one exact race definition and its paired live members", () => {
  const armed = applyStimulus(eventRaceProgram, initialState, eventRaceStart).state;
  const race = eventRaceProgram.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitEventRace,
  );
  const messageWait = armed.messageWaits[0];
  const timerWait = armed.timerWaits[0];
  const eventRace = armed.eventRaces[0];
  assert.ok(
    race?.kind === SemanticOperationKind.AwaitEventRace &&
      messageWait !== undefined &&
      timerWait !== undefined &&
      eventRace !== undefined,
  );

  const swappedLiveOutputs = {
    ...armed,
    messageWaits: [{ ...messageWait, output: timerWait.output }],
    timerWaits: [{ ...timerWait, output: messageWait.output }],
  };
  const swappedDefinition = {
    ...eventRaceProgram,
    operations: eventRaceProgram.operations.map((operation) =>
      operation === race
        ? {
            ...race,
            message: { ...race.message, output: race.timer.output },
            timer: { ...race.timer, output: race.message.output },
          }
        : operation
    ),
  };
  const duplicateDefinition = {
    ...eventRaceProgram,
    operations: [
      ...eventRaceProgram.operations,
      {
        ...race,
        id: `${race.id}:duplicate`,
        message: { ...race.message, output: race.timer.output },
      },
    ],
  };
  const wrongRaceOccurrence = {
    ...armed,
    eventRaces: [{
      ...eventRace,
      id: { ...eventRace.id, processInstanceId: "other-instance" },
    }],
  };

  for (const [program, state] of [
    [eventRaceProgram, swappedLiveOutputs],
    [swappedDefinition, armed],
    [duplicateDefinition, armed],
    [eventRaceProgram, wrongRaceOccurrence],
  ] as const) {
    for (const stimulus of [messageDelivery(), timerFiring()]) {
      const result = applyStimulus(program, state, stimulus);
      assert.equal(result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(result.state, state);
    }
  }
});

test("owner interruption removes the race and both members while retaining counters", () => {
  const armed = applyStimulus(eventRaceProgram, initialState, eventRaceStart).state;
  const root = armed.scopeOccurrences[0];
  assert.ok(root !== undefined);
  const child = {
    processInstanceId: "event-race-instance",
    definitionScopeId: "scope:child",
    activation: 1,
  };
  const race = armed.eventRaces[0];
  const message = armed.messageWaits[0];
  const timer = armed.timerWaits[0];
  assert.ok(race !== undefined && message !== undefined && timer !== undefined);
  const operation = {
    id: "operation:ErrorEnd",
    kind: SemanticOperationKind.ThrowError,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "ErrorEnd" },
    input: "place:ErrorInput",
    error: { errorDefinitionId: "ErrorDefinition", errorElementId: "Error", code: "E" },
    handler: {
      attachedScopeId: child.definitionScopeId,
      code: "E",
      output: "place:Handled",
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        boundaryEventId: "Boundary",
        errorDefinitionId: "ErrorDefinition",
        errorElementId: "Error",
        sequenceFlowId: "Handled",
      },
    },
  } as const satisfies SemanticOperation;
  const interrupted = applyInternalOperation(eventRaceProgram, operation, {
    ...armed,
    scopeOccurrences: [root, { id: child, parent: root.id }],
    controlTokens: [{ placeId: "place:ErrorInput", owner: child, multiplicity: 1 }],
    messageWaits: [{ ...message, owner: child }],
    timerWaits: [{ ...timer, owner: child }],
    eventRaces: [{ ...race, owner: child }],
  });

  assert.deepEqual(interrupted?.messageWaits, []);
  assert.deepEqual(interrupted?.timerWaits, []);
  assert.deepEqual(interrupted?.eventRaces, []);
  assert.deepEqual(interrupted?.messageActivations, armed.messageActivations);
  assert.deepEqual(interrupted?.timerActivations, armed.timerActivations);
  assert.deepEqual(interrupted?.eventRaceActivations, armed.eventRaceActivations);
});
