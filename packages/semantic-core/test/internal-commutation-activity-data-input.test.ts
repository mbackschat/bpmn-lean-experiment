/**
 * The complete preparation owns the Activity lifetime and copied input, which the legacy footprint
 * facade cannot represent. This constructed Program exercises batching beside an ordinary task;
 * it does not establish checked-source or registered-profile admission.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";

import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  evaluateStimulusWithSelectedSteps,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  directInput,
  sourcePropertyId,
} from "./activity-data-input-fixture.ts";
import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type CensusModule = typeof import("../src/internal-commutation-census.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const censusModule = await import(
  new URL("../dist/internal-commutation-census.js", import.meta.url).href
) as CensusModule;

const { deriveInternalTransitionFootprint } = footprintModule;
const { InternalOperationFamily, semanticOperationInternalFamily } =
  censusModule;

const instanceId = "ForkedDataInputInstance_1";

const forkedProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.ActivityDataInputUserTask,
    sourceId: "activity-data-input-forked-frontier",
    sourceSha256:
      "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
    sourceOverlay: null,
  },
  processId: "Process_ForkedDataInput",
  controlPlaces: [
    controlPlace("Flow_Fork_Other"),
    controlPlace("Flow_Fork_Review"),
    controlPlace("Flow_Other_End"),
    controlPlace("Flow_Review_End"),
    controlPlace("Flow_Start_Fork"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_Other"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Other_End",
    },
    {
      ...operationBase("EndEvent_Review"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_Review_End",
    },
    {
      ...operationBase("Gateway_Fork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_Start_Fork",
      outputs: ["place:Flow_Fork_Other", "place:Flow_Fork_Review"],
    },
    {
      ...operationBase("StartEvent_Fork"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start_Fork",
    },
    {
      ...operationBase("UserTask_Other"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_Fork_Other",
      output: "place:Flow_Other_End",
      task: { elementId: "UserTask_Other", name: "Unrelated work" },
    },
    {
      ...operationBase("UserTask_Review"),
      kind: SemanticOperationKind.AwaitDataInputUserTask,
      input: "place:Flow_Fork_Review",
      output: "place:Flow_Review_End",
      task: { elementId: "UserTask_Review", name: "Review invoice" },
      directInput,
    },
  ],
});

const forkedOwner = rootScopeOccurrence(forkedProgram.processId, instanceId);
const dataInputOperation = requireOperation(forkedProgram, "operation:UserTask_Review");

const startForked = {
  kind: StimulusKind.StartProcess,
  commandId: "start-forked-data-input",
  processId: forkedProgram.processId,
  instanceId,
  initialVariables: [
    {
      name: sourcePropertyId,
      value: { kind: VariableValueKind.String, value: "invoice-4711" },
    },
  ],
} as const;

test("classifies the data-input entry as composite Activity arming", () => {
  assert.equal(
    semanticOperationInternalFamily(dataInputOperation),
    InternalOperationFamily.CompositeWaitAndActivityArming,
  );
});

test("commits a frontier holding the data-input entry beside an independent arming", () => {
  const evaluated = evaluateStimulusWithSelectedSteps(
    forkedProgram,
    initialState,
    startForked,
  );

  assert.equal(evaluated.result.outcome, CommandOutcome.Committed);
  assert.equal(evaluated.result.internalStepBoundExceeded, false);
  assert.equal(evaluated.result.ambiguousInternalChoice, false);
  assert.equal(evaluated.ambiguousInternalChoice, false);
  assert.notEqual(evaluated.admittedState, null);
  assert.deepEqual(evaluated.selectedInternalBatches.map((batch) => batch.length), [1, 1, 2]);
  assert.deepEqual(evaluated.result.state.userTaskWaits.map(({ id }) => id.elementId),
    ["UserTask_Other", "UserTask_Review"]);
  assert.deepEqual(evaluated.result.state.variables.activities.map(({ bindings }) => bindings),
    [[{ name: directInput.targetDataInputId,
      value: { kind: VariableValueKind.String, value: "invoice-4711" } }]]);
});

test("the legacy footprint facade leaves data-input entry to complete preparation", () => {
  const frontier = admittedInternalPrefix(
    forkedProgram,
    initialState,
    startForked,
    ["operation:StartEvent_Fork", "operation:Gateway_Fork"],
    ["operation:UserTask_Other", "operation:UserTask_Review"],
  );

  assert.equal(
    deriveInternalTransitionFootprint(forkedProgram, frontier, {
      operation: dataInputOperation,
      owner: forkedOwner,
    }),
    null,
  );
});

function requireOperation(
  program: SemanticProcessProgram,
  id: string,
): SemanticOperation {
  const selected = program.operations.filter((operation) =>
    operation.id === id
  );
  const only = selected[0];
  if (selected.length !== 1 || only === undefined) {
    throw new TypeError(`forked fixture lost its single ${id} operation`);
  }
  return only;
}
