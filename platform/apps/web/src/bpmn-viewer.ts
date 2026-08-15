import {
  FlowNodeMetricOverlay,
} from "./flow-node-metric-overlay.ts";
import type { FlowNodeMetricBadge } from "./flow-node-metric-overlay.ts";
import { BpmnDiagramMarkerKind } from "./bpmn-viewer-contract.ts";
import type {
  BpmnCanvasPort,
  BpmnDiagramMarkerKind as BpmnDiagramMarker,
  BpmnElementRegistryPort,
  BpmnViewerFactory,
  BpmnViewerPort,
} from "./bpmn-viewer-contract.ts";

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
  readonly #metricOverlay: FlowNodeMetricOverlay;
  #highlightedElements: string[] = [];
  #highlightedMarker: string | null = null;
  #renderQueue: Promise<void> = Promise.resolve();
  #destroyed = false;

  constructor(container: HTMLElement, factory: BpmnViewerFactory) {
    this.#viewer = factory(container);
    try {
      requirePoweredByWatermark(container);
      this.#canvas = this.#viewer.get("canvas");
      this.#elementRegistry = this.#viewer.get("elementRegistry");
      this.#metricOverlay = new FlowNodeMetricOverlay(
        this.#viewer.get("overlays"),
        this.#elementRegistry,
      );
    } catch (error: unknown) {
      this.#viewer.destroy();
      throw error;
    }
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
      this.#metricOverlay.clear();
      await this.#viewer.importXML(xml);
      this.#canvas.zoom("fit-viewport", true);
    });
    this.#renderQueue = operation.catch(() => undefined);
    await operation;
  }

  highlight(elementId: string, markerKind: BpmnDiagramMarker): void {
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
    markerKind: BpmnDiagramMarker,
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

  replaceMetricBadges(badges: readonly FlowNodeMetricBadge[]): readonly string[] {
    this.#requireLive();
    return this.#metricOverlay.replace(badges);
  }

  clearMetricBadges(): void {
    this.#requireLive();
    this.#metricOverlay.clear();
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
    this.#metricOverlay.clear();
    this.#destroyed = true;
    this.#viewer.destroy();
  }

  #requireLive(): void {
    if (this.#destroyed) {
      throw new BpmnViewerProtocolError("diagram viewer is destroyed");
    }
  }
}

function markerClass(markerKind: BpmnDiagramMarker): string {
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
