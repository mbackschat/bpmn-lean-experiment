import { BpmnModdle } from "bpmn-moddle";

import { layoutInventory } from "./layout-inventory.js";

import structuredFormModdle from "./bpmn-lean-structured-form-moddle.json" with {
  type: "json",
};

export interface ModdleElement {
  readonly $type: string;
  readonly $attrs?: Readonly<Record<string, string>>;
  readonly $parent?: ModdleElement;
  readonly body?: string;
  readonly id?: string;
  readonly documentation?: readonly ModdleElement[];
  readonly text?: string;
  readonly textFormat?: string;
  readonly extensionElements?: ModdleElement;
  readonly values?: readonly ModdleElement[];
  readonly renderings?: readonly ModdleElement[];
  readonly rootElements?: readonly ModdleElement[];
  readonly participants?: readonly ModdleElement[];
  readonly processRef?: ModdleElement;
  readonly diagrams?: readonly ModdleElement[];
  readonly flowElements?: readonly ModdleElement[];
  readonly artifacts?: readonly ModdleElement[];
  readonly dataInputAssociations?: readonly ModdleElement[];
  readonly dataOutputAssociations?: readonly ModdleElement[];
  readonly ioSpecification?: ModdleElement;
  readonly sourceRef?: ModdleElement | readonly ModdleElement[];
  readonly targetRef?: ModdleElement;
  readonly dataObjectRef?: ModdleElement;
  readonly isExpanded?: boolean;
  set(name: string, value: unknown): void;
  readonly plane?: ModdleElement;
  readonly planeElement?: readonly ModdleElement[];
  readonly bpmnElement?: ModdleElement;
  readonly bounds?: Readonly<{
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
  }>;
  readonly waypoint?: readonly Readonly<{
    readonly x?: number;
    readonly y?: number;
  }>[];
  $instanceOf(typeName: string): boolean;
}

export type PresentationModdleParser = Readonly<{
  create(type: string, attributes?: Record<string, unknown>): ModdleElement;
  toXML(element: ModdleElement, options: { format: boolean }): Promise<{ xml: string }>;
  fromXML(
    xml: string,
    options: Readonly<{ lax: false }>,
  ): Promise<Readonly<{
    rootElement: ModdleElement;
    warnings: readonly Error[];
    elementsById: Readonly<Record<string, ModdleElement>>;
  }>>;
}>;

export const BPMN_MODEL_NAMESPACE = "http://www.omg.org/spec/BPMN/20100524/MODEL";
export const BPMN_DI_NAMESPACE = "http://www.omg.org/spec/BPMN/20100524/DI";
export const DC_NAMESPACE = "http://www.omg.org/spec/DD/20100524/DC";
export const DI_NAMESPACE = "http://www.omg.org/spec/DD/20100524/DI";

export type ParsedPresentationModel = Readonly<{
  definitions: ModdleElement;
  elementsById: Readonly<Record<string, ModdleElement>>;
}>;

export type ProcessInventory = Readonly<{
  process: ModdleElement;
  flowNodes: readonly ModdleElement[];
  sequenceFlows: readonly ModdleElement[];
}>;

type ProcessDiagramSelection = Readonly<{
  diagram: ModdleElement;
  participant: ModdleElement | null;
}>;

export function createPresentationModdle(): PresentationModdleParser {
  // Upstream publishes no declarations; this private cast is the parser trust boundary.
  return new BpmnModdle({ bpmnLean: structuredFormModdle }) as unknown as PresentationModdleParser;
}

export async function parsePresentationModel(
  xml: string,
  boundary: string,
): Promise<ParsedPresentationModel> {
  let parsed: Awaited<ReturnType<PresentationModdleParser["fromXML"]>>;
  try {
    const parser = createPresentationModdle();
    parsed = await parser.fromXML(xml, { lax: false });
  } catch (cause: unknown) {
    throw presentationError(`${boundary} is not well-formed BPMN XML`, cause);
  }
  if (parsed.warnings.length > 0) {
    throw new Error(
      `${boundary} produced a parser warning: ${parsed.warnings[0]?.message ?? "unknown warning"}`,
    );
  }
  return {
    definitions: parsed.rootElement,
    elementsById: parsed.elementsById,
  };
}

export function findProcess(
  definitions: ModdleElement,
  processId: string,
): ModdleElement {
  const matches = (definitions.rootElements ?? []).filter(
    (element) => element.$type === "bpmn:Process" && element.id === processId,
  );
  if (matches.length !== 1) {
    throw new Error(`source must contain exactly one Process with ID ${processId}`);
  }
  return matches[0] as ModdleElement;
}

export function inventoryProcess(process: ModdleElement): ProcessInventory {
  const flowElements = process.flowElements ?? [];
  return {
    process,
    flowNodes: flowElements.filter((element) => element.$instanceOf("bpmn:FlowNode")),
    sequenceFlows: flowElements.filter((element) =>
      element.$instanceOf("bpmn:SequenceFlow"),
    ),
  };
}

export function validateGenerationScope(
  definitions: ModdleElement,
  inventory: ProcessInventory,
): void {
  const roots = definitions.rootElements ?? [];
  const rootProcesses = roots.filter((element) => element.$type === "bpmn:Process");
  if (rootProcesses.length !== 1) {
    throw new Error("generated layout supports exactly one root Process");
  }
  if (roots.some((element) => element.$type === "bpmn:Collaboration")) {
    throw new Error("generated layout does not support Collaborations");
  }

  const selected = layoutInventory(inventory.process);
  const excluded = selected.scopes.flatMap((scope) => [...(scope.flowElements ?? []), ...(scope.artifacts ?? [])])
    .find((element) => ["bpmn:CallActivity", "bpmn:DataStoreReference", "bpmn:Group", "bpmn:TextAnnotation"].includes(element.$type));
  if (excluded !== undefined) throw new Error(`generated layout does not support ${excluded.$type}`);
}

export function validateDiagramCoverage(
  model: ParsedPresentationModel,
  inventory: ProcessInventory,
  exactSourceModel: ParsedPresentationModel = model,
  generatedPresentation = false,
): string | null {
  const diagrams = model.definitions.diagrams ?? [];
  if (generatedPresentation) {
    try {
      validateGenerationScope(model.definitions, inventory);
    } catch (error: unknown) {
      return error instanceof Error ? error.message : "generated layout is outside its supported scope";
    }
    if (diagrams.length !== 1) {
      return "expected exactly one BPMNDiagram";
    }
  }
  const selection = selectProcessDiagram(diagrams, inventory.process);
  if (typeof selection === "string") return selection;

  const diagramIds = new Set<string>();
  const coverage = new Map<string, ModdleElement[]>();
  for (const diagram of diagrams) {
    const plane = diagram.plane;
    for (const diagramElement of [diagram, plane, ...(plane?.planeElement ?? [])]) {
      if (
        diagramElement?.id === undefined ||
        diagramIds.has(diagramElement.id)
      ) {
        return "diagram element IDs must be present and unique";
      }
      diagramIds.add(diagramElement.id);
    }
    if (
      plane?.bpmnElement?.id === undefined ||
      exactSourceModel.elementsById[plane.bpmnElement.id] === undefined
    ) {
      return "every DI reference must resolve to an exact source ID";
    }
    for (const element of plane.planeElement ?? []) {
      const targetId = element.bpmnElement?.id;
      if (targetId === undefined) {
        return "every DI reference must resolve to an exact source ID";
      }
      const target = exactSourceModel.elementsById[targetId];
      if (target === undefined || /^(?:bpmndi|dc|di):/u.test(target.$type)) {
        return "every DI reference must resolve to an exact source ID";
      }
      const existing = coverage.get(targetId) ?? [];
      existing.push(element);
      coverage.set(targetId, existing);
    }
  }

  if (selection.participant !== null) {
    const participantId = requiredId(selection.participant);
    const covered = coverage.get(participantId) ?? [];
    const shapes = covered.filter(
      (element) => element.$type === "bpmndi:BPMNShape",
    );
    if (
      covered.length !== 1 ||
      shapes.length !== 1 ||
      !hasPositiveFiniteBounds(shapes[0])
    ) {
      return `Participant ${participantId} needs exactly one finite positive-bounds BPMNShape`;
    }
  }

  const generatedInventory = generatedPresentation ? layoutInventory(inventory.process) : null;
  for (const node of generatedInventory?.shapes ?? inventory.flowNodes) {
    const covered = coverage.get(requiredId(node)) ?? [];
    const shapes = covered.filter(
      (element) => element.$type === "bpmndi:BPMNShape",
    );
    if (
      covered.length !== 1 ||
      shapes.length !== 1 ||
      !hasPositiveFiniteBounds(shapes[0])
    ) {
      return `flow node ${requiredId(node)} needs exactly one finite positive-bounds BPMNShape`;
    }
  }
  if (generatedInventory !== null) {
    for (const scope of generatedInventory.scopes.slice(1)) {
      if (coverage.get(requiredId(scope))?.[0]?.isExpanded !== true) return `Sub-Process ${requiredId(scope)} must be expanded`;
    }
  }
  for (const flow of generatedInventory?.edges ?? inventory.sequenceFlows) {
    const covered = coverage.get(requiredId(flow)) ?? [];
    const edges = covered.filter(
      (element) => element.$type === "bpmndi:BPMNEdge",
    );
    if (
      covered.length !== 1 ||
      edges.length !== 1 ||
      !hasFiniteWaypoints(edges[0])
    ) {
      return `Sequence Flow ${requiredId(flow)} needs exactly one BPMNEdge with two finite waypoints`;
    }
  }
  return null;
}

function selectProcessDiagram(
  diagrams: readonly ModdleElement[],
  process: ModdleElement,
): ProcessDiagramSelection | string {
  const processId = process.id ?? "<missing>";
  const candidates: ProcessDiagramSelection[] = [];
  for (const diagram of diagrams) {
    const planeTarget = diagram.plane?.bpmnElement;
    if (planeTarget?.$type === "bpmn:Process" && planeTarget.id === process.id) {
      candidates.push({ diagram, participant: null });
      continue;
    }
    if (planeTarget?.$type !== "bpmn:Collaboration") continue;
    const participants = (planeTarget.participants ?? []).filter(
      (participant) =>
        participant.$type === "bpmn:Participant" &&
        participant.processRef?.id === process.id,
    );
    if (participants.length > 1) {
      return `Collaboration ${planeTarget.id ?? "<missing>"} must contain exactly one Participant for Process ${processId}`;
    }
    if (participants.length === 1) {
      const participant = participants[0];
      if (participant === undefined) continue;
      candidates.push({
        diagram,
        participant,
      });
    }
  }
  const selected = candidates[0];
  if (candidates.length !== 1 || selected === undefined) {
    return `expected exactly one BPMNPlane for Process ${processId} or a Collaboration containing exactly one Participant for that Process`;
  }
  return selected;
}

function requiredId(element: ModdleElement): string {
  if (element.id === undefined) {
    throw new Error(`source ${element.$type} is missing an ID`);
  }
  return element.id;
}

function hasPositiveFiniteBounds(element: ModdleElement | undefined): boolean {
  const bounds = element?.bounds;
  return (
    bounds !== undefined &&
    finite(bounds.x) &&
    finite(bounds.y) &&
    finite(bounds.width) &&
    finite(bounds.height) &&
    (bounds.width as number) > 0 &&
    (bounds.height as number) > 0
  );
}

function hasFiniteWaypoints(element: ModdleElement | undefined): boolean {
  const waypoints = element?.waypoint;
  return (
    waypoints !== undefined &&
    waypoints.length >= 2 &&
    waypoints.every((point) => finite(point.x) && finite(point.y))
  );
}

function finite(value: number | undefined): boolean {
  return value !== undefined && Number.isFinite(value);
}

function presentationError(message: string, cause: unknown): Error {
  return cause instanceof Error
    ? new Error(`${message}: ${cause.message}`, { cause })
    : new Error(message);
}
