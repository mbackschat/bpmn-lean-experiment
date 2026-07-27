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
  | Readonly<{
      kind: MappingExpressionKind.StringLiteral;
      value: string;
    }>
  | Readonly<{
      kind: MappingExpressionKind.LocalVariable;
      name: string;
    }>;

export type VariableMapping = Readonly<{
  target: string;
  expression: MappingExpression;
}>;

export type CheckedProcessIdentity = Readonly<{
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;

type CheckedServiceTaskBase = Readonly<{
  kind: CheckedNodeKind.ServiceTask;
  id: string;
  inputMappings: ReadonlyArray<VariableMapping>;
  outputMappings: ReadonlyArray<VariableMapping>;
}>;

type ProbeServiceTask = CheckedServiceTaskBase &
  Readonly<{
    implementation: "urn:bpmn-lean:effect:probe-v1";
    sourceBinding: Readonly<{
      delegateExpressionAttribute: Readonly<{
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "${bpmnLeanEffectHandler}";
      }>;
      asyncBeforeAttribute: Readonly<{
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "true";
      }>;
    }>;
  }>;

type A12CreateDocumentServiceTask = CheckedServiceTaskBase &
  Readonly<{
    implementation: "urn:bpmn-lean:a12-delegate:v1";
    sourceBinding: Readonly<{
      delegateExpressionAttribute: Readonly<{
        namespace: "http://camunda.org/schema/1.0/bpmn";
        value: "${createDocumentDelegate}";
      }>;
      protocolSource: "semanticProfile";
      inputOutputElement: Readonly<{
        namespace: "http://camunda.org/schema/1.0/bpmn";
        inputParameter: Readonly<{
          name: "documentModelName";
          body: "MyDocumentModel";
        }>;
        outputParameter: Readonly<{
          name: "myDocumentReference";
          body: "${newDocRef}";
        }>;
      }>;
    }>;
  }>;

export type CheckedNode =
  | Readonly<{
      kind: CheckedNodeKind.NoneStartEvent;
      id: string;
    }>
  | Readonly<{
      kind: CheckedNodeKind.UserTask;
      id: string;
      name: string | null;
    }>
  | Readonly<{
      kind: CheckedNodeKind.IntermediateCatchTimerEvent;
      id: string;
      durationLiteral: "PT1S";
    }>
  | ProbeServiceTask
  | A12CreateDocumentServiceTask
  | Readonly<{
      kind: CheckedNodeKind.ParallelGateway;
      id: string;
      direction: GatewayDirection;
    }>
  | Readonly<{
      kind: CheckedNodeKind.NoneEndEvent;
      id: string;
    }>;

export type CheckedSequenceFlow = Readonly<{
  id: string;
  sourceId: string;
  targetId: string;
}>;

export type CheckedProcess = Readonly<{
  kind: CheckedProcessKind.CheckedProcess;
  identity: CheckedProcessIdentity;
  processId: string;
  nodes: ReadonlyArray<CheckedNode>;
  sequenceFlows: ReadonlyArray<CheckedSequenceFlow>;
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

export type SemanticProcessIdentity = Readonly<{
  compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess;
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;

export type BpmnElementOrigin = Readonly<{
  kind: SemanticOriginKind.BpmnElement;
  elementId: string;
}>;

export type BpmnSequenceFlowOrigin = Readonly<{
  kind: SemanticOriginKind.BpmnSequenceFlow;
  elementId: string;
}>;

export type ControlPlace = Readonly<{
  id: string;
  origin: BpmnSequenceFlowOrigin;
}>;

export type EffectDescriptor = Readonly<{
  protocol:
    | "urn:bpmn-lean:effect:probe-v1"
    | "urn:bpmn-lean:a12-delegate:v1";
  handler: "bpmnLeanEffectHandler" | "createDocumentDelegate";
}>;

type OperationBase = Readonly<{
  id: string;
  origin: BpmnElementOrigin;
}>;

export type SemanticOperation =
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.Initiate;
        output: string;
      }>)
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.AwaitUserTask;
        input: string;
        output: string;
        task: Readonly<{
          elementId: string;
          name: string | null;
        }>;
      }>)
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.AwaitTimer;
        input: string;
        output: string;
        timer: Readonly<{
          elementId: string;
          durationMs: 1000;
        }>;
      }>)
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.AwaitEffect;
        input: string;
        output: string;
        effect: Readonly<{
          elementId: string;
          descriptor: EffectDescriptor;
          inputMappings: ReadonlyArray<VariableMapping>;
          outputMappings: ReadonlyArray<VariableMapping>;
        }>;
      }>)
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.Duplicate;
        input: string;
        outputs: ReadonlyArray<string>;
      }>)
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.Synchronize;
        inputs: ReadonlyArray<string>;
        output: string;
      }>)
  | (OperationBase &
      Readonly<{
        kind: SemanticOperationKind.Terminate;
        input: string;
      }>);

export type SemanticProcessProgram = Readonly<{
  kind: SemanticProcessKind.SemanticProcess;
  identity: SemanticProcessIdentity;
  processId: string;
  controlPlaces: ReadonlyArray<ControlPlace>;
  operations: ReadonlyArray<SemanticOperation>;
}>;
