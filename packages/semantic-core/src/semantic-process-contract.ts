import type { DeepReadonly } from "./deep-readonly.js";

export enum CheckedProcessKind {
  CheckedProcess = "checkedProcess",
}

export enum CheckedNodeKind {
  NoneStartEvent = "noneStartEvent",
  UserTask = "userTask",
  IntermediateCatchTimerEvent = "intermediateCatchTimerEvent",
  ServiceTask = "serviceTask",
  ParallelGateway = "parallelGateway",
  NoneEndEvent = "noneEndEvent",
}

export enum GatewayDirection {
  Diverging = "diverging",
  Converging = "converging",
}

export enum MappingExpressionKind {
  StringLiteral = "stringLiteral",
  LocalVariable = "localVariable",
}

export type MappingExpression =
  | DeepReadonly<{
      kind: MappingExpressionKind.StringLiteral;
      value: string;
    }>
  | DeepReadonly<{
      kind: MappingExpressionKind.LocalVariable;
      name: string;
    }>;

export type VariableMapping = DeepReadonly<{
  target: string;
  expression: MappingExpression;
}>;

export type CheckedProcessIdentity = DeepReadonly<{
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;

export type CheckedBpmnErrorRoute = DeepReadonly<{
  boundaryEventId: string;
  boundaryEventName: string | null;
  attachedToRef: string;
  errorDefinitionId: string;
  errorElementId: string;
  errorName: string | null;
  code: string;
  outputFlowId: string;
}>;

export const EffectProtocol = {
  Activity: "urn:bpmn-lean:effect-protocol:activity-v1",
} as const;

export const EffectOperation = {
  Probe: "urn:bpmn-lean:effect-operation:probe-v1",
  MappedSuccess: "urn:bpmn-lean:effect-operation:mapped-success-v1",
  MappedBoundaryError:
    "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1",
} as const;

export type EffectDescriptor = DeepReadonly<{
  protocol: string;
  operation: string;
}>;

type CheckedServiceTask = DeepReadonly<{
  kind: CheckedNodeKind.ServiceTask;
  id: string;
  descriptor: EffectDescriptor;
  inputMappings: VariableMapping[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: CheckedBpmnErrorRoute | null;
}>;

export type CheckedNode =
  | DeepReadonly<{
      kind: CheckedNodeKind.NoneStartEvent;
      id: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.UserTask;
      id: string;
      name: string | null;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.IntermediateCatchTimerEvent;
      id: string;
      durationLiteral: "PT1S";
    }>
  | CheckedServiceTask
  | DeepReadonly<{
      kind: CheckedNodeKind.ParallelGateway;
      id: string;
      direction: GatewayDirection;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.NoneEndEvent;
      id: string;
    }>;

export type CheckedSequenceFlow = DeepReadonly<{
  id: string;
  sourceId: string;
  targetId: string;
}>;

export type CheckedProcess = DeepReadonly<{
  kind: CheckedProcessKind.CheckedProcess;
  identity: CheckedProcessIdentity;
  processId: string;
  nodes: CheckedNode[];
  sequenceFlows: CheckedSequenceFlow[];
}>;

export enum SemanticProcessKind {
  SemanticProcess = "semanticProcess",
}

export enum SemanticProcessCompilerId {
  BpmnSourceSemanticProcess = "bpmn-source-semantic-process",
}

export enum SemanticOperationKind {
  Initiate = "initiate",
  AwaitUserTask = "awaitUserTask",
  AwaitTimer = "awaitTimer",
  AwaitEffect = "awaitEffect",
  Duplicate = "duplicate",
  Synchronize = "synchronize",
  Terminate = "terminate",
}

export enum SemanticOriginKind {
  BpmnElement = "bpmnElement",
  BpmnSequenceFlow = "bpmnSequenceFlow",
}

export type SemanticProcessIdentity = DeepReadonly<{
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess;
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;

export type BpmnElementOrigin = DeepReadonly<{
  kind: SemanticOriginKind.BpmnElement;
  elementId: string;
}>;

export type BpmnSequenceFlowOrigin = DeepReadonly<{
  kind: SemanticOriginKind.BpmnSequenceFlow;
  elementId: string;
}>;

export type ControlPlace = DeepReadonly<{
  id: string;
  origin: BpmnSequenceFlowOrigin;
}>;

export type BpmnErrorRoute = DeepReadonly<{
  code: string;
  output: string;
  origin: {
    kind: SemanticOriginKind.BpmnElement;
    boundaryEventId: string;
    errorDefinitionId: string;
    errorElementId: string;
    sequenceFlowId: string;
  };
}>;

type OperationBase = DeepReadonly<{
  id: string;
  origin: BpmnElementOrigin;
}>;

export type SemanticOperation =
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Initiate;
        output: string;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitUserTask;
        input: string;
        output: string;
        task: {
          elementId: string;
          name: string | null;
        };
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitTimer;
        input: string;
        output: string;
        timer: {
          elementId: string;
          durationMs: 1000;
        };
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.AwaitEffect;
        input: string;
        output: string;
        effect: {
          elementId: string;
          descriptor: EffectDescriptor;
          inputMappings: VariableMapping[];
          outputMappings: VariableMapping[];
        };
        bpmnErrorRoute: BpmnErrorRoute | null;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Duplicate;
        input: string;
        outputs: string[];
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Synchronize;
        inputs: string[];
        output: string;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.Terminate;
        input: string;
      }>);

export type SemanticProcessProgram = DeepReadonly<{
  kind: SemanticProcessKind.SemanticProcess;
  identity: SemanticProcessIdentity;
  processId: string;
  controlPlaces: ControlPlace[];
  operations: SemanticOperation[];
}>;
