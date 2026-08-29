/**
 * The checkpoint boundary of the direct Activity data-input operation under internal commutation.
 *
 * Contract: the operation is classified as a composite Activity-arming declarer, and its footprint is
 * deliberately unavailable at this checkpoint. Unavailability is not neutral — it must make every
 * frontier containing the operation fail closed, so the operation can never execute inside a batch.
 *
 * The discriminating fixture is a two-branch program whose branches are otherwise independent, which
 * is exactly the frontier a permissive footprint derivation would wrongly admit. It is local to this
 * guard rather than shared, because it is not a model the profile admits: it exists only to put the
 * operation into a genuinely multi-enabled frontier.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

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

test("refuses a frontier holding the data-input entry beside an independent arming", () => {
  const evaluated = evaluateStimulusWithSelectedSteps(
    forkedProgram,
    initialState,
    startForked,
  );

  assert.equal(evaluated.result.outcome, CommandOutcome.Committed);
  assert.equal(evaluated.ambiguousInternalChoice, true);
  assert.deepEqual(
    evaluated.selectedInternalBatches.map((batch) => batch.length),
    [1, 1],
  );
  assert.deepEqual(
    evaluated.selectedInternalSteps.map(({ operation }) => operation.id),
    ["operation:StartEvent_Fork", "operation:Gateway_Fork"],
  );
});

test("derives no footprint for the data-input entry in that exact frontier state", () => {
  const evaluated = evaluateStimulusWithSelectedSteps(
    forkedProgram,
    initialState,
    startForked,
  );

  assert.equal(
    deriveInternalTransitionFootprint(forkedProgram, evaluated.result.state, {
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
