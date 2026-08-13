const activeMarker = "bpmn-platform-active";

export type BpmnCanvasPort = Readonly<{
  addMarker(elementId: string, marker: string): void;
  removeMarker(elementId: string, marker: string): void;
  zoom(scale: "fit-viewport", center?: boolean): number;
}>;

export type BpmnViewerPort = Readonly<{
  importXML(xml: string): Promise<Readonly<{ warnings: ReadonlyArray<unknown> }>>;
  get(name: "canvas"): BpmnCanvasPort;
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
  #highlightedElement: string | null = null;
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

  highlight(elementId: string): void {
    this.#requireLive();
    if (elementId.length === 0) {
      throw new TypeError("highlighted BPMN element ID must not be empty");
    }
    this.clearHighlight();
    this.#canvas.addMarker(elementId, activeMarker);
    this.#highlightedElement = elementId;
  }

  clearHighlight(): void {
    this.#requireLive();
    if (this.#highlightedElement !== null) {
      this.#canvas.removeMarker(this.#highlightedElement, activeMarker);
      this.#highlightedElement = null;
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    if (this.#highlightedElement !== null) {
      this.#canvas.removeMarker(this.#highlightedElement, activeMarker);
      this.#highlightedElement = null;
    }
    this.#destroyed = true;
    this.#viewer.destroy();
  }

  #requireLive(): void {
    if (this.#destroyed) {
      throw new BpmnViewerProtocolError("diagram viewer is destroyed");
    }
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
