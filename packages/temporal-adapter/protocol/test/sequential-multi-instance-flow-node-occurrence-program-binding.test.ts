import assert from "node:assert/strict";
import test from "node:test";

import {
  SemanticOperationKind,
  SemanticTransitionKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  programOccurrenceFactIsValid,
  programOccurrenceStartMatchesTransition,
} from "../dist/flow-node-occurrence-publication-program-validation.js";
import type { CommittedTransitionRecord } from "../src/semantic-publication.js";
import {
  definition,
  program as baseProgram,
  rootScope,
} from "./semantic-publication-fixture.ts";

const childOwner = {
  ...rootScope,
  definitionScopeId: "Scope_Child",
} as const;

const sequentialOperation = {
  id: "Operation_Sequential_Review",
  kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  origin: { kind: "bpmnElement", elementId: "Sequential_Review_Outer" },
  input: "Place_Flow_1",
  task: { elementId: "Review_Item_Task", name: "Review item" },
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
  normalOutput: "Place_Flow_1",
  boundaryTimer: {
    elementId: "Boundary_Timer_Review",
    durationMs: 5_000,
    output: "Place_Flow_1",
    origin: { kind: "bpmnSequenceFlow", elementId: "Flow_1" },
  },
  limits: {
    maximumItems: 16,
    maximumItemUtf8Bytes: 512,
    maximumCanonicalCollectionUtf8Bytes: 8_192,
  },
} as const satisfies SemanticOperation;

const program = {
  ...baseProgram,
  identity: definition,
  definitionScopes: [
    ...baseProgram.definitionScopes,
    {
      id: "Scope_Child",
      parentScopeId: "Scope_Process_1",
      originElementId: "SubProcess_1",
    },
  ],
  operationScopes: [
    ...baseProgram.operationScopes,
    {
      operationId: sequentialOperation.id,
      scopeId: "Scope_Process_1",
    },
  ],
  operations: [...baseProgram.operations, sequentialOperation],
} as const satisfies SemanticProcessProgram;

const entryTransition = {
  revision: 2,
  logicalTimeMs: 0,
  transition: {
    kind: SemanticTransitionKind.InternalOperation,
    operationId: sequentialOperation.id,
    operationKind: sequentialOperation.kind,
    origin: sequentialOperation.origin,
    owner: rootScope,
  },
  positionDelta: {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  },
} as const satisfies CommittedTransitionRecord;

const completionTransition = {
  revision: 3,
  logicalTimeMs: 0,
  transition: {
    kind: SemanticTransitionKind.ExternalStimulus,
    stimulus: {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "command-complete-review",
      taskId: {
        processInstanceId: rootScope.processInstanceId,
        elementId: sequentialOperation.task.elementId,
        activation: 1,
      },
      submittedValues: [],
    },
  },
  positionDelta: {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  },
} as const satisfies CommittedTransitionRecord;

const timerTransition = {
  revision: 4,
  logicalTimeMs: 5_000,
  transition: {
    kind: SemanticTransitionKind.ExternalStimulus,
    stimulus: {
      kind: StimulusKind.FireTimer,
      commandId: "command-fire-review-deadline",
      timerId: {
        processInstanceId: rootScope.processInstanceId,
        elementId: sequentialOperation.boundaryTimer.elementId,
        activation: 1,
      },
      logicalTimeMs: 5_000,
    },
  },
  positionDelta: {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  },
} as const satisfies CommittedTransitionRecord;

function fact(
  elementId: string,
  owner = rootScope,
) {
  return {
    processId: program.processId,
    elementId,
    owner,
  };
}

test("binds sequential Multi-Instance entry only to its generated task under the exact owner", () => {
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId),
    program,
    entryTransition,
  ), true);
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(baseProgram.operations[0].origin.elementId),
    program,
    entryTransition,
  ), false);
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId, childOwner),
    program,
    entryTransition,
  ), false);
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId, {
      ...rootScope,
      activation: rootScope.activation + 1,
    }),
    program,
    entryTransition,
  ), false);
  assert.equal(programOccurrenceFactIsValid(
    fact(sequentialOperation.origin.elementId),
    program,
  ), false, "the outer/controller identity is not a flow-node occurrence");
});

test("binds a non-final completion successor only to one exact sequential operation", () => {
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId),
    program,
    completionTransition,
  ), true);
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId, childOwner),
    program,
    completionTransition,
  ), false);
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(baseProgram.operations[0].origin.elementId),
    program,
    completionTransition,
  ), false);

  const duplicate = {
    ...sequentialOperation,
    id: "Operation_Sequential_Review_Duplicate",
  } as const;
  const ambiguousProgram = {
    ...program,
    operations: [...program.operations, duplicate],
    operationScopes: [
      ...program.operationScopes,
      { operationId: duplicate.id, scopeId: "Scope_Process_1" },
    ],
  } as const satisfies SemanticProcessProgram;
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId),
    ambiguousProgram,
    completionTransition,
  ), false);

  const otherProcessTransition = structuredClone(completionTransition);
  otherProcessTransition.transition.stimulus.taskId.processInstanceId =
    "Other_Instance";
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.task.elementId),
    program,
    otherProcessTransition,
  ), false);
});

test("does not credit ordinary User Task completion with a successor start", () => {
  const ordinaryOperation = {
    id: "Operation_Ordinary_Review",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: "bpmnElement", elementId: "Ordinary_Review" },
    input: "Place_Flow_1",
    task: {
      elementId: "Ordinary_Review",
      name: null,
      output: "Place_Flow_1",
    },
  } as const satisfies SemanticOperation;
  const ordinaryProgram = {
    ...baseProgram,
    operations: [...baseProgram.operations, ordinaryOperation],
    operationScopes: [
      ...baseProgram.operationScopes,
      { operationId: ordinaryOperation.id, scopeId: "Scope_Process_1" },
    ],
  } as const satisfies SemanticProcessProgram;
  const ordinaryCompletion = structuredClone(completionTransition);
  ordinaryCompletion.transition.stimulus.taskId.elementId =
    ordinaryOperation.task.elementId;
  assert.equal(programOccurrenceStartMatchesTransition(
    {
      processId: ordinaryProgram.processId,
      elementId: ordinaryOperation.task.elementId,
      owner: rootScope,
    },
    ordinaryProgram,
    ordinaryCompletion,
  ), false);
});

test("binds the sequential lifetime boundary instant and rejects an unrelated timer", () => {
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.boundaryTimer.elementId),
    program,
    timerTransition,
  ), true);
  const unrelated = structuredClone(timerTransition);
  unrelated.transition.stimulus.timerId.elementId = "Other_Timer";
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.boundaryTimer.elementId),
    program,
    unrelated,
  ), false);
  assert.equal(programOccurrenceStartMatchesTransition(
    fact(sequentialOperation.boundaryTimer.elementId, childOwner),
    program,
    timerTransition,
  ), false);
});
