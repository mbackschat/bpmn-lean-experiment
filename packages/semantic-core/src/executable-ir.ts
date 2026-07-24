export enum BpmnExecutableIrKind {
  SequentialUserTask = "sequentialUserTask",
}

export enum BpmnCompilerIdentity {
  SequentialUserTask = "bpmn-source-sequential-user-task",
}

export type BpmnExecutableIrIdentity = Readonly<{
  compiler: BpmnCompilerIdentity;
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
}>;

export type ExecutableSequenceFlow = Readonly<{
  id: string;
  sourceId: string;
  targetId: string;
}>;

export type ExecutableUserTaskDefinition = Readonly<{
  id: string;
  name: string | null;
}>;

export type SequentialUserTaskExecutableIr = Readonly<{
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
