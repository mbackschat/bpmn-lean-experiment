export const AlphaFixtureJourney = {
  Interrupted: "interrupted",
  Natural: "natural",
  Running: "running",
} as const;

export type AlphaFixtureJourney =
  typeof AlphaFixtureJourney[keyof typeof AlphaFixtureJourney];

type FixtureRecord = Readonly<Record<string, unknown>>;

export type MuePreviewAlphaFixtureBase = Readonly<{
  batch: FixtureRecord;
  current: FixtureRecord & Readonly<{
    controlTokens: readonly unknown[];
    scopes: readonly unknown[];
    state: FixtureRecord & Readonly<{ variables: readonly unknown[] }>;
  }>;
  emptyDelta: FixtureRecord;
  pageBody: FixtureRecord;
  processInstanceId: string;
}>;

/** Builds strict public pages for the conditional Alpha UI without adding host-private facts. */
export function muePreviewAlphaExecutionPage(
  base: MuePreviewAlphaFixtureBase,
  journey: AlphaFixtureJourney,
  requestCount: number,
): unknown {
  const fixtures = buildFixtures(base);
  if (requestCount === 1 || journey === AlphaFixtureJourney.Running) {
    return structuredClone({
      ...base.pageBody,
      current: fixtures.running,
    });
  }
  switch (journey) {
    case AlphaFixtureJourney.Natural:
      return structuredClone({
        ...base.pageBody,
        pageThroughRevision: 6,
        headRevision: 6,
        batches: [base.batch, fixtures.naturalCompletionBatch],
        current: fixtures.naturalTerminal,
      });
    case AlphaFixtureJourney.Interrupted:
      return interruptedPage(base, fixtures, requestCount >= 4);
  }
}

function buildFixtures(base: MuePreviewAlphaFixtureBase) {
  const taskId = {
    processInstanceId: base.processInstanceId,
    elementId: "UserTask_Review",
    activation: 2,
  } as const;
  const timerId = {
    processInstanceId: base.processInstanceId,
    elementId: "BoundaryTimer_Review",
    activation: 1,
  } as const;
  const running = {
    ...base.current,
    state: {
      ...base.current.state,
      activeWaits: [{
        elementId: taskId.elementId,
        kind: "userTask",
        multiplicity: 1,
      }, {
        elementId: timerId.elementId,
        kind: "timer",
        multiplicity: 1,
      }],
      openUserTasks: [{ id: taskId, name: "Review item", state: "active" }],
      openTimers: [{ id: timerId, deadlineMs: 5_000 }],
      openMultiInstances: [{
        id: {
          processInstanceId: base.processInstanceId,
          activityElementId: taskId.elementId,
          activation: 1,
        },
        mode: "sequential",
        plannedInstanceCount: 3,
        pendingItemCount: 1,
        numberOfInstances: 2,
        numberOfActiveInstances: 1,
        numberOfCompletedInstances: 1,
        numberOfTerminatedInstances: 0,
        activeIterations: [{
          loopCounter: 1,
          taskId,
          taskInput: {
            name: "DataInput_CurrentItem",
            value: { kind: "string", value: "invoice" },
          },
          completionBindingName: "DataOutput_CurrentResult",
        }],
      }],
      enabledInteractions: [{ kind: "completeUserTaskInstance", taskId }],
    },
  } as const;
  const naturalCompletionBatch = completionBatch(
    base,
    "complete-review-receipt-alpha",
    taskId,
    5,
    6,
    [{
      name: "DataOutput_CurrentResult",
      value: { kind: "string", value: "archived" },
    }],
  );
  const naturalTerminal = {
    revision: 6,
    state: {
      ...running.state,
      status: "completed",
      activeWaits: [],
      openUserTasks: [],
      openTimers: [],
      openMultiInstances: [],
      variables: [{
        name: "DataObjectReference_OutputResults",
        value: { kind: "stringList", value: ["accepted", "flagged", "archived"] },
      }, ...base.current.state.variables],
      enabledInteractions: [],
    },
    controlTokens: [],
    scopes: [],
  } as const;
  const timerFiringBatch = {
    commandId: "fire-timer-alpha",
    fromRevision: 5,
    throughRevision: 6,
    transitions: [{
      revision: 6,
      logicalTimeMs: 5_000,
      transition: {
        kind: "externalStimulus",
        stimulus: {
          kind: "fireTimer",
          commandId: "fire-timer-alpha",
          timerId,
          logicalTimeMs: 5_000,
        },
      },
      positionDelta: base.emptyDelta,
    }],
  } as const;
  const escalationTaskId = {
    processInstanceId: base.processInstanceId,
    elementId: "UserTask_Escalation",
    activation: 1,
  } as const;
  const interrupted = {
    ...running,
    revision: 6,
    state: {
      ...running.state,
      activeWaits: [{
        elementId: escalationTaskId.elementId,
        kind: "userTask",
        multiplicity: 1,
      }],
      openUserTasks: [{
        id: escalationTaskId,
        name: "Handle interrupted review",
        state: "active",
      }],
      openTimers: [],
      openMultiInstances: [],
      enabledInteractions: [{
        kind: "completeUserTaskInstance",
        taskId: escalationTaskId,
      }],
      logicalTimeMs: 5_000,
    },
  } as const;
  const escalationCompletionBatch = completionBatch(
    base,
    "complete-escalation-alpha",
    escalationTaskId,
    6,
    7,
    [],
  );
  const interruptedTerminal = {
    revision: 7,
    state: {
      ...interrupted.state,
      status: "completed",
      activeWaits: [],
      openUserTasks: [],
      openMultiInstances: [],
      variables: base.current.state.variables,
      enabledInteractions: [],
    },
    controlTokens: [],
    scopes: [],
  } as const;
  return {
    running,
    naturalCompletionBatch,
    naturalTerminal,
    timerFiringBatch,
    interrupted,
    escalationCompletionBatch,
    interruptedTerminal,
  } as const;
}

function completionBatch(
  base: MuePreviewAlphaFixtureBase,
  commandId: string,
  taskId: FixtureRecord,
  fromRevision: number,
  throughRevision: number,
  submittedValues: readonly unknown[],
) {
  return {
    commandId,
    fromRevision,
    throughRevision,
    transitions: [{
      revision: throughRevision,
      logicalTimeMs: throughRevision === 7 ? 5_000 : 0,
      transition: {
        kind: "externalStimulus",
        stimulus: {
          kind: "completeUserTaskInstance",
          commandId,
          taskId,
          submittedValues,
        },
      },
      positionDelta: {
        consumedTokens: base.current.controlTokens,
        producedTokens: [],
        enteredScopes: [],
        exitedScopes: base.current.scopes,
      },
    }],
  } as const;
}

function interruptedPage(
  base: MuePreviewAlphaFixtureBase,
  fixtures: ReturnType<typeof buildFixtures>,
  terminal: boolean,
): unknown {
  return structuredClone(terminal ? {
    ...base.pageBody,
    pageThroughRevision: 7,
    headRevision: 7,
    batches: [base.batch, fixtures.timerFiringBatch, fixtures.escalationCompletionBatch],
    current: fixtures.interruptedTerminal,
  } : {
    ...base.pageBody,
    pageThroughRevision: 6,
    headRevision: 6,
    batches: [base.batch, fixtures.timerFiringBatch],
    current: fixtures.interrupted,
  });
}
