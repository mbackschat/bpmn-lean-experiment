import assert from "node:assert/strict";
import test from "node:test";

import { replayCommitCost, replayStatistics } from "./lean-fanout-replay.ts";

test("a commit costs the built modules its edited modules and their body-edit importers reach, each once", () => {
  const fanouts = new Map([["A", ["B", "C"]], ["B", ["C"]], ["Fixture", []]]);
  const built = new Set(["A", "B", "C"]);
  assert.equal(replayCommitCost(["A", "B"], fanouts, built), 3);
  // An edited module outside the built roots counts nothing, and one absent from the graph is skipped.
  assert.equal(replayCommitCost(["Fixture", "Removed"], fanouts, built), 0);
});

test("the statistics report the nearest-rank percentiles and the commits above 500", () => {
  assert.deepEqual(replayStatistics([10, 600, 20, 30, 40, 50, 60, 70, 80, 90]), { commits: 10, mean: 105, p50: 50, p90: 90, max: 600, above500: 1 });
});
