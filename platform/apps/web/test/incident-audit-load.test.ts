import assert from "node:assert/strict";
import test from "node:test";

import { LatestRequest } from "../src/latest-request.ts";
import {
  beginIncidentAuditLoad,
  resolveIncidentAuditFailureFocus,
  resolveIncidentAuditFocus,
} from "../src/incident-audit-load.ts";

test("keeps overlapping audit focus intent bound to its own request generation", () => {
  const sequence = new LatestRequest();
  const olderFilter = beginIncidentAuditLoad(sequence, "heading");
  const newerPage = beginIncidentAuditLoad(sequence, "firstNew");

  assert.equal(resolveIncidentAuditFocus(sequence, olderFilter, 1), null);
  assert.equal(resolveIncidentAuditFocus(sequence, newerPage, 1), "firstNew");
});

test("focuses only the latest failed request's rendered error alert", () => {
  const sequence = new LatestRequest();
  const olderFilter = beginIncidentAuditLoad(sequence, "heading");
  const latestFilter = beginIncidentAuditLoad(sequence, "heading");

  assert.equal(resolveIncidentAuditFailureFocus(sequence, olderFilter), null);
  assert.equal(resolveIncidentAuditFailureFocus(sequence, latestFilter), "alert");
});

test("focuses status when a filter or next page returns no row", () => {
  const sequence = new LatestRequest();
  const filter = beginIncidentAuditLoad(sequence, "heading");
  assert.equal(resolveIncidentAuditFocus(sequence, filter, 0), "status");

  const nextPage = beginIncidentAuditLoad(sequence, "firstNew");
  assert.equal(resolveIncidentAuditFocus(sequence, nextPage, 0), "status");
});
