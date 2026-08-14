import assert from "node:assert/strict";
import test from "node:test";

import {
  FlowNodeMetricOverlay,
} from "../src/flow-node-metric-overlay.ts";
import type {
  BpmnElementRegistryPort,
  BpmnOverlaysPort,
} from "../src/bpmn-viewer.ts";

test("replaces one badge per present metric and reports missing IDs without parent fallback", () => {
  const calls: string[] = [];
  let ordinal = 0;
  const overlays: BpmnOverlaysPort = {
    add(elementId, config) {
      calls.push(`add:${elementId}:${config.html.textContent}`);
      ordinal += 1;
      return `overlay-${ordinal}`;
    },
    remove(overlayId) {
      calls.push(`remove:${overlayId}`);
    },
  };
  const registry: BpmnElementRegistryPort = {
    get(elementId) {
      return ["Task_A", "Task_B", "Process_Root"].includes(elementId)
        ? { id: elementId }
        : undefined;
    },
  };
  const owner = new FlowNodeMetricOverlay(
    overlays,
    registry,
    (text) => ({ textContent: text } as HTMLElement),
  );

  assert.deepEqual(owner.replace([
    { elementId: "Task_A", text: "3" },
    { elementId: "Called_Task_Missing", text: "1" },
    { elementId: "Task_B", text: "0ms" },
  ]), ["Called_Task_Missing"]);
  assert.deepEqual(calls, ["add:Task_A:3", "add:Task_B:0ms"]);
  assert.doesNotMatch(calls.join("\n"), /Process_Root/u);

  assert.deepEqual(owner.replace([{ elementId: "Task_A", text: "15ms" }]), []);
  assert.deepEqual(calls, [
    "add:Task_A:3",
    "add:Task_B:0ms",
    "remove:overlay-1",
    "remove:overlay-2",
    "add:Task_A:15ms",
  ]);
  owner.clear();
  assert.equal(calls.at(-1), "remove:overlay-3");
});
