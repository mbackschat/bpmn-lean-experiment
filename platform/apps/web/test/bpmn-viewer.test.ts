import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnDiagramMarkerKind,
  BpmnDiagramViewer,
  BpmnViewerProtocolError,
} from "../src/bpmn-viewer.ts";
import type {
  BpmnCanvasPort,
  BpmnElementRegistryPort,
  BpmnViewerFactory,
  BpmnViewerPort,
} from "../src/bpmn-viewer.ts";

const encoder = new TextEncoder();

function poweredContainer(href: string | null = "http://bpmn.io"): HTMLElement {
  return {
    querySelector(selector: string) {
      if (selector !== "a.bjs-powered-by" || href === null) {
        return null;
      }
      return {
        getAttribute(name: string) {
          return name === "href" ? href : null;
        },
      };
    },
  } as unknown as HTMLElement;
}

function viewerFixture(elementIds: readonly string[] = ["Task_A", "Task_B"]) {
  const imported: string[] = [];
  const canvasCalls: string[] = [];
  const registryCalls: string[] = [];
  let destroyed = false;
  const registry: BpmnElementRegistryPort = {
    get(elementId) {
      registryCalls.push(elementId);
      return elementIds.includes(elementId) ? { id: elementId } : undefined;
    },
  };
  const canvas: BpmnCanvasPort = {
    addMarker(elementId, marker) {
      canvasCalls.push(`add:${elementId}:${marker}`);
    },
    removeMarker(elementId, marker) {
      canvasCalls.push(`remove:${elementId}:${marker}`);
    },
    zoom(scale, center) {
      canvasCalls.push(`zoom:${scale}:${String(center)}`);
      return 1;
    },
  };
  function getViewerService(name: "canvas"): BpmnCanvasPort;
  function getViewerService(name: "elementRegistry"): BpmnElementRegistryPort;
  function getViewerService(
    name: "canvas" | "elementRegistry",
  ): BpmnCanvasPort | BpmnElementRegistryPort {
    switch (name) {
      case "canvas":
        return canvas;
      case "elementRegistry":
        return registry;
    }
  }
  const port: BpmnViewerPort = {
    async importXML(xml) {
      imported.push(xml);
      return { warnings: [] };
    },
    get: getViewerService,
    destroy() {
      destroyed = true;
    },
  };
  const factory: BpmnViewerFactory = () => port;
  return {
    canvasCalls,
    factory,
    imported,
    isDestroyed: () => destroyed,
    registryCalls,
  };
}

test("renders a synchronous byte snapshot as strict UTF-8 and fits the viewport", async () => {
  const fixture = viewerFixture();
  const viewer = new BpmnDiagramViewer(poweredContainer(), fixture.factory);
  const source = encoder.encode("<definitions id=\"original\"/>");
  const pending = viewer.render(source);
  source.fill(120);

  await pending;

  assert.deepEqual(fixture.imported, ["<definitions id=\"original\"/>"]);
  assert.deepEqual(fixture.canvasCalls, ["zoom:fit-viewport:true"]);
  await assert.rejects(
    viewer.render(Uint8Array.from([0xff])),
    (error: unknown) => error instanceof BpmnViewerProtocolError && /UTF-8/u.test(error.message),
  );
});

test("keeps selected work, incident failure, and current execution on distinct markers", () => {
  const fixture = viewerFixture();
  const viewer = new BpmnDiagramViewer(poweredContainer(), fixture.factory);

  viewer.highlight("Task_A", BpmnDiagramMarkerKind.Selected);
  viewer.highlight("Task_B", BpmnDiagramMarkerKind.Incident);
  viewer.highlightMany(["Task_A"], BpmnDiagramMarkerKind.Current);
  viewer.clearHighlight();
  viewer.destroy();

  assert.deepEqual(fixture.canvasCalls, [
    "add:Task_A:bpmn-platform-selected",
    "remove:Task_A:bpmn-platform-selected",
    "add:Task_B:bpmn-platform-incident",
    "remove:Task_B:bpmn-platform-incident",
    "add:Task_A:bpmn-platform-current",
    "remove:Task_A:bpmn-platform-current",
  ]);
  assert.equal(fixture.isDestroyed(), true);
});

test("refuses a missing rendered element before mutating the active marker", () => {
  const fixture = viewerFixture(["Task_A"]);
  const viewer = new BpmnDiagramViewer(poweredContainer(), fixture.factory);
  viewer.highlight("Task_A", BpmnDiagramMarkerKind.Selected);

  assert.throws(
    () => { viewer.highlight("Task_Missing", BpmnDiagramMarkerKind.Selected); },
    (error: unknown) => error instanceof BpmnViewerProtocolError &&
      /Task_Missing.*not present in the rendered diagram/u.test(error.message),
  );
  assert.deepEqual(fixture.registryCalls, ["Task_A", "Task_Missing"]);
  assert.deepEqual(fixture.canvasCalls, ["add:Task_A:bpmn-platform-selected"]);
});

test("atomically highlights every present unique position and reports missing IDs in input order", () => {
  const fixture = viewerFixture(["Flow_Left", "Flow_Right"]);
  const viewer = new BpmnDiagramViewer(poweredContainer(), fixture.factory);
  viewer.highlight("Flow_Left", BpmnDiagramMarkerKind.Current);

  const missing = viewer.highlightMany([
    "Flow_Right",
    "Called_Process_Missing",
    "Flow_Left",
    "Called_Process_Missing",
    "Flow_Right",
  ], BpmnDiagramMarkerKind.Current);

  assert.deepEqual(missing, ["Called_Process_Missing"]);
  assert.deepEqual(fixture.canvasCalls, [
    "add:Flow_Left:bpmn-platform-current",
    "remove:Flow_Left:bpmn-platform-current",
    "add:Flow_Right:bpmn-platform-current",
    "add:Flow_Left:bpmn-platform-current",
  ]);
  viewer.clearHighlight();
  assert.deepEqual(fixture.canvasCalls.slice(-2), [
    "remove:Flow_Right:bpmn-platform-current",
    "remove:Flow_Left:bpmn-platform-current",
  ]);
});

test("fails closed if the supplied bpmn.io watermark is absent or retargeted", () => {
  const fixture = viewerFixture();
  assert.throws(
    () => new BpmnDiagramViewer(poweredContainer(null), fixture.factory),
    /watermark is missing/u,
  );
  assert.throws(
    () => new BpmnDiagramViewer(poweredContainer("https://attacker.invalid"), fixture.factory),
    /must link to bpmn.io/u,
  );
});
