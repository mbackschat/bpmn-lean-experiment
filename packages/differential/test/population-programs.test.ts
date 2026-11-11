/**
 * The harness numbers a population's deployments as `Kernel.Population` does, so the program it assembles for a deploy
 * ordinal is the one that ordinal deploys; the oracle then checks that both kernels agree on what each deployment ran.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { deploymentOrder } from "./population-programs.ts";

test("definitions no deploy step names deploy first in list order, then every deploy step in step order", () => {
  const steps = [
    { kind: "deploy", definitionRef: "b" }, { kind: "instance", definitionRef: "a" }, { kind: "deploy", definitionRef: "b", at: 4 },
    { kind: "deploy", definitionRef: "undeclared" },
  ];
  assert.deepEqual(deploymentOrder(["a", "b", "c"], steps), ["a", "c", "b", "b", "undeclared"]);
  assert.deepEqual(deploymentOrder(["a"], []), ["a"]);
});
