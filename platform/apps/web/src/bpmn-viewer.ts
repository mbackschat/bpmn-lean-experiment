export const BpmnDiagramMarkerKind = {
  Current: "current",
  Incident: "incident",
  Selected: "selected",
} as const;

export type BpmnDiagramMarkerKind =
  (typeof BpmnDiagramMarkerKind)[keyof typeof BpmnDiagramMarkerKind];

export type BpmnCanvasPort = Readonly<{
  addMarker(elementId: string, marker: string): void;
  removeMarker(elementId: string, marker: string): void;
  zoom(scale: "fit-viewport", center?: boolean): number;
}>;

export type BpmnElementRegistryPort = Readonly<{
  get(elementId: string): unknown | undefined;
}>;

export type BpmnViewerPort = Readonly<{
  importXML(xml: string): Promise<Readonly<{ warnings: ReadonlyArray<unknown> }>>;
  get(name: "canvas"): BpmnCanvasPort;
  get(name: "elementRegistry"): BpmnElementRegistryPort;
  destroy(): void;
}>;

export type BpmnViewerFactory = (container: HTMLElement) => BpmnViewerPort;

export class BpmnViewerProtocolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BpmnViewerProtocolError";
  }
}

/** Presentation-only adapter around bpmn-js. Rendering never contributes admission or BPMN meaning. */
export class BpmnDiagramViewer {
  readonly #viewer: BpmnViewerPort;
  readonly #canvas: BpmnCanvasPort;
  readonly #elementRegistry: BpmnElementRegistryPort;
  #highlightedElements: string[] = [];
  #highlightedMarker: string | null = null;
  #renderQueue: Promise<void> = Promise.resolve();
  #destroyed = false;

  constructor(container: HTMLElement, factory: BpmnViewerFactory) {
    this.#viewer = factory(container);
    try {
      requirePoweredByWatermark(container);
    } catch (error: unknown) {
      this.#viewer.destroy();
      throw error;
    }
    this.#canvas = this.#viewer.get("canvas");
    this.#elementRegistry = this.#viewer.get("elementRegistry");
  }

  async render(sourceBytes: Uint8Array): Promise<void> {
    this.#requireLive();
    const bytes = sourceBytes.slice();
    let xml: string;
    try {
      xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause: unknown) {
      throw new BpmnViewerProtocolError("diagram source must be valid UTF-8", { cause });
    }
    const operation = this.#renderQueue.then(async () => {
      this.#requireLive();
      await this.#viewer.importXML(xml);
      this.#canvas.zoom("fit-viewport", true);
    });
    this.#renderQueue = operation.catch(() => undefined);
    await operation;
  }

  highlight(elementId: string, markerKind: BpmnDiagramMarkerKind): void {
    this.#requireLive();
    if (elementId.length === 0) {
      throw new TypeError("highlighted BPMN element ID must not be empty");
    }
    if (this.#elementRegistry.get(elementId) === undefined) {
      throw new BpmnViewerProtocolError(
        `BPMN element ${elementId} is not present in the rendered diagram`,
      );
    }
    this.clearHighlight();
    const marker = markerClass(markerKind);
    this.#canvas.addMarker(elementId, marker);
    this.#highlightedElements = [elementId];
    this.#highlightedMarker = marker;
  }

  /** Replaces every marker as one validated set and reports absent unique IDs in input order. */
  highlightMany(
    elementIds: readonly string[],
    markerKind: BpmnDiagramMarkerKind,
  ): readonly string[] {
    this.#requireLive();
    const unique = [...new Set(elementIds)];
    for (const elementId of unique) {
      if (elementId.length === 0) {
        throw new TypeError("highlighted BPMN element ID must not be empty");
      }
    }
    const present: string[] = [];
    const missing: string[] = [];
    for (const elementId of unique) {
      if (this.#elementRegistry.get(elementId) === undefined) missing.push(elementId);
      else present.push(elementId);
    }
    this.clearHighlight();
    const marker = markerClass(markerKind);
    for (const elementId of present) this.#canvas.addMarker(elementId, marker);
    this.#highlightedElements = present;
    this.#highlightedMarker = present.length === 0 ? null : marker;
    return missing;
  }

  clearHighlight(): void {
    this.#requireLive();
    if (this.#highlightedMarker !== null) {
      for (const elementId of this.#highlightedElements) {
        this.#canvas.removeMarker(elementId, this.#highlightedMarker);
      }
    }
    this.#highlightedElements = [];
    this.#highlightedMarker = null;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    if (this.#highlightedMarker !== null) {
      for (const elementId of this.#highlightedElements) {
        this.#canvas.removeMarker(elementId, this.#highlightedMarker);
      }
    }
    this.#highlightedElements = [];
    this.#highlightedMarker = null;
    this.#destroyed = true;
    this.#viewer.destroy();
  }

  #requireLive(): void {
    if (this.#destroyed) {
      throw new BpmnViewerProtocolError("diagram viewer is destroyed");
    }
  }
}

function markerClass(markerKind: BpmnDiagramMarkerKind): string {
  switch (markerKind) {
    case BpmnDiagramMarkerKind.Current:
      return "bpmn-platform-current";
    case BpmnDiagramMarkerKind.Incident:
      return "bpmn-platform-incident";
    case BpmnDiagramMarkerKind.Selected:
      return "bpmn-platform-selected";
  }
}

function requirePoweredByWatermark(container: HTMLElement): void {
  const link = container.querySelector("a.bjs-powered-by");
  if (link === null) {
    throw new BpmnViewerProtocolError("the supplied bpmn.io watermark is missing");
  }
  const href = link.getAttribute("href");
  if (href === null) {
    throw new BpmnViewerProtocolError("the supplied bpmn.io watermark must link to bpmn.io");
  }
  let target: URL;
  try {
    target = new URL(href, "https://platform.invalid/");
  } catch (cause: unknown) {
    throw new BpmnViewerProtocolError("the supplied bpmn.io watermark link is malformed", { cause });
  }
  if (
    target.hostname !== "bpmn.io" ||
    (target.protocol !== "http:" && target.protocol !== "https:")
  ) {
    throw new BpmnViewerProtocolError("the supplied bpmn.io watermark must link to bpmn.io");
  }
}
