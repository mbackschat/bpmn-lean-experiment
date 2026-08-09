/**
 * Typed mutable fixtures and assertions shared by contract boundary tests.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type {
  ArtifactSet,
  DefinitionArtifacts,
} from "./contract-artifacts.ts";
import type {
  CanonicalObservation,
  CheckedNode,
  CompleteUserTaskInstanceStimulus,
  ControlPlace,
  SemanticOperation,
  SemanticOperationKind,
  StateObservation,
  Stimulus,
  CheckedNodeKind,
} from "../packages/semantic-core/src/index.ts";

export type DeepMutable<Value> =
  Value extends (...args: never[]) => unknown
    ? Value
    : Value extends readonly [unknown, ...unknown[]]
      ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
    : Value extends ReadonlyArray<infer Item>
      ? Array<DeepMutable<Item>>
      : Value extends object
        ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
        : Value;

export type MutableArtifactSet =
  Pick<ArtifactSet, "validator" | "registeredRelationshipIds"> &
  DeepMutable<
    Omit<ArtifactSet, "validator" | "registeredRelationshipIds">
  >;

export type MutableDefinitionArtifacts = DeepMutable<DefinitionArtifacts>;

type IntegerSchemaLocation = Readonly<{
  path: string;
  schema: Readonly<{
    maximum?: unknown;
  }>;
}>;

export const checkedNodeKind = Object.freeze({
  UserTask: "userTask" as CheckedNodeKind.UserTask,
  ServiceTask: "serviceTask" as CheckedNodeKind.ServiceTask,
});

export const semanticOperationKind = Object.freeze({
  AwaitUserTask:
    "awaitUserTask" as SemanticOperationKind.AwaitUserTask,
  AwaitEffect: "awaitEffect" as SemanticOperationKind.AwaitEffect,
  Duplicate: "duplicate" as SemanticOperationKind.Duplicate,
  Synchronize:
    "synchronize" as SemanticOperationKind.Synchronize,
});

export function cloneArtifactSet(
  artifactSet: ArtifactSet,
): MutableArtifactSet {
  return {
    ...artifactSet,
    profile: structuredClone(artifactSet.profile),
    profileBytes: Buffer.from(artifactSet.profileBytes),
    scenario: structuredClone(artifactSet.scenario),
    scenarioBytes: Buffer.from(artifactSet.scenarioBytes),
    evidence: structuredClone(artifactSet.evidence),
    bpmnBytes: Buffer.from(artifactSet.bpmnBytes),
  } as MutableArtifactSet;
}

export function bindScenarioBytes(
  artifactSet: MutableArtifactSet,
  scenarioBytes: string | Uint8Array,
): void {
  artifactSet.scenarioBytes = Buffer.from(scenarioBytes);
  artifactSet.evidence.scenario.sha256 = createHash("sha256")
    .update(artifactSet.scenarioBytes)
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function collectIntegerSchemas(
  value: unknown,
  locations: Array<IntegerSchemaLocation> = [],
  path = "$",
): Array<IntegerSchemaLocation> {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectIntegerSchemas(item, locations, `${path}[${index}]`));
    return locations;
  }
  if (isRecord(value)) {
    if (value.type === "integer") {
      locations.push({ path, schema: value });
    }
    for (const [name, item] of Object.entries(value)) {
      collectIntegerSchemas(item, locations, `${path}.${name}`);
    }
  }
  return locations;
}

export function collectPropertyNames(
  value: unknown,
  names = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPropertyNames(item, names);
    }
    return names;
  }
  if (isRecord(value)) {
    for (const [name, item] of Object.entries(value)) {
      names.add(name);
      collectPropertyNames(item, names);
    }
  }
  return names;
}

export function parallelDefinitionArtifacts(): MutableDefinitionArtifacts {
  const identity = {
    semanticProfile: "parallel-fork-join-draft",
    sourceId: "parallel-two-user-tasks.bpmn",
    sourceSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceOverlay: null,
  };
  return {
    checkedProcess: {
      kind: "checkedProcess",
      identity,
      processId: "Process_ParallelUserTasks",
      ...checkedRootScope(
        "Process_ParallelUserTasks",
        [
          "End_None",
          "Gateway_Fork",
          "Gateway_Join",
          "Start_None",
          "UserTask_A",
          "UserTask_B",
        ],
        [
          "Flow_Fork_A",
          "Flow_Fork_B",
          "Flow_Join_End",
          "Flow_Start_Fork",
          "Flow_Task_A_Join",
          "Flow_Task_B_Join",
        ],
      ),
      nodes: [
        { kind: "noneEndEvent", id: "End_None" },
        {
          kind: "parallelGateway",
          id: "Gateway_Fork",
          direction: "diverging",
        },
        {
          kind: "parallelGateway",
          id: "Gateway_Join",
          direction: "converging",
        },
        { kind: "noneStartEvent", id: "Start_None" },
        { kind: "userTask", id: "UserTask_A", name: "A" },
        { kind: "userTask", id: "UserTask_B", name: "B" },
      ],
      sequenceFlows: [
        {
          id: "Flow_Fork_A",
          sourceId: "Gateway_Fork",
          targetId: "UserTask_A",
          condition: null,
        },
        {
          id: "Flow_Fork_B",
          sourceId: "Gateway_Fork",
          targetId: "UserTask_B",
          condition: null,
        },
        {
          id: "Flow_Join_End",
          sourceId: "Gateway_Join",
          targetId: "End_None",
          condition: null,
        },
        {
          id: "Flow_Start_Fork",
          sourceId: "Start_None",
          targetId: "Gateway_Fork",
          condition: null,
        },
        {
          id: "Flow_Task_A_Join",
          sourceId: "UserTask_A",
          targetId: "Gateway_Join",
          condition: null,
        },
        {
          id: "Flow_Task_B_Join",
          sourceId: "UserTask_B",
          targetId: "Gateway_Join",
          condition: null,
        },
      ],
    },
    semanticProcess: {
      kind: "semanticProcess",
      identity: {
        compiler: "bpmn-source-semantic-process",
        ...identity,
      },
      processId: "Process_ParallelUserTasks",
      ...semanticRootScope(
        "Process_ParallelUserTasks",
        [
          "operation:End_None",
          "operation:Gateway_Fork",
          "operation:Gateway_Join",
          "operation:Start_None",
          "operation:UserTask_A",
          "operation:UserTask_B",
          "operation:complete-scope:scope:Process_ParallelUserTasks",
        ],
        [
          "Flow_Fork_A",
          "Flow_Fork_B",
          "Flow_Join_End",
          "Flow_Start_Fork",
          "Flow_Task_A_Join",
          "Flow_Task_B_Join",
        ],
      ),
      controlPlaces: [
        controlPlace("Flow_Fork_A"),
        controlPlace("Flow_Fork_B"),
        controlPlace("Flow_Join_End"),
        controlPlace("Flow_Start_Fork"),
        controlPlace("Flow_Task_A_Join"),
        controlPlace("Flow_Task_B_Join"),
      ],
      operations: [
        operation("End_None", "reachNoneEnd", {
          input: "place:Flow_Join_End",
        }),
        operation("Gateway_Fork", "duplicate", {
          input: "place:Flow_Start_Fork",
          outputs: ["place:Flow_Fork_A", "place:Flow_Fork_B"],
        }),
        operation("Gateway_Join", "synchronize", {
          inputs: ["place:Flow_Task_A_Join", "place:Flow_Task_B_Join"],
          output: "place:Flow_Join_End",
        }),
        operation("Start_None", "initiate", {
          output: "place:Flow_Start_Fork",
        }),
        operation("UserTask_A", "awaitUserTask", {
          input: "place:Flow_Fork_A",
          output: "place:Flow_Task_A_Join",
          task: { elementId: "UserTask_A", name: "A" },
        }),
        operation("UserTask_B", "awaitUserTask", {
          input: "place:Flow_Fork_B",
          output: "place:Flow_Task_B_Join",
          task: { elementId: "UserTask_B", name: "B" },
        }),
        scopeCompletion("Process_ParallelUserTasks"),
      ],
    },
  } as unknown as MutableDefinitionArtifacts;
}

export function serviceTaskDefinitionArtifacts(): MutableDefinitionArtifacts {
  const identity = {
    semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
    sourceId: "service-task-effect-phase-zero-probe",
    sourceSha256:
      "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d",
    sourceOverlay: null,
  };
  const descriptor = {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:probe-v1",
  };
  return {
    checkedProcess: {
      kind: "checkedProcess",
      identity,
      processId: "Process_ServiceTaskEffectProbe",
      ...checkedRootScope(
        "Process_ServiceTaskEffectProbe",
        ["EndEvent_1", "ServiceTask_Record", "StartEvent_1"],
        ["Flow_ServiceToEnd", "Flow_StartToService"],
      ),
      nodes: [
        { kind: "noneEndEvent", id: "EndEvent_1" },
        {
          kind: "serviceTask",
          id: "ServiceTask_Record",
          descriptor: { ...descriptor },
          inputMappings: [],
          outputMappings: [],
          bpmnErrorRoute: null,
        },
        { kind: "noneStartEvent", id: "StartEvent_1" },
      ],
      sequenceFlows: [
        {
          id: "Flow_ServiceToEnd",
          sourceId: "ServiceTask_Record",
          targetId: "EndEvent_1",
          condition: null,
        },
        {
          id: "Flow_StartToService",
          sourceId: "StartEvent_1",
          targetId: "ServiceTask_Record",
          condition: null,
        },
      ],
    },
    semanticProcess: {
      kind: "semanticProcess",
      identity: {
        compiler: "bpmn-source-semantic-process",
        ...identity,
      },
      processId: "Process_ServiceTaskEffectProbe",
      ...semanticRootScope(
        "Process_ServiceTaskEffectProbe",
        [
          "operation:EndEvent_1",
          "operation:ServiceTask_Record",
          "operation:StartEvent_1",
          "operation:complete-scope:scope:Process_ServiceTaskEffectProbe",
        ],
        ["Flow_ServiceToEnd", "Flow_StartToService"],
      ),
      controlPlaces: [
        controlPlace("Flow_ServiceToEnd"),
        controlPlace("Flow_StartToService"),
      ],
      operations: [
        operation("EndEvent_1", "reachNoneEnd", {
          input: "place:Flow_ServiceToEnd",
        }),
        operation("ServiceTask_Record", "awaitEffect", {
          input: "place:Flow_StartToService",
          output: "place:Flow_ServiceToEnd",
          effect: {
            elementId: "ServiceTask_Record",
            descriptor,
            inputMappings: [],
            outputMappings: [],
          },
          bpmnErrorRoute: null,
        }),
        operation("StartEvent_1", "initiate", {
          output: "place:Flow_StartToService",
        }),
        scopeCompletion("Process_ServiceTaskEffectProbe"),
      ],
    },
  } as unknown as MutableDefinitionArtifacts;
}

function controlPlace(flowId: string): ControlPlace {
  return {
    id: `place:${flowId}`,
    origin: { kind: "bpmnSequenceFlow", elementId: flowId },
  } as unknown as ControlPlace;
}

function checkedRootScope(
  processId: string,
  nodeIds: ReadonlyArray<string>,
  flowIds: ReadonlyArray<string>,
) {
  const scopeId = `scope:${processId}`;
  return {
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: processId,
    }],
    nodeScopes: nodeIds.map((nodeId) => ({ nodeId, scopeId })),
    sequenceFlowScopes: flowIds.map((sequenceFlowId) => ({
      sequenceFlowId,
      scopeId,
    })),
  };
}

function semanticRootScope(
  processId: string,
  operationIds: ReadonlyArray<string>,
  flowIds: ReadonlyArray<string>,
) {
  const scopeId = `scope:${processId}`;
  return {
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: processId,
    }],
    operationScopes: operationIds.map((operationId) => ({
      operationId,
      scopeId,
    })),
    controlPlaceScopes: flowIds.map((flowId) => ({
      controlPlaceId: `place:${flowId}`,
      scopeId,
    })),
  };
}

function scopeCompletion(processId: string): SemanticOperation {
  const scopeId = `scope:${processId}`;
  return {
    id: `operation:complete-scope:${scopeId}`,
    kind: "completeScope",
    origin: { kind: "bpmnElement", elementId: processId },
    scopeId,
    parentOutput: null,
  } as unknown as SemanticOperation;
}

function operation(
  elementId: string,
  kind: string,
  fields: Readonly<Record<string, unknown>>,
): SemanticOperation {
  return {
    id: `operation:${elementId}`,
    kind,
    origin: { kind: "bpmnElement", elementId },
    ...fields,
  } as unknown as SemanticOperation;
}

export function required<Value>(
  value: Value | undefined,
  label: string,
): Value {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }
  return value;
}

export function requiredAt<Value>(
  values: ReadonlyArray<Value>,
  index: number,
  label: string,
): Value {
  return required(values[index], `${label}[${index}]`);
}

export function requireUserTaskCompletion(
  stimulus: DeepMutable<Stimulus> | undefined,
): DeepMutable<CompleteUserTaskInstanceStimulus> {
  if (stimulus?.kind !== "completeUserTaskInstance") {
    throw new Error("expected a User Task completion stimulus");
  }
  return stimulus;
}

export function requireState(
  observation: CanonicalObservation | undefined,
): StateObservation {
  if (observation?.kind !== "state") {
    throw new Error("expected a canonical state observation");
  }
  return observation;
}

export function requireMutableState(
  observation: DeepMutable<CanonicalObservation> | undefined,
): DeepMutable<StateObservation> {
  if (observation?.kind !== "state") {
    throw new Error("expected a mutable canonical state observation");
  }
  return observation;
}

type MutableCheckedUserTask = DeepMutable<
  Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }>
>;
type MutableAwaitUserTask = DeepMutable<
  Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitUserTask }
  >
>;
type MutableServiceTask = DeepMutable<
  Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }>
>;
type MutableAwaitEffect = DeepMutable<
  Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.AwaitEffect }
  >
>;

export function requireCheckedUserTask(
  node: DeepMutable<CheckedNode> | undefined,
): MutableCheckedUserTask {
  if (node?.kind !== checkedNodeKind.UserTask) {
    throw new Error("expected a checked User Task");
  }
  return node;
}

export function requireAwaitUserTask(
  operationValue: DeepMutable<SemanticOperation> | undefined,
): MutableAwaitUserTask {
  if (
    operationValue?.kind !== semanticOperationKind.AwaitUserTask
  ) {
    throw new Error("expected an awaitUserTask operation");
  }
  return operationValue;
}
export function requireServiceTask(
  node: DeepMutable<CheckedNode> | undefined,
): MutableServiceTask {
  if (node?.kind !== checkedNodeKind.ServiceTask) {
    throw new Error("expected a checked Service Task");
  }
  return node;
}

export function requireAwaitEffect(
  operationValue: DeepMutable<SemanticOperation> | undefined,
): MutableAwaitEffect {
  if (operationValue?.kind !== semanticOperationKind.AwaitEffect) {
    throw new Error("expected an awaitEffect operation");
  }
  return operationValue;
}
