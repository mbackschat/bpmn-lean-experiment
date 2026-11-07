import assert from "node:assert/strict";
import test from "node:test";

import { measureReplayResidual } from "./lean-fanout-replay.ts";

// The build-modularity residual the owner restated on 2026-11-01, when closing the hub fix instead of continuing it
// ([current boundary](../docs/LEAN-BUILD-MODULARITY-SPEC.md#current-boundary)): the replay's figures at `11e3cf53`,
// counted over the modules that existed there. A module added since is left to the per-module fan-out bounds,
// which already fail when it joins a hub's cone, so that a new family does not need an exception here as well.
// Growth fails here and, like every bound, is reverted and root-caused first; keeping it needs an owner exception.
// An improvement beyond the tolerance fails too, so that the recorded figure follows it down.
const universe = "11e3cf53";

const restatedResidual = {
  modules: { mean: 239.2, p90: 620, above500: 15 },
  fixtures: { mean: 56.9, p90: 163 },
  // Committed `elapsedSeconds` rows change only when a fixture is remeasured; the owner's decision guards their
  // per-commit sum, while each row stays unratcheted reading context.
  // Followed down on 2026-11-07 to the replay's median 736 and p90 1000, when ServiceTaskIncidentCancellation and
  // -Retry were remeasured at 48.17 s and 21.39 s.
  fixtureSeconds: { median: 736, p90: 1000, above900: 10 },
} as const;

const staleTolerance: Readonly<Record<string, number>> = { mean: 2, median: 20, p90: 20, above500: 1, above900: 1 };

test("the replay of ordinary semantic commits stays within the owner-restated build residual", () => {
  const residual = measureReplayResidual(undefined, undefined, universe);
  const measured: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    modules: residual.modules, fixtures: residual.fixtures, fixtureSeconds: residual.fixtureSeconds,
  };
  const findings: string[] = [];
  for (const [kind, bounds] of Object.entries(restatedResidual)) {
    for (const [statistic, bound] of Object.entries(bounds)) {
      // Compared in tenths, the precision of the recorded means, so that float rounding never decides.
      const value = Math.round(measured[kind]![statistic]! * 10);
      const limit = Math.round(bound * 10);
      if (value > limit) findings.push(`${kind} ${statistic} ${value / 10} exceeds the restated ${bound}`);
      else if (limit - value > staleTolerance[statistic]! * 10) {
        findings.push(`${kind} ${statistic} ${value / 10} leaves stale headroom under the restated ${bound}; lower it`);
      }
    }
  }
  assert.deepEqual(findings, []);
});
