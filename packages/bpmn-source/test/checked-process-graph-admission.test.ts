/**
 * Characterizes the generic checked-source graph gate independently of profile-specific policy.
 *
 * The two cases separate the non-Sequence-Flow edge needed for an attached boundary Event from the
 * saturation rule that rejects an otherwise connected and arity-valid automatic cycle.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BoundaryInterruption,
  CheckedNodeKind,
  GatewayDirection,
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

test("rejects an arity-valid connected automatic cycle", () => {
  const nodes = [
    { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
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
    flow("StartToMerge", "Start", "LoopMerge"),
    flow("MergeToSplit", "LoopMerge", "BranchSplit"),
    flow("SplitToJoinA", "BranchSplit", "BranchJoin"),
    flow("SplitToJoinB", "BranchSplit", "BranchJoin"),
    flow("JoinToExitSplit", "BranchJoin", "ExitSplit"),
    flow("ExitSplitToEnd", "ExitSplit", "End"),
    flow("ExitSplitToMerge", "ExitSplit", "LoopMerge"),
  ] as const satisfies CheckedProcessGraph["flows"];

  assert.equal(
    resolveAdmittedCheckedProcessGraph(withRootOwnership(nodes, flows)),
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

function flow(
  id: string,
  sourceId: string,
  targetId: string,
): CheckedProcessGraph["flows"][number] {
  return { id, sourceId, targetId, condition: null };
}
