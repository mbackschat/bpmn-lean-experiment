/**
 * Reconstructs canonical CIB observations from retained raw producer facts.
 */
import { isDeepStrictEqual } from "node:util";

import type {
  OccurrenceId,
  StateObservation,
  VariableBinding,
  VariableValueKind,
  WaitKind,
} from "../packages/semantic-core/src/index.ts";
import type {
  CibSevenEvidence,
  MappingExecutionSnapshot,
  MessageSubscriptionEvidence,
  ProcessVariableSnapshot,
  TaskQueryTask,
  TimerJob,
} from "./contract-artifacts.ts";
import {
  compareCanonicalStrings,
} from "./contract-artifact-consistency.ts";
import {
  projectEffectJobs,
  statesWithEmptyEffectSnapshots,
} from "./contract-effect-projection.ts";
import {
  projectCibUserTaskMetadata,
} from "./contract-cib-user-task-metadata-projection.ts";

const activeWaitKindRank = {
  userTask: 0,
  message: 1,
  timer: 2,
  effect: 3,
  incident: 4,
} as const satisfies Record<
  StateObservation["activeWaits"][number]["kind"],
  number
>;

export function verifyProducerProjection(
  evidence: CibSevenEvidence,
  expectedInstanceId: string,
): void {
  const stateSnapshots = evidence.producerObservations.stateQueries;
  const taskSnapshots = evidence.producerObservations.taskQueries;
  const timerSnapshots = evidence.producerObservations.timerJobs;
  const states = collectCanonicalStates(evidence.result.trace);
  const messageSnapshots =
    evidence.producerObservations.messageSubscriptions ??
    states.map(({ afterCommandId }) => ({
      afterCommandId,
      subscriptions: [],
    }));
  const effectSnapshots =
    evidence.producerObservations.effectJobs ??
    statesWithEmptyEffectSnapshots(evidence.result.trace);
  if (
    states.length !== stateSnapshots.length ||
    states.length !== taskSnapshots.length ||
    states.length !== messageSnapshots.length ||
    states.length !== timerSnapshots.length ||
    states.length !== effectSnapshots.length
  ) {
    throw new Error(
      "producer observation count does not match canonical state count",
    );
  }

  for (const [index, state] of states.entries()) {
    const stateSnapshot = stateSnapshots[index];
    const taskSnapshot = taskSnapshots[index];
    const timerSnapshot = timerSnapshots[index];
    const messageSnapshot = messageSnapshots[index];
    const effectSnapshot = effectSnapshots[index];
    if (
      stateSnapshot === undefined ||
      taskSnapshot === undefined ||
      messageSnapshot === undefined ||
      timerSnapshot === undefined ||
      effectSnapshot === undefined
    ) {
      throw new Error("producer observation omitted one state snapshot");
    }
    if (
      stateSnapshot.afterCommandId !== state.afterCommandId ||
      taskSnapshot.afterCommandId !== state.afterCommandId ||
      messageSnapshot.afterCommandId !== state.afterCommandId ||
      timerSnapshot.afterCommandId !== state.afterCommandId ||
      effectSnapshot.afterCommandId !== state.afterCommandId
    ) {
      throw new Error(
        "producer observation is bound to a different command",
      );
    }
    if (state.observation.instanceId !== expectedInstanceId) {
      throw new Error(
        "producer observation projection does not match canonical instanceId",
      );
    }

    const stateProjection = projectStateQuery(stateSnapshot);
    const taskProjection = projectTaskQuery(
      evidence.profile.id,
      expectedInstanceId,
      taskSnapshot.tasks,
    );
    const timerProjection = projectTimerJobs(
      expectedInstanceId,
      timerSnapshot.jobs,
    );
    const messageProjection = projectMessageSubscriptions(
      expectedInstanceId,
      messageSnapshot.subscriptions,
    );
    const effectProjection = projectEffectJobs(
      expectedInstanceId,
      effectSnapshot.jobs,
    );
    const activeWaits = [
      ...taskProjection.activeWaits,
      ...messageProjection.activeWaits,
      ...timerProjection.activeWaits,
      ...effectProjection.activeWaits,
    ].sort((left, right) => {
      const kindComparison =
        activeWaitKindRank[left.kind] - activeWaitKindRank[right.kind];
      return kindComparison === 0
        ? compareCanonicalStrings(left.elementId, right.elementId)
        : kindComparison;
    });
    const expectedByField: Pick<
      StateObservation,
      | "status"
      | "activeWaits"
      | "openUserTasks"
      | "openMessageSubscriptions"
      | "openTimers"
      | "openEffects"
      | "openIncidents"
      | "variables"
      | "enabledInteractions"
      | "logicalTimeMs"
    > = {
      status: stateProjection.status,
      activeWaits,
      openUserTasks: taskProjection.openUserTasks,
      openMessageSubscriptions:
        messageProjection.openMessageSubscriptions,
      openTimers: timerProjection.openTimers,
      openEffects: effectProjection.openEffects,
      openIncidents: [],
      variables: stateProjection.variables,
      enabledInteractions: [
        ...taskProjection.enabledInteractions,
        ...messageProjection.enabledInteractions,
      ],
      logicalTimeMs: stateProjection.logicalTimeMs,
    };
    for (
      const field of Object.keys(expectedByField) as Array<
        keyof typeof expectedByField
      >
    ) {
      if (
        !isDeepStrictEqual(
          state.observation[field],
          expectedByField[field],
        )
      ) {
        throw new Error(
          `producer observation projection does not match canonical ${field}`,
        );
      }
    }
  }

  verifyEffectExecutions(evidence);
  verifyMappingExecutions(evidence);
}

function collectCanonicalStates(
  trace: CibSevenEvidence["result"]["trace"],
): ReadonlyArray<Readonly<{
  afterCommandId: string;
  observation: StateObservation;
}>> {
  const states: Array<Readonly<{
    afterCommandId: string;
    observation: StateObservation;
  }>> = [];
  let afterCommandId: string | undefined;
  for (const observation of trace) {
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
        throw new Error("unsupported canonical observation");
    }
  }
  return states;
}

function projectStateQuery(
  snapshot: CibSevenEvidence["producerObservations"]["stateQueries"][number],
): Pick<StateObservation, "status" | "variables" | "logicalTimeMs"> {
  if (
    snapshot.processInstanceCount !== 0 &&
    snapshot.processInstanceCount !== 1
  ) {
    throw new Error(
      "producer state query must identify zero or one Process instance",
    );
  }
  const status =
    snapshot.processInstanceCount === 1
      ? "running" as StateObservation["status"]
      : "completed" as StateObservation["status"];
  const names = new Set<string>();
  const variables = snapshot.variables
    .map((variable) => {
      if (names.has(variable.name)) {
        throw new Error(
          `producer state query repeats Process variable ${variable.name}`,
        );
      }
      names.add(variable.name);
      return projectCibProcessVariable(variable);
    })
    .sort((left, right) =>
      compareCanonicalStrings(left.name, right.name));
  return {
    status,
    variables,
    logicalTimeMs: snapshot.engineClockTimeMs,
  };
}

export function projectCibProcessVariable(
  variable: ProcessVariableSnapshot,
): VariableBinding {
  let value: VariableBinding["value"];
  switch (typeof variable.value) {
    case "string":
      value = {
        kind: "string" as VariableValueKind.String,
        value: variable.value,
      };
      break;
    case "boolean":
      value = {
        kind: "boolean" as VariableValueKind.Boolean,
        value: variable.value,
      };
      break;
    case "object":
      if (variable.value !== null) {
        throw new TypeError("unsupported raw CIB variable object");
      }
      value = { kind: "null" as VariableValueKind.Null };
      break;
    default: {
      const unsupported: never = variable.value;
      throw new TypeError(
        `unsupported raw CIB variable: ${String(unsupported)}`,
      );
    }
  }
  return {
    name: variable.name,
    value,
  };
}

function verifyEffectExecutions(evidence: CibSevenEvidence): void {
  const effectExecutions =
    evidence.producerObservations.effectExecutions ?? [];
  if (effectExecutions.length === 0) {
    return;
  }
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

function verifyMappingExecutions(evidence: CibSevenEvidence): void {
  const mappingExecutions =
    evidence.producerObservations.mappingExecutions ?? [];
  if (mappingExecutions.length === 0) {
    return;
  }
  if (mappingExecutions.length !== 1) {
    throw new Error(
      "retained CIB mapping evidence requires one execution",
    );
  }
  verifyMappingExecution(
    mappingExecutions[0],
    evidence.result.trace,
  );
}

function verifyMappingExecution(
  execution: MappingExecutionSnapshot | undefined,
  trace: CibSevenEvidence["result"]["trace"],
): void {
  if (execution === undefined || execution.invocations !== 1) {
    throw new Error(
      "retained CIB mapping evidence requires one delegate invocation",
    );
  }
  const finalState = [...trace].reverse().find(
    (observation) => observation.kind === "state",
  );
  switch (execution.handler) {
    case "mappedSuccessHandler":
      if (
        execution.afterCommandId !== "start-mapped-success" ||
        !isDeepStrictEqual(execution.arguments, [
          {
            name: "requestValue",
            value: { kind: "string", value: "example-input" },
          },
        ]) ||
        !isDeepStrictEqual(execution.localPatch, [
          {
            name: "result",
            value: { kind: "string", value: "example-result" },
          },
        ]) ||
        finalState?.kind !== "state" ||
        !isDeepStrictEqual(finalState.variables, [
          {
            name: "resultValue",
            value: { kind: "string", value: "example-result" },
          },
        ])
      ) {
        throw new Error(
          "retained CIB mapping evidence does not establish the mapped-success contract",
        );
      }
      return;
    case "mappedBoundaryErrorHandler":
      if (
        execution.afterCommandId !== "start-mapped-boundary-error" ||
        !isDeepStrictEqual(execution.arguments, [
          {
            name: "requestValue",
            value: { kind: "string", value: "example-input" },
          },
        ]) ||
        !isDeepStrictEqual(execution.localPatch, [
          {
            name: "result",
            value: { kind: "null" },
          },
        ]) ||
        finalState?.kind !== "state" ||
        !isDeepStrictEqual(finalState.variables, [
          {
            name: "resultValue",
            value: { kind: "null" },
          },
        ])
      ) {
        throw new Error(
          "retained CIB mapping evidence does not establish the mapped-boundary-error contract",
        );
      }
      return;
    default:
      throw new Error(
        `unsupported retained CIB mapping handler: ${execution.handler}`,
      );
  }
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
        compareCanonicalStrings(left.elementId, right.elementId));
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

function projectMessageSubscriptions(
  instanceId: string,
  subscriptions: ReadonlyArray<MessageSubscriptionEvidence>,
): Pick<
  StateObservation,
  "activeWaits" | "openMessageSubscriptions" | "enabledInteractions"
> {
  type MessageInteraction = Extract<
    StateObservation["enabledInteractions"][number],
    { readonly subscriptionId: OccurrenceId }
  >;
  if (subscriptions.length > 1) {
    throw new Error(
      "producer Message projection supports one live Receive Task subscription",
    );
  }
  for (const subscription of subscriptions) {
    if (
      !subscription.processInstanceIdMatches ||
      !subscription.executionIdPresent
    ) {
      throw new Error(
        "producer Message subscription omitted its live CIB identity",
      );
    }
  }
  const openMessageSubscriptions = subscriptions.map((subscription) => ({
    id: {
      processInstanceId: instanceId,
      elementId: subscription.elementId,
      activation: 1,
    },
    channel: {
      kind: "directMessage" as const,
      messageId: subscription.messageId,
    },
  }));
  return {
    activeWaits: subscriptions.map((subscription) => ({
      elementId: subscription.elementId,
      kind: "message" as WaitKind.Message,
      multiplicity: 1,
    })),
    openMessageSubscriptions,
    enabledInteractions: openMessageSubscriptions.map((subscription) => ({
      kind: "deliverMessage" as MessageInteraction["kind"],
      subscriptionId: subscription.id,
      channel: subscription.channel,
    })),
  };
}

function projectTaskQuery(
  profileId: string,
  instanceId: string,
  tasks: ReadonlyArray<TaskQueryTask>,
): Pick<
  StateObservation,
  "activeWaits" | "openUserTasks" | "enabledInteractions"
> {
  type UserTaskInteraction = Extract<
    StateObservation["enabledInteractions"][number],
    { readonly taskId: OccurrenceId }
  >;
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
      .sort(([left], [right]) =>
        compareCanonicalStrings(left, right))
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
        ...projectOptionalTaskMetadata(profileId, task),
      }))
      .sort((left, right) =>
        compareTaskIdentities(left.id, right.id));
  return {
    activeWaits,
    openUserTasks,
    enabledInteractions: openUserTasks.map((task) => ({
      kind:
        "completeUserTaskInstance" as UserTaskInteraction["kind"],
      taskId: task.id,
    })),
  };
}

function projectOptionalTaskMetadata(
  profileId: string,
  task: TaskQueryTask,
): Readonly<{ metadata?: never } | {
  metadata: NonNullable<StateObservation["openUserTasks"][number]["metadata"]>;
}> {
  const metadata = projectCibUserTaskMetadata(profileId, task);
  return metadata === undefined ? {} : { metadata };
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
    const comparison = compareCanonicalStrings(
      left[field],
      right[field],
    );
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.activation - right.activation;
}
