import assert from "node:assert/strict";
import test from "node:test";

import {
  incidentDetailPresentation,
  incidentSelectionAfterTabChange,
} from "../src/incident-workspace-presentation.ts";

test("drops an incident selection when its top-level tab deactivates", () => {
  const selected = {} as never;
  assert.equal(incidentSelectionAfterTabChange(true, selected), selected);
  assert.equal(incidentSelectionAfterTabChange(false, selected), null);
});

test("presents retained processClosed status without any current-state label", () => {
  assert.deepEqual(incidentDetailPresentation(true), {
    backLabel: "Return to Incidents",
    eyebrow: "Retained action status, no longer current",
    overviewLabel: "Incident action status, no longer current",
  });
  assert.deepEqual(incidentDetailPresentation(false), {
    backLabel: "Back to incidents",
    eyebrow: "Exact current incident",
    overviewLabel: "Incident overview",
  });
});
