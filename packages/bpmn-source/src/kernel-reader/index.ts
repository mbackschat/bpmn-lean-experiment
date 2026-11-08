/**
 * Emits the kernel IL ([proposal](../../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#il)) directly from the parsed BPMN,
 * one module per mechanism. The reader chooses no semantics and never branches on a profile: it refuses only what it
 * cannot read faithfully (parse, preservation, unknown or unrepresentable source), and every semantic refusal belongs
 * to `Kernel.Admission`.
 */
import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { indexCompensation } from "./compensation.js";
import { readEvent } from "./events.js";
import { readGateway } from "./flow.js";
import {
  FlowElementKind,
  ReadRefusal,
  ReadRefusalCode,
  byId,
  createExtensionTracker,
  flowElementKind,
  list,
  optionalId,
  requireId,
  requireInertRoot,
  text,
  uncarriedFacts,
} from "./model.js";
import type { Built, ModelNode, ReadContext, SourceFactNotCarried } from "./model.js";
import { childIds, readScope } from "./scopes.js";
import { parseKernelSource } from "./source.js";
import type { KernelSource } from "./source.js";
import { assertNever, compareIds, defaultKernelProfileOptions } from "./wire.js";
import type { KernelJson, KernelProfileOptions } from "./wire.js";
import { readActivity } from "./work.js";

export { defaultKernelProfileOptions, kernelProfileOptions } from "./wire.js";
export type { KernelJson, KernelProfileOptions } from "./wire.js";
export { ReadRefusalCode } from "./model.js";
export type { SourceFactNotCarried } from "./model.js";
export type { KernelSource } from "./source.js";

export type KernelRead =
  | Readonly<{ kind: "read"; program: KernelJson; notCarried: ReadonlyArray<SourceFactNotCarried> }>
  | Readonly<{ kind: "refused"; code: ReadRefusalCode; element: string | null; evidence: string }>;

type Scan = Readonly<{
  nodes: Map<string, ModelNode>;
  flows: ElementRecord[];
  containers: ElementRecord[];
}>;

function scanContainer(scan: Scan, container: ElementRecord, parent: string | null): void {
  scan.containers.push(container);
  for (const element of list(container, "flowElements")) {
    const kind = flowElementKind(element);
    if (kind === FlowElementKind.DataDeclaration) continue;
    const id = requireId(element);
    if (scan.nodes.has(id) || scan.flows.some((flow) => flow.id === id)) {
      throw new ReadRefusal(ReadRefusalCode.SourceDuplicateId, id, "id used twice");
    }
    if (kind === FlowElementKind.SequenceFlow) {
      scan.flows.push(element);
    } else {
      scan.nodes.set(id, { element, kind, parent, container });
      if (kind === FlowElementKind.SubProcess || kind === FlowElementKind.Transaction) scanContainer(scan, element, id);
    }
  }
}

const endpoint = (flow: ElementRecord, key: string): string | null => optionalId(asElement(flow[key]) ?? {});

/** A Process is called when some Call Activity names it; the root is the first Process nothing calls. */
function selectRootProcess(processes: ReadonlyArray<ElementRecord>, nodes: ReadonlyMap<string, ModelNode>): ElementRecord {
  const called = new Set([...nodes.values()].flatMap((node) => {
    if (node.kind !== FlowElementKind.CallActivity) return [];
    const name = text(node.element, "calledElement") ?? "";
    return [name.includes(":") ? name.slice(name.indexOf(":") + 1) : name];
  }));
  const root = processes.find((process) => !called.has(String(process.id))) ?? processes[0];
  if (root === undefined) throw new ReadRefusal(ReadRefusalCode.SourceNoProcess, null, "no Process");
  return root;
}

function createContext(definitions: ElementRecord, parsed: Awaited<ReturnType<typeof parseKernelSource>>, scan: Scan,
  processes: ReadonlyArray<ElementRecord>, notCarried: SourceFactNotCarried[]): ReadContext & { consumedBy: (element: ElementRecord) => ReadonlySet<string> } {
  const compensation = indexCompensation(scan.nodes, scan.containers);
  const flowOrder = new Map(scan.flows.map((flow, index) => [String(flow.id), index]));
  const flows = scan.flows.filter((flow) => !compensation.erased.has(String(flow.id)))
    .sort((left, right) => compareIds(String(left.id), String(right.id)));
  const tracker = createExtensionTracker(definitions);
  return {
    ...tracker,
    definitions,
    rootProcess: selectRootProcess(processes, scan.nodes),
    processes,
    nodes: scan.nodes,
    flows,
    flowOrder,
    incoming: (id) => flows.filter((flow) => endpoint(flow, "targetRef") === id).map((flow) => String(flow.id)),
    outgoing: (id) => flows.filter((flow) => endpoint(flow, "sourceRef") === id).map((flow) => String(flow.id)),
    childrenOf: (container) => [...scan.nodes.values()].filter((node) => node.container === container),
    compensation: compensation.subjects,
    handlers: compensation.handlers,
    erased: compensation.erased,
    bindings: parsed.bindings,
    inertAttributes: parsed.inertAttributes,
    expressionLanguage: Object.hasOwn(definitions, "expressionLanguage") ? text(definitions, "expressionLanguage") : null,
    noteNotCarried: (fact) => notCarried.push(fact),
  };
}

function readNode(ctx: ReadContext, node: ModelNode): Built {
  switch (node.kind) {
    case FlowElementKind.StartEvent:
    case FlowElementKind.EndEvent:
    case FlowElementKind.IntermediateCatchEvent:
    case FlowElementKind.IntermediateThrowEvent:
    case FlowElementKind.BoundaryEvent:
      return readEvent(ctx, node, node.kind);
    case FlowElementKind.Task:
    case FlowElementKind.ManualTask:
    case FlowElementKind.UserTask:
    case FlowElementKind.ServiceTask:
    case FlowElementKind.SendTask:
    case FlowElementKind.ReceiveTask:
    case FlowElementKind.ScriptTask:
    case FlowElementKind.BusinessRuleTask:
    case FlowElementKind.CallActivity:
      return readActivity(ctx, node, node.kind);
    case FlowElementKind.SubProcess:
    case FlowElementKind.Transaction:
      return readScope(ctx, node, node.kind);
    case FlowElementKind.ExclusiveGateway:
    case FlowElementKind.InclusiveGateway:
    case FlowElementKind.ParallelGateway:
    case FlowElementKind.EventBasedGateway:
      return readGateway(ctx, node, node.kind);
    case FlowElementKind.SequenceFlow:
    case FlowElementKind.DataDeclaration:
      throw new TypeError(`${node.kind} is not a flow node`);
  }
  return assertNever(node.kind);
}

/** Every element below a compensation handler follows that handler in the element list. */
function handlerDescendants(ctx: ReadContext, handler: string): ModelNode[] {
  const below = [...ctx.nodes.values()].filter((node) => {
    for (let parent = node.parent; parent !== null; parent = ctx.nodes.get(parent)?.parent ?? null) {
      if (parent === handler) return true;
    }
    return false;
  });
  return below.filter((node) => !ctx.erased.has(requireId(node.element))).sort(byId);
}

function buildProgramElements(ctx: ReadContext): KernelJson[] {
  const deferredBoundaries = new Set(ctx.compensation.flatMap((entry) => (entry.boundary === null ? [] : [entry.boundary])));
  const inHandler = new Set(ctx.compensation.flatMap((entry) => handlerDescendants(ctx, entry.handler).map((node) => requireId(node.element))));
  const normal = [...ctx.nodes.values()].filter((node) => {
    const id = requireId(node.element);
    return !ctx.handlers.has(id) && !inHandler.has(id) && !ctx.erased.has(id) && !deferredBoundaries.has(id);
  }).sort(byId);
  const built = normal.map((node) => readNode(ctx, node));
  for (const entry of ctx.compensation) {
    const handler = ctx.nodes.get(entry.handler);
    if (handler !== undefined) built.push(readNode(ctx, handler));
    built.push(...handlerDescendants(ctx, entry.handler).map((node) => readNode(ctx, node)));
    const boundary = entry.boundary === null ? undefined : ctx.nodes.get(entry.boundary);
    if (boundary !== undefined) built.push(readNode(ctx, boundary));
  }
  const boundaries = new Map<string, KernelJson[]>();
  for (const entry of built) {
    if (entry.kind === "boundary") boundaries.set(entry.attachedTo, [...(boundaries.get(entry.attachedTo) ?? []), entry.boundary]);
  }
  return built.flatMap((entry) => (entry.kind === "element" ? [entry.build(boundaries.get(entry.id) ?? [])] : []));
}

const conditionReadingKinds: ReadonlySet<FlowElementKind> = new Set([FlowElementKind.ExclusiveGateway, FlowElementKind.InclusiveGateway]);

/** BPMN facts with no IL field yet (the conditional and default outflows of an Activity, a Transaction's method). */
function structuralFacts(ctx: ReadContext): SourceFactNotCarried[] {
  const conditional = ctx.flows.filter((flow) => asElement(flow.conditionExpression) !== undefined &&
    !conditionReadingKinds.has(ctx.nodes.get(String(endpoint(flow, "sourceRef")))?.kind ?? FlowElementKind.SequenceFlow));
  const facts: SourceFactNotCarried[] = conditional.map((flow) => ({ element: optionalId(flow), fact: "conditionExpression on a non-gateway source" }));
  for (const { element, kind } of ctx.nodes.values()) {
    const gateway = conditionReadingKinds.has(kind);
    if (!gateway && asElement(element.default) !== undefined) facts.push({ element: optionalId(element), fact: "default" });
    if (kind === FlowElementKind.Transaction && Object.hasOwn(element, "method")) facts.push({ element: optionalId(element), fact: "method" });
  }
  return facts;
}

function collectNotCarried(ctx: ReadContext & { consumedBy: (element: ElementRecord) => ReadonlySet<string> },
  processes: ReadonlyArray<ElementRecord>): SourceFactNotCarried[] {
  const owners: ElementRecord[] = [...processes, ...ctx.flows, ...[...ctx.nodes.values()].map((node) => node.element)];
  for (const node of ctx.nodes.values()) {
    owners.push(...list(node.element, "eventDefinitions"));
    const loop = asElement(node.element.loopCharacteristics);
    if (loop !== undefined) owners.push(loop);
  }
  return [...structuralFacts(ctx),
    ...owners.flatMap((element) => uncarriedFacts(element, ctx.definitions, ctx.consumedBy(element), ctx.inertAttributes))];
}

/** Reads one BPMN source to the kernel IL; `options` are copied into the Program and select nothing here. */
export async function readKernelProgram(source: KernelSource, options: KernelProfileOptions = defaultKernelProfileOptions): Promise<KernelRead> {
  try {
    const parsed = await parseKernelSource(source);
    const rootElements = asElementArray(parsed.definitions.rootElements) ?? [];
    const processes = rootElements.filter((element) => element.$type === "bpmn:Process");
    for (const element of rootElements) if (element.$type !== "bpmn:Process") requireInertRoot(element);
    const scan: Scan = { nodes: new Map(), flows: [], containers: [] };
    for (const process of processes) scanContainer(scan, process, null);
    const notCarried: SourceFactNotCarried[] = [];
    const ctx = createContext(parsed.definitions, parsed, scan, processes, notCarried);
    const elements = buildProgramElements(ctx);
    notCarried.push(...collectNotCarried(ctx, processes));
    const program: KernelJson = {
      identity: { processId: requireId(ctx.rootProcess), sourceSha256: parsed.sha256, profile: source.profile },
      options,
      elements,
      flows: ctx.flows.map((flow) => ({ id: requireId(flow), source: endpoint(flow, "sourceRef"), target: endpoint(flow, "targetRef") })),
      processes: processes.filter((process) => process !== ctx.rootProcess)
        .sort((left, right) => compareIds(requireId(left), requireId(right)))
        .map((process) => ({ id: requireId(process), children: childIds(ctx, process) })),
    };
    return { kind: "read", program, notCarried };
  } catch (error: unknown) {
    if (error instanceof ReadRefusal) return { kind: "refused", code: error.code, element: error.element, evidence: error.evidence };
    throw error;
  }
}
