import { isMessageChannel } from "./message-channel.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { InterruptingMessageEventSubProcess } from "./interrupting-message-event-subprocess-contract.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import { isWellFormedWireString } from "./wire.js";

export function isInterruptingMessageEventSubProcessDeclaration(value: unknown): value is InterruptingMessageEventSubProcess {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const ids = ["parentScopeId", "handlerScopeId", "elementId", "startEventId", "childEntry"];
  return Object.keys(record).length === ids.length + 1 &&
    Object.keys(record).every((key) => key === "channel" || ids.includes(key)) &&
    ids.every((key) => typeof record[key] === "string" && record[key].length > 0 && isWellFormedWireString(record[key])) &&
    isMessageChannel(record.channel) && record.channel.kind === MessageChannelKind.OperationMessage;
}

/** IMES-CLOSE-01 binds independent IL paths, keeping the handler entry outside ordinary token production. */
export function interruptingMessageEventSubProcessProgramGraph(program: SemanticProcessProgram): boolean {
  const declarations = program.interruptingMessageEventSubProcesses;
  const declaration = declarations?.[0];
  if (!Array.isArray(declarations) || declarations.length !== 1 || !isInterruptingMessageEventSubProcessDeclaration(declaration) ||
      declaration.channel.kind !== MessageChannelKind.OperationMessage ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || program.definitionScopes.length !== 2 || program.operations.length !== 10 ||
      program.controlPlaces.length !== 7 || program.operationScopes.length !== 10 || program.controlPlaceScopes.length !== 7) return false;
  const start = only(program.operations, SemanticOperationKind.Initiate);
  const fork = only(program.operations, SemanticOperationKind.Duplicate);
  const rootCompletion = only(program.operations, SemanticOperationKind.CompleteScope);
  const handlerCompletion = only(program.operations, SemanticOperationKind.CompleteEventSubProcess);
  const tasks = program.operations.filter((op) => op.kind === SemanticOperationKind.AwaitUserTask);
  const ends = program.operations.filter((op) => op.kind === SemanticOperationKind.ReachNoneEnd);
  const root = program.definitionScopes.find(({ id }) => id === declaration.parentScopeId);
  const child = program.definitionScopes.find(({ id }) => id === declaration.handlerScopeId);
  if (start === undefined || fork === undefined || rootCompletion === undefined || handlerCompletion === undefined ||
      tasks.length !== 3 || ends.length !== 3 || tasks.some(({ task }) => task.metadata !== undefined) ||
      root === undefined || child === undefined || root.id === child.id || root.parentScopeId !== null ||
      root.originElementId !== program.processId || child.parentScopeId !== root.id || child.originElementId !== declaration.elementId ||
      rootCompletion.scopeId !== root.id || rootCompletion.origin.elementId !== program.processId || rootCompletion.parentOutput !== null ||
      handlerCompletion.scopeId !== child.id || handlerCompletion.origin.elementId !== declaration.elementId ||
      start.output !== fork.input || fork.outputs.length !== 2 || fork.outputs[0] === fork.outputs[1]) return false;
  const operationOwner = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const placeOwner = new Map(program.controlPlaceScopes.map(({ controlPlaceId, scopeId }) => [controlPlaceId, scopeId]));
  if (operationOwner.size !== 10 || placeOwner.size !== 7 || new Set(program.operations.map(({ id }) => id)).size !== 10 ||
      new Set(program.controlPlaces.map(({ id }) => id)).size !== 7) return false;
  const parentTasks = tasks.filter(({ id }) => operationOwner.get(id) === root.id);
  const childTasks = tasks.filter(({ id }) => operationOwner.get(id) === child.id);
  const task = childTasks[0];
  const childEnds = ends.filter(({ id }) => operationOwner.get(id) === child.id);
  const childEnd = childEnds[0];
  const parentEnds = ends.filter(({ id }) => operationOwner.get(id) === root.id);
  if (parentTasks.length !== 2 || childTasks.length !== 1 || task === undefined || parentEnds.length !== 2 ||
      childEnds.length !== 1 || childEnd === undefined || task.input !== declaration.childEntry || task.output !== childEnd.input ||
      !parentTasks.every((candidate) => fork.outputs.includes(candidate.input) &&
        parentEnds.filter(({ input }) => input === candidate.output).length === 1) ||
      new Set(parentTasks.map(({ input }) => input)).size !== 2 || new Set(parentTasks.map(({ output }) => output)).size !== 2) return false;
  const parentPlaces = [start.output, ...fork.outputs, ...parentTasks.map(({ output }) => output)];
  const childPlaces = [declaration.childEntry, task.output];
  const sourceIds = [program.processId, declaration.elementId, declaration.startEventId,
    declaration.channel.messageId, declaration.channel.interfaceId, declaration.channel.interfaceOperationId,
    ...[start, fork, ...tasks, ...ends].map(({ origin }) => origin.elementId),
    ...program.controlPlaces.map(({ origin }) => origin.elementId)];
  return sourceIds.every((id) => id.length > 0 && isWellFormedWireString(id)) && new Set(sourceIds).size === sourceIds.length &&
    [start, fork, rootCompletion, ...parentTasks, ...parentEnds].every(({ id }) => operationOwner.get(id) === root.id) &&
    [task, childEnd, handlerCompletion].every(({ id }) => operationOwner.get(id) === child.id) &&
    new Set([...parentPlaces, ...childPlaces]).size === 7 &&
    parentPlaces.every((id) => placeOwner.get(id) === root.id) && childPlaces.every((id) => placeOwner.get(id) === child.id) &&
    program.controlPlaces.every(({ id }) => parentPlaces.includes(id) || childPlaces.includes(id)) &&
    tasks.every(({ task: descriptor, origin }) => descriptor.elementId === origin.elementId);
}

function only<K extends SemanticOperationKind>(operations: readonly SemanticOperation[], kind: K): Extract<SemanticOperation, { kind: K }> | undefined {
  const matches = operations.filter((operation): operation is Extract<SemanticOperation, { kind: K }> => operation.kind === kind);
  return matches.length === 1 ? matches[0] : undefined;
}
