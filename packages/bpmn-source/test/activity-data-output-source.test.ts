/**
 * Locks the exact direct Activity data-output source slice and its lowering.
 *
 * The checked-graph and program expectations here are written from the reviewed account rather than
 * copied from the compiler, so a lowering that dropped the association or lowered the Activity as a
 * plain User Task would have to change these literals to pass. They do not discriminate how the
 * reader resolved either association end: the projection carries the model's ids into the checked
 * node, so the asserted literals are the same whichever end a defective reader read them from. The
 * discriminating power against direction, cardinality, and reference resolution lives entirely in
 * the refusal cases below.
 *
 * Those cases are the profile's exclusions made executable: each mutation is still valid BPMN but is
 * outside the reviewed slice. They share one oracle, because admission reads a whole-model exact
 * shape rather than checking features one at a time.
 *
 * The registered model deliberately gives the `DataOutput` and its target `Property` different ids.
 * That inequality is the capsule's separating witness against name-merged User Task completion, and
 * a reader who equates them would make the routed and named accounts agree by coincidence. Equating
 * them is not a source mutation — both are `xsd:ID`, so one model cannot carry the same id twice —
 * and the refusal is locked at program admission by the semantic core instead.
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

test("refuses every model outside the reviewed data-output slice", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations: ReadonlyArray<readonly [string, string]> = [
    [
      "reversed association direction",
      xml.replace(
        "<bpmn:sourceRef>DataOutput_Decision</bpmn:sourceRef>\n        <bpmn:targetRef>Property_UnderwritingOutcome</bpmn:targetRef>",
        "<bpmn:sourceRef>Property_UnderwritingOutcome</bpmn:sourceRef>\n        <bpmn:targetRef>DataOutput_Decision</bpmn:targetRef>",
      ),
    ],
    [
      "unresolved association source",
      xml.replace(
        "<bpmn:sourceRef>DataOutput_Decision</bpmn:sourceRef>",
        "<bpmn:sourceRef>DataOutput_Missing</bpmn:sourceRef>",
      ),
    ],
    [
      "absent Process Property",
      xml.replace('<bpmn:property id="Property_UnderwritingOutcome" />', ""),
    ],
    // `DataAssociation-sourceRef` is declared `upper="*"`, so a second source is schema-valid BPMN
    // and the profile's cardinality rule is the only thing that refuses it.
    [
      "two association sources",
      xml.replace(
        "<bpmn:sourceRef>DataOutput_Decision</bpmn:sourceRef>",
        "<bpmn:sourceRef>DataOutput_Decision</bpmn:sourceRef>\n        <bpmn:sourceRef>Property_UnderwritingOutcome</bpmn:sourceRef>",
      ),
    ],
    [
      "second data output",
      xml.replace(
        '<bpmn:dataOutput id="DataOutput_Decision" name="Underwriting decision" />',
        '<bpmn:dataOutput id="DataOutput_Decision" name="Underwriting decision" />\n        <bpmn:dataOutput id="DataOutput_Second" name="Second" />',
      ),
    ],
    [
      "second output set",
      xml.replace(
        "</bpmn:outputSet>",
        '</bpmn:outputSet>\n        <bpmn:outputSet id="OutputSet_Second" />',
      ),
    ],
    [
      "nonempty input set",
      xml.replace(
        '<bpmn:dataOutput id="DataOutput_Decision" name="Underwriting decision" />\n        <bpmn:inputSet id="InputSet_Decide" />',
        '<bpmn:dataInput id="DataInput_Extra" name="Extra" />\n        <bpmn:dataOutput id="DataOutput_Decision" name="Underwriting decision" />\n        <bpmn:inputSet id="InputSet_Decide">\n          <bpmn:dataInputRefs>DataInput_Extra</bpmn:dataInputRefs>\n        </bpmn:inputSet>',
      ),
    ],
    [
      "optional output reference",
      xml.replace(
        "<bpmn:dataOutputRefs>DataOutput_Decision</bpmn:dataOutputRefs>",
        "<bpmn:dataOutputRefs>DataOutput_Decision</bpmn:dataOutputRefs>\n          <bpmn:optionalOutputRefs>DataOutput_Decision</bpmn:optionalOutputRefs>",
      ),
    ],
    [
      "while-executing output reference",
      xml.replace(
        "<bpmn:dataOutputRefs>DataOutput_Decision</bpmn:dataOutputRefs>",
        "<bpmn:dataOutputRefs>DataOutput_Decision</bpmn:dataOutputRefs>\n          <bpmn:whileExecutingOutputRefs>DataOutput_Decision</bpmn:whileExecutingOutputRefs>",
      ),
    ],
    [
      "collection data output",
      xml.replace(
        '<bpmn:dataOutput id="DataOutput_Decision" name="Underwriting decision" />',
        '<bpmn:dataOutput id="DataOutput_Decision" name="Underwriting decision" isCollection="true" />',
      ),
    ],
    [
      "association carrying a transformation",
      xml.replace(
        "<bpmn:targetRef>Property_UnderwritingOutcome</bpmn:targetRef>",
        '<bpmn:targetRef>Property_UnderwritingOutcome</bpmn:targetRef>\n        <bpmn:transformation id="Transformation_Forbidden">decision</bpmn:transformation>',
      ),
    ],
  ];

  for (const [label, mutation] of mutations) {
    assert.notEqual(mutation, xml, label);
    const result = await compile(new TextEncoder().encode(mutation));
    assert.equal(result.status, BpmnCompilationStatus.Rejected, label);
  }
});
