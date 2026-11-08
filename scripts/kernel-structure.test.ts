import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  Layer,
  layeringFindings,
  leanModules,
  pairingFindings,
  profileLiteralFindings,
  shapeFindings,
  typeScriptModules,
  type Module,
} from "./kernel-structure.ts";

test("the Lean kernel follows the layer table", () => {
  assert.deepEqual(layeringFindings(leanModules(), (name) => name === "Kernel" || name.startsWith("Kernel.")), []);
});

test("the TypeScript kernel follows the layer table", () => {
  assert.deepEqual(layeringFindings(typeScriptModules(), (name) => !name.startsWith("node:") && !name.startsWith("@") && !name.startsWith("..")), []);
});

test("kernel files stay within the shape and size ceilings", () => {
  assert.deepEqual(shapeFindings(), []);
});

test("every Lean executable module has a TypeScript pair of the same name", () => {
  assert.deepEqual(pairingFindings(), []);
});

test("no profile identifier appears in the kernel", () => {
  assert.deepEqual(profileLiteralFindings(), []);
});

// The scans must reject what they exist to reject, so each is checked against a minimal violating module set.
test("layering rejects a feature importing another feature, an admission importing state, a foreign import, and a dispatch module other than population importing step", () => {
  const module = (name: string, layer: Layer, family: string, imports: string[]): Module =>
    ({ name, layer, family, file: name, imports });
  const modules = [
    module("Kernel.Feature.Work", Layer.Feature, "work", ["Kernel.Feature.Data", "Kernel.Hooks"]),
    module("Kernel.Feature.Data", Layer.Feature, "data", ["Kernel.Hooks"]),
    module("Kernel.Feature.Work.Effects", Layer.Feature, "work", ["Kernel.Feature.Work"]),
    module("Kernel.Admission.Flow", Layer.Admission, "flow", ["Kernel.State", "Lean.Data.Json"]),
    module("Kernel.Hooks", Layer.Hooks, "", ["Kernel.State"]),
    module("Kernel.State", Layer.State, "", []),
    module("Kernel.Step", Layer.Dispatch, "step", ["Kernel.Hooks"]),
    module("Kernel.Population", Layer.Dispatch, "population", ["Kernel.Step"]),
    module("Kernel.Publish", Layer.Dispatch, "publish", ["Kernel.Step"]),
  ];
  assert.deepEqual(layeringFindings(modules, (name) => name.startsWith("Kernel.")), [
    "Kernel.Feature.Work: feature module imports feature module Kernel.Feature.Data",
    "Kernel.Admission.Flow: admission module imports state module Kernel.State",
    "Kernel.Admission.Flow: imports Lean.Data.Json outside the kernel",
    "Kernel.Publish: dispatch module imports dispatch module Kernel.Step",
  ]);
});

test("pairing rejects a Lean module without a TypeScript pair and the reverse", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-pairing-"));
  try {
    for (const file of ["Kernel/Feature/MultiInstance.lean", "Kernel/Step.lean", "Kernel/Laws/Flow.lean"]) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "");
    }
    for (const file of ["packages/kernel/src/feature/multi-instance.ts", "packages/kernel/src/index.ts", "packages/kernel/src/extra.ts"]) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "");
    }
    assert.deepEqual(pairingFindings(root), [
      "Lean module without a TypeScript pair: step",
      "TypeScript module without a Lean pair: extra",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
