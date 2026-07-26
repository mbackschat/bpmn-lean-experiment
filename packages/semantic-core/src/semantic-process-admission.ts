import {
  ObservationRequestKind,
  ScenarioDocumentKind,
  StimulusKind,
} from "./contract.js";
import type {
  Scenario,
  StartProcessStimulus,
} from "./contract.js";
import {
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  isWellFormedStimulus,
} from "./stimulus.js";

const supportedObservations = Object.freeze([
  ObservationRequestKind.Deployment,
  ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus,
  ObservationRequestKind.ActiveWaits,
  ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.EnabledInteractions,
  ObservationRequestKind.LogicalTime,
]);

export function supportsSemanticProcessScenario(
  scenario: Scenario,
  program: SemanticProcessProgram,
): boolean {
  return (
    isSupportedScenario(scenario) &&
    isWellFormedSemanticProcessProgram(program) &&
    hasSupportedExecutionSurface(program) &&
    program.identity.semanticProfile === scenario.profile &&
    program.identity.sourceId === scenario.bpmn.id &&
    program.identity.sourceSha256 === scenario.bpmn.sha256
  );
}

export function supportsSemanticProcessExecution(
  start: StartProcessStimulus,
  program: SemanticProcessProgram,
): boolean {
  return (
    isWellFormedStimulus(start) &&
    start.kind === StimulusKind.StartProcess &&
    isWellFormedSemanticProcessProgram(program) &&
    hasSupportedExecutionSurface(program) &&
    start.processId === program.processId
  );
}

export function isWellFormedSemanticProcessProgram(
  value: unknown,
): value is SemanticProcessProgram {
  if (!isRecord(value)) {
    return false;
  }
  const identity = isRecord(value.identity) ? value.identity : undefined;
  const controlPlaces = Array.isArray(value.controlPlaces)
    ? value.controlPlaces
    : undefined;
  const operations = Array.isArray(value.operations)
    ? value.operations
    : undefined;
  if (
    value.kind !== SemanticProcessKind.SemanticProcess ||
    identity === undefined ||
    identity.compiler !==
      SemanticProcessCompilerId.BpmnSourceSemanticProcess ||
    !isNonEmptyString(identity.semanticProfile) ||
    !isNonEmptyString(identity.sourceId) ||
    !isSha256(identity.sourceSha256) ||
    !isNonEmptyString(value.processId) ||
    controlPlaces === undefined ||
    controlPlaces.length === 0 ||
    operations === undefined ||
    operations.length === 0 ||
    !isSortedById(controlPlaces) ||
    !isSortedById(operations)
  ) {
    return false;
  }

  const placeIds = new Set<string>();
  for (const place of controlPlaces) {
    if (
      !isRecord(place) ||
      !hasOnlyKeys(place, ["id", "origin"]) ||
      !isNonEmptyString(place.id) ||
      !isRecord(place.origin) ||
      !hasOnlyKeys(place.origin, ["kind", "elementId"]) ||
      place.origin.kind !== SemanticOriginKind.BpmnSequenceFlow ||
      !isNonEmptyString(place.origin.elementId)
    ) {
      return false;
    }
    placeIds.add(place.id);
  }

  let initiates = 0;
  for (const operation of operations) {
    if (!isWellFormedOperation(operation, placeIds)) {
      return false;
    }
    if (operation.kind === SemanticOperationKind.Initiate) {
      initiates += 1;
    }
  }
  return initiates === 1;
}

function hasSupportedExecutionSurface(
  program: SemanticProcessProgram,
): boolean {
  return (
    hasSequentialExecutionSurface(program) ||
    hasBalancedParallelExecutionSurface(program)
  );
}

function hasSequentialExecutionSurface(
  program: SemanticProcessProgram,
): boolean {
  const initiate = onlyOperation(program, SemanticOperationKind.Initiate);
  const task = onlyOperation(program, SemanticOperationKind.AwaitUserTask);
  const terminate = onlyOperation(program, SemanticOperationKind.Terminate);
  return (
    program.controlPlaces.length === 2 &&
    program.operations.length === 3 &&
    initiate !== undefined &&
    task !== undefined &&
    terminate !== undefined &&
    initiate.output === task.input &&
    task.output === terminate.input
  );
}

function hasBalancedParallelExecutionSurface(
  program: SemanticProcessProgram,
): boolean {
  const initiate = onlyOperation(program, SemanticOperationKind.Initiate);
  const duplicate = onlyOperation(program, SemanticOperationKind.Duplicate);
  const synchronize = onlyOperation(
    program,
    SemanticOperationKind.Synchronize,
  );
  const terminate = onlyOperation(program, SemanticOperationKind.Terminate);
  const tasks = operationsOfKind(
    program,
    SemanticOperationKind.AwaitUserTask,
  );
  return (
    program.controlPlaces.length === 6 &&
    program.operations.length === 6 &&
    initiate !== undefined &&
    duplicate !== undefined &&
    synchronize !== undefined &&
    terminate !== undefined &&
    tasks.length === 2 &&
    new Set(tasks.map(({ task }) => task.elementId)).size === 2 &&
    initiate.output === duplicate.input &&
    sameStringSet(
      duplicate.outputs,
      tasks.map(({ input }) => input),
    ) &&
    sameStringSet(
      tasks.map(({ output }) => output),
      synchronize.inputs,
    ) &&
    synchronize.output === terminate.input
  );
}

function onlyOperation<K extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: K,
): Extract<SemanticOperation, { kind: K }> | undefined {
  const operations = operationsOfKind(program, kind);
  return operations.length === 1 ? operations[0] : undefined;
}

function operationsOfKind<K extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: K,
): ReadonlyArray<Extract<SemanticOperation, { kind: K }>> {
  return program.operations.filter(
    (
      operation,
    ): operation is Extract<SemanticOperation, { kind: K }> =>
      operation.kind === kind,
  );
}

function sameStringSet(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function isWellFormedOperation(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is SemanticOperation {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isRecord(value.origin) ||
    !hasOnlyKeys(value.origin, ["kind", "elementId"]) ||
    value.origin.kind !== SemanticOriginKind.BpmnElement ||
    !isNonEmptyString(value.origin.elementId)
  ) {
    return false;
  }
  switch (value.kind) {
    case SemanticOperationKind.Initiate:
      return (
        hasOnlyKeys(value, ["id", "kind", "origin", "output"]) &&
        isPlaceReference(value.output, placeIds)
      );
    case SemanticOperationKind.AwaitUserTask:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "output",
          "task",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isPlaceReference(value.output, placeIds) &&
        isRecord(value.task) &&
        hasOnlyKeys(value.task, ["elementId", "name"]) &&
        value.task.elementId === value.origin.elementId &&
        (value.task.name === null || typeof value.task.name === "string")
      );
    case SemanticOperationKind.Duplicate:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "input",
          "outputs",
        ]) &&
        isPlaceReference(value.input, placeIds) &&
        isManyPlaceReferences(value.outputs, placeIds)
      );
    case SemanticOperationKind.Synchronize:
      return (
        hasOnlyKeys(value, [
          "id",
          "kind",
          "origin",
          "inputs",
          "output",
        ]) &&
        isManyPlaceReferences(value.inputs, placeIds) &&
        isPlaceReference(value.output, placeIds)
      );
    case SemanticOperationKind.Terminate:
      return (
        hasOnlyKeys(value, ["id", "kind", "origin", "input"]) &&
        isPlaceReference(value.input, placeIds)
      );
    default:
      return false;
  }
}

function isSupportedScenario(value: unknown): value is Scenario {
  if (!isRecord(value) || value.kind !== ScenarioDocumentKind.Scenario) {
    return false;
  }
  const bpmn = isRecord(value.bpmn) ? value.bpmn : undefined;
  const stimuli = Array.isArray(value.stimuli) ? value.stimuli : undefined;
  const observations = Array.isArray(value.observations)
    ? value.observations
    : undefined;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.profile) &&
    bpmn !== undefined &&
    isNonEmptyString(bpmn.id) &&
    isNonEmptyString(bpmn.relativePath) &&
    isSha256(bpmn.sha256) &&
    stimuli !== undefined &&
    stimuli.length >= 1 &&
    stimuli.every(isWellFormedStimulus) &&
    stimuli[0]?.kind === StimulusKind.StartProcess &&
    stimuli
      .slice(1)
      .every(
        (stimulus) =>
          stimulus.kind === StimulusKind.CompleteUserTaskInstance,
      ) &&
    observations !== undefined &&
    observations.length === supportedObservations.length &&
    observations.every(
      (observation, index) => observation === supportedObservations[index],
    )
  );
}

function isManyPlaceReferences(
  value: unknown,
  placeIds: ReadonlySet<string>,
): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    new Set(value).size === value.length &&
    isSortedStrings(value) &&
    value.every((item) => isPlaceReference(item, placeIds))
  );
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function isSortedById(values: ReadonlyArray<unknown>): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return (
      isRecord(value) &&
      isNonEmptyString(value.id) &&
      (previous === undefined ||
        (isRecord(previous) &&
          isNonEmptyString(previous.id) &&
          previous.id < value.id))
    );
  });
}

function isSortedStrings(values: ReadonlyArray<unknown>): boolean {
  return values.every(
    (value, index) =>
      typeof value === "string" &&
      (index === 0 || String(values[index - 1]) < value),
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
