import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SimpleBooleanExpressionKind,
  VariableValueKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";
import {
  inclusiveCompletion,
  inclusiveProgram,
  inclusiveStart,
  present,
} from "./inclusive-gateway-fixture.ts";
import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

type LocalControlPreparationModule =
  typeof import("../src/internal-transition-local-control-preparation.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type AlternativeModule =
  typeof import("../src/internal-transition-alternative.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-local-control-preparation.js",
    import.meta.url,
  ).href
) as LocalControlPreparationModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const alternativeModule = await import(
  new URL("../dist/internal-transition-alternative.js", import.meta.url).href
) as AlternativeModule;

const {
  InternalLocalControlBranchResultKind,
  deriveInternalChoosePreparation,
  deriveInternalDuplicatePreparation,
  deriveInternalSelectManyPreparation,
  deriveInternalSynchronizePreparation,
  deriveInternalSynchronizeSelectedPreparation,
} = preparationModule;
const {
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { InternalAlternativeKind } = alternativeModule;

const duplicate = requireOperation(parallelProgram, SemanticOperationKind.Duplicate);
const synchronize = requireOperation(
  parallelProgram,
  SemanticOperationKind.Synchronize,
);
const duplicateOutput = duplicate.outputs[0];
if (duplicateOutput === undefined) {
  throw new Error("expected one Parallel Gateway fork output");
}

const beforeFork = applyStimulus(
  parallelProgram,
  initialState,
  startStimulus(),
  1,
);
assert.equal(beforeFork.outcome, CommandOutcome.Committed);
assert.equal(beforeFork.internalStepBoundExceeded, true);

const started = applyStimulus(
  parallelProgram,
  initialState,
  startStimulus(),
);
assert.equal(started.outcome, CommandOutcome.Committed);
const afterA = applyStimulus(
  parallelProgram,
  started.state,
  completionStimulus("UserTask_A"),
);
assert.equal(afterA.outcome, CommandOutcome.Committed);
const beforeJoin = applyStimulus(
  parallelProgram,
  afterA.state,
  completionStimulus("UserTask_B"),
  0,
);
assert.equal(beforeJoin.outcome, CommandOutcome.Committed);
assert.equal(beforeJoin.internalStepBoundExceeded, true);

const choiceProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "internal-commutation-choice-test",
    sourceId: "internal-commutation-choice-test",
    sourceOverlay: null,
    sourceSha256: "d".repeat(64),
  },
  processId: "Process_InternalCommutationChoice",
  controlPlaces: ["Input", "First", "Second", "Default"].map((id) =>
    controlPlace(`Flow_${id}`)
  ),
  operations: [{
    ...operationBase("Choice"),
    kind: SemanticOperationKind.Choose,
    input: "place:Flow_Input",
    candidates: [
      {
        condition: {
          kind: SimpleBooleanExpressionKind.StringEquals,
          variable: "priority",
          value: "urgent",
        },
        output: "place:Flow_First",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_First",
        },
      },
      {
        condition: {
          kind: SimpleBooleanExpressionKind.IsPresent,
          variable: "fallback",
        },
        output: "place:Flow_Second",
        origin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "Flow_Second",
        },
      },
    ],
    defaultOutput: "place:Flow_Default",
    defaultOrigin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: "Flow_Default",
    },
  }],
});
const choose = requireOperation(choiceProgram, SemanticOperationKind.Choose);
const choiceOwner = rootScopeOccurrence(
  choiceProgram.processId,
  "Instance_InternalCommutationChoice",
);
const choiceState: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: choiceOwner.processInstanceId,
  },
  scopeOccurrences: [{ id: choiceOwner, parent: null }],
  controlTokens: [{
    placeId: choose.input,
    owner: choiceOwner,
    multiplicity: 1,
  }],
  variables: {
    process: {
      bindings: [
        { name: "fallback", value: { kind: VariableValueKind.Null } },
        {
          name: "priority",
          value: { kind: VariableValueKind.String, value: "urgent" },
        },
      ],
    },
    activities: [],
  },
};

const selectMany = requireOperation(
  inclusiveProgram,
  SemanticOperationKind.SelectMany,
);
const synchronizeSelected = requireOperation(
  inclusiveProgram,
  SemanticOperationKind.SynchronizeSelected,
);
const beforeInclusiveSplit = applyStimulus(
  inclusiveProgram,
  initialState,
  inclusiveStart([present("takeA"), present("takeB")]),
  1,
);
assert.equal(beforeInclusiveSplit.outcome, CommandOutcome.Committed);
assert.equal(beforeInclusiveSplit.internalStepBoundExceeded, true);
const inclusiveStarted = applyStimulus(
  inclusiveProgram,
  initialState,
  inclusiveStart([present("takeA"), present("takeB")]),
);
assert.equal(inclusiveStarted.outcome, CommandOutcome.Committed);
const inclusiveAfterA = applyStimulus(
  inclusiveProgram,
  inclusiveStarted.state,
  inclusiveCompletion("Task_A"),
);
assert.equal(inclusiveAfterA.outcome, CommandOutcome.Committed);
const beforeInclusiveJoin = applyStimulus(
  inclusiveProgram,
  inclusiveAfterA.state,
  inclusiveCompletion("Task_B"),
  0,
);
assert.equal(beforeInclusiveJoin.outcome, CommandOutcome.Committed);
assert.equal(beforeInclusiveJoin.internalStepBoundExceeded, true);

test("prepares the exact Parallel Gateway fork token footprint", () => {
  const prepared = deriveInternalDuplicatePreparation(
    parallelProgram,
    beforeFork.state,
    duplicate,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Gateway fork");
  }
  assert.deepEqual(prepared.alternative, {
    kind: InternalAlternativeKind.Operation,
    operationId: duplicate.id,
  });
  assert.deepEqual(controlTokenWrites(prepared.footprint), [
    "place:Flow_ForkToA",
    "place:Flow_ForkToB",
    "place:Flow_StartToFork",
  ]);
});

test("prepares the exact Parallel Gateway join token footprint", () => {
  const prepared = deriveInternalSynchronizePreparation(
    parallelProgram,
    beforeJoin.state,
    synchronize,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Gateway join");
  }
  assert.deepEqual(controlTokenWrites(prepared.footprint), [
    "place:Flow_AToJoin",
    "place:Flow_BToJoin",
    "place:Flow_JoinToEnd",
  ]);
});

test("retains token-unit semantics for a repeated fork offer", () => {
  const input = beforeFork.state.controlTokens.find(({ placeId }) =>
    placeId === duplicate.input
  );
  assert.ok(input !== undefined);
  const repeated: RuntimeState = {
    ...beforeFork.state,
    controlTokens: beforeFork.state.controlTokens.map((token) =>
      token === input ? { ...token, multiplicity: 2 } : token
    ),
  };
  assert.notEqual(
    deriveInternalDuplicatePreparation(parallelProgram, repeated, duplicate),
    null,
  );
});

test("refuses an ambiguous affected output bucket", () => {
  const owner = beforeFork.state.controlTokens[0]?.owner;
  if (owner === undefined) {
    throw new Error("expected one Parallel Gateway fork owner");
  }
  assert.equal(
    deriveInternalDuplicatePreparation(
      parallelProgram,
      {
        ...beforeFork.state,
        controlTokens: [
          ...beforeFork.state.controlTokens,
          { placeId: duplicateOutput, owner, multiplicity: 1 },
          { placeId: duplicateOutput, owner, multiplicity: 1 },
        ],
      },
      duplicate,
    ),
    null,
  );
});

test("separates disjoint owners and conflicts on one exact token bucket", () => {
  const prepared = deriveInternalDuplicatePreparation(
    parallelProgram,
    beforeFork.state,
    duplicate,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Gateway fork");
  }
  const owner = prepared.owner;
  const disjointOwner = { ...owner, activation: owner.activation + 1 };
  assert.equal(
    independent(prepared.footprint, remapOwner(prepared.footprint, disjointOwner)),
    true,
  );
  assert.equal(
    independent(prepared.footprint, {
      reads: [{
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner,
        placeId: duplicateOutput,
      }],
      writes: [],
    }),
    false,
  );
});

test("prepares the selected Exclusive branch with only its evaluated reads", () => {
  const prepared = deriveInternalChoosePreparation(
    choiceProgram,
    choiceState,
    choose,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Exclusive Gateway choice");
  }
  assert.deepEqual(prepared.branchResult, {
    kind: InternalLocalControlBranchResultKind.ExclusiveChoice,
    output: "place:Flow_First",
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: "Flow_First",
    },
  });
  assert.deepEqual(processVariableReads(prepared.footprint), ["priority"]);

  const second = deriveInternalChoosePreparation(
    choiceProgram,
    {
      ...choiceState,
      variables: {
        ...choiceState.variables,
        process: {
          bindings: choiceState.variables.process.bindings.map((binding) =>
            binding.name === "priority"
              ? {
                name: "priority",
                value: { kind: VariableValueKind.String, value: "routine" },
              }
              : binding
          ),
        },
      },
    },
    choose,
  );
  assert.deepEqual(processVariableReads(requirePrepared(second).footprint), [
    "fallback",
    "priority",
  ]);
});

test("prepares every selected Inclusive branch and its hidden record", () => {
  const prepared = deriveInternalSelectManyPreparation(
    inclusiveProgram,
    beforeInclusiveSplit.state,
    selectMany,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Inclusive Gateway split");
  }
  assert.equal(
    prepared.branchResult?.kind,
    InternalLocalControlBranchResultKind.InclusiveSelection,
  );
  if (
    prepared.branchResult?.kind !==
      InternalLocalControlBranchResultKind.InclusiveSelection
  ) {
    throw new Error("expected an Inclusive branch result");
  }
  assert.deepEqual(
    prepared.branchResult.selected.map(({ output }) => output),
    ["place:Flow_A", "place:Flow_B"],
  );
  assert.deepEqual(processVariableReads(prepared.footprint), ["takeA", "takeB"]);
  assert.deepEqual(selectedBranchWrites(prepared.footprint), [{
    owner: prepared.owner,
    selectionKey: selectMany.selectionKey,
  }]);
});

test("prepares the exact selected Inclusive join record and token subset", () => {
  const prepared = deriveInternalSynchronizeSelectedPreparation(
    inclusiveProgram,
    beforeInclusiveJoin.state,
    synchronizeSelected,
  );
  if (prepared === null) {
    throw new Error("expected a prepared selected Inclusive Gateway join");
  }
  assert.equal(
    prepared.branchResult?.kind,
    InternalLocalControlBranchResultKind.SelectedJoin,
  );
  assert.deepEqual(controlTokenWrites(prepared.footprint), [
    "place:Flow_A_Join",
    "place:Flow_B_Join",
    "place:Flow_End",
  ]);
  assert.deepEqual(selectedBranchWrites(prepared.footprint), [{
    owner: prepared.owner,
    selectionKey: synchronizeSelected.selectionKey,
  }]);
});

test("conflicts only with the exact Process variable and selected-set owner", () => {
  const choicePrepared = requirePrepared(deriveInternalChoosePreparation(
    choiceProgram,
    choiceState,
    choose,
  ));
  assert.equal(independent(choicePrepared.footprint, {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.ProcessVariable,
      name: "priority",
    }],
  }), false);
  assert.equal(independent(choicePrepared.footprint, {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.ProcessVariable,
      name: "unread",
    }],
  }), true);

  const splitPrepared = requirePrepared(deriveInternalSelectManyPreparation(
    inclusiveProgram,
    beforeInclusiveSplit.state,
    selectMany,
  ));
  const selectedBranch = {
    kind: InternalTransitionStateAtomKind.SelectedBranch,
    owner: splitPrepared.owner,
    selectionKey: selectMany.selectionKey,
  } as const;
  assert.equal(independent(splitPrepared.footprint, {
    reads: [],
    writes: [selectedBranch],
  }), false);
  assert.equal(independent(splitPrepared.footprint, {
    reads: [],
    writes: [{
      ...selectedBranch,
      owner: {
        ...splitPrepared.owner,
        activation: splitPrepared.owner.activation + 1,
      },
    }],
  }), true);
  assert.equal(independent(splitPrepared.footprint, {
    reads: [],
    writes: [{ ...selectedBranch, selectionKey: "another-selection" }],
  }), true);
  assert.equal(independent(splitPrepared.footprint, {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.OccurrenceRegion,
      region: {
        root: splitPrepared.owner,
        members: [splitPrepared.owner],
      },
    }],
  }), false);
});

function requireOperation<Kind extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = program.operations.find((operation) =>
    operation.kind === kind
  );
  if (found?.kind !== kind) {
    throw new Error(`expected ${kind} operation`);
  }
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function requirePrepared(
  prepared: ReturnType<typeof deriveInternalChoosePreparation> |
    ReturnType<typeof deriveInternalSelectManyPreparation>,
) {
  if (prepared === null) {
    throw new Error("expected a prepared local-control transition");
  }
  return prepared;
}

function controlTokenWrites(
  footprint: InternalTransitionStateFootprint,
): ReadonlyArray<string> {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.ControlToken
      ? [atom.placeId]
      : []
  );
}

function processVariableReads(
  footprint: InternalTransitionStateFootprint,
): ReadonlyArray<string> {
  return footprint.reads.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.ProcessVariable
      ? [atom.name]
      : []
  );
}

function selectedBranchWrites(
  footprint: InternalTransitionStateFootprint,
) {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.SelectedBranch
      ? [{ owner: atom.owner, selectionKey: atom.selectionKey }]
      : []
  );
}

function remapOwner(
  footprint: InternalTransitionStateFootprint,
  owner: ScopeOccurrenceId,
): InternalTransitionStateFootprint {
  const remap = (
    atom: typeof footprint.reads[number],
  ): typeof footprint.reads[number] => {
    switch (atom.kind) {
      case InternalTransitionStateAtomKind.ControlToken:
      case InternalTransitionStateAtomKind.ScopeOccurrence:
        return { ...atom, owner };
      case InternalTransitionStateAtomKind.RuntimeControl:
        return { ...atom, instanceId: owner.processInstanceId };
      default:
        return atom;
    }
  };
  return {
    reads: footprint.reads.map(remap),
    writes: footprint.writes.map(remap),
  };
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
