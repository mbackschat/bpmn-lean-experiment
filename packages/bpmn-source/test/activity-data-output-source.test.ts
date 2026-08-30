/**
 * Locks the exact direct Activity data-output source slice and its lowering.
 *
 * The checked-graph and program expectations here are written from the reviewed account rather than
 * copied from the compiler, so a lowering that reversed the association, resolved either end by
 * name, or admitted a second output would have to change these literals to pass.
 *
 * The registered model deliberately gives the `DataOutput` and its target `Property` different ids.
 * That inequality is the capsule's separating witness against name-merged User Task completion, and
 * a reader who equates them would make the routed and named accounts agree by coincidence.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";

const dataOutputProfile = "bpmn-2.0.2-activity-data-output-user-task-draft";
const sourceUrl = new URL(
  "../../../scenarios/activity-data-output-user-task/process.bpmn",
  import.meta.url,
);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

const directOutput = {
  associationId: "DataOutputAssociation_Decision",
  sourceDataOutputId: "DataOutput_Decision",
  sourceDataOutputName: "Underwriting decision",
  targetPropertyId: "Property_UnderwritingOutcome",
} as const;

async function compile(
  bytes: Uint8Array,
  semanticProfile = dataOutputProfile,
): Promise<Awaited<ReturnType<typeof compileBpmnToSemanticProcess>>> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "activity-data-output-user-task-process",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

function requireAccepted(
  result: Awaited<ReturnType<typeof compile>>,
): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

test("admits the data interface as one checked data-output User Task", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "UserTask_Decide"),
    {
      kind: CheckedNodeKind.DataOutputUserTask,
      id: "UserTask_Decide",
      name: "Decide credit application",
      directOutput,
    },
  );
  assert.deepEqual(result.checkedProcess.nodes.map(({ kind }) => kind).sort(), [
    CheckedNodeKind.DataOutputUserTask,
    CheckedNodeKind.NoneEndEvent,
    CheckedNodeKind.NoneStartEvent,
  ].sort());
});

test("lowers the data interface to one awaitDataOutputUserTask operation", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitDataOutputUserTask,
    ),
    {
      id: "operation:UserTask_Decide",
      kind: SemanticOperationKind.AwaitDataOutputUserTask,
      origin: { kind: "bpmnElement", elementId: "UserTask_Decide" },
      input: "place:Flow_Application_Decide",
      output: "place:Flow_Decide_Recorded",
      task: { elementId: "UserTask_Decide", name: "Decide credit application" },
      directOutput,
    },
  );
  assert.equal(
    result.semanticProcess.operations.some(
      ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
    ),
    false,
  );
});

test("refuses the exact output model under every other current profile", async () => {
  const bytes = await readFile(sourceUrl);

  for (
    const profile of [
      "bpmn-2.0.2-activity-data-input-user-task-draft",
      "bpmn-2.0.2-user-task-preserved-notation-draft",
    ]
  ) {
    const result = await compile(bytes, profile);

    assert.equal(
      result.status,
      BpmnCompilationStatus.Rejected,
      `${profile} must not admit a declared DataOutput`,
    );
  }
});
