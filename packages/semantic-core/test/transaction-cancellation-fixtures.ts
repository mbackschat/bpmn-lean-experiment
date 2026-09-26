import assert from "node:assert/strict";

import {
  CommandOutcome,
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  isWellFormedSemanticProcessProgram,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";

export const transactionProcessId = "Process_Withdrawal";
export const transactionInstanceId = "Instance_Withdrawal";
export const transactionRootScope = "scope:Process_Withdrawal";
export const transactionChildScope = "scope:Transaction_Reservation";

const rootOperations = [
  {
    ...operationBase("Start"),
    kind: SemanticOperationKind.Initiate,
    output: "place:Start_Transaction",
  },
  {
    ...operationBase("Transaction_Reservation"),
    kind: SemanticOperationKind.EnterScope,
    input: "place:Start_Transaction",
    childEntry: "place:Child_Start_Split",
    childScopeId: transactionChildScope,
  },
  {
    ...operationBase("Acknowledge"),
    kind: SemanticOperationKind.AwaitUserTask,
    input: "place:Cancel_Acknowledge",
    output: "place:Acknowledge_End",
    task: { elementId: "Acknowledge", name: null },
  },
  {
    ...operationBase("End_Cancelled"),
    kind: SemanticOperationKind.ReachNoneEnd,
    input: "place:Acknowledge_End",
  },
  {
    ...operationBase("End_Normal"),
    kind: SemanticOperationKind.ReachNoneEnd,
    input: "place:Transaction_End_Normal",
  },
  {
    ...operationBase(transactionProcessId),
    kind: SemanticOperationKind.CompleteScope,
    scopeId: transactionRootScope,
    parentOutput: null,
  },
] as const;

const childOperations = [
  {
    ...operationBase("Split"),
    kind: SemanticOperationKind.Duplicate,
    input: "place:Child_Start_Split",
    outputs: ["place:Split_Reserve", "place:Split_Withdraw"],
  },
  {
    ...operationBase("Reserve"),
    kind: SemanticOperationKind.AwaitUserTask,
    input: "place:Split_Reserve",
    output: "place:Reserve_Prepare",
    task: { elementId: "Reserve", name: null },
  },
  {
    ...operationBase("Prepare"),
    kind: SemanticOperationKind.AwaitUserTask,
    input: "place:Reserve_Prepare",
    output: "place:Prepare_End",
    task: { elementId: "Prepare", name: null },
  },
  {
    ...operationBase("Withdraw"),
    kind: SemanticOperationKind.AwaitUserTask,
    input: "place:Split_Withdraw",
    output: "place:Withdraw_Cancel",
    task: { elementId: "Withdraw", name: null },
  },
  {
    ...operationBase("Cancel"),
    kind: "cancelTransaction",
    definitionScopeId: transactionChildScope,
    input: "place:Withdraw_Cancel",
    output: "place:Cancel_Acknowledge",
    boundaryEventElementId: "Boundary_Cancel",
  },
  {
    ...operationBase("End_Prepared"),
    kind: SemanticOperationKind.ReachNoneEnd,
    input: "place:Prepare_End",
  },
  {
    ...operationBase("Complete_Transaction"),
    origin: operationBase("Transaction_Reservation").origin,
    kind: SemanticOperationKind.CompleteScope,
    scopeId: transactionChildScope,
    parentOutput: "place:Transaction_End_Normal",
  },
] as const;

const rootPlaces = [
  "Acknowledge_End", "Cancel_Acknowledge", "Start_Transaction", "Transaction_End_Normal",
].map(controlPlace);
const childPlaces = [
  "Child_Start_Split", "Prepare_End", "Reserve_Prepare", "Split_Reserve",
  "Split_Withdraw", "Withdraw_Cancel",
].map(controlPlace);
const byId = (left: { readonly id: string }, right: { readonly id: string }) =>
  compareCanonicalStrings(left.id, right.id);

export const transactionProgramWire = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.UserTask,
    sourceId: "transaction-cancellation-semantics",
    sourceSha256: "2".repeat(64),
    sourceOverlay: null,
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId: transactionProcessId,
  definitionScopes: [
    { id: transactionRootScope, parentScopeId: null, originElementId: transactionProcessId },
    {
      id: transactionChildScope,
      parentScopeId: transactionRootScope,
      originElementId: "Transaction_Reservation",
    },
  ].sort(byId),
  operations: [...rootOperations, ...childOperations].sort(byId),
  operationScopes: [
    ...rootOperations.map(({ id }) => ({ operationId: id, scopeId: transactionRootScope })),
    ...childOperations.map(({ id }) => ({ operationId: id, scopeId: transactionChildScope })),
  ].sort((left, right) => compareCanonicalStrings(left.operationId, right.operationId)),
  controlPlaces: [...rootPlaces, ...childPlaces].sort(byId),
  controlPlaceScopes: [
    ...rootPlaces.map(({ id }) => ({ controlPlaceId: id, scopeId: transactionRootScope })),
    ...childPlaces.map(({ id }) => ({ controlPlaceId: id, scopeId: transactionChildScope })),
  ].sort((left, right) => compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)),
  compensationActivityRetention: {
    definitionScopeId: transactionChildScope,
    targets: [{
      activityElementId: "Reserve",
      boundaryEventElementId: "Boundary_Compensate",
      compensationActivityElementId: "Release_Reservation",
    }],
    limits: { maxRecords: 1, maxCanonicalBytes: 4096 },
  },
  compensationExecution: {
    definitionScopeId: transactionChildScope,
    triggerOperationId: "operation:Cancel",
    subjects: [{
      kind: "boundaryActivity",
      subjectElementId: "Reserve",
      body: {
        kind: "singleEffect",
        handlerElementId: "Release_Reservation",
        effectElementId: "Release_Reservation",
        descriptor: {
          protocol: EffectProtocol.Activity,
          operation: EffectOperation.CompensationSingleEffect,
        },
        input: { kind: "empty" },
      },
    }],
    dependencies: [],
    limits: { maxTriggers: 1, maxHandlers: 1, maxCanonicalBytes: 20480 },
  },
} as const;

export function admittedTransactionProgram(): SemanticProcessProgram {
  const value: unknown = transactionProgramWire;
  assert.ok(isWellFormedSemanticProcessProgram(value), "the reviewed cancellation Program must be well formed");
  return value;
}

export function startTransaction(program: SemanticProcessProgram): RuntimeState {
  const result = applyStimulus(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-withdrawal",
    processId: transactionProcessId,
    instanceId: transactionInstanceId,
    initialVariables: [],
  });
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

export function completeTransactionTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  elementId: string,
) {
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === elementId);
  assert.ok(wait, `expected live ${elementId}`);
  return applyStimulus(program, state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: wait.id,
    submittedValues: [],
  });
}
