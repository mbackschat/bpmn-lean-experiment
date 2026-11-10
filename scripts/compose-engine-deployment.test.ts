import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { withCurrentEngineDeployment } from "./compose-engine-deployment.ts";

// The fast loop's copy of the platform test's check, so a profile that selects a relation fails here, next to the
// change, instead of in the hosted platform lane.
test("compose.yaml deploys the repository's current profile catalog", () => {
  const compose = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8");
  assert.equal(withCurrentEngineDeployment(compose), compose,
    "compose.yaml's engine deployment is stale: run node scripts/compose-engine-deployment.ts --write");
});
