import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CompensationParentContextAttemptKind,
  CompensationParentContextRetentionKind,
  CompensationParentContextRefusalReason,
  CompensationParentContextRootDisposition,
  CompensationEventSubProcessSnapshotStateDefect,
  ControlStateKind,
  VariableValueKind,
  RuntimeStateDefect,
  canonicalCompensationParentContextRetentions,
  canonicalCompensationParentContextRetentionsUtf8Bytes,
  compensationEventSubProcessSnapshotProgramDefects,
  compensationEventSubProcessSnapshotStateDefects,
  initialState,
  isWellFormedSemanticProcessGraph,
  isWellFormedSemanticProcessProgram,
  promoteCompensationParentContext,
  purgeCompensationParentContextForParent,
  purgeCompensationParentContextForRoot,
  reserveCompensationParentContext,
  runtimeStateDefects,
  type RuntimeScopeOccurrence,
  type RuntimeState,
  type SemanticProcessGraph,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  boundedScopeProgram,
  childScopeId,
  rootScopeId,
} from "./bounded-scope-fixture.ts";

const handlerScopeId = "scope:Compensation_Handler";

const program = {
  ...boundedScopeProgram,
  definitionScopes: [
    {
      id: handlerScopeId,
      parentScopeId: childScopeId,
      originElementId: "Compensation_Handler",
    },
    ...boundedScopeProgram.definitionScopes,
  ],
  compensationEventSubProcessSnapshots: {
    targets: [{ parentScopeId: childScopeId, handlerScopeId }],
    limits: { maxRecords: 8, maxCanonicalBytes: 65_536 },
  },
} as const satisfies SemanticProcessProgram;

function rawGraph(candidate: SemanticProcessProgram): SemanticProcessGraph {
  return {
    semanticProfile: candidate.identity.semanticProfile,
    processId: candidate.processId,
    definitionScopes: candidate.definitionScopes,
    operationScopes: candidate.operationScopes,
    controlPlaceScopes: candidate.controlPlaceScopes,
    controlPlaceIds: candidate.controlPlaces.map(({ id }) => id),
    operations: candidate.operations,
  };
}

test("strict Program admission alone admits its exact declared dormant handler", () => {
  const graph = rawGraph(program);

  assert.equal(isWellFormedSemanticProcessGraph(graph), false);
  assert.deepEqual(compensationEventSubProcessSnapshotProgramDefects(program), []);
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
});

test("does not widen the dormant-handler exception", () => {
  const extraDormantScope = {
    ...program,
    definitionScopes: [
      {
        id: "scope:Undeclared_Handler",
        parentScopeId: rootScopeId,
        originElementId: "Undeclared_Handler",
      },
      ...program.definitionScopes,
    ],
  } satisfies SemanticProcessProgram;
  const mismatchedParent = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      targets: [{ parentScopeId: rootScopeId, handlerScopeId }],
    },
  } satisfies SemanticProcessProgram;
  const nonEmptyHandler = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      targets: [{ parentScopeId: rootScopeId, handlerScopeId: childScopeId }],
    },
  } satisfies SemanticProcessProgram;

  assert.equal(isWellFormedSemanticProcessProgram(extraDormantScope), false);
  assert.equal(isWellFormedSemanticProcessProgram(mismatchedParent), false);
  assert.equal(isWellFormedSemanticProcessProgram(nonEmptyHandler), false);
});

test("rejects a declaring Program with an additional parentless root", () => {
  const additionalParentlessRoot = {
    ...program,
    definitionScopes: [
      ...program.definitionScopes,
      {
        id: "scope:Called_Process",
        parentScopeId: null,
        originElementId: "Called_Process",
      },
    ],
  } satisfies SemanticProcessProgram;

  assert.notDeepEqual(
    compensationEventSubProcessSnapshotProgramDefects(additionalParentlessRoot),
    [],
  );
  assert.equal(isWellFormedSemanticProcessProgram(additionalParentlessRoot), false);
});

test("the exported raw validator accepts no caller-supplied exemption", () => {
  const graph = rawGraph(program);

  // @ts-expect-error The declaration-derived exception belongs only to strict Program admission.
  assert.equal(isWellFormedSemanticProcessGraph(graph, [handlerScopeId]), false);
});

test("binds optional retention collection presence to the Program declaration", () => {
  const declaredInitial = {
    ...initialState,
    compensationParentContextRetentions: [],
  } satisfies RuntimeState;
  const { compensationEventSubProcessSnapshots: _declaration, ...legacyProgram } = program;
  const injectedLegacyState = {
    ...initialState,
    compensationParentContextRetentions: [],
  } satisfies RuntimeState;

  assert.equal(
    runtimeStateDefects(program, "", initialState).includes(
      RuntimeStateDefect.CompensationEventSubProcessSnapshotProfileMismatch,
    ),
    true,
  );
  assert.equal(
    runtimeStateDefects(program, "", declaredInitial).includes(
      RuntimeStateDefect.CompensationEventSubProcessSnapshotProfileMismatch,
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(initialState, "compensationParentContextRetentions"),
    false,
  );
  assert.equal(
    runtimeStateDefects(legacyProgram, "", injectedLegacyState).includes(
      RuntimeStateDefect.CompensationEventSubProcessSnapshotProfileMismatch,
    ),
    true,
  );
});

const processInstanceId = "Instance_\u00e9\"";
const rootOccurrence: RuntimeScopeOccurrence = {
  id: { processInstanceId, definitionScopeId: rootScopeId, activation: 1 },
  parent: null,
};
const firstParent: RuntimeScopeOccurrence = {
  id: { processInstanceId, definitionScopeId: childScopeId, activation: 1 },
  parent: rootOccurrence.id,
};
const secondParent: RuntimeScopeOccurrence = {
  id: { processInstanceId, definitionScopeId: childScopeId, activation: 2 },
  parent: rootOccurrence.id,
};

function runningState(
  parents: ReadonlyArray<RuntimeScopeOccurrence>,
  value: string,
): RuntimeState {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    scopeOccurrences: [rootOccurrence, ...parents],
    compensationParentContextRetentions: parents.map((parent) => ({
      kind: CompensationParentContextRetentionKind.Provisional,
      parent,
      handlerScopeId,
    })),
    variables: {
      process: {
        bindings: [{
          name: "context",
          value: { kind: VariableValueKind.String, value },
        }],
      },
      activities: [],
    },
  };
}

test("promotes and purges complete same-definition occurrences independently", () => {
  const firstPreState = runningState([firstParent, secondParent], "A");
  const firstAttempt = promoteCompensationParentContext(
    program,
    firstPreState,
    firstParent,
  );
  assert.equal(firstAttempt.kind, CompensationParentContextAttemptKind.Applied);
  assert.notEqual(firstAttempt.state, firstPreState);
  assert.equal(
    firstAttempt.state.compensationParentContextRetentions?.[0]?.kind,
    CompensationParentContextRetentionKind.Promoted,
  );
  assert.equal(
    firstAttempt.state.compensationParentContextRetentions?.[1]?.kind,
    CompensationParentContextRetentionKind.Provisional,
  );

  const secondPreState: RuntimeState = {
    ...firstAttempt.state,
    scopeOccurrences: [rootOccurrence, secondParent],
    variables: {
      ...firstAttempt.state.variables,
      process: {
        bindings: [{
          name: "context",
          value: { kind: VariableValueKind.String, value: "B" },
        }],
      },
    },
  };
  const secondAttempt = promoteCompensationParentContext(
    program,
    secondPreState,
    secondParent,
  );
  assert.equal(secondAttempt.kind, CompensationParentContextAttemptKind.Applied);
  assert.equal(
    secondAttempt.state.compensationParentContextRetentions?.[0]?.kind,
    CompensationParentContextRetentionKind.Promoted,
  );
  assert.equal(
    secondAttempt.state.compensationParentContextRetentions?.[1]?.kind,
    CompensationParentContextRetentionKind.Promoted,
  );
  assert.equal(
    secondAttempt.state.compensationParentContextRetentions?.[0]?.snapshot.frames[0]
      ?.bindings[0]?.value.kind === VariableValueKind.String
      ? secondAttempt.state.compensationParentContextRetentions[0].snapshot.frames[0]
        ?.bindings[0]?.value.value
      : undefined,
    "A",
  );
  assert.equal(
    secondAttempt.state.compensationParentContextRetentions?.[1]?.snapshot.frames[0]
      ?.bindings[0]?.value.kind === VariableValueKind.String
      ? secondAttempt.state.compensationParentContextRetentions[1].snapshot.frames[0]
        ?.bindings[0]?.value.value
      : undefined,
    "B",
  );
  assert.notEqual(
    firstAttempt.state.compensationParentContextRetentions?.[0]?.kind ===
        CompensationParentContextRetentionKind.Promoted
      ? firstAttempt.state.compensationParentContextRetentions[0].snapshot.frames[0]
        ?.bindings
      : undefined,
    firstPreState.variables.process.bindings,
  );
  assert.deepEqual(
    firstAttempt.state.compensationParentContextRetentions?.[0]?.kind ===
        CompensationParentContextRetentionKind.Promoted
      ? firstAttempt.state.compensationParentContextRetentions[0].snapshot.frames[1]
        ?.bindings
      : undefined,
    [],
  );

  const purged = purgeCompensationParentContextForParent(
    secondPreState,
    secondParent,
  );
  assert.equal(purged.compensationParentContextRetentions?.length, 1);
  assert.deepEqual(
    purged.compensationParentContextRetentions?.[0]?.parent.id,
    firstParent.id,
  );
  assert.equal(
    purgeCompensationParentContextForParent(firstAttempt.state, firstParent),
    firstAttempt.state,
  );
});

test("reservation capacity is atomic at exact canonical byte and record bounds", () => {
  const entryState: RuntimeState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    scopeOccurrences: [rootOccurrence],
    compensationParentContextRetentions: [],
  };
  const countRefusalProgram = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      limits: { maxRecords: 1, maxCanonicalBytes: 65_536 },
    },
  } satisfies SemanticProcessProgram;
  const first = reserveCompensationParentContext(
    countRefusalProgram,
    entryState,
    firstParent,
  );
  assert.equal(first.kind, CompensationParentContextAttemptKind.Applied);
  const firstRunningState: RuntimeState = {
    ...first.state,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    scopeOccurrences: [rootOccurrence, firstParent],
  };
  const refused = reserveCompensationParentContext(
    countRefusalProgram,
    firstRunningState,
    secondParent,
  );
  assert.equal(refused.kind, CompensationParentContextAttemptKind.Refused);
  assert.equal(refused.state, firstRunningState);
  assert.equal(
    refused.kind === CompensationParentContextAttemptKind.Refused
      ? refused.detail.reason
      : undefined,
    CompensationParentContextRefusalReason.RecordCapacity,
  );

  const wide = reserveCompensationParentContext(program, entryState, firstParent);
  assert.equal(wide.kind, CompensationParentContextAttemptKind.Applied);
  const records = wide.state.compensationParentContextRetentions ?? [];
  const canonicalRecords = canonicalCompensationParentContextRetentions(records);
  const exactBytes = canonicalCompensationParentContextRetentionsUtf8Bytes(records);
  assert.equal(
    exactBytes,
    new TextEncoder().encode(canonicalRecords).length,
  );
  assert.equal(canonicalRecords.includes("\u00e9\\\""), true);
  assert.equal(
    canonicalRecords.startsWith(
      '[{"handlerScopeId":"scope:Compensation_Handler","kind":"provisional","parent":{"id":{"activation":1,"definitionScopeId"',
    ),
    true,
  );
  const exactProgram = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      limits: { maxRecords: 8, maxCanonicalBytes: exactBytes },
    },
  } satisfies SemanticProcessProgram;
  const oneUnderProgram = {
    ...exactProgram,
    compensationEventSubProcessSnapshots: {
      ...exactProgram.compensationEventSubProcessSnapshots,
      limits: { maxRecords: 8, maxCanonicalBytes: exactBytes - 1 },
    },
  } satisfies SemanticProcessProgram;
  assert.equal(
    reserveCompensationParentContext(exactProgram, entryState, firstParent).kind,
    CompensationParentContextAttemptKind.Applied,
  );
  const byteRefusal = reserveCompensationParentContext(
    oneUnderProgram,
    entryState,
    firstParent,
  );
  assert.equal(byteRefusal.kind, CompensationParentContextAttemptKind.Refused);
  assert.equal(byteRefusal.state, entryState);
  assert.deepEqual(
    byteRefusal.kind === CompensationParentContextAttemptKind.Refused
      ? byteRefusal.detail
      : undefined,
    {
      reason: CompensationParentContextRefusalReason.CanonicalByteCapacity,
      bound: exactBytes - 1,
      prospective: exactBytes,
    },
  );
});

test("promotion capacity measures the complete escaped completion-time snapshot", () => {
  const preState = runningState([firstParent], "A\u00e9\"\n");
  const wide = promoteCompensationParentContext(program, preState, firstParent);
  assert.equal(wide.kind, CompensationParentContextAttemptKind.Applied);
  const exactBytes = canonicalCompensationParentContextRetentionsUtf8Bytes(
    wide.state.compensationParentContextRetentions ?? [],
  );
  const exactProgram = {
    ...program,
    compensationEventSubProcessSnapshots: {
      ...program.compensationEventSubProcessSnapshots,
      limits: { maxRecords: 8, maxCanonicalBytes: exactBytes },
    },
  } satisfies SemanticProcessProgram;
  const oneUnderProgram = {
    ...exactProgram,
    compensationEventSubProcessSnapshots: {
      ...exactProgram.compensationEventSubProcessSnapshots,
      limits: { maxRecords: 8, maxCanonicalBytes: exactBytes - 1 },
    },
  } satisfies SemanticProcessProgram;

  assert.equal(
    promoteCompensationParentContext(exactProgram, preState, firstParent).kind,
    CompensationParentContextAttemptKind.Applied,
  );
  const refusal = promoteCompensationParentContext(
    oneUnderProgram,
    preState,
    firstParent,
  );
  assert.equal(refusal.kind, CompensationParentContextAttemptKind.Refused);
  assert.equal(refusal.state, preState);
  assert.deepEqual(
    refusal.kind === CompensationParentContextAttemptKind.Refused
      ? refusal.detail
      : undefined,
    {
      reason: CompensationParentContextRefusalReason.CanonicalByteCapacity,
      bound: exactBytes - 1,
      prospective: exactBytes,
    },
  );
});

test("reservation sorts by complete occurrence identity and disables undeclared parents", () => {
  const secondOnly = runningState([secondParent], "A");
  const attempt = reserveCompensationParentContext(program, secondOnly, firstParent);
  assert.equal(attempt.kind, CompensationParentContextAttemptKind.Applied);
  assert.deepEqual(
    attempt.state.compensationParentContextRetentions?.map(({ parent }) =>
      parent.id.activation
    ),
    [1, 2],
  );
  const settled: RuntimeState = {
    ...attempt.state,
    scopeOccurrences: [rootOccurrence, firstParent, secondParent],
  };
  const reversed: RuntimeState = {
    ...settled,
    compensationParentContextRetentions: [
      ...(settled.compensationParentContextRetentions ?? []),
    ].reverse(),
  };
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, reversed),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );
  const firstRetention = settled.compensationParentContextRetentions?.[0];
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, {
      ...settled,
      compensationParentContextRetentions:
        firstRetention === undefined ? [] : [firstRetention, firstRetention],
    }),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );
  const undeclaredParent: RuntimeScopeOccurrence = {
    id: {
      processInstanceId,
      definitionScopeId: "scope:Undeclared_Parent",
      activation: 1,
    },
    parent: rootOccurrence.id,
  };
  const emptyState: RuntimeState = {
    ...initialState,
    compensationParentContextRetentions: [],
  };
  const disabled = reserveCompensationParentContext(
    program,
    emptyState,
    undeclaredParent,
  );
  assert.equal(disabled.kind, CompensationParentContextAttemptKind.Disabled);
  assert.equal(disabled.state, emptyState);

  const childEntryState: RuntimeState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    scopeOccurrences: [rootOccurrence],
    compensationParentContextRetentions: [],
  };
  const forgedParent: RuntimeScopeOccurrence = {
    ...firstParent,
    parent: { ...rootOccurrence.id, activation: 2 },
  };
  const forged = reserveCompensationParentContext(
    program,
    childEntryState,
    forgedParent,
  );
  assert.equal(forged.kind, CompensationParentContextAttemptKind.Refused);
  assert.equal(forged.state, childEntryState);
  const missingRootState: RuntimeState = {
    ...childEntryState,
    scopeOccurrences: [],
  };
  const missingRoot = reserveCompensationParentContext(
    program,
    missingRootState,
    firstParent,
  );
  assert.equal(missingRoot.kind, CompensationParentContextAttemptKind.Refused);
  assert.equal(missingRoot.state, missingRootState);
});

test("state validation closes running coverage and terminal promoted-root ownership", () => {
  const missingLiveReservation = {
    ...runningState([firstParent], "A"),
    compensationParentContextRetentions: [],
  } satisfies RuntimeState;
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, missingLiveReservation),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );

  const promoted = promoteCompensationParentContext(
    program,
    runningState([firstParent], "A"),
    firstParent,
  );
  assert.equal(promoted.kind, CompensationParentContextAttemptKind.Applied);
  const settledRunning: RuntimeState = {
    ...promoted.state,
    scopeOccurrences: [rootOccurrence],
  };
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, settledRunning),
    [],
  );
  const promotedRetention = settledRunning.compensationParentContextRetentions?.[0];
  assert.equal(
    promotedRetention?.kind,
    CompensationParentContextRetentionKind.Promoted,
  );
  if (promotedRetention?.kind !== CompensationParentContextRetentionKind.Promoted) {
    assert.fail("promotion must produce the promoted test fixture");
  }
  const sparseFrames = Array(2);
  const malformedFrames = [
    undefined,
    sparseFrames,
    [{
      owner: rootOccurrence.id,
      bindings: [{
        name: "context",
        value: { kind: VariableValueKind.String },
      }],
    }],
  ];
  for (const frames of malformedFrames) {
    const malformed = {
      ...settledRunning,
      compensationParentContextRetentions: [{
        ...promotedRetention,
        snapshot: { frames },
      }],
    } as unknown as RuntimeState;
    assert.doesNotThrow(() =>
      compensationEventSubProcessSnapshotStateDefects(program, malformed)
    );
    assert.deepEqual(
      compensationEventSubProcessSnapshotStateDefects(program, malformed),
      [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
    );
  }
  const wrongFrameOrder: RuntimeState = {
    ...settledRunning,
    compensationParentContextRetentions:
      promotedRetention?.kind === CompensationParentContextRetentionKind.Promoted
        ? [{
            ...promotedRetention,
            snapshot: { frames: [...promotedRetention.snapshot.frames].reverse() },
          }]
        : [],
  };
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, wrongFrameOrder),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );
  const terminalOrphan: RuntimeState = {
    ...settledRunning,
    control: { kind: ControlStateKind.Completed, instanceId: processInstanceId },
    scopeOccurrences: [],
  };
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, terminalOrphan),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(program, {
      ...terminalOrphan,
      compensationParentContextRetentions: [],
    }),
    [],
  );
});

test("selected-root completion retains exactly one promoted root owner", () => {
  const rootHandlerScopeId = "scope:Root_Compensation_Handler";
  const rootProgram = {
    ...boundedScopeProgram,
    definitionScopes: [
      {
        id: rootHandlerScopeId,
        parentScopeId: rootScopeId,
        originElementId: "Root_Compensation_Handler",
      },
      ...boundedScopeProgram.definitionScopes,
    ],
    compensationEventSubProcessSnapshots: {
      targets: [{ parentScopeId: rootScopeId, handlerScopeId: rootHandlerScopeId }],
      limits: { maxRecords: 2, maxCanonicalBytes: 65_536 },
    },
  } as const satisfies SemanticProcessProgram;
  assert.deepEqual(compensationEventSubProcessSnapshotProgramDefects(rootProgram), []);
  const rootPreState: RuntimeState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: processInstanceId },
    scopeOccurrences: [rootOccurrence],
    compensationParentContextRetentions: [{
      kind: CompensationParentContextRetentionKind.Provisional,
      parent: rootOccurrence,
      handlerScopeId: rootHandlerScopeId,
    }],
    variables: {
      process: {
        bindings: [{
          name: "root",
          value: { kind: VariableValueKind.String, value: "complete" },
        }],
      },
      activities: [],
    },
  };
  const promotedRoot = promoteCompensationParentContext(
    rootProgram,
    rootPreState,
    rootOccurrence,
  );
  assert.equal(promotedRoot.kind, CompensationParentContextAttemptKind.Applied);
  const terminal: RuntimeState = {
    ...promotedRoot.state,
    control: { kind: ControlStateKind.Completed, instanceId: processInstanceId },
    scopeOccurrences: [],
  };
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(rootProgram, terminal),
    [],
  );
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(rootProgram, {
      ...terminal,
      compensationParentContextRetentions: [],
    }),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );
  assert.equal(
    purgeCompensationParentContextForRoot(
      terminal,
      rootOccurrence,
      CompensationParentContextRootDisposition.RetainPromoted,
    ),
    terminal,
  );
  assert.deepEqual(
    purgeCompensationParentContextForRoot(
      terminal,
      rootOccurrence,
      CompensationParentContextRootDisposition.Discard,
    ).compensationParentContextRetentions,
    [],
  );
  const provisionalPurge = purgeCompensationParentContextForRoot(
    rootPreState,
    rootOccurrence,
    CompensationParentContextRootDisposition.RetainPromoted,
  );
  assert.deepEqual(provisionalPurge.compensationParentContextRetentions, []);

  const childPromotion = promoteCompensationParentContext(
    program,
    runningState([firstParent], "child"),
    firstParent,
  );
  assert.equal(childPromotion.kind, CompensationParentContextAttemptKind.Applied);
  const rootRetention = terminal.compensationParentContextRetentions?.[0];
  const childRetention = childPromotion.state.compensationParentContextRetentions?.[0];
  if (
    rootRetention?.kind !== CompensationParentContextRetentionKind.Promoted ||
    childRetention?.kind !== CompensationParentContextRetentionKind.Promoted ||
    childRetention.parent.parent === null
  ) {
    assert.fail("wrong-root separator requires promoted root and child fixtures");
  }
  const otherInstanceId = "Other_Instance";
  const wrongRootChild = {
    ...childRetention,
    parent: {
      id: { ...childRetention.parent.id, processInstanceId: otherInstanceId },
      parent: {
        ...childRetention.parent.parent,
        processInstanceId: otherInstanceId,
      },
    },
    snapshot: {
      frames: childRetention.snapshot.frames.map((frame) => ({
        ...frame,
        owner: { ...frame.owner, processInstanceId: otherInstanceId },
      })),
    },
  } as const;
  const combinedProgram = {
    ...program,
    definitionScopes: [
      {
        id: rootHandlerScopeId,
        parentScopeId: rootScopeId,
        originElementId: "Root_Compensation_Handler",
      },
      ...program.definitionScopes,
    ],
    compensationEventSubProcessSnapshots: {
      targets: [
        { parentScopeId: rootScopeId, handlerScopeId: rootHandlerScopeId },
        { parentScopeId: childScopeId, handlerScopeId },
      ],
      limits: { maxRecords: 2, maxCanonicalBytes: 65_536 },
    },
  } as const satisfies SemanticProcessProgram;
  assert.deepEqual(compensationEventSubProcessSnapshotProgramDefects(combinedProgram), []);
  const wrongRootTerminal: RuntimeState = {
    ...terminal,
    compensationParentContextRetentions: [rootRetention, wrongRootChild],
  };
  assert.deepEqual(
    compensationEventSubProcessSnapshotStateDefects(
      combinedProgram,
      wrongRootTerminal,
    ),
    [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention],
  );
});
