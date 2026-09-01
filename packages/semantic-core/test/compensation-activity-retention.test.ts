import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  CompensationCompletionFactKind,
  CompensationRetentionCapacityMeasure,
  CompensationRetentionProgramDefect,
  CompensationRetentionRefusalKind,
  CompensationRetentionResultKind,
  CompensationRetentionStateDefect,
  ControlStateKind,
  InternalSchedulingMode,
  MessageChannelKind,
  MultiInstanceCompensationCompletionOutcome,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  applyInternalOperation,
  applyStimulus,
  canonicalCompensationRecordsUtf8Bytes,
  compensationRetentionProgramDefects,
  compensationRetentionStateDefects,
  initialState,
  isCompensationActivityRetentionDeclaration,
  isWellFormedSemanticProcessProgram,
  retainCompletedCompensableActivity,
  runtimeStateDefects,
  type CompensationCompletionFacts,
  type RuntimeState,
  type SemanticOperation,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  multiInstanceFacts,
  programForTarget,
  requireOperation,
  startFixture,
  stateForTarget,
  withLimits,
} from "./compensation-activity-retention-fixtures.ts";

const activityElementId = "Task_é\"";

const program: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "compensation-retention-test",
    sourceId: "Process_Retention",
    sourceSha256: "0".repeat(64),
    sourceOverlay: null,
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId: "Process_Retention",
  definitionScopes: [{
    id: "Scope_Root",
    parentScopeId: null,
    originElementId: "Process_Retention",
  }],
  operationScopes: [
    { operationId: "Complete_Root", scopeId: "Scope_Root" },
    { operationId: "End", scopeId: "Scope_Root" },
    { operationId: "Initiate", scopeId: "Scope_Root" },
    { operationId: "Wait_Eligible", scopeId: "Scope_Root" },
  ],
  controlPlaceScopes: [
    { controlPlaceId: "Flow_End", scopeId: "Scope_Root" },
    { controlPlaceId: "Flow_Start", scopeId: "Scope_Root" },
  ],
  controlPlaces: [
    {
      id: "Flow_End",
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_End" },
    },
    {
      id: "Flow_Start",
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_Start" },
    },
  ],
  operations: [
    {
      id: "Complete_Root",
      kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Process_Retention" },
      scopeId: "Scope_Root",
      parentOutput: null,
    },
    {
      id: "End",
      kind: SemanticOperationKind.ReachNoneEnd,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End" },
      input: "Flow_End",
    },
    {
      id: "Initiate",
      kind: SemanticOperationKind.Initiate,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Start" },
      output: "Flow_Start",
    },
    {
      id: "Wait_Eligible",
      kind: SemanticOperationKind.AwaitUserTask,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: activityElementId },
      input: "Flow_Start",
      output: "Flow_End",
      task: { elementId: activityElementId, name: null },
    },
  ],
  compensationActivityRetention: {
    definitionScopeId: "Scope_Root",
    targets: [{
      activityElementId,
      boundaryEventElementId: "Boundary_Compensate",
      compensationActivityElementId: "Task_Undo",
    }],
    limits: { maxRecords: 2, maxCanonicalBytes: 65_536 },
  },
};

const activity = {
  processInstanceId: "Instance_é\"",
  activityElementId,
  activation: 1,
};

const facts: CompensationCompletionFacts = {
  kind: CompensationCompletionFactKind.OrdinaryUserTask,
  activity,
};

const state: RuntimeState = {
  control: { kind: ControlStateKind.Running, instanceId: activity.processInstanceId },
  initiationPending: false,
  scopeOccurrences: [{
    id: {
      processInstanceId: activity.processInstanceId,
      definitionScopeId: "Scope_Root",
      activation: 1,
    },
    parent: null,
  }],
  controlTokens: [],
  userTaskWaits: [],
  messageWaits: [],
  timerWaits: [],
  effectWaits: [],
  effectIncidents: [],
  selectedBranchSets: [],
  eventRaces: [],
  calledProcessOccurrences: [],
  activityOccurrences: [],
  compensationActivityRetentions: [{
    owner: {
      processInstanceId: activity.processInstanceId,
      definitionScopeId: "Scope_Root",
      activation: 1,
    },
    nextCompletionOrdinal: 1,
    records: [],
  }],
  variables: { process: { bindings: [] }, activities: [] },
  taskActivations: [],
  messageActivations: [],
  timerActivations: [],
  eventRaceActivations: [],
  callActivations: [],
  effectActivations: [],
  scopeActivations: [{ elementId: "Scope_Root", count: 1 }],
  activityActivations: [],
  endOccurrences: 0,
  logicalTimeMs: 0,
};

const retentionDeclaration = program.compensationActivityRetention;
if (retentionDeclaration === undefined) {
  throw new TypeError("the retention fixture must declare compensation retention");
}
const retentionTarget = retentionDeclaration.targets[0];
if (retentionTarget === undefined) {
  throw new TypeError("the retention fixture must declare one target");
}

test("refuses an escaped and non-ASCII identity at one byte over the exact canonical limit", () => {
  const unlimited = retainCompletedCompensableActivity(program, state, facts);
  assert.equal(unlimited.kind, CompensationRetentionResultKind.Retained);
  if (unlimited.kind !== CompensationRetentionResultKind.Retained) return;

  const observed = canonicalCompensationRecordsUtf8Bytes(
    unlimited.state.compensationActivityRetentions?.[0]?.records ?? [],
  );
  const boundedProgram = {
    ...program,
    compensationActivityRetention: {
      ...retentionDeclaration,
      limits: {
        ...retentionDeclaration.limits,
        maxRecords: 2,
        maxCanonicalBytes: observed - 1,
      },
    },
  } satisfies SemanticProcessProgram;
  const refused = retainCompletedCompensableActivity(boundedProgram, state, facts);

  assert.equal(refused.kind, CompensationRetentionResultKind.Refused);
  assert.equal(refused.state, state);
  if (refused.kind !== CompensationRetentionResultKind.Refused) return;
  assert.deepEqual(refused.refusal, {
    kind: CompensationRetentionRefusalKind.CapacityExceeded,
    measure: CompensationRetentionCapacityMeasure.CanonicalBytes,
    configuredBound: observed - 1,
    observedValue: observed,
  });
});

test("accepts exact-fit bytes and refuses duplicate and count overflow without allocating state", () => {
  const first = retainCompletedCompensableActivity(program, state, facts);
  assert.equal(first.kind, CompensationRetentionResultKind.Retained);
  if (first.kind !== CompensationRetentionResultKind.Retained) return;
  const exactBytes = canonicalCompensationRecordsUtf8Bytes(
    first.state.compensationActivityRetentions?.[0]?.records ?? [],
  );
  const exactFit = retainCompletedCompensableActivity(
    withLimits(program, { maxRecords: 1, maxCanonicalBytes: exactBytes }),
    state,
    facts,
  );
  assert.equal(exactFit.kind, CompensationRetentionResultKind.Retained);

  const duplicate = retainCompletedCompensableActivity(program, first.state, facts);
  assert.equal(duplicate.kind, CompensationRetentionResultKind.Refused);
  assert.equal(duplicate.state, first.state);
  if (duplicate.kind !== CompensationRetentionResultKind.Refused) return;
  assert.deepEqual(duplicate.refusal, {
    kind: CompensationRetentionRefusalKind.DuplicateActivity,
  });

  const secondFacts: CompensationCompletionFacts = {
    ...facts,
    activity: { ...activity, activation: 2 },
  };
  const countRefused = retainCompletedCompensableActivity(
    withLimits(program, { maxRecords: 1, maxCanonicalBytes: 65_536 }),
    first.state,
    secondFacts,
  );
  assert.equal(countRefused.kind, CompensationRetentionResultKind.Refused);
  assert.equal(countRefused.state, first.state);
  if (countRefused.kind !== CompensationRetentionResultKind.Refused) return;
  assert.deepEqual(countRefused.refusal, {
    kind: CompensationRetentionRefusalKind.CapacityExceeded,
    measure: CompensationRetentionCapacityMeasure.Records,
    configuredBound: 1,
    observedValue: 2,
  });
});

test("retains only explicitly targeted exact operation families", () => {
  const handlerFreeFacts: CompensationCompletionFacts = {
    kind: CompensationCompletionFactKind.OrdinaryUserTask,
    activity: { ...activity, activityElementId: "Task_HandlerFree" },
  };
  const handlerFree = retainCompletedCompensableActivity(
    program,
    state,
    handlerFreeFacts,
  );
  assert.equal(handlerFree.kind, CompensationRetentionResultKind.Refused);
  assert.equal(handlerFree.state, state);
  if (handlerFree.kind === CompensationRetentionResultKind.Refused) {
    assert.deepEqual(handlerFree.refusal, {
      kind: CompensationRetentionRefusalKind.TargetAbsent,
    });
  }

  const wrongScope = retainCompletedCompensableActivity(program, state, {
    ...facts,
    activity: { ...activity, processInstanceId: "Instance_Other" },
  });
  assert.equal(wrongScope.kind, CompensationRetentionResultKind.Refused);
  assert.equal(wrongScope.state, state);
  if (wrongScope.kind === CompensationRetentionResultKind.Refused) {
    assert.deepEqual(wrongScope.refusal, {
      kind: CompensationRetentionRefusalKind.RetentionStateMismatch,
    });
  }

  const excluded = programForTarget(
    program,
    retentionDeclaration,
    SemanticOperationKind.AwaitDataInputUserTask,
    "Task_DataInput",
  );
  assert.ok(
    compensationRetentionProgramDefects(excluded).includes(
      CompensationRetentionProgramDefect.TargetOperationMismatch,
    ),
  );
  const mismatchedOrigin = {
    ...program,
    operations: program.operations.map((operation) =>
      operation.id === "Wait_Eligible"
        ? {
            ...operation,
            origin: {
              ...operation.origin,
              elementId: "Task_OtherOrigin",
            },
          }
        : operation
    ),
  } satisfies SemanticProcessProgram;
  assert.ok(
    compensationRetentionProgramDefects(mismatchedOrigin).includes(
      CompensationRetentionProgramDefect.TargetOperationMismatch,
    ),
  );
});

test("closes the flat-root declaration, target ordering, uniqueness, and limits", () => {
  assert.deepEqual(compensationRetentionProgramDefects(program), []);
  const mutations: ReadonlyArray<readonly [
    SemanticProcessProgram,
    CompensationRetentionProgramDefect,
  ]> = [
    [
      {
        ...program,
        definitionScopes: [
          ...program.definitionScopes,
          { id: "Scope_Child", parentScopeId: "Scope_Root", originElementId: "Child" },
        ],
      },
      CompensationRetentionProgramDefect.InvalidRootScope,
    ],
    [
      withLimits(program, { maxRecords: 0, maxCanonicalBytes: 2 }),
      CompensationRetentionProgramDefect.InvalidLimits,
    ],
    [
      {
        ...program,
        compensationActivityRetention: { ...retentionDeclaration, targets: [] },
      },
      CompensationRetentionProgramDefect.EmptyTargets,
    ],
    [
      {
        ...program,
        compensationActivityRetention: {
          ...retentionDeclaration,
          targets: [{
            activityElementId,
            boundaryEventElementId: activityElementId,
            compensationActivityElementId: "Task_Undo",
          }],
        },
      },
      CompensationRetentionProgramDefect.InvalidTarget,
    ],
    [
      {
        ...program,
        compensationActivityRetention: {
          ...retentionDeclaration,
          targets: [
            retentionTarget,
            retentionTarget,
          ],
        },
      },
      CompensationRetentionProgramDefect.DuplicateActivityTarget,
    ],
    [
      {
        ...program,
        compensationActivityRetention: {
          ...retentionDeclaration,
          targets: [
            {
              activityElementId: "Task_z",
              boundaryEventElementId: "Boundary_z",
              compensationActivityElementId: "Undo_z",
            },
            {
              activityElementId: "Task_a",
              boundaryEventElementId: "Boundary_a",
              compensationActivityElementId: "Undo_a",
            },
          ],
        },
      },
      CompensationRetentionProgramDefect.UnorderedTargets,
    ],
    [
      {
        ...program,
        identity: {
          ...program.identity,
          semanticProfile: SemanticProfileId.ServiceTaskIncidentCancellation,
        },
      },
      CompensationRetentionProgramDefect.UnsupportedLifecycle,
    ],
    [
      {
        ...program,
        operations: [
          ...program.operations,
          {
            id: "Terminate_Root",
            kind: SemanticOperationKind.TerminateScope,
            origin: {
              kind: SemanticOriginKind.BpmnElement,
              elementId: "End_Terminate",
            },
            input: "Flow_End",
            scopeId: "Scope_Root",
          },
        ],
      },
      CompensationRetentionProgramDefect.UnsupportedLifecycle,
    ],
  ];
  for (const [mutation, expected] of mutations) {
    assert.ok(
      compensationRetentionProgramDefects(mutation).includes(expected),
      `${expected} must be reported`,
    );
  }
  const cancellationProgram = mutations[5]?.[0];
  assert.ok(cancellationProgram !== undefined);
  const refused = retainCompletedCompensableActivity(
    cancellationProgram,
    state,
    facts,
  );
  assert.equal(refused.kind, CompensationRetentionResultKind.Refused);
  assert.equal(refused.state, state);
  if (refused.kind === CompensationRetentionResultKind.Refused) {
    assert.deepEqual(refused.refusal, {
      kind: CompensationRetentionRefusalKind.InvalidProgram,
    });
  }
});

test("refuses malformed unknown declarations before semantic validation", () => {
  assert.equal(
    isCompensationActivityRetentionDeclaration(retentionDeclaration),
    true,
  );
  const malformed: ReadonlyArray<unknown> = [
    null,
    [],
    {},
    { ...retentionDeclaration, extra: true },
    { ...retentionDeclaration, definitionScopeId: "" },
    { ...retentionDeclaration, targets: [] },
    { ...retentionDeclaration, targets: [{ ...retentionTarget, extra: true }] },
    {
      ...retentionDeclaration,
      targets: [{ ...retentionTarget, activityElementId: "\ud800" }],
    },
    { ...retentionDeclaration, limits: { maxRecords: 1 } },
    { ...retentionDeclaration, limits: { ...retentionDeclaration.limits, extra: 1 } },
    { ...retentionDeclaration, limits: { maxRecords: 0, maxCanonicalBytes: 2 } },
    { ...retentionDeclaration, limits: { maxRecords: 1.5, maxCanonicalBytes: 2 } },
    { ...retentionDeclaration, limits: { maxRecords: 1, maxCanonicalBytes: 1 } },
    { ...retentionDeclaration, limits: { maxRecords: 1, maxCanonicalBytes: 65_537 } },
  ];
  for (const value of malformed) {
    assert.equal(isCompensationActivityRetentionDeclaration(value), false);
  }
});

test("the aggregate Program boundary admits only a structurally and semantically valid optional declaration", () => {
  const validProgram = startFixture(SemanticOperationKind.Initiate).startProgram;
  const declaration = validProgram.compensationActivityRetention;
  assert.ok(declaration !== undefined);
  assert.equal(isWellFormedSemanticProcessProgram(validProgram), true);
  assert.equal(
    isWellFormedSemanticProcessProgram({
      ...validProgram,
      compensationActivityRetention: { ...declaration, extra: true },
    }),
    false,
  );
  assert.equal(
    isWellFormedSemanticProcessProgram({
      ...validProgram,
      compensationActivityRetention: {
        ...declaration,
        targets: [{
          ...(declaration.targets[0] as NonNullable<typeof declaration.targets[0]>),
          activityElementId: "Task_Missing",
        }],
      },
    }),
    false,
  );
  const { compensationActivityRetention, ...legacyProgram } = validProgram;
  void compensationActivityRetention;
  assert.equal(isWellFormedSemanticProcessProgram(legacyProgram), true);
  assert.equal(
    isWellFormedSemanticProcessProgram({
      ...legacyProgram,
      compensationActivityRetention: undefined,
    }),
    false,
  );
});

test("refuses a handler-free completion without changing state", () => {
  const { compensationActivityRetention, ...handlerFreeProgram } = program;
  const { compensationActivityRetentions, ...handlerFreeState } = state;
  void compensationActivityRetention;
  void compensationActivityRetentions;
  const result = retainCompletedCompensableActivity(handlerFreeProgram, handlerFreeState, facts);
  assert.equal(result.kind, CompensationRetentionResultKind.Refused);
  if (result.kind !== CompensationRetentionResultKind.Refused) return;
  assert.equal(result.refusal.kind, CompensationRetentionRefusalKind.DeclarationAbsent);
  assert.equal(result.state, handlerFreeState);
});

test("classifies zero and one as all-success while larger early completion never retains", () => {
  for (const [kind, label] of [
    [SemanticOperationKind.AwaitSequentialMultiInstanceUserTask, "sequential"],
    [SemanticOperationKind.AwaitParallelMultiInstanceUserTask, "parallel"],
  ] as const) {
    const multiProgram = programForTarget(program, retentionDeclaration, kind, "Task_Multi");
    const multiState = stateForTarget(state, "Task_Multi");
    for (const [plannedInstances, labelSuffix] of [
      [0, "zero-item"],
      [1, "one-item-first"],
      [3, "positive all-success"],
    ] as const) {
      const retained = retainCompletedCompensableActivity(
        multiProgram,
        multiState,
        multiInstanceFacts(activity, plannedInstances, plannedInstances),
      );
      assert.equal(
        retained.kind,
        CompensationRetentionResultKind.Retained,
        `${label} ${labelSuffix}`,
      );
    }

    const early = retainCompletedCompensableActivity(
      multiProgram,
      multiState,
      multiInstanceFacts(
        activity,
        3,
        1,
        MultiInstanceCompensationCompletionOutcome.EarlyCompletion,
      ),
    );
    assert.equal(early.kind, CompensationRetentionResultKind.NotEligible);
    assert.equal(early.state, multiState);
    const interrupted = retainCompletedCompensableActivity(
      multiProgram,
      multiState,
      multiInstanceFacts(
        activity,
        3,
        1,
        MultiInstanceCompensationCompletionOutcome.Interrupted,
      ),
    );
    assert.equal(interrupted.kind, CompensationRetentionResultKind.NotEligible);
    assert.equal(interrupted.state, multiState);

    const malformedState: RuntimeState = {
      ...multiState,
      compensationActivityRetentions: [
        ...(multiState.compensationActivityRetentions ?? []),
        {
          owner: {
            processInstanceId: activity.processInstanceId,
            definitionScopeId: "Scope_Root",
            activation: 2,
          },
          nextCompletionOrdinal: 1,
          records: [],
        },
      ],
    };
    const malformedEarly = retainCompletedCompensableActivity(
      multiProgram,
      malformedState,
      multiInstanceFacts(
        activity,
        3,
        1,
        MultiInstanceCompensationCompletionOutcome.EarlyCompletion,
      ),
    );
    assert.equal(malformedEarly.kind, CompensationRetentionResultKind.Refused);
    assert.equal(malformedEarly.state, malformedState);
    if (malformedEarly.kind === CompensationRetentionResultKind.Refused) {
      assert.deepEqual(malformedEarly.refusal, {
        kind: CompensationRetentionRefusalKind.RetentionStateMismatch,
      });
    }
  }
});

test("refuses every malformed Multi-Instance count and outcome combination", () => {
  const multiProgram = programForTarget(
    program,
    retentionDeclaration,
    SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
    "Task_Multi",
  );
  const multiState = stateForTarget(state, "Task_Multi");
  const malformed = [
    multiInstanceFacts(
      activity,
      2,
      1,
      MultiInstanceCompensationCompletionOutcome.AllSuccessfulCompletion,
    ),
    multiInstanceFacts(
      activity,
      1,
      1,
      MultiInstanceCompensationCompletionOutcome.EarlyCompletion,
    ),
    multiInstanceFacts(
      activity,
      0,
      0,
      MultiInstanceCompensationCompletionOutcome.Interrupted,
    ),
    multiInstanceFacts(activity, -1, -1),
    multiInstanceFacts(activity, Number.MAX_SAFE_INTEGER + 1, 0),
  ];
  for (const mutation of malformed) {
    const refused = retainCompletedCompensableActivity(
      multiProgram,
      multiState,
      mutation,
    );
    assert.equal(refused.kind, CompensationRetentionResultKind.Refused);
    assert.equal(refused.state, multiState);
    if (refused.kind !== CompensationRetentionResultKind.Refused) continue;
    assert.deepEqual(refused.refusal, {
      kind: CompensationRetentionRefusalKind.InvalidCompletionFacts,
    });
  }

  const wrongFamily = retainCompletedCompensableActivity(
    multiProgram,
    multiState,
    { ...facts, activity: { ...activity, activityElementId: "Task_Multi" } },
  );
  assert.equal(wrongFamily.kind, CompensationRetentionResultKind.Refused);
  assert.equal(wrongFamily.state, multiState);
  if (wrongFamily.kind === CompensationRetentionResultKind.Refused) {
    assert.deepEqual(wrongFamily.refusal, {
      kind: CompensationRetentionRefusalKind.InvalidCompletionFacts,
    });
  }
});

test("validates optionality, root ownership, chronology, uniqueness, and capacity", () => {
  assert.deepEqual(compensationRetentionStateDefects(program, state), []);
  const { compensationActivityRetentions: _omittedStateRetention, ...stateWithoutRetention } =
    state;
  assert.ok(
    compensationRetentionStateDefects(program, stateWithoutRetention).includes(
      CompensationRetentionStateDefect.ProgramPresenceMismatch,
    ),
  );
  const { compensationActivityRetention: _omittedDeclaration, ...noDeclaration } = program;
  assert.ok(
    compensationRetentionStateDefects(noDeclaration, state).includes(
      CompensationRetentionStateDefect.ProgramPresenceMismatch,
    ),
  );
  const malformedRegister: RuntimeState = {
    ...state,
    compensationActivityRetentions: [{
      owner: {
        processInstanceId: activity.processInstanceId,
        definitionScopeId: "Scope_Other",
        activation: 1,
      },
      nextCompletionOrdinal: 3,
      records: [
        { id: activity, completionOrdinal: 2 },
        { id: activity, completionOrdinal: 1 },
      ],
    }],
  };
  const defects = compensationRetentionStateDefects(program, malformedRegister);
  assert.ok(defects.includes(CompensationRetentionStateDefect.RegisterOwnerMismatch));
  assert.ok(defects.includes(CompensationRetentionStateDefect.InvalidChronology));
  assert.ok(defects.includes(CompensationRetentionStateDefect.DuplicateActivity));
  const malformedInsertion = retainCompletedCompensableActivity(
    program,
    malformedRegister,
    facts,
  );
  assert.equal(malformedInsertion.kind, CompensationRetentionResultKind.Refused);
  assert.equal(malformedInsertion.state, malformedRegister);
  if (malformedInsertion.kind === CompensationRetentionResultKind.Refused) {
    assert.deepEqual(malformedInsertion.refusal, {
      kind: CompensationRetentionRefusalKind.RetentionStateMismatch,
    });
  }
  const capacityDefects = compensationRetentionStateDefects(
    withLimits(program, { maxRecords: 1, maxCanonicalBytes: 65_536 }),
    malformedRegister,
  );
  assert.ok(capacityDefects.includes(CompensationRetentionStateDefect.CapacityExceeded));
  assert.ok(
    runtimeStateDefects(
      program,
      activity.processInstanceId,
      stateWithoutRetention,
    ).includes("compensationActivityRetentionProfileMismatch"),
  );
});

test("keeps the shared initial state byte-identical while every accepted start materializes a root register", () => {
  assert.equal(Object.hasOwn(initialState, "compensationActivityRetentions"), false);
  assert.equal(JSON.stringify(initialState).includes("compensationActivityRetentions"), false);

  const channel = {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Start",
    interfaceOperationId: "Operation_Start",
    messageId: "Message_Start",
  } as const;
  const cases = [
    startFixture(SemanticOperationKind.Initiate),
    startFixture(SemanticOperationKind.InitiateMessage, channel),
    startFixture(SemanticOperationKind.InitiateTimer),
  ];
  for (const { startProgram, stimulus } of cases) {
    const started = applyStimulus(startProgram, initialState, stimulus, 0);
    assert.equal(started.outcome, CommandOutcome.Committed);
    assert.equal(started.state.compensationActivityRetentions?.length, 1);
    assert.deepEqual(started.state.compensationActivityRetentions?.[0], {
      owner: {
        processInstanceId: stimulus.instanceId,
        definitionScopeId: startProgram.compensationActivityRetention?.definitionScopeId,
        activation: 1,
      },
      nextCompletionOrdinal: 1,
      records: [],
    });
  }
});

test("preserves retention on child close and disposes only the matching root register", () => {
  const rootCompletion = requireOperation(program, SemanticOperationKind.CompleteScope);
  const closed = applyInternalOperation(program, rootCompletion, state);
  assert.ok(closed !== null);
  assert.equal(closed.control.kind, ControlStateKind.Completed);
  assert.deepEqual(closed.compensationActivityRetentions, []);

  const childOwner = {
    processInstanceId: activity.processInstanceId,
    definitionScopeId: "Scope_Child",
    activation: 1,
  };
  const childCompletion = {
    id: "Complete_Child",
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Child" },
    scopeId: "Scope_Child",
    parentOutput: "Flow_ChildReturn",
  } satisfies SemanticOperation;
  const childState: RuntimeState = {
    ...state,
    scopeOccurrences: [
      state.scopeOccurrences[0] as NonNullable<typeof state.scopeOccurrences[0]>,
      { id: childOwner, parent: state.scopeOccurrences[0]?.id ?? null },
    ],
  };
  const afterChild = applyInternalOperation(
    { ...program, operations: [...program.operations, childCompletion] },
    childCompletion,
    childState,
  );
  assert.ok(afterChild !== null);
  assert.equal(
    afterChild.compensationActivityRetentions,
    childState.compensationActivityRetentions,
  );
});
