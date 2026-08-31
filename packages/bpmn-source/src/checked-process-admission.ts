import {
  BoundaryInterruption,
  CheckedNodeKind,
  GatewayDirection,
  SemanticProfileId,
  SimpleBooleanExpressionKind,
  SimpleBooleanExpressionLanguage,
  hasExactBalancedTwoBranchControlTopology,
  profileAllowsCheckedProcessShape,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";
import {
  hasSelectedCallActivityDefinitions,
} from "./call-activity-checked-admission.js";
import {
  resolveAdmittedCheckedProcessGraph,
} from "./checked-process-graph-admission.js";
import type {
  CheckedProcessGraph,
} from "./checked-process-graph-admission.js";
import {
  hasSelectedConfiguredTaskTopology,
} from "./configured-task-checked-admission.js";
import { parseSimpleBooleanExpression } from "./simple-boolean-expression.js";

const bpmnDefaultExpressionLanguage = "http://www.w3.org/1999/XPath";

/** Applies profile cardinalities and any selected bounded topology after generic graph admission. */
export function isAdmittedCheckedProcess(
  graph: CheckedProcessGraph,
  expressionLanguage: unknown,
  semanticProfile: string,
): boolean {
  const admittedGraph = resolveAdmittedCheckedProcessGraph(
    graph,
    semanticProfile,
  );
  return profileAllowsCheckedProcessShape(
      semanticProfile,
      graph.nodes,
      graph.definitionScopes.length,
    ) &&
    admittedGraph !== undefined &&
    embeddedNodesOwnChildScopes(graph, admittedGraph.nodeScopes, semanticProfile) &&
    hasSelectedCallActivityDefinitions(
      semanticProfile,
      graph,
      admittedGraph.nodeScopes,
    ) &&
    errorNodesHaveDirectHandlers(graph, admittedGraph.nodeScopes) &&
    boundaryTimersAttachToDeadlineOwners(graph, admittedGraph.nodeScopes) &&
    boundaryMessagesAttachToUserTasks(graph, admittedGraph.nodeScopes) &&
    hasSelectedActivityBoundaryMessageTopology(semanticProfile, graph) &&
    hasSelectedExpressionLanguage(semanticProfile, expressionLanguage) &&
    hasSelectedConditions(semanticProfile, graph.flows) &&
    hasSelectedParallelTopology(semanticProfile, graph) &&
    hasSelectedStructuredHumanWorkTopology(semanticProfile, graph) &&
    hasSelectedCyclicTopology(semanticProfile, graph) &&
    hasSelectedInclusivePairing(semanticProfile, graph) &&
    hasSelectedEventRaceTopology(semanticProfile, graph) &&
    hasSelectedConfiguredTaskTopology(semanticProfile, graph) &&
    hasSelectedTerminateTopology(
      semanticProfile,
      graph,
      admittedGraph.nodeScopes,
    );
}

function hasSelectedStructuredHumanWorkTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.StructuredHumanWork) {
    return true;
  }
  const one = <Kind extends CheckedNodeKind>(kind: Kind) => {
    const matches = graph.nodes.filter(
      (node): node is Extract<CheckedNode, { kind: Kind }> => node.kind === kind,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const start = one(CheckedNodeKind.NoneStartEvent);
  const task = one(CheckedNodeKind.UserTask);
  const gateway = one(CheckedNodeKind.ExclusiveGateway);
  const ends = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.NoneEndEvent }> =>
      node.kind === CheckedNodeKind.NoneEndEvent,
  );
  if (
    start === undefined || task === undefined || gateway === undefined ||
    gateway.direction !== GatewayDirection.Diverging || ends.length !== 3 ||
    graph.nodes.length !== 6 || graph.flows.length !== 5
  ) {
    return false;
  }
  const exactFlow = (sourceId: string, targetId: string) =>
    graph.flows.filter((flow) =>
      flow.sourceId === sourceId && flow.targetId === targetId
    );
  const outgoing = graph.flows.filter(
    ({ sourceId }) => sourceId === gateway.id,
  );
  const candidates = outgoing.filter(({ condition }) => condition !== null);
  const fallback = outgoing.filter(({ condition }) => condition === null);
  const endIds = new Set(ends.map(({ id }) => id));
  return exactFlow(start.id, task.id).length === 1 &&
    exactFlow(start.id, task.id)[0]?.condition === null &&
    exactFlow(task.id, gateway.id).length === 1 &&
    exactFlow(task.id, gateway.id)[0]?.condition === null &&
    outgoing.length === 3 && candidates.length === 2 && fallback.length === 1 &&
    new Set(outgoing.map(({ targetId }) => targetId)).size === 3 &&
    outgoing.every(({ targetId }) => endIds.has(targetId)) &&
    candidates.every(({ id }) => gateway.candidateFlowIds.includes(id)) &&
    gateway.candidateFlowIds.every((id) =>
      candidates.some((flow) => flow.id === id)
    ) &&
    fallback[0]?.id === gateway.defaultFlowId;
}

function hasSelectedParallelTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (
    semanticProfile !== SemanticProfileId.ParallelForkJoin &&
    semanticProfile !==
      SemanticProfileId.ParallelUserTaskAssignmentFormMetadata
  ) {
    return true;
  }
  const idsOfKind = <Kind extends CheckedNodeKind>(kind: Kind) =>
    graph.nodes
      .filter(
        (node): node is Extract<CheckedNode, { kind: Kind }> =>
          node.kind === kind,
      )
      .map(({ id }) => id);
  const gatewaysOfDirection = (direction: GatewayDirection) =>
    graph.nodes
      .filter(
        (node): node is Extract<
          CheckedNode,
          { kind: CheckedNodeKind.ParallelGateway }
        > => node.kind === CheckedNodeKind.ParallelGateway &&
          node.direction === direction,
      )
      .map(({ id }) => id);
  return hasExactBalancedTwoBranchControlTopology({
    entryIds: idsOfKind(CheckedNodeKind.NoneStartEvent),
    splitIds: gatewaysOfDirection(GatewayDirection.Diverging),
    branchIds: idsOfKind(CheckedNodeKind.UserTask),
    joinIds: gatewaysOfDirection(GatewayDirection.Converging),
    endIds: idsOfKind(CheckedNodeKind.NoneEndEvent),
    edges: graph.flows.map(({ sourceId: source, targetId: target }) => ({
      source,
      target,
    })),
  });
}

/** Locks the selected nested scope distribution and branch topology without using fixture IDs. */
function hasSelectedTerminateTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  if (semanticProfile !== SemanticProfileId.TerminateEnd) {
    return true;
  }
  const only = <Kind extends CheckedNodeKind>(
    nodes: ReadonlyArray<CheckedNode>,
    kind: Kind,
  ): Extract<CheckedNode, { kind: Kind }> | undefined => {
    const matches = nodes.filter(
      (node): node is Extract<CheckedNode, { kind: Kind }> =>
        node.kind === kind,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const rootScope = graph.definitionScopes.find(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === graph.processId,
  );
  const embedded = only(graph.nodes, CheckedNodeKind.EmbeddedSubProcess);
  if (rootScope === undefined || embedded === undefined) {
    return false;
  }
  const childScope = graph.definitionScopes.find(
    ({ id, parentScopeId, originElementId }) =>
      id === embedded.childScopeId &&
      parentScopeId === rootScope.id &&
      originElementId === embedded.id,
  );
  if (childScope === undefined) {
    return false;
  }
  const rootNodes = graph.nodes.filter(
    ({ id }) => nodeScopes.get(id) === rootScope.id,
  );
  const childNodes = graph.nodes.filter(
    ({ id }) => nodeScopes.get(id) === childScope.id,
  );
  const rootStart = only(rootNodes, CheckedNodeKind.NoneStartEvent);
  const outerTask = only(rootNodes, CheckedNodeKind.UserTask);
  const rootEnd = only(rootNodes, CheckedNodeKind.NoneEndEvent);
  const childStart = only(childNodes, CheckedNodeKind.NoneStartEvent);
  const fork = only(childNodes, CheckedNodeKind.ParallelGateway);
  const terminate = only(childNodes, CheckedNodeKind.TerminateEndEvent);
  const siblingEnd = only(childNodes, CheckedNodeKind.NoneEndEvent);
  const childTasks = childNodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }> =>
      node.kind === CheckedNodeKind.UserTask,
  );
  if (
    rootNodes.length !== 4 || childNodes.length !== 6 ||
    rootStart === undefined || outerTask === undefined || rootEnd === undefined ||
    childStart === undefined || fork === undefined || terminate === undefined ||
    siblingEnd === undefined || childTasks.length !== 2 ||
    fork.direction !== GatewayDirection.Diverging || graph.flows.length !== 8
  ) {
    return false;
  }
  const exactFlow = (sourceId: string, targetId: string) =>
    graph.flows.filter(
      (flow) => flow.sourceId === sourceId && flow.targetId === targetId,
    ).length === 1;
  const forkTargets = graph.flows
    .filter(({ sourceId }) => sourceId === fork.id)
    .map(({ targetId }) => targetId);
  const taskTargets = childTasks.map((task) =>
    graph.flows.filter(({ sourceId }) => sourceId === task.id),
  );
  const taskTargetIds = taskTargets.flatMap((flows) =>
    flows.map(({ targetId }) => targetId)
  );
  return exactFlow(rootStart.id, embedded.id) &&
    exactFlow(embedded.id, outerTask.id) &&
    exactFlow(outerTask.id, rootEnd.id) &&
    exactFlow(childStart.id, fork.id) &&
    forkTargets.length === 2 &&
    childTasks.every(({ id }) => forkTargets.includes(id)) &&
    taskTargets.every((flows) => flows.length === 1) &&
    taskTargetIds.length === 2 &&
    new Set(taskTargetIds).size === 2 &&
    taskTargetIds.includes(siblingEnd.id) &&
    taskTargetIds.includes(terminate.id);
}

/**
 * The node kinds whose lowered operation carries a boundary Timer deadline of the given disposition.
 *
 * An allowlist rather than an exclusion list, so an unrecognised kind fails closed. A host kind
 * belongs here only once some lowering clause folds the deadline into that host's operation; adding
 * a kind here without that clause is exactly the deadline-free program the caller rejects. The two
 * dispositions have different allowlists because they have different lowering clauses: only the
 * interrupting one has a Sub-Process host, so a non-interrupting deadline on a Sub-Process is
 * refused here rather than lowering to an entry operation that would drop it.
 */
function ownsBoundaryTimerDeadline(
  node: CheckedNode,
  interruption: BoundaryInterruption,
): boolean {
  switch (interruption) {
    case BoundaryInterruption.Interrupting:
      return node.kind === CheckedNodeKind.UserTask ||
        node.kind === CheckedNodeKind.EmbeddedSubProcess;
    case BoundaryInterruption.NonInterrupting:
      return node.kind === CheckedNodeKind.UserTask;
  }
}

/**
 * Every boundary Timer must attach to exactly one deadline-owning Activity in its own scope, and no
 * two may claim the same host.
 *
 * Without this the node still admits and then lowers to no operation, because the deadline belongs
 * to the Activity's operation rather than to itself. The result is a silently deadline-free program:
 * a misattached boundary node contributes nothing and nothing downstream requires it to have been
 * consumed. The attachment reference is the only place this can be caught, so the check is stated
 * here rather than left to program support.
 */
function boundaryTimersAttachToDeadlineOwners(
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  const deadlines = graph.nodes.filter(
    (node): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.TimerBoundaryEvent }
    > => node.kind === CheckedNodeKind.TimerBoundaryEvent,
  );
  const hosts = deadlines.map((deadline) => deadline.attachedToRef);
  return deadlines.every((deadline) => {
    const host = graph.nodes.find(
      (node) =>
        node.id === deadline.attachedToRef &&
        ownsBoundaryTimerDeadline(node, deadline.interruption),
    );
    return host !== undefined &&
      nodeScopes.get(deadline.id) === nodeScopes.get(host.id) &&
      hosts.filter((candidate) => candidate === host.id).length === 1;
  });
}

/** Every Message handler has one same-scope User Task owner and its projected outgoing Flow. */
function boundaryMessagesAttachToUserTasks(
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  const handlers = graph.nodes.filter(
    (node): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.MessageBoundaryEvent }
    > => node.kind === CheckedNodeKind.MessageBoundaryEvent,
  );
  const attachedHostIds = handlers.map(({ attachedToRef }) => attachedToRef);
  return handlers.every((handler) => {
    const host = graph.nodes.find(
      (candidate): candidate is Extract<
        CheckedNode,
        { kind: CheckedNodeKind.UserTask }
      > =>
        candidate.id === handler.attachedToRef &&
        candidate.kind === CheckedNodeKind.UserTask,
    );
    return host !== undefined &&
      nodeScopes.get(handler.id) === nodeScopes.get(host.id) &&
      attachedHostIds.filter((candidate) => candidate === host.id).length === 1 &&
      graph.flows.some(
        ({ id, sourceId }) =>
          id === handler.outputFlowId && sourceId === handler.id,
      );
  });
}

function hasSelectedActivityBoundaryMessageTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.ActivityBoundaryMessage) {
    return true;
  }
  const starts = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.NoneStartEvent }> =>
      node.kind === CheckedNodeKind.NoneStartEvent,
  );
  const handlers = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.MessageBoundaryEvent }> =>
      node.kind === CheckedNodeKind.MessageBoundaryEvent,
  );
  const tasks = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }> =>
      node.kind === CheckedNodeKind.UserTask,
  );
  const ends = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.NoneEndEvent }> =>
      node.kind === CheckedNodeKind.NoneEndEvent,
  );
  const start = starts[0];
  const handler = handlers[0];
  if (
    starts.length !== 1 || start === undefined ||
    handlers.length !== 1 || handler === undefined ||
    tasks.length !== 3 || ends.length !== 2 || graph.flows.length !== 5
  ) {
    return false;
  }
  const host = tasks.find(({ id }) => id === handler.attachedToRef);
  const followUps = tasks.filter(({ id }) => id !== handler.attachedToRef);
  const onlyOutgoing = (sourceId: string) => {
    const matches = graph.flows.filter(
      (flow) => flow.sourceId === sourceId && flow.condition === null,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const startFlow = onlyOutgoing(start.id);
  const hostFlow = host === undefined ? undefined : onlyOutgoing(host.id);
  const handlerFlow = onlyOutgoing(handler.id);
  const normalFollowUp = followUps.find(({ id }) => id === hostFlow?.targetId);
  const boundaryFollowUp = followUps.find(({ id }) => id === handlerFlow?.targetId);
  const normalEndFlow = normalFollowUp === undefined
    ? undefined
    : onlyOutgoing(normalFollowUp.id);
  const boundaryEndFlow = boundaryFollowUp === undefined
    ? undefined
    : onlyOutgoing(boundaryFollowUp.id);
  const endIds = new Set(ends.map(({ id }) => id));
  return host !== undefined && startFlow?.targetId === host.id &&
    handlerFlow?.id === handler.outputFlowId &&
    normalFollowUp !== undefined && boundaryFollowUp !== undefined &&
    normalFollowUp.id !== boundaryFollowUp.id &&
    normalEndFlow !== undefined && boundaryEndFlow !== undefined &&
    normalEndFlow.targetId !== boundaryEndFlow.targetId &&
    endIds.has(normalEndFlow.targetId) && endIds.has(boundaryEndFlow.targetId);
}

function errorNodesHaveDirectHandlers(
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
): boolean {
  const thrown = graph.nodes.filter(
    (
      node,
    ): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.ErrorEndEvent }
    > => node.kind === CheckedNodeKind.ErrorEndEvent,
  );
  const handlers = graph.nodes.filter(
    (
      node,
    ): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.BoundaryErrorEvent }
    > => node.kind === CheckedNodeKind.BoundaryErrorEvent,
  );
  const matchingHandlers = (
    errorEnd: Extract<
      CheckedNode,
      { kind: CheckedNodeKind.ErrorEndEvent }
    >,
  ) => handlers.filter((handler) => {
    const attached = graph.nodes.find(
      (node): node is Extract<
        CheckedNode,
        { kind: CheckedNodeKind.EmbeddedSubProcess }
      > =>
        node.id === handler.attachedToRef &&
        node.kind === CheckedNodeKind.EmbeddedSubProcess,
    );
    return attached !== undefined &&
      attached.childScopeId === nodeScopes.get(errorEnd.id) &&
      nodeScopes.get(handler.id) === nodeScopes.get(attached.id) &&
      handler.error.errorElementId === errorEnd.error.errorElementId &&
      handler.error.code === errorEnd.error.code &&
      graph.flows.some(
        ({ id, sourceId }) =>
          id === handler.outputFlowId && sourceId === handler.id,
      );
  });
  return thrown.every((errorEnd) => matchingHandlers(errorEnd).length === 1) &&
    handlers.every(
      (handler) =>
        thrown.filter((errorEnd) =>
          matchingHandlers(errorEnd).includes(handler)
        ).length === 1,
    );
}

function embeddedNodesOwnChildScopes(
  graph: CheckedProcessGraph,
  nodeScopes: ReadonlyMap<string, string>,
  semanticProfile: string,
): boolean {
  const embedded = graph.nodes.filter(
    (
      node,
    ): node is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.EmbeddedSubProcess }
    > => node.kind === CheckedNodeKind.EmbeddedSubProcess,
  );
  const roots = graph.definitionScopes.filter(
    ({ parentScopeId }) => parentScopeId === null,
  );
  const expectedRootCount =
    semanticProfile === SemanticProfileId.CalledProcessCallActivity ? 2 : 1;
  return roots.length === expectedRootCount &&
    embedded.every((node) =>
      graph.definitionScopes.some(
        ({ id, parentScopeId, originElementId }) =>
          id === node.childScopeId &&
          parentScopeId === nodeScopes.get(node.id) &&
          originElementId === node.id,
      )
    ) &&
    graph.definitionScopes.every(({ id, parentScopeId, originElementId }) =>
      parentScopeId === null || embedded.some(
        (node) => node.id === originElementId && node.childScopeId === id,
      )
    );
}

/**
 * Decides the expression language from the resolved value alone.
 *
 * Whether the source wrote the attribute is deliberately not consulted: the parser resolves the same
 * BPMN default when it is omitted, so admitting on presence would refuse a model that spelled out a
 * value already in force. The simple-boolean profiles need no presence test either, because their
 * required URI is not any default and cannot be resolved without being written.
 */
function hasSelectedExpressionLanguage(
  semanticProfile: string,
  expressionLanguage: unknown,
): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
    case SemanticProfileId.ParallelMultiInstanceUserTask:
    case SemanticProfileId.UserTaskCycle:
    case SemanticProfileId.StructuredHumanWork:
      return expressionLanguage === SimpleBooleanExpressionLanguage;
    default:
      return expressionLanguage === bpmnDefaultExpressionLanguage;
  }
}

function hasSelectedConditions(
  semanticProfile: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
    case SemanticProfileId.UserTaskCycle:
      return flows.filter(({ condition }) => condition !== null).length === 2;
    case SemanticProfileId.StructuredHumanWork: {
      const conditions = flows.flatMap(({ condition }) =>
        condition === null ? [] : [condition]
      );
      return conditions.length === 2 && conditions.every(
        ({ body }) =>
          parseSimpleBooleanExpression(body)?.kind ===
            SimpleBooleanExpressionKind.StringEquals,
      );
    }
    default:
      return flows.every(({ condition }) => condition === null);
  }
}

function hasSelectedCyclicTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.UserTaskCycle) {
    return true;
  }
  const one = <Kind extends CheckedNodeKind>(kind: Kind) => {
    const matches = graph.nodes.filter(
      (node): node is Extract<CheckedNode, { kind: Kind }> => node.kind === kind,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  const start = one(CheckedNodeKind.NoneStartEvent);
  const merge = one(CheckedNodeKind.ExclusiveMerge);
  const task = one(CheckedNodeKind.UserTask);
  const choice = one(CheckedNodeKind.ExclusiveGateway);
  const end = one(CheckedNodeKind.NoneEndEvent);
  if (
    start === undefined || merge === undefined || task === undefined ||
    choice === undefined || end === undefined || graph.nodes.length !== 5
  ) {
    return false;
  }
  const exactFlow = (
    sourceId: string,
    targetId: string,
    condition: "absent" | "present",
  ) => graph.flows.filter((flow) =>
    flow.sourceId === sourceId &&
    flow.targetId === targetId &&
    (condition === "present" ? flow.condition !== null : flow.condition === null)
  );
  const backEdges = exactFlow(choice.id, merge.id, "present");
  const exit = exactFlow(choice.id, end.id, "absent");
  return graph.flows.length === 6 &&
    exactFlow(start.id, merge.id, "absent").length === 1 &&
    exactFlow(merge.id, task.id, "absent").length === 1 &&
    exactFlow(task.id, choice.id, "absent").length === 1 &&
    backEdges.length === 2 &&
    new Set(backEdges.map(({ id }) => id)).size === 2 &&
    backEdges.every(({ id }) => choice.candidateFlowIds.includes(id)) &&
    choice.candidateFlowIds.every((id) => backEdges.some((flow) => flow.id === id)) &&
    exit.length === 1 && exit[0]?.id === choice.defaultFlowId;
}

function hasSelectedInclusivePairing(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.InclusiveGatewaySelectedBranches) {
    return true;
  }
  const inclusive = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.InclusiveGateway }> =>
      node.kind === CheckedNodeKind.InclusiveGateway,
  );
  const split = inclusive.find(
    (node): node is Extract<CheckedNode, {
      kind: CheckedNodeKind.InclusiveGateway;
      direction: GatewayDirection.Diverging;
    }> => node.direction === GatewayDirection.Diverging,
  );
  const join = inclusive.find(
    (node): node is Extract<CheckedNode, {
      kind: CheckedNodeKind.InclusiveGateway;
      direction: GatewayDirection.Converging;
    }> => node.direction === GatewayDirection.Converging,
  );
  if (split === undefined || join === undefined || join.pairedGatewayId !== split.id) {
    return false;
  }
  const splitFlowIds = [split.defaultFlowId, ...split.candidateFlowIds];
  const branches = splitFlowIds.map((flowId) => {
    const splitFlow = graph.flows.find(({ id }) => id === flowId);
    const task = splitFlow === undefined
      ? undefined
      : graph.nodes.find(({ id }) => id === splitFlow.targetId);
    const taskOutputs = task === undefined
      ? []
      : graph.flows.filter(({ sourceId }) => sourceId === task.id);
    return task?.kind === CheckedNodeKind.UserTask &&
        splitFlow?.sourceId === split.id &&
        taskOutputs.length === 1 &&
        taskOutputs[0]?.targetId === join.id
      ? taskOutputs[0]?.id
      : undefined;
  });
  const joinInputIds = graph.flows
    .filter(({ targetId }) => targetId === join.id)
    .map(({ id }) => id);
  return branches.every((flowId) => flowId !== undefined) &&
    new Set(branches).size === 3 &&
    joinInputIds.length === 3 &&
    joinInputIds.every((flowId) => branches.includes(flowId));
}

function hasSelectedEventRaceTopology(
  semanticProfile: string,
  graph: CheckedProcessGraph,
): boolean {
  if (semanticProfile !== SemanticProfileId.EventBasedGatewayMessageTimer) {
    return true;
  }
  const gateways = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.EventBasedGateway }> =>
      node.kind === CheckedNodeKind.EventBasedGateway,
  );
  const messages = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.IntermediateCatchMessageEvent }> =>
      node.kind === CheckedNodeKind.IntermediateCatchMessageEvent,
  );
  const timers = graph.nodes.filter(
    (node): node is Extract<CheckedNode, { kind: CheckedNodeKind.IntermediateCatchTimerEvent }> =>
      node.kind === CheckedNodeKind.IntermediateCatchTimerEvent,
  );
  const gateway = gateways[0];
  const message = messages[0];
  const timer = timers[0];
  if (
    gateways.length !== 1 ||
    messages.length !== 1 ||
    timers.length !== 1 ||
    gateway === undefined ||
    message === undefined ||
    timer === undefined
  ) {
    return false;
  }
  const configured = graph.flows.filter(({ sourceId }) => sourceId === gateway.id);
  return configured.length === 2 &&
    configured.every(({ condition }) => condition === null) &&
    configured.filter(({ targetId }) => targetId === message.id).length === 1 &&
    configured.filter(({ targetId }) => targetId === timer.id).length === 1;
}
