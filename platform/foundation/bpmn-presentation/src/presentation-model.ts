import { BpmnModdle } from "bpmn-moddle";

interface ModdleElement {
  readonly $type: string;
  readonly id?: string;
  readonly rootElements?: readonly ModdleElement[];
  readonly diagrams?: readonly ModdleElement[];
  readonly flowElements?: readonly ModdleElement[];
  readonly artifacts?: readonly ModdleElement[];
  readonly dataInputAssociations?: readonly ModdleElement[];
  readonly dataOutputAssociations?: readonly ModdleElement[];
  readonly ioSpecification?: ModdleElement;
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

type PresentationModdleParser = Readonly<{
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

export async function parsePresentationModel(
  xml: string,
  boundary: string,
): Promise<ParsedPresentationModel> {
  let parsed: Awaited<ReturnType<PresentationModdleParser["fromXML"]>>;
  try {
    // Upstream publishes no declarations. This private cast is the parser trust boundary.
    const parser = new BpmnModdle() as unknown as PresentationModdleParser;
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

  const excludedFlowTypes = new Set([
    "bpmn:CallActivity",
    "bpmn:SubProcess",
    "bpmn:DataObject",
    "bpmn:DataObjectReference",
    "bpmn:DataStoreReference",
  ]);
  const excludedArtifactTypes = new Set([
    "bpmn:Association",
    "bpmn:Group",
    "bpmn:TextAnnotation",
  ]);
  const excluded = [
    ...(inventory.process.flowElements ?? []).filter((element) =>
      excludedFlowTypes.has(element.$type),
    ),
    ...(inventory.process.artifacts ?? []).filter((element) =>
      excludedArtifactTypes.has(element.$type),
    ),
    ...inventory.flowNodes.filter(
      (element) =>
        (element.dataInputAssociations?.length ?? 0) > 0 ||
        (element.dataOutputAssociations?.length ?? 0) > 0 ||
        element.ioSpecification !== undefined,
    ),
  ];
  if (excluded.length > 0) {
    throw new Error(`generated layout does not support ${excluded[0]?.$type ?? "source"}`);
  }
}

export function validateDiagramCoverage(
  model: ParsedPresentationModel,
  inventory: ProcessInventory,
  exactSourceModel: ParsedPresentationModel = model,
  requireExactlyOneDiagram = false,
): string | null {
  const diagrams = model.definitions.diagrams ?? [];
  if (requireExactlyOneDiagram && diagrams.length !== 1) {
    return "expected exactly one BPMNDiagram";
  }
  const diagramsForProcess = diagrams.filter(
    (diagram) => diagram.plane?.bpmnElement?.id === inventory.process.id,
  );
  if (diagramsForProcess.length !== 1) {
    return `expected exactly one BPMNPlane for Process ${inventory.process.id ?? "<missing>"}`;
  }

  const diagramIds = new Set<string>();
  const selectedDiagram = diagramsForProcess[0];
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
    }
  }
  const planeElements = selectedDiagram?.plane?.planeElement ?? [];
  for (const element of planeElements) {
    if (element.id === undefined) {
      return "diagram element IDs must be present and unique";
    }
    const targetId = element.bpmnElement?.id;
    if (targetId === undefined) {
      return "every DI reference must resolve to an exact source ID";
    }
    const existing = coverage.get(targetId) ?? [];
    existing.push(element);
    coverage.set(targetId, existing);
  }

  for (const node of inventory.flowNodes) {
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
  for (const flow of inventory.sequenceFlows) {
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
