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
    state: FixtureRecord & Readonly<{ variables: readonly unknown[] }>;
  }>;
  pageBody: FixtureRecord;
  processInstanceId: string;
}>;

/** Builds strict public pages for the conditional Alpha UI without adding host-private facts. */
export function muePreviewAlphaExecutionPage(
  base: MuePreviewAlphaFixtureBase,
  journey: AlphaFixtureJourney,
  requestCount: number,
): Record<string, unknown> {
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
  const reviewId = occurrenceId(base, "UserTask_Review", 2);
  const timerId = occurrenceId(base, "BoundaryTimer_Review", 1);
  const escalationId = occurrenceId(base, "UserTask_Escalation", 1);
  // The canonical state orders open waits by occurrence: element identifier first, then activation.
  const running = {
    revision: 5,
    state: {
      ...base.current.state,
      openWaits: [
        timerWait(timerId),
        userTaskWait(reviewId, "Review item", [{
          name: "DataInput_CurrentItem",
          value: { kind: "string", value: "invoice" },
        }]),
      ],
    },
  } as const;
  const naturalCompletionBatch = completionBatch(
    "complete-review-receipt-alpha",
    5,
    6,
    "UserTask_Review",
  );
  const naturalTerminal = {
    revision: 6,
    state: {
      ...running.state,
      status: "completed",
      openWaits: [],
      variables: [{
        name: "DataObjectReference_OutputResults",
        value: { kind: "stringList", value: ["accepted", "flagged", "archived"] },
      }, ...base.current.state.variables],
    },
  } as const;
  const timerFiringBatch = {
    commandId: "fire-timer-alpha",
    fromRevision: 5,
    throughRevision: 6,
    transitions: [{
      revision: 6,
      role: { kind: "input", input: "timerFire" },
      element: timerId.elementId,
      sourceType: "boundaryEvent",
      owner: 0,
    }],
  } as const;
  const interrupted = {
    revision: 6,
    state: {
      ...running.state,
      openWaits: [userTaskWait(escalationId, "Handle interrupted review", [])],
      logicalTimeMs: 5_000,
    },
  } as const;
  const escalationCompletionBatch = completionBatch(
    "complete-escalation-alpha",
    6,
    7,
    escalationId.elementId,
  );
  const interruptedTerminal = {
    revision: 7,
    state: {
      ...interrupted.state,
      status: "completed",
      openWaits: [],
      variables: base.current.state.variables,
    },
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

function occurrenceId(base: MuePreviewAlphaFixtureBase, elementId: string, activation: number) {
  return { processInstanceId: base.processInstanceId, elementId, activation } as const;
}

type OccurrenceId = ReturnType<typeof occurrenceId>;

function timerWait(id: OccurrenceId) {
  return {
    id,
    definition: null,
    input: "timerFire",
    detail: { kind: "timer", deadlineMs: 5_000, recurrence: null },
  } as const;
}

function userTaskWait(id: OccurrenceId, name: string, inputs: readonly unknown[]) {
  return {
    id,
    definition: null,
    input: "command",
    detail: {
      kind: "userTask",
      name,
      assignee: null,
      candidateUsers: [],
      candidateGroups: [],
      formKey: null,
      formFields: [],
      dueDate: null,
      followUpDate: null,
      priority: null,
      inputs,
    },
  } as const;
}

function completionBatch(
  commandId: string,
  fromRevision: number,
  throughRevision: number,
  element: string,
) {
  return {
    commandId,
    fromRevision,
    throughRevision,
    transitions: [{
      revision: throughRevision,
      role: { kind: "input", input: "command" },
      element,
      sourceType: "userTask",
      owner: 0,
    }],
  } as const;
}

function interruptedPage(
  base: MuePreviewAlphaFixtureBase,
  fixtures: ReturnType<typeof buildFixtures>,
  terminal: boolean,
): Record<string, unknown> {
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
