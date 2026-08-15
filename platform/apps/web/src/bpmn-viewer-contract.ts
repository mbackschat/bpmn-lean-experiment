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

export type BpmnOverlayConfiguration = Readonly<{
  position: Readonly<{
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }>;
  show: Readonly<{ minZoom: number; maxZoom: number }>;
  html: HTMLElement;
}>;

export type BpmnOverlaysPort = Readonly<{
  add(elementId: string, configuration: BpmnOverlayConfiguration): string;
  remove(overlayId: string): void;
}>;

export type BpmnViewerPort = Readonly<{
  importXML(xml: string): Promise<Readonly<{ warnings: ReadonlyArray<unknown> }>>;
  get(name: "canvas"): BpmnCanvasPort;
  get(name: "elementRegistry"): BpmnElementRegistryPort;
  get(name: "overlays"): BpmnOverlaysPort;
  destroy(): void;
}>;

export type BpmnViewerFactory = (container: HTMLElement) => BpmnViewerPort;
