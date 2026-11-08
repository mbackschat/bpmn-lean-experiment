import assert from "node:assert/strict";
import test from "node:test";

import { committedKernelRoot, generatedKernelRoot } from "./kernel-root.ts";

test("the kernel root module equals its generated form", () => {
  assert.equal(committedKernelRoot(), generatedKernelRoot(), "run: node scripts/kernel-root.ts --write");
});
