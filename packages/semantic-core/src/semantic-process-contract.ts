export enum CheckedProcessKind {
  CheckedProcess = "checkedProcess",
}

export enum CheckedNodeKind {
  NoneStartEvent = "noneStartEvent",
  UserTask = "userTask",
  IntermediateCatchTimerEvent = "intermediateCatchTimerEvent",
  ParallelGateway = "parallelGateway",
  NoneEndEvent = "noneEndEvent",
}

export enum GatewayDirection {
  Diverging = "diverging",
  Converging = "converging",
}

export type CheckedProcessIdentity = Readonly<{
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
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
