import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const PARALLEL_MULTI_INSTANCE_PROFILE_ID =
  "bpmn-2.0.2-parallel-multi-instance-user-task-draft";
const sequentialSource = await readFile(
  new URL("./fixtures/sequential-multi-instance-user-task.bpmn", import.meta.url),
  "utf8",
);

const parallelSource = sequentialSource
  .replace(
    "Definitions_SequentialMultiInstanceReview",
    "Definitions_ParallelMultiInstanceReview",
  )
  .replace(
    "https://bpmn-lean.org/scenarios/sequential-multi-instance-review",
    "https://bpmn-lean.org/scenarios/parallel-multi-instance-review",
  )
  .replace(
    'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review">',
    [
      'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review"',
      '  expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">',
    ].join("\n"),
  )
  .replace(
    "Process_SequentialMultiInstanceReview",
    "Process_ParallelMultiInstanceReview",
  )
  .replace(
    '<bpmn:multiInstanceLoopCharacteristics isSequential="true" behavior="All">',
    '<bpmn:multiInstanceLoopCharacteristics isSequential="false" behavior="All">',
  )
  .replace(
    "      </bpmn:multiInstanceLoopCharacteristics>",
    [
      "        <bpmn:completionCondition xsi:type=\"bpmn:tFormalExpression\">stringEquals(completionPolicy,\"first\")</bpmn:completionCondition>",
      "      </bpmn:multiInstanceLoopCharacteristics>",
    ].join("\n"),
  );

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "parallel-multi-instance-source-test",
    expectedSha256: undefined,
    semanticProfile: PARALLEL_MULTI_INSTANCE_PROFILE_ID,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

test("admits the exact parallel Multi-Instance source", async () => {
  const result = await compile(parallelSource);

  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    JSON.stringify(result),
  );
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  const checked = result.checkedProcess.nodes.find(({ kind }) =>
    kind === "parallelMultiInstanceUserTask"
  );
  assert.deepEqual(checked, {
    kind: "parallelMultiInstanceUserTask",
    id: "UserTask_Review",
    name: "Review item",
    input: {
      collectionItemDefinitionId: "ItemDefinition_StringList",
      scalarItemDefinitionId: "ItemDefinition_String",
      dataObjectId: "DataObject_InputItems",
      dataObjectReferenceId: "DataObjectReference_InputItems",
      loopDataInputId: "DataInput_Items",
      inputDataItemId: "InputDataItem_CurrentItem",
      taskDataInputId: "DataInput_CurrentItem",
      collectionAssociationId: "DataInputAssociation_Items",
      itemAssociationId: "DataInputAssociation_CurrentItem",
    },
    output: {
      dataObjectId: "DataObject_OutputResults",
      dataObjectReferenceId: "DataObjectReference_OutputResults",
      taskDataOutputId: "DataOutput_CurrentResult",
      outputDataItemId: "OutputDataItem_CurrentResult",
      loopDataOutputId: "DataOutput_Results",
      itemAssociationId: "DataOutputAssociation_CurrentResult",
      collectionAssociationId: "DataOutputAssociation_Results",
    },
    completionCondition: {
      language: "urn:bpmn-lean:expression:simple-boolean:v1",
      body: 'stringEquals(completionPolicy,"first")',
    },
    normalOutputFlowId: "Flow_Review_Completed",
    boundaryTimer: {
      elementId: "BoundaryTimer_Review",
      durationLiteral: "PT1S",
      outputFlowId: "Flow_Timer_Escalation",
    },
  });
  assert.deepEqual(
    result.semanticProcess.operations.filter(({ kind }) =>
      kind === "awaitParallelMultiInstanceUserTask" ||
      kind === "completeParallelMultiInstanceUserTask"
    ).map(({ id, kind }) => ({ id, kind })),
    [
      {
        id: "operation:UserTask_Review",
        kind: "awaitParallelMultiInstanceUserTask",
      },
      {
        id: "operation:UserTask_Review:complete",
        kind: "completeParallelMultiInstanceUserTask",
      },
    ],
  );
});

test("rejects every near-miss in the selected parallel loop contract", async () => {
  const mutations = [
    parallelSource.replace('behavior="All"', 'behavior="all"'),
    parallelSource.replace('isSequential="false"', 'isSequential="true"'),
    parallelSource.replace(
      'stringEquals(completionPolicy,"first")',
      'stringEquals(completionPolicy,"last")',
    ),
    parallelSource.replace(
      /\s*<bpmn:completionCondition[^>]*>[^<]*<\/bpmn:completionCondition>/u,
      "",
    ),
  ];
  for (const mutation of mutations) {
    const result = await compile(mutation);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
