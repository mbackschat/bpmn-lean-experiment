/**
 * Locks the exact direct Activity input/output composition and its one-operation lowering.
 *
 * The independently written expectations require both association contracts on one checked node and
 * one Semantic Process operation. Reference and ownership mutations below carry the discriminating
 * evidence that the reader follows the parser graph rather than matching endpoint names.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

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

const profile = "bpmn-2.0.2-activity-data-input-output-user-task-draft";

test("registers the composed Activity-data profile for product execution", () => {
  assert.equal(new Set<string>(Object.values(SemanticProfileId)).has(profile), true);
});

const sourceUrl = new URL(
  "../../../scenarios/activity-data-input-output-user-task/process.bpmn",
  import.meta.url,
);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

const directInput = {
  associationId: "DataInputAssociation_ClaimSummary",
  sourcePropertyId: "Property_ClaimSummary",
  targetDataInputId: "DataInput_ClaimSummary",
  targetDataInputName: "Claim summary",
} as const;
const directOutput = {
  associationId: "DataOutputAssociation_ClaimDecision",
  sourceDataOutputId: "DataOutput_ClaimDecision",
  sourceDataOutputName: "Claim decision",
  targetPropertyId: "Property_ClaimDecision",
} as const;

async function compile(
  bytes: Uint8Array,
  semanticProfile = profile,
): Promise<Awaited<ReturnType<typeof compileBpmnToSemanticProcess>>> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "activity-data-input-output-user-task-process",
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

test("admits both direct associations as one checked User Task", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "UserTask_AssessClaim",
    ),
    {
      kind: CheckedNodeKind.DataInputOutputUserTask,
      id: "UserTask_AssessClaim",
      name: "Assess claim",
      directInput,
      directOutput,
    },
  );
  assert.deepEqual(result.checkedProcess.nodes.map(({ kind }) => kind).sort(), [
    CheckedNodeKind.DataInputOutputUserTask,
    CheckedNodeKind.NoneEndEvent,
    CheckedNodeKind.NoneStartEvent,
  ].sort());
});

test("lowers both associations to one composed await operation", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));

  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) =>
        kind === SemanticOperationKind.AwaitDataInputOutputUserTask,
    ),
    {
      id: "operation:UserTask_AssessClaim",
      kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
      origin: { kind: "bpmnElement", elementId: "UserTask_AssessClaim" },
      input: "place:Flow_ClaimReceived_Assess",
      output: "place:Flow_AssessClaim_Recorded",
      task: { elementId: "UserTask_AssessClaim", name: "Assess claim" },
      directInput,
      directOutput,
    },
  );
  assert.equal(
    result.semanticProcess.operations.some(
      ({ kind }) =>
        kind === SemanticOperationKind.AwaitDataInputUserTask ||
        kind === SemanticOperationKind.AwaitDataOutputUserTask ||
        kind === SemanticOperationKind.AwaitUserTask,
    ),
    false,
  );
});

test("keeps optional data-item names descriptive and non-authoritative", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const unnamed = xml
    .replace(' name="Claim summary"', "")
    .replace(' name="Claim decision"', "");
  const result = requireAccepted(
    await compile(new TextEncoder().encode(unnamed)),
  );
  const node = result.checkedProcess.nodes.find(
    ({ id }) => id === "UserTask_AssessClaim",
  );

  assert.equal(node?.kind, CheckedNodeKind.DataInputOutputUserTask);
  if (node?.kind !== CheckedNodeKind.DataInputOutputUserTask) {
    throw new Error("expected the composed checked User Task");
  }
  assert.equal(node.directInput.targetDataInputName, null);
  assert.equal(node.directOutput.sourceDataOutputName, null);
});

test("refuses the composed source under both predecessor profiles", async () => {
  const bytes = await readFile(sourceUrl);

  for (
    const predecessor of [
      "bpmn-2.0.2-activity-data-input-user-task-draft",
      "bpmn-2.0.2-activity-data-output-user-task-draft",
    ]
  ) {
    assert.equal(
      (await compile(bytes, predecessor)).status,
      BpmnCompilationStatus.Rejected,
      predecessor,
    );
  }
});

test("refuses models outside the one-input one-output direct composition", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations: ReadonlyArray<readonly [string, string]> = [
    [
      "reversed input association",
      xml.replace(
        "<bpmn:sourceRef>Property_ClaimSummary</bpmn:sourceRef>\n        <bpmn:targetRef>DataInput_ClaimSummary</bpmn:targetRef>",
        "<bpmn:sourceRef>DataInput_ClaimSummary</bpmn:sourceRef>\n        <bpmn:targetRef>Property_ClaimSummary</bpmn:targetRef>",
      ),
    ],
    [
      "reversed output association",
      xml.replace(
        "<bpmn:sourceRef>DataOutput_ClaimDecision</bpmn:sourceRef>\n        <bpmn:targetRef>Property_ClaimDecision</bpmn:targetRef>",
        "<bpmn:sourceRef>Property_ClaimDecision</bpmn:sourceRef>\n        <bpmn:targetRef>DataOutput_ClaimDecision</bpmn:targetRef>",
      ),
    ],
    [
      "unresolved input source",
      xml.replace(
        "<bpmn:sourceRef>Property_ClaimSummary</bpmn:sourceRef>",
        "<bpmn:sourceRef>Property_Missing</bpmn:sourceRef>",
      ),
    ],
    [
      "unresolved output target",
      xml.replace(
        "<bpmn:targetRef>Property_ClaimDecision</bpmn:targetRef>",
        "<bpmn:targetRef>Property_Missing</bpmn:targetRef>",
      ),
    ],
    [
      "input Property owned by the Activity",
      xml.replace(
        '    <bpmn:property id="Property_ClaimSummary" />\n',
        "",
      ).replace(
        "      <bpmn:ioSpecification",
        '      <bpmn:property id="Property_ClaimSummary" />\n      <bpmn:ioSpecification',
      ),
    ],
    [
      "output Property owned by the Activity",
      xml.replace(
        '    <bpmn:property id="Property_ClaimDecision" />\n',
        "",
      ).replace(
        "      <bpmn:ioSpecification",
        '      <bpmn:property id="Property_ClaimDecision" />\n      <bpmn:ioSpecification',
      ),
    ],
    [
      "InputSet paired to the OutputSet",
      xml.replace(
        "<bpmn:dataInputRefs>DataInput_ClaimSummary</bpmn:dataInputRefs>",
        "<bpmn:dataInputRefs>DataInput_ClaimSummary</bpmn:dataInputRefs>\n          <bpmn:outputSetRefs>OutputSet_AssessClaim</bpmn:outputSetRefs>",
      ),
    ],
    [
      "OutputSet paired to the InputSet",
      xml.replace(
        "<bpmn:dataOutputRefs>DataOutput_ClaimDecision</bpmn:dataOutputRefs>",
        "<bpmn:dataOutputRefs>DataOutput_ClaimDecision</bpmn:dataOutputRefs>\n          <bpmn:inputSetRefs>InputSet_AssessClaim</bpmn:inputSetRefs>",
      ),
    ],
    [
      "second data input",
      xml.replace(
        '<bpmn:dataInput id="DataInput_ClaimSummary" name="Claim summary" />',
        '<bpmn:dataInput id="DataInput_ClaimSummary" name="Claim summary" />\n        <bpmn:dataInput id="DataInput_Second" name="Second input" />',
      ),
    ],
    [
      "second data output",
      xml.replace(
        '<bpmn:dataOutput id="DataOutput_ClaimDecision" name="Claim decision" />',
        '<bpmn:dataOutput id="DataOutput_ClaimDecision" name="Claim decision" />\n        <bpmn:dataOutput id="DataOutput_Second" name="Second output" />',
      ),
    ],
    [
      "input association assignment",
      xml.replace(
        "</bpmn:dataInputAssociation>",
        '  <bpmn:assignment id="Assignment_Forbidden" />\n      </bpmn:dataInputAssociation>',
      ),
    ],
    [
      "output association transformation",
      xml.replace(
        "<bpmn:targetRef>Property_ClaimDecision</bpmn:targetRef>",
        '<bpmn:targetRef>Property_ClaimDecision</bpmn:targetRef>\n        <bpmn:transformation id="Transformation_Forbidden">decision</bpmn:transformation>',
      ),
    ],
    [
      "collection input",
      xml.replace(
        '<bpmn:dataInput id="DataInput_ClaimSummary" name="Claim summary" />',
        '<bpmn:dataInput id="DataInput_ClaimSummary" name="Claim summary" isCollection="true" />',
      ),
    ],
    [
      "collection output",
      xml.replace(
        '<bpmn:dataOutput id="DataOutput_ClaimDecision" name="Claim decision" />',
        '<bpmn:dataOutput id="DataOutput_ClaimDecision" name="Claim decision" isCollection="true" />',
      ),
    ],
    [
      "repeated Activity",
      xml.replace(
        "</bpmn:userTask>",
        '  <bpmn:standardLoopCharacteristics id="Loop_Forbidden" />\n    </bpmn:userTask>',
      ),
    ],
  ];

  for (const [label, mutation] of mutations) {
    assert.notEqual(mutation, xml, label);
    assert.equal(
      (await compile(new TextEncoder().encode(mutation))).status,
      BpmnCompilationStatus.Rejected,
      label,
    );
  }
});
