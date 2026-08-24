import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

const profile = SemanticProfileId.SequentialMultiInstanceUserTask;
const userTaskProfile = SemanticProfileId.UserTask;

// `Array.prototype.find` narrows nothing about its result, so the loop-specific `limits` field stays
// unreachable without an explicit predicate over the operation union.
const isSequentialMultiInstanceOperation = (
  candidate: SemanticOperation,
): candidate is AwaitSequentialMultiInstanceUserTaskOperation =>
  candidate.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask;
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL("./fixtures/sequential-multi-instance-user-task.bpmn", import.meta.url),
);
const ordinaryUserTaskSource = await readFile(
  new URL(
    "../../../scenarios/user-task-discovery-completion/process.bpmn",
    import.meta.url,
  ),
  "utf8",
);

function compile(
  bytes: Uint8Array | string,
  semanticProfile: string = profile,
) {
  return compileBpmnToSemanticProcess({
    bytes: typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
    sourceId: "sequential-multi-instance-source-test",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

test("admits the exact sequential Multi-Instance source as one closed checked node and operation", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.deepEqual(
    result.checkedProcess.sequenceFlowScopes.map(({ sequenceFlowId }) =>
      sequenceFlowId
    ),
    result.checkedProcess.sequenceFlows.map(({ id }) => id),
  );
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start-sequential-review",
    processId: result.semanticProcess.processId,
    instanceId: "ProcessInstance_SequentialMultiInstanceReview",
    initialVariables: [
      {
        name: "DataObjectReference_InputItems",
        value: {
          kind: VariableValueKind.StringList,
          value: ["contract", "invoice", "receipt"],
        },
      },
    ],
  } as const;
  assert.equal(
    supportsSemanticProcessExecution(start, result.semanticProcess),
    true,
  );
  let command = applyStimulus(result.semanticProcess, initialState, start);
  assert.equal(command.outcome, CommandOutcome.Committed);
  assert.deepEqual(command.state.userTaskWaits.map(({ id }) => id), [{
    processInstanceId: start.instanceId,
    elementId: "UserTask_Review",
    activation: 1,
  }]);
  for (const [index, submitted] of ["accepted", "flagged", "archived"].entries()) {
    command = applyStimulus(result.semanticProcess, command.state, {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete-review-${String(index + 1)}`,
      taskId: {
        processInstanceId: start.instanceId,
        elementId: "UserTask_Review",
        activation: index + 1,
      },
      submittedValues: [{
        name: "DataOutput_CurrentResult",
        value: { kind: VariableValueKind.String, value: submitted },
      }],
    });
    assert.equal(command.outcome, CommandOutcome.Committed);
  }
  assert.deepEqual(command.state.variables.process.bindings, [
    ...start.initialVariables,
    {
      name: "DataObjectReference_OutputResults",
      value: {
        kind: VariableValueKind.StringList,
        value: ["accepted", "flagged", "archived"],
      },
    },
  ]);
  const checked = result.checkedProcess.nodes.find(
    ({ kind }) => kind === "sequentialMultiInstanceUserTask",
  );
  assert.deepEqual(checked, {
    kind: "sequentialMultiInstanceUserTask",
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
    normalOutputFlowId: "Flow_Review_Completed",
    boundaryTimer: {
      elementId: "BoundaryTimer_Review",
      durationLiteral: "PT1S",
      outputFlowId: "Flow_Timer_Escalation",
    },
  });

  const operation = result.semanticProcess.operations.find(
    isSequentialMultiInstanceOperation,
  );
  assert.deepEqual(operation, {
    id: "operation:UserTask_Review",
    kind: "awaitSequentialMultiInstanceUserTask",
    origin: { kind: "bpmnElement", elementId: "UserTask_Review" },
    input: "place:Flow_Start_Review",
    task: { elementId: "UserTask_Review", name: "Review item" },
    data: checked === undefined
      ? undefined
      : { input: checked.input, output: checked.output },
    normalOutput: "place:Flow_Review_Completed",
    boundaryTimer: {
      elementId: "BoundaryTimer_Review",
      durationMs: 1_000,
      output: "place:Flow_Timer_Escalation",
      origin: {
        kind: "bpmnSequenceFlow",
        elementId: "Flow_Timer_Escalation",
      },
    },
    limits: {
      maximumItems: 16,
      maximumItemUtf8Bytes: 512,
      maximumCanonicalCollectionUtf8Bytes: 8_192,
    },
  });
});

test("binds the exact checked node and operation to closed structural schemas", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const [checkedSchema, semanticSchema] = await Promise.all([
    readFile(
      new URL("../../../contracts/schemas/checked-process.schema.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../contracts/schemas/semantic-process.schema.json", import.meta.url),
      "utf8",
    ),
  ]);
  const ajv = new Ajv2020({ strict: true });
  const checkedDefinitions = JSON.parse(checkedSchema) as {
    $defs: Record<string, unknown>;
  };
  const semanticDefinitions = JSON.parse(semanticSchema) as {
    $defs: Record<string, unknown>;
  };
  const validateNode = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: checkedDefinitions.$defs,
    $ref: "#/$defs/node",
  });
  const validateOperation = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: semanticDefinitions.$defs,
    $ref: "#/$defs/operation",
  });
  const node = result.checkedProcess.nodes.find(
    ({ kind }) => kind === "sequentialMultiInstanceUserTask",
  );
  const operation = result.semanticProcess.operations.find(
    isSequentialMultiInstanceOperation,
  );
  assert.ok(node !== undefined && operation !== undefined);
  assert.equal(validateNode(node), true, JSON.stringify(validateNode.errors));
  assert.equal(
    validateOperation(operation),
    true,
    JSON.stringify(validateOperation.errors),
  );
  assert.equal(validateNode({ ...node, controller: "runtime-only" }), false);
  assert.equal(
    validateOperation({
      ...operation,
      limits: { ...operation.limits, maximumItems: 17 },
    }),
    false,
  );
});

test("rejects surplus loop material and same-typed reference or association substitutions", async () => {
  const xml = new TextDecoder().decode(source);
  const mutations = [
    xml.replace(
      '<bpmn:multiInstanceLoopCharacteristics isSequential="true" behavior="All">',
      '<bpmn:multiInstanceLoopCharacteristics isSequential="true" behavior="All"><bpmn:documentation>surplus</bpmn:documentation>',
    ),
    xml.replace(
      "<bpmn:loopDataInputRef>DataInput_Items</bpmn:loopDataInputRef>",
      "<bpmn:loopDataInputRef>DataInput_CurrentItem</bpmn:loopDataInputRef>",
    ),
    xml.replace(
      'dataObjectRef="DataObject_OutputResults"',
      'dataObjectRef="DataObject_InputItems"',
    ),
    xml.replace(
      "<bpmn:targetRef>DataInput_CurrentItem</bpmn:targetRef>",
      "<bpmn:targetRef>DataInput_Items</bpmn:targetRef>",
    ),
    xml.replace(
      "<bpmn:sourceRef>DataOutput_CurrentResult</bpmn:sourceRef>",
      "<bpmn:sourceRef>DataOutput_Results</bpmn:sourceRef>",
    ),
  ];
  assert.equal(new Set(mutations).size, mutations.length);

  for (const mutation of mutations) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("separates the new loop construct from every previously registered profile", async () => {
  const closingTag = "    </bpmn:userTask>";
  const loop = [
    "      <bpmn:multiInstanceLoopCharacteristics",
    "        isSequential=\"true\"",
    "        behavior=\"All\" />",
  ].join("\n");
  const withLoop = ordinaryUserTaskSource.replace(
    closingTag,
    `${loop}\n${closingTag}`,
  );
  assert.notEqual(withLoop, ordinaryUserTaskSource);

  const admitted = await compile(
    withLoop.replace(`${loop}\n`, ""),
    userTaskProfile,
  );

  assert.equal(admitted.status, BpmnCompilationStatus.Accepted);
  for (const oldProfileId of Object.values(SemanticProfileId).filter(
    (profileId) => profileId !== profile,
  )) {
    const rejected = await compile(withLoop, oldProfileId);
    assert.equal(
      rejected.status,
      BpmnCompilationStatus.Rejected,
      `${oldProfileId} must not admit sequential Multi-Instance source`,
    );
  }
});
