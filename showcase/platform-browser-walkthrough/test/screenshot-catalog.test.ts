import assert from "node:assert/strict";
import test from "node:test";

import {
  screenshotCatalog,
  screenshotTargetDirectory,
} from "../src/screenshot-catalog.ts";

const expectedNames = Object.freeze([
  "01-about-capability-boundary.png",
  "02-expense-definition-diagram.png",
  "03-expense-work-inbox.png",
  "04-expense-structured-form.png",
  "05-completed-process-history.png",
  "06-completed-process-diagram.png",
  "07-definition-flow-node-metrics.png",
  "08-current-incidents.png",
  "09-cancel-process-confirmation.png",
  "10-incident-action-audit.png",
]);

test("walkthrough screenshot catalog fixes the exact ordered PNG contract", () => {
  const names = screenshotCatalog.map(({ filename }) => filename);

  assert.deepEqual(names, expectedNames);
  assert.equal(new Set(names).size, names.length);
  assert.equal(screenshotTargetDirectory, "docs/assets/bpm-platform-browser-walkthrough");
  assert.ok(names.every((name) => name.endsWith(".png")));
  assert.ok(screenshotCatalog.every(({ alt }) => alt.trim().length > 0));
});
