import { CallDataKind } from "./call-data-contract.js";
import { callDataInterfaceValid, sameCallDataInterface } from "./call-data-admission.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { ScalarIoSpecification } from "./call-data-contract.js";
import { compareCanonicalStrings } from "./wire.js";

/** CDATA-MATCH-01 closes standalone IL over the same two owned serial paths as the source account. */
export function callDataProgramGraph(program: SemanticProcessProgram): boolean {
  const invoke = only(program.operations, SemanticOperationKind.InvokeProcess);
  const returning = only(program.operations, SemanticOperationKind.ReturnProcess);
  const start = only(program.operations, SemanticOperationKind.Initiate);
  const complete = only(program.operations, SemanticOperationKind.CompleteScope);
  const tasks = program.operations.filter((operation) => operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask);
  const ends = program.operations.filter((operation) => operation.kind === SemanticOperationKind.ReachNoneEnd);
  if (program.operations.length !== 8 || program.controlPlaces.length !== 5 ||
      program.definitionScopes.length !== 2 || tasks.length !== 2 || ends.length !== 2 ||
      invoke === undefined || returning === undefined || start === undefined || complete === undefined ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || invoke.data.kind !== CallDataKind.Scalar ||
      !sameCallDataInterface(invoke.data, returning.data) ||
      !callDataInterfaceValid(invoke.data, invoke.origin.elementId, invoke.calledProcessId)) return false;
  const data = invoke.data;
  const callerRoot = program.definitionScopes.find(({ parentScopeId, originElementId }) => parentScopeId === null && originElementId === program.processId);
  const calledRoot = program.definitionScopes.find(({ parentScopeId, originElementId }) => parentScopeId === null && originElementId === invoke.calledProcessId);
  const callerTask = tasks.find(({ input }) => input === returning.callerOutput);
  const calledTask = tasks.find(({ input }) => input === invoke.calledEntry);
  const callerEnd = ends.find(({ input }) => input === callerTask?.output);
  const calledEnd = ends.find(({ input }) => input === calledTask?.output);
  if (callerRoot === undefined || calledRoot === undefined || callerRoot.id === calledRoot.id ||
      callerTask === undefined || calledTask === undefined || callerTask.id === calledTask.id ||
      callerEnd === undefined || calledEnd === undefined || callerEnd.id === calledEnd.id ||
      start.output !== invoke.input || complete.scopeId !== callerRoot.id || complete.parentOutput !== null ||
      complete.origin.elementId !== program.processId ||
      invoke.calledRootScopeId !== calledRoot.id || returning.calledRootScopeId !== calledRoot.id ||
      returning.calledProcessId !== invoke.calledProcessId || returning.id !== invoke.returnOperationId ||
      returning.origin.elementId !== invoke.origin.elementId ||
      data.directInput.source.kind !== "property" || data.directOutput.target.kind !== "property" ||
      callerTask.directInput.source.kind !== "property" || callerTask.directOutput.target.kind !== "property" ||
      calledTask.directInput.source.kind !== "processDataInput" || calledTask.directOutput.target.kind !== "processDataOutput") return false;
  const receipt = callerTask.directOutput.target.propertyId;
  const operationOwner = (operation: SemanticOperation, scopeId: string) =>
    program.operationScopes.filter((binding) => binding.operationId === operation.id).length === 1 &&
    program.operationScopes.some((binding) => binding.operationId === operation.id && binding.scopeId === scopeId);
  const ids = [program.processId, invoke.calledProcessId,
    ...[start, invoke, callerTask, calledTask, callerEnd, calledEnd].map(({ origin }) => origin.elementId),
    ...program.controlPlaces.map(({ origin }) => origin.elementId), ...data.callerProperties,
    ...interfaceIds(data.call), ...interfaceIds(data.called), data.directInput.associationId, data.directOutput.associationId,
    ...tasks.flatMap(({ directInput, directOutput }) =>
      [directInput.associationId, directInput.targetDataInputId, directOutput.associationId, directOutput.sourceDataOutputId])];
  return [start, invoke, callerTask, callerEnd, complete].every((operation) => operationOwner(operation, callerRoot.id)) &&
    [calledTask, calledEnd, returning].every((operation) => operationOwner(operation, calledRoot.id)) &&
    callerTask.directInput.source.propertyId === data.directOutput.target.propertyId &&
    data.callerProperties.includes(receipt) && receipt !== data.directInput.source.propertyId && receipt !== data.directOutput.target.propertyId &&
    calledTask.directInput.source.dataInputId === data.called.input.id && calledTask.directOutput.target.dataOutputId === data.called.output.id &&
    data.callerProperties.every((id, index) => index === 0 || compareCanonicalStrings(data.callerProperties[index - 1] ?? "", id) < 0) &&
    ids.every((id) => id.length > 0) && new Set(ids).size === ids.length;
}

function only<Kind extends SemanticOperationKind>(operations: readonly SemanticOperation[], kind: Kind): Extract<SemanticOperation, { kind: Kind }> | undefined {
  const matches = operations.filter((operation): operation is Extract<SemanticOperation, { kind: Kind }> => operation.kind === kind);
  return matches.length === 1 ? matches[0] : undefined;
}

function interfaceIds(io: ScalarIoSpecification): readonly string[] {
  return [io.id, io.input.id, io.output.id, io.inputSet.id, io.outputSet.id];
}
