import assert from "node:assert/strict";
import test from "node:test";

import {
  replayCommitCost, replayCommitFixtureSeconds, replayCommitFixtures, replayFixtureStatistics, replayStatistics,
} from "./lean-fanout-replay.ts";

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

test("a commit costs the recorded serial seconds of the fixtures it rebuilds, each once", () => {
  const fanouts = new Map([["A", ["F1", "F2"]], ["B", ["F2"]], ["F1", []], ["F2", []]]);
  const seconds = new Map([["F1", 1.5], ["F2", 2.25]]);
  assert.equal(replayCommitFixtureSeconds(["A", "B"], fanouts, seconds), 3.75);
  // A rebuilt module without a recorded cost row adds nothing; an edited fixture counts its own row.
  assert.equal(replayCommitFixtureSeconds(["B", "F1"], fanouts, seconds), 3.75);
});

test("the fixture statistics round to whole seconds and count the commits above contract item 5's 900", () => {
  assert.deepEqual(replayFixtureStatistics([100.4, 950, 20, 30, 40, 50, 60, 70, 80, 901]), { median: 60, p90: 901, above900: 2 });
});

test("a commit counts the recorded fixtures it rebuilds, each once", () => {
  const fanouts = new Map([["A", ["F1", "F2", "L"]], ["B", ["F2"]], ["F1", []], ["F2", []], ["L", []]]);
  assert.equal(replayCommitFixtures(["A", "B"], fanouts, new Set(["F1", "F2"])), 2);
  assert.equal(replayCommitFixtures(["B"], fanouts, new Set(["F1", "F2"])), 1);
});
