import assert from "node:assert/strict";
import test from "node:test";

import { LatestRequest } from "../src/latest-request.ts";

test("invalidates stale responses after a newer tab or detail request starts", () => {
  const requests = new LatestRequest();
  const incidents = requests.begin();
  const detail = requests.begin();

  assert.equal(requests.isCurrent(incidents), false);
  assert.equal(requests.isCurrent(detail), true);
  requests.invalidate();
  assert.equal(requests.isCurrent(detail), false);
});
