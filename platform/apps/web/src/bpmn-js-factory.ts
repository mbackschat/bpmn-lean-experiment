import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

import type {
  BpmnCanvasPort,
  BpmnElementRegistryPort,
  BpmnOverlaysPort,
  BpmnViewerFactory,
  BpmnViewerPort,
} from "./bpmn-viewer-contract.ts";

/** Browser-only construction seam for the approved viewer bundle. */
export const createBpmnJsViewer: BpmnViewerFactory = (container): BpmnViewerPort =>
  new NavigatedViewer<{
    canvas: BpmnCanvasPort;
    elementRegistry: BpmnElementRegistryPort;
    overlays: BpmnOverlaysPort;
  }>({ container });
