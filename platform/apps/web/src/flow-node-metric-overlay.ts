import type {
  BpmnElementRegistryPort,
  BpmnOverlaysPort,
} from "./bpmn-viewer.ts";

export type FlowNodeMetricBadge = Readonly<{
  elementId: string;
  text: string;
}>;

export type FlowNodeMetricBadgeElementFactory = (text: string) => HTMLElement;

/** Owns the complete standard bpmn-js overlay lifecycle for metric badges. */
export class FlowNodeMetricOverlay {
  readonly #overlays: BpmnOverlaysPort;
  readonly #elementRegistry: BpmnElementRegistryPort;
  readonly #createElement: FlowNodeMetricBadgeElementFactory;
  #overlayIds: string[] = [];

  constructor(
    overlays: BpmnOverlaysPort,
    elementRegistry: BpmnElementRegistryPort,
    createElement: FlowNodeMetricBadgeElementFactory = createMetricBadgeElement,
  ) {
    if (
      overlays === null || typeof overlays !== "object" ||
      typeof overlays.add !== "function" || typeof overlays.remove !== "function"
    ) {
      throw new TypeError("bpmn-js overlays service is unavailable");
    }
    this.#overlays = overlays;
    this.#elementRegistry = elementRegistry;
    this.#createElement = createElement;
  }

  /** Replaces the complete badge set and returns unique absent element IDs in input order. */
  replace(badges: readonly FlowNodeMetricBadge[]): readonly string[] {
    const unique = new Map<string, FlowNodeMetricBadge>();
    for (const badge of badges) {
      if (badge.elementId.length === 0 || badge.text.length === 0) {
        throw new TypeError("flow-node metric badge values must not be empty");
      }
      if (unique.has(badge.elementId)) {
        throw new TypeError(`flow-node metric badge ${badge.elementId} is duplicated`);
      }
      unique.set(badge.elementId, badge);
    }
    const present: FlowNodeMetricBadge[] = [];
    const missing: string[] = [];
    for (const badge of unique.values()) {
      if (this.#elementRegistry.get(badge.elementId) === undefined) missing.push(badge.elementId);
      else present.push(badge);
    }
    this.clear();
    const added: string[] = [];
    try {
      for (const badge of present) {
        added.push(this.#overlays.add(badge.elementId, {
          position: { top: -10, right: -10 },
          show: { minZoom: -Infinity, maxZoom: Infinity },
          html: this.#createElement(badge.text),
        }));
      }
    } catch (error: unknown) {
      for (const overlayId of added) this.#overlays.remove(overlayId);
      throw error;
    }
    this.#overlayIds = added;
    return missing;
  }

  clear(): void {
    for (const overlayId of this.#overlayIds) this.#overlays.remove(overlayId);
    this.#overlayIds = [];
  }
}

function createMetricBadgeElement(text: string): HTMLElement {
  const element = document.createElement("span");
  element.className = "bpmn-platform-metric-badge";
  element.textContent = text;
  element.setAttribute("aria-hidden", "true");
  return element;
}
