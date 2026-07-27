/**
 * Cross-artifact reference, ordering, and producer-projection consistency checks.
 */
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  CheckedProcess,
  OccurrenceId,
  SemanticOperation,
  SemanticProcessProgram,
  StateObservation,
} from "../packages/semantic-core/src/index.ts";
import type {
  CibSevenEvidence,
  EffectJob,
  EffectJobSnapshot,
  TaskQueryTask,
  TimerJob,
} from "./contract-artifacts.ts";
import {
  requireUnicodeScalarString,
} from "./strict-json.ts";

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function requireSortedById<Value extends Readonly<{ id: string }>>(
  label: string,
  values: ReadonlyArray<Value>,
): void {
  const sorted = [...values].sort(compareIds);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted by id`);
  }
}

function requireSortedStrings(
  label: string,
  values: ReadonlyArray<string>,
): void {
  const sorted = [...values].sort(compareCanonicalStrings);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted`);
  }
}

function requireUniqueIds<Value extends Readonly<{ id: string }>>(
  label: string,
  values: ReadonlyArray<Value>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) {
      throw new Error(`${label} contains duplicate id ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
}

function referencedControlPlaces(
  operation: SemanticOperation,
): ReadonlyArray<string> {
  switch (operation.kind) {
    case "initiate":
      return [operation.output];
    case "awaitUserTask":
    case "awaitTimer":
    case "awaitEffect":
      return [operation.input, operation.output];
    case "duplicate":
      return [operation.input, ...operation.outputs];
    case "synchronize":
      return [...operation.inputs, operation.output];
    case "terminate":
      return [operation.input];
    default:
      throw new Error("unsupported semantic operation");
  }
}

export function verifyCanonicalDefinitionOrder(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  requireSortedById("checked process nodes", checkedProcess.nodes);
  requireSortedById(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  requireSortedById(
    "semantic process control places",
    semanticProcess.controlPlaces,
  );
  requireSortedById(
    "semantic process operations",
    semanticProcess.operations,
  );
  for (const operation of semanticProcess.operations) {
    switch (operation.kind) {
      case "duplicate":
        requireSortedStrings(
          `operation ${operation.id} outputs`,
          operation.outputs,
        );
        break;
      case "synchronize":
        requireSortedStrings(`operation ${operation.id} inputs`, operation.inputs);
        break;
      case "initiate":
      case "awaitUserTask":
      case "awaitTimer":
      case "awaitEffect":
      case "terminate":
        break;
      default:
        throw new Error("unsupported semantic operation");
    }
  }
}

export function verifyDefinitionReferences(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  const nodeIds = requireUniqueIds("checked process nodes", checkedProcess.nodes);
  const flowIds = requireUniqueIds(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  for (const flow of checkedProcess.sequenceFlows) {
    if (!nodeIds.has(flow.sourceId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown source node ${flow.sourceId}`,
      );
    }
    if (!nodeIds.has(flow.targetId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown target node ${flow.targetId}`,
      );
    }
  }

  const placeIds = requireUniqueIds(
    "semantic process control places",
    semanticProcess.controlPlaces,
  );
  requireUniqueIds("semantic process operations", semanticProcess.operations);
  for (const place of semanticProcess.controlPlaces) {
    if (!flowIds.has(place.origin.elementId)) {
      throw new Error(
        `control place ${place.id} references unknown Sequence Flow origin ${place.origin.elementId}`,
      );
    }
  }
  for (const operation of semanticProcess.operations) {
    if (!nodeIds.has(operation.origin.elementId)) {
      throw new Error(
        `operation ${operation.id} references unknown BPMN element origin ${operation.origin.elementId}`,
      );
    }
    for (const placeId of referencedControlPlaces(operation)) {
      if (!placeIds.has(placeId)) {
        throw new Error(
          `operation ${operation.id} references unknown control place ${placeId}`,
        );
      }
    }
    if (
      operation.kind === "awaitUserTask" &&
      operation.task.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} task identity differs from its BPMN origin`,
      );
    }
    if (
      operation.kind === "awaitTimer" &&
      operation.timer.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} timer identity differs from its BPMN origin`,
      );
    }
    if (
      operation.kind === "awaitEffect" &&
      operation.effect.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} effect identity differs from its BPMN origin`,
      );
    }
  }
}

export function verifyProducerProjection(evidence: CibSevenEvidence): void {
  const taskSnapshots = evidence.producerObservations.taskQueries;
  const timerSnapshots = evidence.producerObservations.timerJobs;
  const effectSnapshots =
    evidence.producerObservations.effectJobs ??
    statesWithEmptyEffectSnapshots(evidence.result.trace);
  const states: Array<Readonly<{
    afterCommandId: string;
    observation: StateObservation;
  }>> = [];
  let afterCommandId: string | undefined;
  for (const observation of evidence.result.trace) {
    switch (observation.kind) {
      case "deployment":
        break;
      case "command":
        afterCommandId = observation.commandId;
        break;
      case "state":
        if (afterCommandId === undefined) {
          throw new Error(
            "canonical state has no preceding command observation",
          );
        }
        states.push({ afterCommandId, observation });
        afterCommandId = undefined;
        break;
      default:
        throw new Error(
          "unsupported canonical observation",
        );
    }
  }
  if (
    states.length !== taskSnapshots.length ||
    states.length !== timerSnapshots.length ||
    states.length !== effectSnapshots.length
  ) {
    throw new Error(
      "producer observation count does not match canonical state count",
    );
  }

  for (const [index, state] of states.entries()) {
    const taskSnapshot = taskSnapshots[index];
    const timerSnapshot = timerSnapshots[index];
    const effectSnapshot = effectSnapshots[index];
    if (
      taskSnapshot === undefined ||
      timerSnapshot === undefined ||
      effectSnapshot === undefined
    ) {
      throw new Error("producer observation omitted one state snapshot");
    }
    if (
      taskSnapshot.afterCommandId !== state.afterCommandId ||
      timerSnapshot.afterCommandId !== state.afterCommandId ||
      effectSnapshot.afterCommandId !== state.afterCommandId
    ) {
      throw new Error(
        "producer observation is bound to a different command",
      );
    }
    const taskProjection = projectTaskQuery(
      state.observation.instanceId,
      taskSnapshot.tasks,
    );
    const timerProjection = projectTimerJobs(
      state.observation.instanceId,
      timerSnapshot.jobs,
    );
    const effectProjection = projectEffectJobs(
      state.observation.instanceId,
      effectSnapshot.jobs,
    );
    const activeWaits = [
      ...taskProjection.activeWaits,
      ...timerProjection.activeWaits,
      ...effectProjection.activeWaits,
    ].sort((left, right) =>
      compareStrings(left.elementId, right.elementId));
    const expectedByField: Pick<
      StateObservation,
      | "activeWaits"
      | "openUserTasks"
      | "openTimers"
      | "openEffects"
      | "enabledInteractions"
    > = {
      activeWaits,
      openUserTasks: taskProjection.openUserTasks,
      openTimers: timerProjection.openTimers,
      openEffects: effectProjection.openEffects,
      enabledInteractions: taskProjection.enabledInteractions,
    };
    for (
      const field of Object.keys(expectedByField) as Array<
        keyof typeof expectedByField
      >
    ) {
      const expected = expectedByField[field];
      if (!isDeepStrictEqual(state.observation[field], expected)) {
        throw new Error(
          `producer observation projection does not match canonical ${field}`,
        );
      }
    }
  }

  const effectExecutions =
    evidence.producerObservations.effectExecutions ?? [];
  if (effectExecutions.length > 0) {
    const execution = effectExecutions[0];
    if (
      effectExecutions.length !== 1 ||
      execution === undefined ||
      execution.schedule !== "plainSuccess" ||
      execution.invocations !== 1 ||
      execution.mutations !== 1 ||
      execution.initialRetries !== 3 ||
      execution.retriesAfterFirstFailure !== null
    ) {
      throw new Error(
        "retained CIB effect evidence must bind to plain success",
      );
    }
  }
}

function statesWithEmptyEffectSnapshots(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<EffectJobSnapshot> {
  const snapshots: Array<EffectJobSnapshot> = [];
  let afterCommandId: string | undefined;
  for (const observation of trace) {
    if (observation.kind === "command") {
      afterCommandId = observation.commandId;
    } else if (
      observation.kind === "state" &&
      afterCommandId !== undefined
    ) {
      snapshots.push({ afterCommandId, jobs: [] });
      afterCommandId = undefined;
    }
  }
  return snapshots;
}

function projectEffectJobs(
  instanceId: string,
  jobs: ReadonlyArray<EffectJob>,
): Pick<StateObservation, "activeWaits" | "openEffects"> {
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    jobs.map((job) => ({
    elementId: job.elementId,
    kind: "effect" as StateObservation["activeWaits"][number]["kind"],
    multiplicity: 1,
  }));
  const openEffects = jobs.map((job) => ({
    id: {
      processInstanceId: instanceId,
      elementId: job.elementId,
      activation: job.activation,
    },
    descriptor: {
      protocol: job.protocol,
      handler: job.handler,
    },
  }));
  return { activeWaits, openEffects };
}

function projectTimerJobs(
  instanceId: string,
  jobs: ReadonlyArray<TimerJob>,
): Pick<StateObservation, "activeWaits" | "openTimers"> {
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    jobs
    .map((job) => ({
      elementId: job.elementId,
      kind: "timer" as StateObservation["activeWaits"][number]["kind"],
      multiplicity: 1,
    }))
    .sort((left, right) =>
      compareStrings(left.elementId, right.elementId));
  const openTimers = jobs
    .map((job) => ({
      id: {
        processInstanceId: instanceId,
        elementId: job.elementId,
        activation: 1,
      },
      deadlineMs: job.dueDateDeltaMs,
    }))
    .sort((left, right) =>
      compareTaskIdentities(left.id, right.id));
  return { activeWaits, openTimers };
}

function projectTaskQuery(
  instanceId: string,
  tasks: ReadonlyArray<TaskQueryTask>,
): Pick<
  StateObservation,
  "activeWaits" | "openUserTasks" | "enabledInteractions"
> {
  const multiplicities = new Map<string, number>();
  const byElement = new Map<string, TaskQueryTask>();
  for (const task of tasks) {
    multiplicities.set(
      task.elementId,
      (multiplicities.get(task.elementId) ?? 0) + 1,
    );
    if (byElement.has(task.elementId)) {
      throw new Error(
        `producer task query repeats unsupported element ${task.elementId}`,
      );
    }
    byElement.set(task.elementId, task);
  }
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    [...multiplicities.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([elementId, multiplicity]) => ({
      elementId,
      kind:
        "userTask" as StateObservation["activeWaits"][number]["kind"],
      multiplicity,
    }));
  const openUserTasks: Array<StateObservation["openUserTasks"][number]> =
    [...byElement.values()]
    .map((task) => ({
      id: {
        processInstanceId: instanceId,
        elementId: task.elementId,
        activation: 1,
      },
      name: task.name,
      state:
        "active" as StateObservation["openUserTasks"][number]["state"],
    }))
    .sort((left, right) =>
      compareTaskIdentities(left.id, right.id)
    );
  return {
    activeWaits,
    openUserTasks,
    enabledInteractions: openUserTasks.map((task) => ({
      kind:
        "completeUserTaskInstance" as StateObservation[
          "enabledInteractions"
        ][number]["kind"],
      taskId: task.id,
    })),
  };
}

function compareTaskIdentities(
  left: OccurrenceId,
  right: OccurrenceId,
): number {
  for (
    const field of [
      "processInstanceId",
      "elementId",
    ] as const
  ) {
    const comparison = compareStrings(left[field], right[field]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.activation - right.activation;
}

function compareStrings(left: string, right: string): number {
  return compareCanonicalStrings(left, right);
}

export function compareCanonicalStrings(
  left: string,
  right: string,
): number {
  requireUnicodeScalarString(left, "canonical string");
  requireUnicodeScalarString(right, "canonical string");
  const leftScalars = [...left];
  const rightScalars = [...right];
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftValue = leftScalars[index];
    const rightValue = rightScalars[index];
    if (leftValue === undefined || rightValue === undefined) {
      throw new Error("canonical scalar iteration lost an indexed value");
    }
    const leftScalar = leftValue.codePointAt(0);
    const rightScalar = rightValue.codePointAt(0);
    if (leftScalar === undefined || rightScalar === undefined) {
      throw new Error("canonical scalar has no code point");
    }
    if (leftScalar !== rightScalar) {
      return leftScalar < rightScalar ? -1 : 1;
    }
  }
  return Math.sign(leftScalars.length - rightScalars.length);
}
