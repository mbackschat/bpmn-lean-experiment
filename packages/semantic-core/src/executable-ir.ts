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

export type SequentialUserTaskExecutableIr = Readonly<{
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
