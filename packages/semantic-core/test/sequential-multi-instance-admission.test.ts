import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  SemanticOriginKind,
  isWellFormedAwaitSequentialMultiInstanceUserTaskOperation,
  sequentialMultiInstanceLimits,
} from "@bpmn-lean/semantic-core";

const places = new Set(["place:input", "place:normal", "place:boundary"]);
const placeOrigins = new Map([
  ["place:input", "Flow_Input"],
  ["place:normal", "Flow_Normal"],
  ["place:boundary", "Flow_Boundary"],
]);

const operation = Object.freeze({
  id: "operation:Review",
  kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Review" },
  input: "place:input",
  task: { elementId: "Review", name: "Review item" },
  data: {
    input: {
      collectionItemDefinitionId: "Item_StringList",
      scalarItemDefinitionId: "Item_String",
      dataObjectId: "Data_Input",
      dataObjectReferenceId: "Reference_Input",
      loopDataInputId: "Loop_Input",
      inputDataItemId: "Input_Item",
      taskDataInputId: "Task_Input",
      collectionAssociationId: "Association_InputCollection",
      itemAssociationId: "Association_InputItem",
    },
    output: {
      dataObjectId: "Data_Output",
      dataObjectReferenceId: "Reference_Output",
      taskDataOutputId: "Task_Output",
      outputDataItemId: "Output_Item",
      loopDataOutputId: "Loop_Output",
      itemAssociationId: "Association_OutputItem",
      collectionAssociationId: "Association_OutputCollection",
    },
  },
  normalOutput: "place:normal",
  boundaryTimer: {
    elementId: "Boundary_Timer",
    durationMs: 1_000,
    output: "place:boundary",
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: "Flow_Boundary",
    },
  },
  limits: sequentialMultiInstanceLimits,
});

test("admits one exact immutable sequential Multi-Instance definition", () => {
  assert.equal(
    isWellFormedAwaitSequentialMultiInstanceUserTaskOperation(
      operation,
      places,
      placeOrigins,
    ),
    true,
  );
});

test("rejects endpoint, identity, limit, and surplus substitutions", () => {
  const mutations = [
    { ...operation, normalOutput: operation.input },
    {
      ...operation,
      data: {
        ...operation.data,
        input: {
          ...operation.data.input,
          taskDataInputId: operation.data.input.inputDataItemId,
        },
      },
    },
    {
      ...operation,
      boundaryTimer: {
        ...operation.boundaryTimer,
        origin: {
          ...operation.boundaryTimer.origin,
          elementId: "Flow_Normal",
        },
      },
    },
    {
      ...operation,
      limits: { ...operation.limits, maximumItems: 17 },
    },
    { ...operation, runtimeController: "must-not-cross-the-IL-boundary" },
  ];

  for (const mutation of mutations) {
    assert.equal(
      isWellFormedAwaitSequentialMultiInstanceUserTaskOperation(
        mutation,
        places,
        placeOrigins,
      ),
      false,
    );
  }
});
