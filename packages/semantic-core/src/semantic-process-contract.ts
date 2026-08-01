import type { DeepReadonly } from "./deep-readonly.js";

export enum CheckedProcessKind {
  CheckedProcess = "checkedProcess",
}

export enum CheckedNodeKind {
  NoneStartEvent = "noneStartEvent",
  EmbeddedSubProcess = "embeddedSubProcess",
  BoundaryErrorEvent = "boundaryErrorEvent",
  UserTask = "userTask",
  IntermediateCatchTimerEvent = "intermediateCatchTimerEvent",
  IntermediateCatchMessageEvent = "intermediateCatchMessageEvent",
  ReceiveTask = "receiveTask",
  ServiceTask = "serviceTask",
  ParallelGateway = "parallelGateway",
  ExclusiveGateway = "exclusiveGateway",
  ErrorEndEvent = "errorEndEvent",
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

export type ErrorReference = DeepReadonly<{
  errorDefinitionId: string;
  errorElementId: string;
  code: string;
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

export const SimpleBooleanExpressionLanguage =
  "urn:bpmn-lean:expression:simple-boolean:v1";

export enum SimpleBooleanExpressionKind {
  Literal = "literal",
  IsPresent = "isPresent",
  IsNull = "isNull",
  StringEquals = "stringEquals",
}

export type SimpleBooleanExpression =
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.Literal;
      value: boolean;
    }>
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.IsPresent;
      variable: string;
    }>
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.IsNull;
      variable: string;
    }>
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.StringEquals;
      variable: string;
      value: string;
    }>;

export type CheckedCondition = DeepReadonly<{
  language: string;
  body: string;
}>;

export const MessageChannelKind = {
  OperationMessage: "operationMessage",
  DirectMessage: "directMessage",
} as const;

export type MessageChannelKind =
  typeof MessageChannelKind[keyof typeof MessageChannelKind];

export type MessageChannel = DeepReadonly<
  | {
      kind: typeof MessageChannelKind.OperationMessage;
      interfaceId: string;
      interfaceOperationId: string;
      messageId: string;
    }
  | {
      kind: typeof MessageChannelKind.DirectMessage;
      messageId: string;
    }
>;

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
      kind: CheckedNodeKind.EmbeddedSubProcess;
      id: string;
      childScopeId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.BoundaryErrorEvent;
      id: string;
      attachedToRef: string;
      error: ErrorReference;
      outputFlowId: string;
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
  | DeepReadonly<{
      kind: CheckedNodeKind.IntermediateCatchMessageEvent;
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.OperationMessage }
      >;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ReceiveTask;
      id: string;
      channel: Extract<
        MessageChannel,
        { kind: typeof MessageChannelKind.DirectMessage }
      >;
    }>
  | CheckedServiceTask
  | DeepReadonly<{
      kind: CheckedNodeKind.ParallelGateway;
      id: string;
      direction: GatewayDirection;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ExclusiveGateway;
      id: string;
      direction: GatewayDirection.Diverging;
      candidateFlowIds: [string, string];
      defaultFlowId: string;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.ErrorEndEvent;
      id: string;
      error: ErrorReference;
    }>
  | DeepReadonly<{
      kind: CheckedNodeKind.NoneEndEvent;
      id: string;
    }>;

export type CheckedSequenceFlow = DeepReadonly<{
  id: string;
  sourceId: string;
  targetId: string;
  condition: CheckedCondition | null;
}>;

export type DefinitionScope = DeepReadonly<{
  id: string;
  parentScopeId: string | null;
  originElementId: string;
}>;

export type NodeScopeOwnership = DeepReadonly<{
  nodeId: string;
  scopeId: string;
}>;

export type SequenceFlowScopeOwnership = DeepReadonly<{
  sequenceFlowId: string;
  scopeId: string;
}>;

export type CheckedProcess = DeepReadonly<{
  kind: CheckedProcessKind.CheckedProcess;
  identity: CheckedProcessIdentity;
  processId: string;
  definitionScopes: DefinitionScope[];
  nodeScopes: NodeScopeOwnership[];
  sequenceFlowScopes: SequenceFlowScopeOwnership[];
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
  EnterScope = "enterScope",
  AwaitUserTask = "awaitUserTask",
  AwaitMessage = "awaitMessage",
  AwaitTimer = "awaitTimer",
  AwaitEffect = "awaitEffect",
  Duplicate = "duplicate",
  Synchronize = "synchronize",
  Choose = "choose",
  ThrowError = "throwError",
  ReachNoneEnd = "reachNoneEnd",
  CompleteScope = "completeScope",
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

export type OperationScopeOwnership = DeepReadonly<{
  operationId: string;
  scopeId: string;
}>;

export type ControlPlaceScopeOwnership = DeepReadonly<{
  controlPlaceId: string;
  scopeId: string;
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

export type InterruptingErrorHandler = DeepReadonly<{
  attachedScopeId: string;
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

export type ConditionalCandidate = DeepReadonly<{
  condition: SimpleBooleanExpression;
  output: string;
  origin: BpmnSequenceFlowOrigin;
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
        kind: SemanticOperationKind.EnterScope;
        input: string;
        childEntry: string;
        childScopeId: string;
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
        kind: SemanticOperationKind.AwaitMessage;
        input: string;
        output: string;
        message: {
          elementId: string;
          channel: MessageChannel;
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
        kind: SemanticOperationKind.Choose;
        input: string;
        candidates: [ConditionalCandidate, ConditionalCandidate];
        defaultOutput: string;
        defaultOrigin: BpmnSequenceFlowOrigin;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.ThrowError;
        input: string;
        error: ErrorReference;
        handler: InterruptingErrorHandler;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.ReachNoneEnd;
        input: string;
      }>)
  | (OperationBase &
      DeepReadonly<{
        kind: SemanticOperationKind.CompleteScope;
        scopeId: string;
        parentOutput: string | null;
      }>);

export type SemanticProcessProgram = DeepReadonly<{
  kind: SemanticProcessKind.SemanticProcess;
  identity: SemanticProcessIdentity;
  processId: string;
  definitionScopes: DefinitionScope[];
  operationScopes: OperationScopeOwnership[];
  controlPlaceScopes: ControlPlaceScopeOwnership[];
  controlPlaces: ControlPlace[];
  operations: SemanticOperation[];
}>;
