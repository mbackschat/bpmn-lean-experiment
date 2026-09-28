import assert from "node:assert/strict";
import test from "node:test";

import {
  screenshotCatalog,
  screenshotTargetDirectory,
} from "../src/screenshot-catalog.ts";

const expectedNames = Object.freeze([
  "01-about-capability-boundary.png",
  "02-about-capability-families.png",
  "03-process-showcases.png",
  "04-showcase-description.png",
  "05-deploy-definition-dialog.png",
  "06-definition-start-and-diagram.png",
  "07-definition-triggers.png",
  "08-expense-work-inbox.png",
  "09-expense-structured-form.png",
  "09b-expense-approval-action.png",
  "10-task-action-history.png",
  "11-process-instances.png",
  "12-completed-process-history.png",
  "13-completed-process-diagram.png",
  "14-operations-process-metrics.png",
  "15-current-incidents.png",
  "16-cancel-process-confirmation.png",
  "17-incident-action-history.png"
]);

test("walkthrough screenshot catalog fixes the exact ordered PNG contract", () => {
  const names = screenshotCatalog.map(({ filename }) => filename);

  assert.deepEqual(names, expectedNames);
  assert.equal(new Set(names).size, names.length);
  assert.equal(screenshotTargetDirectory, "docs/assets/bpm-platform-browser-walkthrough");
  assert.ok(names.every((name) => name.endsWith(".png")));
  assert.ok(screenshotCatalog.every(({ alt }) => alt.trim().length > 0));
});
