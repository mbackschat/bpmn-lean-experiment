export enum BpmnExecutableIrKind {
  SequentialUserTask = "sequentialUserTask",
}

export type BpmnExecutableIrIdentity = Readonly<{
  compiler: string;
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;

export type ExecutableSequenceFlow = Readonly<{
  id: string;
  sourceId: string;
  targetId: string;
}>;

export type SequentialUserTaskExecutableIrV1 = Readonly<{
  schemaVersion: "0.1.0";
  kind: BpmnExecutableIrKind.SequentialUserTask;
  identity: BpmnExecutableIrIdentity;
  processId: string;
  startEventId: string;
  userTaskId: string;
  endEventId: string;
  sequenceFlows: readonly [
    ExecutableSequenceFlow,
    ExecutableSequenceFlow,
  ];
}>;

export type ExecutableUserTaskDefinition = Readonly<{
  id: string;
  name: string | null;
}>;

export type SequentialUserTaskExecutableIrV2 = Readonly<{
  schemaVersion: "0.2.0";
  kind: BpmnExecutableIrKind.SequentialUserTask;
  identity: BpmnExecutableIrIdentity;
  processId: string;
  startEventId: string;
  userTask: ExecutableUserTaskDefinition;
  endEventId: string;
  sequenceFlows: readonly [
    ExecutableSequenceFlow,
    ExecutableSequenceFlow,
  ];
}>;

export type SequentialUserTaskExecutableIr =
  | SequentialUserTaskExecutableIrV1
  | SequentialUserTaskExecutableIrV2;
