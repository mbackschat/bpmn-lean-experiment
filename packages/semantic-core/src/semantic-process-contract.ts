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

type CheckedServiceTaskBase = DeepReadonly<{
  kind: CheckedNodeKind.ServiceTask;
  id: string;
  inputMappings: VariableMapping[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: CheckedBpmnErrorRoute | null;
}>;

type ProbeServiceTask = CheckedServiceTaskBase &
  DeepReadonly<{
    implementation: "urn:bpmn-lean:effect:probe-v1";
    sourceBinding: {
      delegateExpressionAttribute: {
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "${bpmnLeanEffectHandler}";
      };
      asyncBeforeAttribute: {
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "true";
      };
    };
  }>;

type A12CreateDocumentServiceTask = CheckedServiceTaskBase &
  DeepReadonly<{
    implementation: "urn:bpmn-lean:a12-delegate:v1";
    sourceBinding: {
      delegateExpressionAttribute: {
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "${createDocumentDelegate}";
      };
      protocolSource: "semanticProfile";
      inputOutputElement: {
        namespace: "http://camunda.org/schema/1.0/bpmn";
        inputParameter: {
          name: "documentModelName";
          body: "MyDocumentModel";
        };
        outputParameter: {
          name: "myDocumentReference";
          body: "${newDocRef}";
        };
      };
    };
  }>;

type A12BoundaryErrorServiceTask = CheckedServiceTaskBase &
  DeepReadonly<{
    implementation: "urn:bpmn-lean:a12-delegate:v1";
    sourceBinding: {
      delegateExpressionAttribute: {
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "#{createRelationshipLinkDelegate}";
      };
      implementationAttribute: {
        value: "urn:bpmn-lean:a12-delegate:v1";
      };
      inputOutputElement: {
        namespace: "http://camunda.org/schema/1.0/bpmn";
        inputParameter: {
          name: "relationshipModel";
          body: "RelationshipModel";
        };
        outputParameter: {
          name: "relationshipLinkId";
          body: "${newLinkId}";
        };
      };
    };
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
  | ProbeServiceTask
  | A12CreateDocumentServiceTask
  | A12BoundaryErrorServiceTask
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

export type EffectDescriptor = DeepReadonly<{
  protocol:
    | "urn:bpmn-lean:effect:probe-v1"
    | "urn:bpmn-lean:a12-delegate:v1";
  handler:
    | "bpmnLeanEffectHandler"
    | "createDocumentDelegate"
    | "createRelationshipLinkDelegate";
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
