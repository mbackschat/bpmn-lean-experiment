/** The approved subscription forest and complete resumption-burst restriction, before execution. */
import { BoundaryInterruption, CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedSequenceFlow, NodeScopeOwnership } from "./checked-process-contract.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { DefinitionScope } from "./semantic-value-contract.js";

enum StepKind { Start, Wait, Fork, Scope, End, Terminate, Boundary }
type Step = Readonly<{
  id: string;
  scope: string;
  kind: StepKind;
  outputs: readonly string[];
  timer: boolean;
  childScope?: string;
  childEntry?: string;
  host?: string;
  repeating?: boolean;
}>;
type Forest = Readonly<{ steps: readonly Step[]; root: string; entry: string }>;
type Burst = Readonly<{ count: number; live: boolean }>;

export function repeatableSubscriptionCheckedShape(nodes: readonly CheckedNode[], scopes: number): boolean {
  const children = nodes.filter(({ kind }) => kind === CheckedNodeKind.EmbeddedSubProcess);
  return scopes >= 1 && scopes <= 2 && children.length === scopes - 1 &&
    nodes.filter(({ kind }) => kind === CheckedNodeKind.NoneStartEvent).length === scopes &&
    nodes.every((node) => {
      switch (node.kind) {
        case CheckedNodeKind.NoneStartEvent:
        case CheckedNodeKind.EmbeddedSubProcess:
        case CheckedNodeKind.IntermediateCatchMessageEvent:
        case CheckedNodeKind.ReceiveTask:
        case CheckedNodeKind.NoneEndEvent:
        case CheckedNodeKind.TerminateEndEvent: return true;
        case CheckedNodeKind.UserTask: return node.metadata === undefined;
        case CheckedNodeKind.ParallelGateway: return node.direction === GatewayDirection.Diverging;
        case CheckedNodeKind.IntermediateCatchTimerEvent: return node.durationLiteral === "PT1S";
        case CheckedNodeKind.MessageBoundaryEvent:
          return node.interruption === BoundaryInterruption.Interrupting ||
            node.interruption === BoundaryInterruption.NonInterrupting;
        case CheckedNodeKind.TimerBoundaryEvent:
          return (node.durationLiteral === "PT1S" && !Object.hasOwn(node, "cycleLiteral")) ||
            (node.cycleLiteral === "R/PT1S" && !Object.hasOwn(node, "durationLiteral") &&
              node.interruption === BoundaryInterruption.NonInterrupting);
        default: return false;
      }
    });
}

export function repeatableSubscriptionProgramShape(operations: readonly SemanticOperation[], scopes: number): boolean {
  const entries = operations.filter((operation) => isScopeEntry(operation));
  return scopes >= 1 && scopes <= 2 && entries.length === scopes - 1 &&
    operations.filter(({ kind }) => kind === SemanticOperationKind.Initiate).length === 1 &&
    operations.filter(({ kind }) => kind === SemanticOperationKind.CompleteScope).length === scopes &&
    operations.every((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.Initiate:
        case SemanticOperationKind.EnterScope:
        case SemanticOperationKind.AwaitMessage:
        case SemanticOperationKind.AwaitMessageBoundedUserTask:
        case SemanticOperationKind.AwaitMessageMonitoredUserTask:
        case SemanticOperationKind.Duplicate:
        case SemanticOperationKind.ReachNoneEnd:
        case SemanticOperationKind.TerminateScope:
        case SemanticOperationKind.CompleteScope: return true;
        case SemanticOperationKind.AwaitUserTask: return operation.task.metadata === undefined;
        case SemanticOperationKind.AwaitTimer: return operation.timer.durationMs === 1000;
        case SemanticOperationKind.EnterBoundedScope:
        case SemanticOperationKind.AwaitBoundedUserTask:
          return !Object.hasOwn(operation.boundaryTimer, "recurrence");
        case SemanticOperationKind.EnterMonitoredScope:
        case SemanticOperationKind.AwaitMonitoredUserTask:
          return operation.boundaryTimer.durationMs === 1000 &&
            (!Object.hasOwn(operation.boundaryTimer, "recurrence") || operation.boundaryTimer.recurrence === "repeating");
        default: return false;
      }
    });
}

type CheckedGraph = Readonly<{
  processId: string;
  definitionScopes: readonly DefinitionScope[];
  nodeScopes: readonly NodeScopeOwnership[];
  nodes: readonly CheckedNode[];
  flows: readonly CheckedSequenceFlow[];
}>;

/** Reads checked nodes and exact source-flow endpoints without invoking lowering. */
export function repeatableSubscriptionCheckedGraph(graph: CheckedGraph): boolean {
  if (!repeatableSubscriptionCheckedShape(graph.nodes, graph.definitionScopes.length)) return false;
  const root = selectedRoot(graph.processId, graph.definitionScopes);
  if (root === undefined) return false;
  const owners = new Map(graph.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  const steps: Step[] = [];
  for (const node of graph.nodes) {
    const scope = owners.get(node.id);
    if (scope === undefined) return false;
    const base = { id: node.id, scope, timer: false,
      outputs: graph.flows.filter(({ sourceId }) => sourceId === node.id).map(({ targetId }) => targetId) };
    switch (node.kind) {
      case CheckedNodeKind.NoneStartEvent: steps.push({ ...base, kind: StepKind.Start }); break;
      case CheckedNodeKind.UserTask:
      case CheckedNodeKind.ReceiveTask:
      case CheckedNodeKind.IntermediateCatchMessageEvent: steps.push({ ...base, kind: StepKind.Wait }); break;
      case CheckedNodeKind.IntermediateCatchTimerEvent: steps.push({ ...base, kind: StepKind.Wait, timer: true }); break;
      case CheckedNodeKind.ParallelGateway: steps.push({ ...base, kind: StepKind.Fork }); break;
      case CheckedNodeKind.NoneEndEvent: steps.push({ ...base, kind: StepKind.End }); break;
      case CheckedNodeKind.TerminateEndEvent: steps.push({ ...base, kind: StepKind.Terminate }); break;
      case CheckedNodeKind.EmbeddedSubProcess: {
        const starts = graph.nodes.filter((candidate) => candidate.kind === CheckedNodeKind.NoneStartEvent &&
          owners.get(candidate.id) === node.childScopeId);
        if (starts.length !== 1 || starts[0] === undefined) return false;
        steps.push({ ...base, kind: StepKind.Scope, childScope: node.childScopeId, childEntry: starts[0].id });
        break;
      }
      case CheckedNodeKind.TimerBoundaryEvent:
      case CheckedNodeKind.MessageBoundaryEvent:
        steps.push({ ...base, kind: StepKind.Boundary, host: node.attachedToRef,
          timer: node.kind === CheckedNodeKind.TimerBoundaryEvent,
          repeating: node.interruption === BoundaryInterruption.NonInterrupting });
        break;
      default: return false;
    }
  }
  const entry = steps.find((step) => step.kind === StepKind.Start && step.scope === root);
  return entry !== undefined && forestAdmitted({ steps, root, entry: entry.id });
}

/** Reads Program places, owners, and completion bindings independently of checked-source projection. */
export function repeatableSubscriptionProgramGraph(program: SemanticProcessProgram): boolean {
  if (!repeatableSubscriptionProgramShape(program.operations, program.definitionScopes.length) ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined) return false;
  const root = selectedRoot(program.processId, program.definitionScopes);
  if (root === undefined) return false;
  const owners = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const key = (id: string) => `operation:${JSON.stringify(id)}`;
  const target = (place: string): string | undefined => {
    const consumers = program.operations.filter((operation) => "input" in operation && operation.input === place);
    return consumers.length === 1 && consumers[0] !== undefined ? key(consumers[0].id) : undefined;
  };
  const steps: Step[] = [];
  for (const operation of program.operations) {
    const scope = owners.get(operation.id);
    if (scope === undefined) return false;
    const base = { id: key(operation.id), scope, timer: false };
    let outputs: readonly string[];
    let step: Step;
    switch (operation.kind) {
      case SemanticOperationKind.CompleteScope: continue;
      case SemanticOperationKind.Initiate:
        step = { ...base, kind: StepKind.Start, outputs: [] }; outputs = [operation.output]; break;
      case SemanticOperationKind.ReachNoneEnd:
        step = { ...base, kind: StepKind.End, outputs: [] }; outputs = []; break;
      case SemanticOperationKind.TerminateScope:
        step = { ...base, kind: StepKind.Terminate, outputs: [] }; outputs = []; break;
      case SemanticOperationKind.Duplicate:
        step = { ...base, kind: StepKind.Fork, outputs: [] }; outputs = operation.outputs; break;
      case SemanticOperationKind.AwaitUserTask:
      case SemanticOperationKind.AwaitMessage:
      case SemanticOperationKind.AwaitTimer:
        step = { ...base, kind: StepKind.Wait, outputs: [], timer: operation.kind === SemanticOperationKind.AwaitTimer };
        outputs = [operation.output]; break;
      case SemanticOperationKind.AwaitBoundedUserTask:
      case SemanticOperationKind.AwaitMonitoredUserTask:
      case SemanticOperationKind.AwaitMessageBoundedUserTask:
      case SemanticOperationKind.AwaitMessageMonitoredUserTask:
        step = { ...base, kind: StepKind.Wait, outputs: [] }; outputs = [operation.task.output]; break;
      case SemanticOperationKind.EnterScope:
      case SemanticOperationKind.EnterBoundedScope:
      case SemanticOperationKind.EnterMonitoredScope: {
        const completions = program.operations.filter((candidate) =>
          candidate.kind === SemanticOperationKind.CompleteScope && candidate.scopeId === operation.childScopeId);
        const completion = completions.length === 1 ? completions[0] : undefined;
        const childEntry = target(operation.childEntry);
        if (completion?.kind !== SemanticOperationKind.CompleteScope || completion.parentOutput === null || childEntry === undefined) return false;
        step = { ...base, kind: StepKind.Scope, outputs: [], childScope: operation.childScopeId, childEntry };
        outputs = [completion.parentOutput]; break;
      }
      default: return false;
    }
    const resolved = outputs.map(target);
    if (resolved.some((id) => id === undefined)) return false;
    steps.push({ ...step, outputs: resolved as string[] });
    if ("boundaryTimer" in operation || "boundaryMessage" in operation) {
      const timer = "boundaryTimer" in operation;
      const arm = "boundaryTimer" in operation ? operation.boundaryTimer : operation.boundaryMessage;
      const output = target(arm.output);
      if (output === undefined) return false;
      steps.push({ id: `boundary:${JSON.stringify(operation.id)}`, scope, kind: StepKind.Boundary,
        outputs: [output], host: base.id, timer,
        repeating: operation.kind === SemanticOperationKind.AwaitMonitoredUserTask ||
          operation.kind === SemanticOperationKind.AwaitMessageMonitoredUserTask ||
          operation.kind === SemanticOperationKind.EnterMonitoredScope });
    }
  }
  const entry = steps.find((step) => step.kind === StepKind.Start && step.scope === root);
  return entry !== undefined && forestAdmitted({ steps, root, entry: entry.id });
}

function selectedRoot(processId: string, scopes: readonly DefinitionScope[]): string | undefined {
  const roots = scopes.filter(({ parentScopeId, originElementId }) => parentScopeId === null && originElementId === processId);
  const root = roots.length === 1 ? roots[0] : undefined;
  return root !== undefined && scopes.every((scope) => scope.id === root.id || scope.parentScopeId === root.id)
    ? root.id : undefined;
}

function isScopeEntry(operation: SemanticOperation): boolean {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.EnterBoundedScope:
    case SemanticOperationKind.EnterMonitoredScope: return true;
    default: return false;
  }
}

function forestAdmitted(forest: Forest): boolean {
  const { steps, root, entry } = forest;
  const byId = new Map(steps.map((step) => [step.id, step]));
  const boundaries = steps.filter(({ kind }) => kind === StepKind.Boundary);
  const scopeSteps = steps.filter(({ kind }) => kind === StepKind.Scope);
  const entries = new Set([entry, ...scopeSteps.flatMap(({ childEntry }) => childEntry === undefined ? [] : [childEntry]),
    ...boundaries.map(({ id }) => id)]);
  if (byId.size !== steps.length || boundaries.length > 1 || steps.filter(({ timer }) => timer).length > 1) return false;
  for (const step of steps) {
    const incoming = steps.filter(({ outputs }) => outputs.includes(step.id));
    if (incoming.length !== (entries.has(step.id) ? 0 : 1) ||
        step.outputs.some((id) => byId.get(id)?.scope !== step.scope) ||
        new Set(step.outputs).size !== step.outputs.length) return false;
    switch (step.kind) {
      case StepKind.Fork: if (step.outputs.length < 2) return false; break;
      case StepKind.End:
      case StepKind.Terminate: if (step.outputs.length !== 0) return false; break;
      default: if (step.outputs.length !== 1) return false;
    }
    if (step.kind === StepKind.Terminate &&
        incoming[0]?.kind !== StepKind.Wait && incoming[0]?.kind !== StepKind.Boundary) return false;
    if (step.kind === StepKind.Boundary) {
      const host = step.host === undefined ? undefined : byId.get(step.host);
      if (host === undefined || host.scope !== step.scope ||
          (host.kind !== StepKind.Wait && !(step.timer && host.kind === StepKind.Scope))) return false;
      if (step.repeating) {
        const seen = new Set<string>();
        const pending = [...step.outputs];
        for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
          if (seen.has(id)) continue;
          seen.add(id);
          const reached = byId.get(id);
          if (reached === undefined || reached.timer || reached.kind === StepKind.Scope || reached.id === host.id) return false;
          pending.push(...reached.outputs);
        }
      }
    }
  }
  const memo = new Map<string, Burst>();
  const active = new Set<string>();
  const follow = (outputs: readonly string[]): Burst | undefined => {
    let count = 0, live = false;
    for (const output of outputs) {
      const part = walk(output);
      if (part === undefined) return undefined;
      count += part.count; live ||= part.live;
    }
    return { count, live };
  };
  const finish = (burst: Burst, scope: string): Burst | undefined => {
    if (burst.live) return burst;
    if (scope === root) return { count: burst.count + 1, live: false };
    const host = scopeSteps.find(({ childScope }) => childScope === scope);
    if (host === undefined) return undefined;
    const parent = follow(host.outputs);
    if (parent === undefined) return undefined;
    return finish({ count: burst.count + 1 + parent.count, live: parent.live }, host.scope);
  };
  const walk = (id: string): Burst | undefined => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const step = byId.get(id);
    if (step === undefined || active.has(id)) return undefined;
    active.add(id);
    let result: Burst | undefined;
    switch (step.kind) {
      case StepKind.Wait: result = { count: 1, live: true }; break;
      case StepKind.End:
      case StepKind.Terminate: result = { count: 1, live: false }; break;
      case StepKind.Scope: {
        const child = step.childEntry === undefined ? undefined : walk(step.childEntry);
        if (child === undefined) break;
        if (child.live) { result = { count: 1 + child.count, live: true }; break; }
        const continuation = follow(step.outputs);
        if (continuation !== undefined) result = { count: 2 + child.count + continuation.count, live: continuation.live };
        break;
      }
      case StepKind.Start:
      case StepKind.Fork:
      case StepKind.Boundary: {
        const tail = follow(step.outputs);
        if (tail !== undefined) result = { count: tail.count +
          (step.kind === StepKind.Boundary || (step.kind === StepKind.Start && step.scope !== root) ? 0 : 1), live: tail.live };
        break;
      }
    }
    active.delete(id);
    if (result !== undefined) memo.set(id, result);
    return result;
  };
  const initial = walk(entry);
  if (initial === undefined || (finish(initial, root)?.count ?? Infinity) > 8) return false;
  return steps.every((step) => {
    if (step.kind !== StepKind.Wait && step.kind !== StepKind.Boundary) return true;
    const tail = follow(step.outputs);
    return tail !== undefined && (finish(tail, step.scope)?.count ?? Infinity) <= 8;
  });
}
