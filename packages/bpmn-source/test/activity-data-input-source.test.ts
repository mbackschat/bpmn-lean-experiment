/**
 * Locks the exact direct Activity data-input source slice and its lowering.
 *
 * The checked-graph and program expectations here are written from the reviewed account rather than
 * copied from the compiler, so a lowering that silently changed the association direction, resolved
 * the source by name, or admitted a second input would have to change these literals to pass.
 *
 * The refusal cases are the profile's exclusions made executable: each mutation is a model that is
 * still valid BPMN but is outside the reviewed slice.
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

const dataInputProfile = "bpmn-2.0.2-activity-data-input-user-task-draft";
const sourceUrl = new URL(
  "../../../scenarios/activity-data-input-user-task/process.bpmn",
  import.meta.url,
);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

const directInput = {
  associationId: "DataInputAssociation_ReviewContext",
  sourcePropertyId: "Property_ReviewContext",
  targetDataInputId: "DataInput_ReviewContext",
  targetDataInputName: "Review context",
} as const;

async function compile(
  bytes: Uint8Array,
  semanticProfile = dataInputProfile,
): Promise<Awaited<ReturnType<typeof compileBpmnToSemanticProcess>>> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "activity-data-input-user-task-process",
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

test("admits the data interface as one checked data-input User Task", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "UserTask_Review"),
    {
      kind: CheckedNodeKind.DataInputUserTask,
      id: "UserTask_Review",
      name: "Review invoice",
      directInput,
    },
  );
  assert.deepEqual(result.checkedProcess.nodes.map(({ kind }) => kind).sort(), [
    CheckedNodeKind.DataInputUserTask,
    CheckedNodeKind.NoneEndEvent,
    CheckedNodeKind.NoneStartEvent,
  ].sort());
});

test("lowers the data interface to one awaitDataInputUserTask operation", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitDataInputUserTask,
    ),
    {
      id: "operation:UserTask_Review",
      kind: SemanticOperationKind.AwaitDataInputUserTask,
      origin: { kind: "bpmnElement", elementId: "UserTask_Review" },
      input: "place:Flow_Start_Review",
      output: "place:Flow_Review_Completed",
      task: { elementId: "UserTask_Review", name: "Review invoice" },
      directInput,
    },
  );
  assert.equal(
    result.semanticProcess.operations.some(
      ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
    ),
    false,
  );
});

test("refuses the exact source under every other registered profile", async () => {
  const bytes = await readFile(sourceUrl);
  for (
    const profile of [
      "cibseven-2.2.0-user-task-process-data-draft",
      "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    ]
  ) {
    const result = await compile(bytes, profile);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, profile);
  }
});

test("refuses every model outside the reviewed data-input slice", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations: ReadonlyArray<readonly [string, string]> = [
    [
      "reversed association direction",
      xml.replace(
        "<bpmn:sourceRef>Property_ReviewContext</bpmn:sourceRef>\n        <bpmn:targetRef>DataInput_ReviewContext</bpmn:targetRef>",
        "<bpmn:sourceRef>DataInput_ReviewContext</bpmn:sourceRef>\n        <bpmn:targetRef>Property_ReviewContext</bpmn:targetRef>",
      ),
    ],
    [
      "association carrying an assignment",
      xml.replace(
        "</bpmn:dataInputAssociation>",
        "  <bpmn:assignment id=\"Assignment_Forbidden\" />\n      </bpmn:dataInputAssociation>",
      ),
    ],
    [
      "unresolved association source",
      xml.replace(
        "<bpmn:sourceRef>Property_ReviewContext</bpmn:sourceRef>",
        "<bpmn:sourceRef>Property_Missing</bpmn:sourceRef>",
      ),
    ],
    [
      "absent Process Property",
      xml.replace('<bpmn:property id="Property_ReviewContext" />', ""),
    ],
    [
      "second data input",
      xml.replace(
        '<bpmn:dataInput id="DataInput_ReviewContext" name="Review context" />',
        '<bpmn:dataInput id="DataInput_ReviewContext" name="Review context" />\n        <bpmn:dataInput id="DataInput_Second" name="Second" />',
      ),
    ],
    [
      "nonempty output set",
      xml.replace(
        '<bpmn:outputSet id="OutputSet_Review" />',
        '<bpmn:outputSet id="OutputSet_Review">\n          <bpmn:dataOutputRefs>DataOutput_Result</bpmn:dataOutputRefs>\n        </bpmn:outputSet>',
      ),
    ],
    [
      "collection data input",
      xml.replace(
        '<bpmn:dataInput id="DataInput_ReviewContext" name="Review context" />',
        '<bpmn:dataInput id="DataInput_ReviewContext" name="Review context" isCollection="true" />',
      ),
    ],
    [
      "input set not referencing the data input",
      xml.replace(
        "<bpmn:dataInputRefs>DataInput_ReviewContext</bpmn:dataInputRefs>",
        "",
      ),
    ],
    [
      "optional input reference",
      xml.replace(
        "<bpmn:dataInputRefs>DataInput_ReviewContext</bpmn:dataInputRefs>",
        "<bpmn:dataInputRefs>DataInput_ReviewContext</bpmn:dataInputRefs>\n          <bpmn:optionalInputRefs>DataInput_ReviewContext</bpmn:optionalInputRefs>",
      ),
    ],
  ];

  for (const [label, mutation] of mutations) {
    assert.notEqual(mutation, xml, label);
    const result = await compile(new TextEncoder().encode(mutation));
    assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  }
});
