import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CompensationExecutionStateDefect,
  ControlStateKind,
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  ProcessStatus,
  RuntimeStateDefect,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  admitProcessStart,
  applyInternalOperation,
  compareCanonicalStrings,
  compensationExecutionStateDefects,
  initialState,
  isWellFormedSemanticProcessProgram,
  isWellFormedRuntimeState,
  initializeCompensationExecutionState,
  observeStableState,
  runtimeStateDefects,
  supportsSemanticProcessExecution,
  type CompensationDependency,
  type CompensationExecutionDeclaration,
  type ControlPlace,
  type RuntimeState,
  type SemanticOperation,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const processId = "Process_Compensation_Trigger";
const rootScopeId = `scope:${processId}`;
const subjectBScopeId = "scope:B";
const handlerBScopeId = "scope:Undo_B";
const triggerOperationId = "operation:Trigger";

const subjectA = {
  kind: "boundaryActivity",
  subjectElementId: "A",
  body: {
    kind: "singleEffect",
    handlerElementId: "Undo_A",
    effectElementId: "Undo_A",
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.CompensationSingleEffect,
    },
    input: { kind: "empty" },
  },
} as const;

const subjectB = {
  kind: "eventSubProcess",
  parentScopeId: subjectBScopeId,
  handlerScopeId: handlerBScopeId,
  body: {
    kind: "singleEffect",
    handlerElementId: "Undo_B",
    effectElementId: "Effect_Undo_B",
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.CompensationSingleEffect,
    },
    input: {
      kind: "restoredProcessBinding",
      sourceName: "completionContext",
      argumentName: "archivedContext",
    },
  },
} as const;

const subjectC = {
  kind: "boundaryActivity",
  subjectElementId: "C",
  body: {
    kind: "singleEffect",
    handlerElementId: "Undo_C",
    effectElementId: "Undo_C",
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.CompensationSingleEffect,
    },
    input: { kind: "empty" },
  },
} as const;

const dependencyAB = {
  predecessorElementId: "A",
  successorElementId: "B",
  reason: "sequenceFlow",
} as const satisfies CompensationDependency;

const compensationExecution = {
  definitionScopeId: rootScopeId,
  triggerOperationId,
  subjects: [subjectA, subjectB, subjectC],
  dependencies: [dependencyAB],
  limits: {
    maxTriggers: 2,
    maxHandlers: 3,
    maxCanonicalBytes: 65_536,
  },
} as const satisfies CompensationExecutionDeclaration;

const controlPlaces = [
  "A_To_B",
  "B_Entry",
  "B_Task_To_End",
  "B_To_C",
  "C_To_Trigger",
  "Start_To_A",
  "Trigger_To_End",
].map((elementId): ControlPlace => ({
  id: `place:${elementId}`,
  origin: {
    kind: SemanticOriginKind.BpmnSequenceFlow,
    elementId,
  },
})).sort((left, right) => compareCanonicalStrings(left.id, right.id));

const operations = ([
  {
    id: "operation:A",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "A" },
    input: "place:Start_To_A",
    output: "place:A_To_B",
    task: { elementId: "A", name: null },
  },
  {
    id: "operation:B",
    kind: SemanticOperationKind.EnterScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B" },
    input: "place:A_To_B",
    childEntry: "place:B_Entry",
    childScopeId: subjectBScopeId,
  },
  {
    id: "operation:B_End",
    kind: SemanticOperationKind.ReachNoneEnd,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B_End" },
    input: "place:B_Task_To_End",
  },
  {
    id: "operation:B_Task",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B_Task" },
    input: "place:B_Entry",
    output: "place:B_Task_To_End",
    task: { elementId: "B_Task", name: null },
  },
  {
    id: "operation:C",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "C" },
    input: "place:B_To_C",
    output: "place:C_To_Trigger",
    task: { elementId: "C", name: null },
  },
  {
    id: "operation:End",
    kind: SemanticOperationKind.ReachNoneEnd,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End" },
    input: "place:Trigger_To_End",
  },
  {
    id: "operation:Start",
    kind: SemanticOperationKind.Initiate,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Start" },
    output: "place:Start_To_A",
  },
  {
    id: triggerOperationId,
    kind: SemanticOperationKind.TriggerCompensation,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Trigger" },
    definitionScopeId: rootScopeId,
    input: "place:C_To_Trigger",
    output: "place:Trigger_To_End",
  },
  {
    id: `operation:complete-scope:${rootScopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: processId },
    scopeId: rootScopeId,
    parentOutput: null,
  },
  {
    id: `operation:complete-scope:${subjectBScopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B" },
    scopeId: subjectBScopeId,
    parentOutput: "place:B_To_C",
  },
] satisfies SemanticOperation[]).sort((left, right) =>
  compareCanonicalStrings(left.id, right.id)
);

const validProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-subprocess-boundary-timer-draft",
    sourceId: "compensation-trigger-handler-program",
    sourceSha256: "1".repeat(64),
    sourceOverlay: null,
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId,
  definitionScopes: [
    {
      id: handlerBScopeId,
      parentScopeId: subjectBScopeId,
      originElementId: "Undo_B",
    },
    {
      id: rootScopeId,
      parentScopeId: null,
      originElementId: processId,
    },
    {
      id: subjectBScopeId,
      parentScopeId: rootScopeId,
      originElementId: "B",
    },
  ].sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  operationScopes: operations.map(({ id: operationId }) => ({
    operationId,
    scopeId: operationId.includes(":B_") ||
        operationId === `operation:complete-scope:${subjectBScopeId}`
      ? subjectBScopeId
      : rootScopeId,
  })),
  controlPlaceScopes: controlPlaces.map(({ id: controlPlaceId }) => ({
    controlPlaceId,
    scopeId: controlPlaceId === "place:B_Entry" ||
        controlPlaceId === "place:B_Task_To_End"
      ? subjectBScopeId
      : rootScopeId,
  })),
  controlPlaces,
  operations,
  compensationActivityRetention: {
    definitionScopeId: rootScopeId,
    targets: [
      {
        activityElementId: "A",
        boundaryEventElementId: "Boundary_A",
        compensationActivityElementId: "Undo_A",
      },
      {
        activityElementId: "C",
        boundaryEventElementId: "Boundary_C",
        compensationActivityElementId: "Undo_C",
      },
    ],
    limits: { maxRecords: 8, maxCanonicalBytes: 65_536 },
  },
  compensationEventSubProcessSnapshots: {
    targets: [{ parentScopeId: subjectBScopeId, handlerScopeId: handlerBScopeId }],
    limits: { maxRecords: 8, maxCanonicalBytes: 65_536 },
  },
  compensationExecution,
} as const satisfies SemanticProcessProgram;

const start = {
  kind: StimulusKind.StartProcess,
  commandId: "start-compensation-trigger-handler-program",
  processId,
  instanceId: "Instance_Compensation_Trigger",
  initialVariables: [],
} as const;

function withExecution(
  declaration: CompensationExecutionDeclaration,
): SemanticProcessProgram {
  return { ...validProgram, compensationExecution: declaration };
}

function mutateExecution(
  mutate: (
    declaration: CompensationExecutionDeclaration,
  ) => CompensationExecutionDeclaration,
): SemanticProcessProgram {
  return withExecution(mutate(compensationExecution));
}

test("admits the exact A/B/C Program declaration without admitting public execution", () => {
  assert.equal(isWellFormedSemanticProcessProgram(validProgram), true);
  for (const semanticProfile of Object.values(SemanticProfileId)) {
    assert.equal(
      supportsSemanticProcessExecution(start, {
        ...validProgram,
        identity: { ...validProgram.identity, semanticProfile },
      }),
      false,
    );
  }
  assert.equal(
    isWellFormedSemanticProcessProgram(mutateExecution((declaration) => ({
      ...declaration,
      limits: { ...declaration.limits, maxHandlers: 1 },
    }))),
    true,
  );

  const {
    compensationActivityRetention: _retention,
    compensationEventSubProcessSnapshots: _snapshots,
    ...withoutSources
  } = validProgram;
  void _retention;
  void _snapshots;
  const zeroSubjectProgram = {
    ...withoutSources,
    definitionScopes: withoutSources.definitionScopes.filter(
      ({ id }) => id !== handlerBScopeId,
    ),
    compensationExecution: {
      ...compensationExecution,
      subjects: [],
      dependencies: [],
    },
  } as const satisfies SemanticProcessProgram;
  assert.equal(isWellFormedSemanticProcessProgram(zeroSubjectProgram), true);
});

test("requires the declaration and its one root-owned trigger to agree exactly", () => {
  const { compensationExecution: _execution, ...withoutExecution } = validProgram;
  void _execution;
  const wrongDefinitionScope = mutateExecution((declaration) => ({
    ...declaration,
    definitionScopeId: subjectBScopeId,
  }));
  const wrongTriggerId = mutateExecution((declaration) => ({
    ...declaration,
    triggerOperationId: "operation:Other_Trigger",
  }));
  const reusedSubjectOrigin = {
    ...validProgram,
    operations: validProgram.operations.map((operation) =>
      operation.id === triggerOperationId
        ? {
            ...operation,
            origin: {
              kind: SemanticOriginKind.BpmnElement,
              elementId: "A",
            },
          }
        : operation
    ),
  } as SemanticProcessProgram;

  assert.equal(isWellFormedSemanticProcessProgram(withoutExecution), false);
  assert.equal(isWellFormedSemanticProcessProgram(wrongDefinitionScope), false);
  assert.equal(isWellFormedSemanticProcessProgram(wrongTriggerId), false);
  assert.equal(isWellFormedSemanticProcessProgram(reusedSubjectOrigin), false);
});

test("binds every subject exactly to its retention or snapshot declaration", () => {
  const wrongRetentionSubject = mutateExecution((declaration) => ({
    ...declaration,
    subjects: [
      { ...subjectA, subjectElementId: "A_other" },
      subjectB,
      subjectC,
    ],
  }));
  const wrongSnapshotHandler = mutateExecution((declaration) => ({
    ...declaration,
    subjects: [
      subjectA,
      { ...subjectB, handlerScopeId: "scope:Other_Handler" },
      subjectC,
    ],
  }));
  const ordinaryHandlerReuse = {
    ...validProgram,
    operations: validProgram.operations.map((operation) =>
      operation.id === "operation:B_Task"
        ? {
            ...operation,
            origin: {
              kind: SemanticOriginKind.BpmnElement,
              elementId: "Effect_Undo_B",
            },
            task: { ...operation.task, elementId: "Effect_Undo_B" },
          }
        : operation
    ),
  } as SemanticProcessProgram;

  assert.equal(isWellFormedSemanticProcessProgram(wrongRetentionSubject), false);
  assert.equal(isWellFormedSemanticProcessProgram(wrongSnapshotHandler), false);
  assert.equal(isWellFormedSemanticProcessProgram(ordinaryHandlerReuse), false);
});

test("requires canonical unique acyclic subjects and dependencies", () => {
  const reversedSubjects = mutateExecution((declaration) => ({
    ...declaration,
    subjects: [subjectC, subjectB, subjectA],
  }));
  const duplicateDependency = mutateExecution((declaration) => ({
    ...declaration,
    dependencies: [dependencyAB, dependencyAB],
  }));
  const cyclicDependencies = mutateExecution((declaration) => ({
    ...declaration,
    dependencies: [
      dependencyAB,
      {
        predecessorElementId: "B",
        successorElementId: "A",
        reason: "sequenceFlow",
      },
    ],
  }));
  const twoDependencies = [
    dependencyAB,
    {
      predecessorElementId: "B",
      successorElementId: "C",
      reason: "sequenceFlow",
    },
  ] as const satisfies readonly CompensationDependency[];
  const reversedDependencies = mutateExecution((declaration) => ({
    ...declaration,
    dependencies: [...twoDependencies].reverse(),
  }));
  const selfDependency = mutateExecution((declaration) => ({
    ...declaration,
    dependencies: [{
      predecessorElementId: "A",
      successorElementId: "A",
      reason: "sequenceFlow",
    }],
  }));
  const unknownDependency = mutateExecution((declaration) => ({
    ...declaration,
    dependencies: [{
      predecessorElementId: "A",
      successorElementId: "Unknown",
      reason: "sequenceFlow",
    }],
  }));

  assert.equal(isWellFormedSemanticProcessProgram(reversedSubjects), false);
  assert.equal(isWellFormedSemanticProcessProgram(duplicateDependency), false);
  assert.equal(isWellFormedSemanticProcessProgram(cyclicDependencies), false);
  assert.equal(isWellFormedSemanticProcessProgram(reversedDependencies), false);
  assert.equal(isWellFormedSemanticProcessProgram(selfDependency), false);
  assert.equal(isWellFormedSemanticProcessProgram(unknownDependency), false);
});

test("admits only the exact body descriptor and input disposition", () => {
  const boundaryRestoredInput = {
    ...validProgram,
    compensationExecution: {
      ...compensationExecution,
      subjects: [
        {
          ...subjectA,
          body: {
            ...subjectA.body,
            input: {
              kind: "restoredProcessBinding",
              sourceName: "source",
              argumentName: "argument",
            },
          },
        },
        subjectB,
        subjectC,
      ],
    },
  };
  const eventEmptyInput = {
    ...validProgram,
    compensationExecution: {
      ...compensationExecution,
      subjects: [
        subjectA,
        { ...subjectB, body: { ...subjectB.body, input: { kind: "empty" } } },
        subjectC,
      ],
    },
  };
  const ordinaryDescriptor = {
    ...validProgram,
    compensationExecution: {
      ...compensationExecution,
      subjects: [
        {
          ...subjectA,
          body: {
            ...subjectA.body,
            descriptor: {
              protocol: EffectProtocol.Activity,
              operation: EffectOperation.Probe,
            },
          },
        },
        subjectB,
        subjectC,
      ],
    },
  };
  const aliasedEventEffect = {
    ...validProgram,
    compensationExecution: {
      ...compensationExecution,
      subjects: [
        subjectA,
        {
          ...subjectB,
          body: { ...subjectB.body, effectElementId: "Undo_B" },
        },
        subjectC,
      ],
    },
  };

  assert.equal(isWellFormedSemanticProcessProgram(boundaryRestoredInput), false);
  assert.equal(isWellFormedSemanticProcessProgram(eventEmptyInput), false);
  assert.equal(isWellFormedSemanticProcessProgram(ordinaryDescriptor), false);
  assert.equal(isWellFormedSemanticProcessProgram(aliasedEventEffect), false);
});

test("keeps the compensation effect descriptor outside ordinary awaitEffect admission", () => {
  const {
    compensationActivityRetention: _retention,
    compensationEventSubProcessSnapshots: _snapshots,
    compensationExecution: _execution,
    ...programWithoutCompensation
  } = validProgram;
  void _retention;
  void _snapshots;
  void _execution;
  const ordinaryEffectProgram = {
    ...programWithoutCompensation,
    definitionScopes: [validProgram.definitionScopes.find(({ id }) =>
      id === rootScopeId
    )],
    operationScopes: validProgram.operationScopes.filter(({ operationId }) =>
      [
        "operation:Start",
        "operation:Trigger",
        "operation:End",
        `operation:complete-scope:${rootScopeId}`,
      ].includes(operationId)
    ),
    controlPlaceScopes: validProgram.controlPlaceScopes.filter(
      ({ controlPlaceId }) =>
        controlPlaceId === "place:Start_To_A" ||
        controlPlaceId === "place:Trigger_To_End",
    ),
    controlPlaces: validProgram.controlPlaces.filter(({ id }) =>
      id === "place:Start_To_A" || id === "place:Trigger_To_End"
    ),
    operations: validProgram.operations.flatMap<SemanticOperation>((operation) => {
      if (operation.id === "operation:Start") return [operation];
      if (operation.id === "operation:End") {
        return [{ ...operation, input: "place:Trigger_To_End" }];
      }
      if (operation.id === "operation:Trigger") {
        return [{
          id: operation.id,
          kind: SemanticOperationKind.AwaitEffect,
          origin: operation.origin,
          input: "place:Start_To_A",
          output: "place:Trigger_To_End",
          effect: {
            elementId: operation.origin.elementId,
            descriptor: {
              protocol: EffectProtocol.Activity,
              operation: EffectOperation.CompensationSingleEffect,
            },
            inputMappings: [],
            outputMappings: [],
          },
          bpmnErrorRoute: null,
        }];
      }
      return operation.id === `operation:complete-scope:${rootScopeId}`
        ? [operation]
        : [];
    }).sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  };

  assert.equal(isWellFormedSemanticProcessProgram(ordinaryEffectProgram), false);
});

test("keeps the dormant trigger out of the ordinary internal transition families", () => {
  const trigger = validProgram.operations.find(({ id }) => id === triggerOperationId);
  assert.ok(trigger?.kind === SemanticOperationKind.TriggerCompensation);
  const owner = {
    processInstanceId: start.instanceId,
    definitionScopeId: rootScopeId,
    activation: 1,
  } as const;
  const state = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: start.instanceId },
    scopeOccurrences: [{ id: owner, parent: null }],
    controlTokens: [{ placeId: trigger.input, owner, multiplicity: 1 }],
    compensationActivityRetentions: [{
      owner,
      nextCompletionOrdinal: 1,
      records: [],
    }],
    compensationParentContextRetentions: [],
  } as const satisfies RuntimeState;

  assert.equal(applyInternalOperation(validProgram, trigger, state), null);
});

test("binds both compensation execution collections to the declaring Program", () => {
  assert.equal(Object.hasOwn(initialState, "compensationTriggers"), false);
  assert.equal(Object.hasOwn(initialState, "compensationHandlerEffectWaits"), false);
  assert.equal(
    runtimeStateDefects(validProgram, "", initialState).includes(
      RuntimeStateDefect.CompensationExecutionProfileMismatch,
    ),
    true,
  );

  const started = admitProcessStart(validProgram, initialState, start);
  assert.ok(started !== null);
  assert.deepEqual(started.compensationTriggers, []);
  assert.deepEqual(started.compensationHandlerEffectWaits, []);
  assert.equal(isWellFormedRuntimeState(validProgram, start.instanceId, started), true);

  const { compensationHandlerEffectWaits: _waits, ...missingWaitCollection } = started;
  void _waits;
  assert.equal(
    runtimeStateDefects(validProgram, start.instanceId, missingWaitCollection).includes(
      RuntimeStateDefect.CompensationExecutionProfileMismatch,
    ),
    true,
  );

  const malformedRunning = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: start.instanceId },
  } as const satisfies RuntimeState;
  assert.strictEqual(
    initializeCompensationExecutionState(validProgram, malformedRunning),
    malformedRunning,
  );
});

test("requires the exact lifted dependency relation between selected handlers", () => {
  const owner = {
    processInstanceId: start.instanceId,
    definitionScopeId: rootScopeId,
    activation: 1,
  } as const;
  const subjectAOccurrence = {
    kind: "boundaryActivity",
    activity: {
      processInstanceId: start.instanceId,
      activityElementId: "A",
      activation: 1,
    },
  } as const;
  const subjectBOccurrence = {
    kind: "eventSubProcess",
    parent: {
      processInstanceId: start.instanceId,
      definitionScopeId: subjectBScopeId,
      activation: 1,
    },
  } as const;
  const trigger = {
    id: { processInstanceId: start.instanceId, elementId: triggerOperationId, activation: 1 },
    owner,
    output: "place:Trigger_To_End",
    lifecycle: "succeeded",
    handlers: [
      {
        id: { processInstanceId: start.instanceId, elementId: "Undo_A", activation: 1 },
        subject: subjectAOccurrence,
        handlerElementId: "Undo_A",
        lifecycle: "compensated",
      },
      {
        id: { processInstanceId: start.instanceId, elementId: "Undo_B", activation: 1 },
        subject: subjectBOccurrence,
        handlerElementId: "Undo_B",
        lifecycle: "compensated",
      },
    ],
    dependencies: [{
      predecessor: subjectAOccurrence,
      successor: subjectBOccurrence,
      reason: "sequenceFlow",
    }],
  } as const;
  const state = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: start.instanceId },
    compensationTriggers: [trigger],
    compensationHandlerEffectWaits: [],
  } as const satisfies RuntimeState;

  assert.equal(
    compensationExecutionStateDefects(validProgram, state).includes(
      CompensationExecutionStateDefect.InvalidTrigger,
    ),
    false,
  );
  assert.equal(
    compensationExecutionStateDefects(validProgram, {
      ...state,
      compensationTriggers: [{ ...trigger, dependencies: [] }],
    }).includes(CompensationExecutionStateDefect.InvalidTrigger),
    true,
  );
});

test("projects a typed failed Process without live public work", () => {
  const triggerId = {
    processInstanceId: start.instanceId,
    elementId: triggerOperationId,
    activation: 1,
  } as const;
  const handlerId = {
    processInstanceId: start.instanceId,
    elementId: "Undo_C",
    activation: 1,
  } as const;
  const effectId = handlerId;
  const failure = {
    kind: "compensationHandlerFailure",
    triggerId,
    handlerId,
    effectId,
    code: "compensation-rejected",
    message: "downstream rejected the reversal",
  } as const;
  const failed = {
    ...initialState,
    control: {
      kind: ControlStateKind.Failed,
      instanceId: start.instanceId,
      failure,
    },
    compensationActivityRetentions: [],
    compensationParentContextRetentions: [],
    compensationTriggers: [{
      id: triggerId,
      owner: {
        processInstanceId: start.instanceId,
        definitionScopeId: rootScopeId,
        activation: 1,
      },
      output: "place:Trigger_To_End",
      lifecycle: "failed",
      handlers: [{
        id: handlerId,
        subject: {
          kind: "boundaryActivity",
          activity: {
            processInstanceId: start.instanceId,
            activityElementId: "C",
            activation: 1,
          },
        },
        handlerElementId: "Undo_C",
        lifecycle: "failed",
      }],
      dependencies: [],
    }],
    compensationHandlerEffectWaits: [],
  } as const satisfies RuntimeState;

  assert.deepEqual(observeStableState(validProgram, failed), {
    kind: CanonicalObservationKind.State,
    instanceId: start.instanceId,
    status: ProcessStatus.Failed,
    failure,
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
  });
  assert.equal(observeStableState(validProgram, { ...failed, compensationTriggers: [] }), null);
  assert.equal(observeStableState(validProgram, {
    ...failed,
    control: {
      ...failed.control,
      failure: { ...failure, effectId: { ...effectId, elementId: "wrong-effect" } },
    },
  }), null);
  assert.equal(
    observeStableState(validProgram, {
      ...failed,
      timerWaits: [{
        id: {
          processInstanceId: start.instanceId,
          elementId: "late-timer",
          activation: 1,
        },
        owner: {
          processInstanceId: start.instanceId,
          definitionScopeId: rootScopeId,
          activation: 1,
        },
        deadlineMs: 0,
        output: "place:Trigger_To_End",
      }],
    }),
    null,
  );
});
