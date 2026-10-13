import type { DirectActivityDataInput } from "./activity-data-input-contract.js";
import type { DirectActivityDataOutput } from "./activity-data-output-contract.js";
import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedProcess, CheckedSequenceFlow } from "./checked-process-contract.js";
import { StimulusKind } from "./contract.js";
import type { Stimulus } from "./contract.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { compareCanonicalStrings } from "./wire.js";

enum VertexKind { Start, Task, Choice, Merge, End }
type Vertex = Readonly<{
  id: string;
  kind: VertexKind;
  outputs: readonly string[];
  reads?: string;
  writes?: string;
}>;
type Analysis = Readonly<{ requiredInputs: ReadonlySet<string>; maximumBurst: number }>;

/** SPC admits existing operations by mechanism and arity, never by retained fixture IDs. */
export function structuredCompositionProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  return scopeCount === 1 &&
    operations.filter(({ kind }) => kind === SemanticOperationKind.Initiate).length === 1 &&
    operations.filter(({ kind }) => kind === SemanticOperationKind.ReachNoneEnd).length === 1 &&
    operations.filter(({ kind }) => kind === SemanticOperationKind.CompleteScope).length === 1 &&
    operations.some(({ kind }) => kind === SemanticOperationKind.AwaitUserTask || kind === SemanticOperationKind.AwaitDataInputOutputUserTask) &&
    operations.every((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.Initiate:
        case SemanticOperationKind.ReachNoneEnd:
        case SemanticOperationKind.AwaitDataInputOutputUserTask: return true;
        case SemanticOperationKind.CompleteScope: return operation.parentOutput === null;
        case SemanticOperationKind.AwaitUserTask: return operation.task.metadata === undefined;
        case SemanticOperationKind.Choose: return operation.candidates.length === 2;
        case SemanticOperationKind.MergeExclusive: return operation.inputs.length === 3;
        default: return false;
      }
    });
}

/** Checked admission examines its own node/flow references before Program lowering. */
export function structuredCompositionCheckedShape(nodes: readonly CheckedNode[], scopeCount: number): boolean {
  return scopeCount === 1 &&
    nodes.filter(({ kind }) => kind === CheckedNodeKind.NoneStartEvent).length === 1 &&
    nodes.filter(({ kind }) => kind === CheckedNodeKind.NoneEndEvent).length === 1 &&
    nodes.some(({ kind }) => kind === CheckedNodeKind.UserTask || kind === CheckedNodeKind.DataInputOutputUserTask) &&
    nodes.every((node) => {
      switch (node.kind) {
        case CheckedNodeKind.NoneStartEvent:
        case CheckedNodeKind.NoneEndEvent:
        case CheckedNodeKind.ExclusiveMerge:
        case CheckedNodeKind.DataInputOutputUserTask: return true;
        case CheckedNodeKind.UserTask: return node.metadata === undefined;
        case CheckedNodeKind.ExclusiveGateway: return node.direction === GatewayDirection.Diverging && node.candidateFlowIds.length === 2;
        default: return false;
      }
    });
}

/** SPC-SOURCE-01 permits shared root Properties, but local data elements have one declaration owner. */
export function dataIdentitiesValid(declarations: readonly string[], tasks: readonly Readonly<{
  directInput: DirectActivityDataInput;
  directOutput: DirectActivityDataOutput;
}>[]): boolean {
  const owned = [...declarations, ...tasks.flatMap(({ directInput: input, directOutput: output }) =>
    [input.associationId, input.targetDataInputId, output.associationId, output.sourceDataOutputId])];
  const identities = new Set(owned);
  return identities.size === owned.length && tasks.every(({ directInput: input, directOutput: output }) =>
    input.source.kind === "property" && output.target.kind === "property" &&
    !identities.has(input.source.propertyId) && !identities.has(output.target.propertyId));
}

export function structuredCompositionCheckedGraph(graph: Readonly<{
  processId: string; nodes: readonly CheckedNode[]; flows: readonly CheckedSequenceFlow[];
}> & Pick<CheckedProcess, "compensation" | "transactionCancellation">): boolean {
  if (graph.compensation !== undefined || graph.transactionCancellation !== undefined ||
      !dataIdentitiesValid([graph.processId, ...graph.nodes.map(({ id }) => id), ...graph.flows.map(({ id }) => id)],
        graph.nodes.filter((node) => node.kind === CheckedNodeKind.DataInputOutputUserTask))) return false;
  const vertices: Vertex[] = [];
  if (new Set(graph.flows.map(({ id }) => id)).size !== graph.flows.length) return false;
  for (const node of graph.nodes) {
    const outgoing = graph.flows.filter(({ sourceId }) => sourceId === node.id);
    let kind: VertexKind;
    let data: Pick<Vertex, "reads" | "writes"> = {};
    switch (node.kind) {
      case CheckedNodeKind.NoneStartEvent: kind = VertexKind.Start; break;
      case CheckedNodeKind.NoneEndEvent: kind = VertexKind.End; break;
      case CheckedNodeKind.UserTask: kind = VertexKind.Task; break;
      case CheckedNodeKind.DataInputOutputUserTask:
        kind = VertexKind.Task;
        if (node.directInput.source.kind !== "property" || node.directOutput.target.kind !== "property") return false;
        data = { reads: node.directInput.source.propertyId, writes: node.directOutput.target.propertyId }; break;
      case CheckedNodeKind.ExclusiveMerge: kind = VertexKind.Merge; break;
      case CheckedNodeKind.ExclusiveGateway:
        kind = VertexKind.Choice;
        if (new Set([...node.candidateFlowIds, node.defaultFlowId]).size !== 3 ||
            !node.candidateFlowIds.every((id) => outgoing.some((flow) => flow.id === id && flow.condition !== null)) ||
            !outgoing.some((flow) => flow.id === node.defaultFlowId && flow.condition === null)) return false;
        break;
      default: return false;
    }
    if (kind !== VertexKind.Choice && outgoing.some(({ condition }) => condition !== null)) return false;
    vertices.push({ id: node.id, kind, outputs: outgoing.map(({ targetId }) => targetId), ...data });
  }
  const nodeIds = new Set(graph.nodes.map(({ id }) => id));
  if (!graph.flows.every(({ sourceId, targetId }) => nodeIds.has(sourceId) && nodeIds.has(targetId))) return false;
  const analysis = analyze(vertices);
  return analysis !== undefined && analysis.maximumBurst <= semanticProcessClosureLimit;
}

function programVertices(program: SemanticProcessProgram): readonly Vertex[] | undefined {
  if (!structuredCompositionProgramShape(program.operations, program.definitionScopes.length) ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined ||
      !dataIdentitiesValid([program.processId,
        ...program.operations.filter((operation) => operation.kind !== SemanticOperationKind.CompleteScope)
          .map(({ origin }) => origin.elementId), ...program.controlPlaces.map(({ origin }) => origin.elementId)],
        program.operations.filter((operation) => operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask))) return undefined;
  const consumers = new Map<string, string[]>();
  for (const operation of program.operations) {
    const inputs = operation.kind === SemanticOperationKind.MergeExclusive ? operation.inputs :
      "input" in operation ? [operation.input] : [];
    for (const input of inputs) consumers.set(input, [...(consumers.get(input) ?? []), operation.id]);
  }
  const vertices: Vertex[] = [];
  for (const operation of program.operations) {
    let kind: VertexKind;
    let places: readonly string[];
    let data: Pick<Vertex, "reads" | "writes"> = {};
    switch (operation.kind) {
      case SemanticOperationKind.CompleteScope: continue;
      case SemanticOperationKind.Initiate: kind = VertexKind.Start; places = [operation.output]; break;
      case SemanticOperationKind.ReachNoneEnd: kind = VertexKind.End; places = []; break;
      case SemanticOperationKind.Choose:
        kind = VertexKind.Choice; places = [...operation.candidates.map(({ output }) => output), operation.defaultOutput]; break;
      case SemanticOperationKind.MergeExclusive: kind = VertexKind.Merge; places = [operation.output]; break;
      case SemanticOperationKind.AwaitUserTask: kind = VertexKind.Task; places = [operation.output]; break;
      case SemanticOperationKind.AwaitDataInputOutputUserTask:
        kind = VertexKind.Task; places = [operation.output];
        if (operation.directInput.source.kind !== "property" || operation.directOutput.target.kind !== "property") return undefined;
        data = { reads: operation.directInput.source.propertyId, writes: operation.directOutput.target.propertyId }; break;
      default: return undefined;
    }
    const outputs: string[] = [];
    for (const place of places) {
      const targets = consumers.get(place);
      if (targets?.length !== 1 || targets[0] === undefined) return undefined;
      outputs.push(targets[0]);
    }
    vertices.push({ id: operation.id, kind, outputs, ...data });
  }
  return vertices;
}

function topologicalOrder(vertices: readonly Vertex[]): readonly Vertex[] | undefined {
  const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  if (byId.size !== vertices.length) return undefined;
  const incoming = new Map(vertices.map(({ id }) => [id, 0]));
  for (const vertex of vertices) {
    for (const target of vertex.outputs) {
      const count = incoming.get(target);
      if (count === undefined) return undefined;
      incoming.set(target, count + 1);
    }
  }
  for (const vertex of vertices) {
    const expectedInputs = vertex.kind === VertexKind.Start ? 0 : vertex.kind === VertexKind.Merge ? 3 : 1;
    const expectedOutputs = vertex.kind === VertexKind.End ? 0 : vertex.kind === VertexKind.Choice ? 3 : 1;
    if (incoming.get(vertex.id) !== expectedInputs || vertex.outputs.length !== expectedOutputs) return undefined;
  }
  const ready = vertices.filter(({ id }) => incoming.get(id) === 0);
  const ordered: Vertex[] = [];
  for (let i = 0; i < ready.length; i += 1) {
    const current = ready[i];
    if (current === undefined) return undefined;
    ordered.push(current);
    for (const target of current.outputs) {
      const count = incoming.get(target);
      const next = byId.get(target);
      if (count === undefined || next === undefined) return undefined;
      incoming.set(target, count - 1);
      if (count === 1) ready.push(next);
    }
  }
  return ordered.length === vertices.length ? ordered : undefined;
}

/** Edge arrays retain multiplicity: empty branches are three distinct routes into their merge. */
function pairedStructure(vertices: readonly Vertex[]): boolean {
  let remaining = [...vertices].sort((left, right) => compareCanonicalStrings(left.id, right.id));
  while (remaining.length > 2) {
    const byId = new Map(remaining.map((vertex) => [vertex.id, vertex]));
    const incoming = new Map<string, number>();
    for (const vertex of remaining) {
      for (const target of vertex.outputs) incoming.set(target, (incoming.get(target) ?? 0) + 1);
    }
    let contracted = false;
    for (const vertex of remaining) {
      let removed = [vertex.id];
      let output: string | undefined;
      switch (vertex.kind) {
        case VertexKind.Task: output = vertex.outputs[0]; break;
        case VertexKind.Choice: {
          const first = vertex.outputs[0];
          const merge = first === undefined ? undefined : byId.get(first);
          if (merge?.kind !== VertexKind.Merge || !vertex.outputs.every((id) => id === merge.id) ||
              incoming.get(merge.id) !== 3) continue;
          removed = [vertex.id, merge.id]; output = merge.outputs[0]; break;
        }
        default: continue;
      }
      if (output === undefined || removed.includes(output)) return false;
      const successor = output;
      remaining = remaining.filter(({ id }) => !removed.includes(id)).map((candidate) => ({
        ...candidate, outputs: candidate.outputs.map((id) => id === vertex.id ? successor : id),
      }));
      contracted = true;
      break;
    }
    if (!contracted) return false;
  }
  const start = remaining.find(({ kind }) => kind === VertexKind.Start);
  const end = remaining.find(({ kind }) => kind === VertexKind.End);
  return start !== undefined && end !== undefined && start.outputs.length === 1 && start.outputs[0] === end.id;
}

function analyze(vertices: readonly Vertex[]): Analysis | undefined {
  const ordered = topologicalOrder(vertices);
  if (ordered === undefined || !pairedStructure(vertices)) return undefined;
  const requiredInputs = new Set<string>();
  const written = new Map<string, ReadonlySet<string>>();
  for (const vertex of ordered) {
    const predecessors = vertices.filter(({ outputs }) => outputs.includes(vertex.id));
    const incoming = predecessors.map(({ id }) => written.get(id));
    if (incoming.some((set) => set === undefined)) return undefined;
    const definitelyWritten = new Set([...(incoming[0] ?? [])].filter((key) => incoming.every((set) => set?.has(key))));
    if (vertex.reads !== undefined && !definitelyWritten.has(vertex.reads)) requiredInputs.add(vertex.reads);
    if (vertex.writes !== undefined) definitelyWritten.add(vertex.writes);
    written.set(vertex.id, definitelyWritten);
  }
  const bursts = new Map<string, number>();
  let maximumBurst = 0;
  for (const vertex of [...ordered].reverse()) {
    let tail = 0;
    for (const id of vertex.outputs) {
      const next = bursts.get(id);
      if (next === undefined) return undefined;
      tail = Math.max(tail, next);
    }
    // SPC-CLOSURE-01 counts None End and root completion separately; arming a task ends the burst.
    const cost = vertex.kind === VertexKind.Task ? 1 : vertex.kind === VertexKind.End ? 2 : 1 + tail;
    bursts.set(vertex.id, cost);
    if (vertex.kind === VertexKind.Start) maximumBurst = Math.max(maximumBurst, cost);
    if (vertex.kind === VertexKind.Task) maximumBurst = Math.max(maximumBurst, tail);
  }
  return { requiredInputs, maximumBurst };
}

function programAnalysis(program: SemanticProcessProgram): Analysis | undefined {
  const vertices = programVertices(program);
  return vertices === undefined ? undefined : analyze(vertices);
}

export function structuredCompositionProgramGraph(program: SemanticProcessProgram): boolean {
  const analysis = programAnalysis(program);
  return analysis !== undefined && analysis.maximumBurst <= semanticProcessClosureLimit;
}

/** SPC-AVAILABLE-01 and SPC-COMMAND-01 bind data admission to the selected task, not only its profile. */
export function structuredCompositionStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (program.identity.semanticProfile !== STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID) return true;
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const analysis = programAnalysis(program);
      return analysis !== undefined && [...analysis.requiredInputs].every((name) =>
        stimulus.initialVariables.some((binding) => binding.name === name));
    }
    case StimulusKind.CompleteUserTaskInstance: {
      const tasks = program.operations.filter((operation) => "task" in operation && operation.task.elementId === stimulus.taskId.elementId);
      const task = tasks.length === 1 ? tasks[0] : undefined;
      if (task?.kind === SemanticOperationKind.AwaitUserTask) return stimulus.submittedValues.length === 0;
      return task?.kind === SemanticOperationKind.AwaitDataInputOutputUserTask && stimulus.submittedValues.length === 1 &&
        stimulus.submittedValues[0]?.name === task.directOutput.sourceDataOutputId;
    }
    default: return false;
  }
}
