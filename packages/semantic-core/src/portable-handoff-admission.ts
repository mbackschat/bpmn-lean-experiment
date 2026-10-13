/**
 * Source and Program admission of the serial portable-value handoff.
 *
 * The profile admits exactly Start, two owned Data Input/Output User Tasks and End on one acyclic path, wired
 * P_in to P_mid to P_out through three pairwise-distinct Process Properties. Only ordinal position in the path and
 * Property identity enter the rules: no business name, task name or element spelling does, and the declaration order of
 * nodes, operations and flows is irrelevant. Value-level rules belong to `property-path-value-policy.ts`.
 *
 * The shape is fixed, so the automatic closure after every accepted command is a constant of at most two internal
 * steps and stays under `semanticProcessClosureLimit` without an analysis.
 */
import { ActivityDataEndpointKind } from "./activity-data-endpoint.js";
import type { DirectActivityDataInput } from "./activity-data-input-contract.js";
import type { DirectActivityDataOutput } from "./activity-data-output-contract.js";
import { CheckedNodeKind } from "./checked-process-contract.js";
import type { CheckedNode, CheckedProcess, CheckedSequenceFlow } from "./checked-process-contract.js";
import { StimulusKind } from "./contract.js";
import type { Stimulus } from "./contract.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitDataInputOutputUserTaskOperation,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { dataIdentitiesValid } from "./structured-process-composition-admission.js";

type DataTask = Readonly<{
  directInput: DirectActivityDataInput;
  directOutput: DirectActivityDataOutput;
}>;

const PathRole = { Start: "start", Task: "task", End: "end" } as const;
type PathRole = typeof PathRole[keyof typeof PathRole];

/** One vertex of the candidate path, in either representation; `outputs` repeats a target once per edge. */
type PathVertex = Readonly<{
  id: string;
  role: PathRole;
  outputs: readonly string[];
  task?: DataTask;
}>;

const pathLength = 4;

/** The exact operation multiset: one initiation, two composed tasks, one None End and the root completion. */
export function portableHandoffProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  const count = (kind: SemanticOperationKind) => operations.filter((operation) => operation.kind === kind).length;
  return scopeCount === 1 && operations.length === pathLength + 1 &&
    count(SemanticOperationKind.Initiate) === 1 &&
    count(SemanticOperationKind.AwaitDataInputOutputUserTask) === 2 &&
    count(SemanticOperationKind.ReachNoneEnd) === 1 &&
    operations.filter((operation) => operation.kind === SemanticOperationKind.CompleteScope && operation.parentOutput === null)
      .length === 1;
}

/** The exact checked-node multiset, independent of every identifier. */
export function portableHandoffCheckedShape(nodes: readonly CheckedNode[], scopeCount: number): boolean {
  const count = (kind: CheckedNodeKind) => nodes.filter((node) => node.kind === kind).length;
  return scopeCount === 1 && nodes.length === pathLength &&
    count(CheckedNodeKind.NoneStartEvent) === 1 &&
    count(CheckedNodeKind.DataInputOutputUserTask) === 2 &&
    count(CheckedNodeKind.NoneEndEvent) === 1;
}

/**
 * Walks Start to End and returns the two tasks in path order, or `undefined` unless the vertices form exactly one
 * simple path in which only the Start has no incoming edge and every other vertex has exactly one.
 */
function serialTasks(vertices: readonly PathVertex[]): readonly [DataTask, DataTask] | undefined {
  const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const incoming = new Map<string, number>();
  for (const vertex of vertices) {
    for (const target of vertex.outputs) incoming.set(target, (incoming.get(target) ?? 0) + 1);
  }
  const starts = vertices.filter(({ role }) => role === PathRole.Start);
  if (vertices.length !== pathLength || byId.size !== pathLength || starts.length !== 1) return undefined;
  const path: PathVertex[] = [];
  let current: PathVertex | undefined = starts[0];
  while (current !== undefined && path.length < pathLength && !path.includes(current)) {
    path.push(current);
    const next: string | undefined = current.outputs.length === 1 ? current.outputs[0] : undefined;
    current = next === undefined ? undefined : byId.get(next);
  }
  const [begin, first, second, end] = path;
  if (begin?.role !== PathRole.Start || first?.role !== PathRole.Task || second?.role !== PathRole.Task ||
      end?.role !== PathRole.End || end.outputs.length !== 0 || first.task === undefined || second.task === undefined ||
      incoming.has(begin.id) || [first, second, end].some(({ id }) => incoming.get(id) !== 1)) return undefined;
  return [first.task, second.task];
}

/** P_in to T1 to P_mid to T2 to P_out with three distinct Process Properties; nothing else is read. */
function propertyWiringExact([first, second]: readonly [DataTask, DataTask]): boolean {
  const read = first.directInput.source;
  const handoffOut = first.directOutput.target;
  const handoffIn = second.directInput.source;
  const write = second.directOutput.target;
  return read.kind === ActivityDataEndpointKind.Property && handoffOut.kind === ActivityDataEndpointKind.Property &&
    handoffIn.kind === ActivityDataEndpointKind.Property && write.kind === ActivityDataEndpointKind.Property &&
    handoffOut.propertyId === handoffIn.propertyId &&
    new Set([read.propertyId, handoffOut.propertyId, write.propertyId]).size === 3;
}

function checkedVertices(
  nodes: readonly CheckedNode[],
  flows: readonly CheckedSequenceFlow[],
): readonly PathVertex[] | undefined {
  const ids = new Set(nodes.map(({ id }) => id));
  if (new Set(flows.map(({ id }) => id)).size !== flows.length || ids.size !== nodes.length ||
      !flows.every(({ sourceId, targetId, condition }) => ids.has(sourceId) && ids.has(targetId) && condition === null)) {
    return undefined;
  }
  const vertices: PathVertex[] = [];
  for (const node of nodes) {
    const outputs = flows.filter(({ sourceId }) => sourceId === node.id).map(({ targetId }) => targetId);
    switch (node.kind) {
      case CheckedNodeKind.NoneStartEvent: vertices.push({ id: node.id, role: PathRole.Start, outputs }); break;
      case CheckedNodeKind.NoneEndEvent: vertices.push({ id: node.id, role: PathRole.End, outputs }); break;
      case CheckedNodeKind.DataInputOutputUserTask: vertices.push({ id: node.id, role: PathRole.Task, outputs, task: node }); break;
      default: return undefined;
    }
  }
  return vertices;
}

function programVertices(program: SemanticProcessProgram): readonly PathVertex[] | undefined {
  if (!portableHandoffProgramShape(program.operations, program.definitionScopes.length) ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined) return undefined;
  const consumers = new Map<string, string[]>();
  for (const operation of program.operations) {
    if ("input" in operation && typeof operation.input === "string") {
      consumers.set(operation.input, [...(consumers.get(operation.input) ?? []), operation.id]);
    }
  }
  const vertices: PathVertex[] = [];
  for (const operation of program.operations) {
    let role: PathRole;
    let places: readonly string[];
    let task: DataTask | undefined;
    switch (operation.kind) {
      case SemanticOperationKind.CompleteScope: continue;
      case SemanticOperationKind.Initiate: role = PathRole.Start; places = [operation.output]; break;
      case SemanticOperationKind.ReachNoneEnd: role = PathRole.End; places = []; break;
      case SemanticOperationKind.AwaitDataInputOutputUserTask: role = PathRole.Task; places = [operation.output]; task = operation; break;
      default: return undefined;
    }
    const outputs: string[] = [];
    for (const place of places) {
      const targets = consumers.get(place);
      if (targets?.length !== 1 || targets[0] === undefined) return undefined;
      outputs.push(targets[0]);
    }
    vertices.push({ id: operation.id, role, outputs, ...(task === undefined ? {} : { task }) });
  }
  return vertices;
}

function programTasks(program: SemanticProcessProgram): readonly [DataTask, DataTask] | undefined {
  const vertices = programVertices(program);
  const tasks = vertices === undefined ? undefined : serialTasks(vertices);
  const owners = program.operations.filter((operation): operation is AwaitDataInputOutputUserTaskOperation =>
    operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask);
  return tasks !== undefined && propertyWiringExact(tasks) && dataIdentitiesValid(
    [program.processId,
      ...program.operations.filter((operation) => operation.kind !== SemanticOperationKind.CompleteScope)
        .map(({ origin }) => origin.elementId),
      ...program.controlPlaces.map(({ origin }) => origin.elementId)],
    owners,
  ) ? tasks : undefined;
}

/** Checked admission of the exact serial path, its Property wiring and its global data identities. */
export function portableHandoffCheckedGraph(graph: Readonly<{
  processId: string; nodes: readonly CheckedNode[]; flows: readonly CheckedSequenceFlow[];
}> & Pick<CheckedProcess, "compensation" | "transactionCancellation">): boolean {
  if (graph.compensation !== undefined || graph.transactionCancellation !== undefined) return false;
  const vertices = checkedVertices(graph.nodes, graph.flows);
  const tasks = vertices === undefined ? undefined : serialTasks(vertices);
  return tasks !== undefined && propertyWiringExact(tasks) && dataIdentitiesValid(
    [graph.processId, ...graph.nodes.map(({ id }) => id), ...graph.flows.map(({ id }) => id)],
    graph.nodes.filter((node) => node.kind === CheckedNodeKind.DataInputOutputUserTask),
  );
}

/** Program admission of the same path, computed from places and operations independently of the checked graph. */
export function portableHandoffProgramGraph(program: SemanticProcessProgram): boolean {
  return programTasks(program) !== undefined;
}

/**
 * Binds a Start command's binding to the declared P_in: exactly one binding, named by the first task's source Property.
 * Value eligibility is separate. A completion needs no check here because the composed-task runtime already requires
 * exactly the task's DataOutput name and refuses an undeclared or stale occurrence without a partial write; any other
 * external command is outside this profile's selected surfaces.
 */
export function portableHandoffStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (program.identity.semanticProfile !== SemanticProfileId.PortableBusinessValuesHandoff) return true;
  const tasks = programTasks(program);
  if (tasks === undefined) return false;
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const read = tasks[0].directInput.source;
      return read.kind === ActivityDataEndpointKind.Property && stimulus.initialVariables.length === 1 &&
        stimulus.initialVariables[0]?.name === read.propertyId;
    }
    case StimulusKind.CompleteUserTaskInstance:
      return true;
    default:
      return false;
  }
}
