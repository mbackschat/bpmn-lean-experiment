/**
 * Characterizes the generic checked-source graph gate independently of profile-specific policy.
 *
 * The cases separate the non-Sequence-Flow edge needed for an attached boundary Event, one selected
 * User-Task resumption cut, and an internal cycle that remains after that cut.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BoundaryInterruption,
  CheckedNodeKind,
  GatewayDirection,
  MessageChannelKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

import {
  resolveAdmittedCheckedProcessGraph,
} from "../src/checked-process-graph-admission.ts";
import type {
  CheckedProcessGraph,
} from "../src/checked-process-graph-admission.ts";

const scopeId = "scope:Process";

function withRootOwnership(
  nodes: CheckedProcessGraph["nodes"],
  flows: CheckedProcessGraph["flows"],
): CheckedProcessGraph {
  return {
    processId: "Process",
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: "Process",
    }],
    nodeScopes: nodes.map(({ id }) => ({ nodeId: id, scopeId })),
    sequenceFlowScopes: flows.map(({ id }) => ({
      sequenceFlowId: id,
      scopeId,
    })),
    nodes,
    flows,
  };
}

test("admits only the selected User-Task-crossing cycle policy", () => {
  const nodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
    { kind: CheckedNodeKind.ExclusiveMerge, id: "Merge" },
    { kind: CheckedNodeKind.UserTask, id: "Review", name: null },
    {
      kind: CheckedNodeKind.ExclusiveGateway,
      id: "Choice",
      direction: GatewayDirection.Diverging,
      candidateFlowIds: ["Repeat", "Rework"],
      defaultFlowId: "Exit",
    },
    { kind: CheckedNodeKind.NoneEndEvent, id: "End" },
  ] as const satisfies CheckedProcessGraph["nodes"];
  const flows = [
    flow("StartMerge", "Start", "Merge"),
    flow("Repeat", "Choice", "Merge"),
    flow("Rework", "Choice", "Merge"),
    flow("MergeReview", "Merge", "Review"),
    flow("ReviewChoice", "Review", "Choice"),
    flow("Exit", "Choice", "End"),
  ] as const satisfies CheckedProcessGraph["flows"];
  const graph = withRootOwnership(nodes, flows);

  assert.notEqual(
    resolveAdmittedCheckedProcessGraph(
      graph,
      SemanticProfileId.UserTaskCycle,
    ),
    undefined,
  );
  assert.equal(
    resolveAdmittedCheckedProcessGraph(graph, SemanticProfileId.UserTask),
    undefined,
  );
});

test("rejects an internal cycle even when a User Task is reachable outside it", () => {
  const nodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
    { kind: CheckedNodeKind.UserTask, id: "Wait", name: null },
    {
      kind: CheckedNodeKind.ParallelGateway,
      id: "LoopMerge",
      direction: GatewayDirection.Converging,
    },
    {
      kind: CheckedNodeKind.ParallelGateway,
      id: "BranchSplit",
      direction: GatewayDirection.Diverging,
    },
    {
      kind: CheckedNodeKind.ParallelGateway,
      id: "BranchJoin",
      direction: GatewayDirection.Converging,
    },
    {
      kind: CheckedNodeKind.ParallelGateway,
      id: "ExitSplit",
      direction: GatewayDirection.Diverging,
    },
    { kind: CheckedNodeKind.NoneEndEvent, id: "End" },
  ] as const satisfies CheckedProcessGraph["nodes"];
  const flows = [
    flow("StartToWait", "Start", "Wait"),
    flow("WaitToMerge", "Wait", "LoopMerge"),
    flow("MergeToSplit", "LoopMerge", "BranchSplit"),
    flow("SplitToJoinA", "BranchSplit", "BranchJoin"),
    flow("SplitToJoinB", "BranchSplit", "BranchJoin"),
    flow("JoinToExitSplit", "BranchJoin", "ExitSplit"),
    flow("ExitSplitToEnd", "ExitSplit", "End"),
    flow("ExitSplitToMerge", "ExitSplit", "LoopMerge"),
  ] as const satisfies CheckedProcessGraph["flows"];

  assert.equal(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership(nodes, flows),
      SemanticProfileId.UserTaskCycle,
    ),
    undefined,
  );
});

test("admits an attached boundary Timer through its exceptional host edge", () => {
  const nodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
    { kind: CheckedNodeKind.UserTask, id: "Host", name: null },
    {
      kind: CheckedNodeKind.TimerBoundaryEvent,
      id: "Deadline",
      attachedToRef: "Host",
      interruption: BoundaryInterruption.Interrupting,
      durationLiteral: "PT1S",
      outputFlowId: "DeadlineToHandler",
    },
    { kind: CheckedNodeKind.UserTask, id: "Handler", name: null },
    { kind: CheckedNodeKind.NoneEndEvent, id: "NormalEnd" },
    { kind: CheckedNodeKind.NoneEndEvent, id: "DeadlineEnd" },
  ] as const satisfies CheckedProcessGraph["nodes"];
  const flows = [
    flow("StartToHost", "Start", "Host"),
    flow("HostToEnd", "Host", "NormalEnd"),
    flow("DeadlineToHandler", "Deadline", "Handler"),
    flow("HandlerToEnd", "Handler", "DeadlineEnd"),
  ] as const satisfies CheckedProcessGraph["flows"];

  const result = resolveAdmittedCheckedProcessGraph(
    withRootOwnership(nodes, flows),
  );

  assert.notEqual(result, undefined);
  assert.equal(result?.nodeScopes.get("Deadline"), scopeId);
  assert.equal(result?.flowScopes.get("DeadlineToHandler"), scopeId);
});

test("admits a Message Start only as the single zero-to-one graph root", () => {
  const messageStart = {
    kind: CheckedNodeKind.MessageStartEvent,
    id: "MessageStart",
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface",
      interfaceOperationId: "Operation",
      messageId: "Message",
    },
  } as const;
  const task = {
    kind: CheckedNodeKind.UserTask,
    id: "Task",
    name: null,
  } as const;
  const end = { kind: CheckedNodeKind.NoneEndEvent, id: "End" } as const;
  const linearFlows = [
    flow("StartToTask", "MessageStart", "Task"),
    flow("TaskToEnd", "Task", "End"),
  ] as const satisfies CheckedProcessGraph["flows"];

  assert.notEqual(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership([messageStart, task, end], linearFlows),
      SemanticProfileId.MessageStart,
    ),
    undefined,
  );

  const incomingStart = [
    ...linearFlows,
    flow("EndToStart", "End", "MessageStart"),
  ] as const satisfies CheckedProcessGraph["flows"];
  assert.equal(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership([messageStart, task, end], incomingStart),
      SemanticProfileId.MessageStart,
    ),
    undefined,
  );

  const mixedStarts = [
    messageStart,
    { kind: CheckedNodeKind.NoneStartEvent, id: "ManualStart" },
    task,
    end,
  ] as const satisfies CheckedProcessGraph["nodes"];
  const mixedFlows = [
    ...linearFlows,
    flow("ManualToTask", "ManualStart", "Task"),
  ] as const satisfies CheckedProcessGraph["flows"];
  assert.equal(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership(mixedStarts, mixedFlows),
      SemanticProfileId.MessageStart,
    ),
    undefined,
  );
});

test("admits a Timer Start only as the single zero-to-one graph root", () => {
  const timerStart = {
    kind: CheckedNodeKind.TimerStartEvent,
    id: "TimerStart",
    durationLiteral: "PT1S",
  } as const;
  const task = {
    kind: CheckedNodeKind.UserTask,
    id: "Task",
    name: null,
  } as const;
  const end = { kind: CheckedNodeKind.NoneEndEvent, id: "End" } as const;
  const linearFlows = [
    flow("StartToTask", "TimerStart", "Task"),
    flow("TaskToEnd", "Task", "End"),
  ] as const satisfies CheckedProcessGraph["flows"];

  assert.notEqual(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership([timerStart, task, end], linearFlows),
      SemanticProfileId.TimerStart,
    ),
    undefined,
  );

  assert.equal(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership(
        [timerStart, task, end],
        [...linearFlows, flow("EndToStart", "End", "TimerStart")],
      ),
      SemanticProfileId.TimerStart,
    ),
    undefined,
  );

  const manualStart = {
    kind: CheckedNodeKind.NoneStartEvent,
    id: "ManualStart",
  } as const;
  assert.equal(
    resolveAdmittedCheckedProcessGraph(
      withRootOwnership(
        [timerStart, manualStart, task, end],
        [...linearFlows, flow("ManualToTask", "ManualStart", "Task")],
      ),
      SemanticProfileId.TimerStart,
    ),
    undefined,
  );
});

function flow(
  id: string,
  sourceId: string,
  targetId: string,
): CheckedProcessGraph["flows"][number] {
  return { id, sourceId, targetId, condition: null };
}
