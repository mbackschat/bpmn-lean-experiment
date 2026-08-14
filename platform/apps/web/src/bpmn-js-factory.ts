import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import type {
  BpmnCanvasPort,
  BpmnElementRegistryPort,
  BpmnOverlaysPort,
  BpmnViewerFactory,
  BpmnViewerPort,
} from "./bpmn-viewer";

/** Browser-only construction seam for the approved viewer bundle. */
export const createBpmnJsViewer: BpmnViewerFactory = (container): BpmnViewerPort =>
  new NavigatedViewer<{
    canvas: BpmnCanvasPort;
    elementRegistry: BpmnElementRegistryPort;
    overlays: BpmnOverlaysPort;
  }>({ container });
