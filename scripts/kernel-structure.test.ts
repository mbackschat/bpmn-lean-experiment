import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  classify,
  duplicateNameFindings,
  featureFileFindings,
  Layer,
  layeringFindings,
  lawsFindings,
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

test("a definition's short name appears once per language package", () => {
  assert.deepEqual(duplicateNameFindings(), []);
});

test("every feature spans at most three files in each language", () => {
  assert.deepEqual(featureFileFindings(leanModules()), []);
  assert.deepEqual(featureFileFindings(typeScriptModules()), []);
});

test("the feature file limit rejects a fourth file of one feature, counts a sub-feature apart and fails on no features", () => {
  const module = (file: string, family: string): Module => ({ name: file, layer: Layer.Feature, family, file, imports: [] });
  const work = ["Kernel/Feature/Work.lean", "Kernel/Feature/Work/Call.lean", "Kernel/Feature/Work/Submission.lean"];
  assert.deepEqual(featureFileFindings([...work.map((file) => module(file, "work")), module("Kernel/Feature/Decision.lean", "decision")]), []);
  assert.deepEqual(featureFileFindings([...work, "Kernel/Feature/Work/Effects.lean"].map((file) => module(file, "work"))), [
    "feature work: 4 files, above three (Kernel/Feature/Work.lean, Kernel/Feature/Work/Call.lean, Kernel/Feature/Work/Effects.lean, Kernel/Feature/Work/Submission.lean)",
  ]);
  assert.notDeepEqual(featureFileFindings([]), []);
});

test("no profile identifier appears in the kernel", () => {
  assert.deepEqual(profileLiteralFindings(), []);
});

// The scans must reject what they exist to reject, so each is checked against a minimal violating module set.
test("layering rejects a feature importing another feature, an admission importing state, a foreign import, and a dispatch module other than population importing step, and admits a dispatch module importing its own family", () => {
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
    module("Kernel.Population", Layer.Dispatch, "population", ["Kernel.Step", "Kernel.Population.Deploy"]),
    module("Kernel.Population.Deploy", Layer.Dispatch, "population", ["Kernel.Hooks"]),
    module("Kernel.Publish", Layer.Dispatch, "publish", ["Kernel.Step"]),
  ];
  assert.deepEqual(layeringFindings(modules, (name) => name.startsWith("Kernel.")), [
    "Kernel.Feature.Work: feature module imports feature module Kernel.Feature.Data",
    "Kernel.Admission.Flow: admission module imports state module Kernel.State",
    "Kernel.Admission.Flow: imports Lean.Data.Json outside the kernel",
    "Kernel.Publish: dispatch module imports dispatch module Kernel.Step",
  ]);
});

test("a Laws module is classified apart, imports only its own feature or dispatch family besides the shared layers, and nothing executable imports it", () => {
  assert.deepEqual(classify(["Laws", "Population"]), [Layer.Laws, "population"]);
  const module = (name: string, layer: Layer, family: string, imports: string[], file = `${name.split(".").join("/")}.lean`): Module =>
    ({ name, layer, family, file, imports });
  const modules = [
    module("Kernel", Layer.Root, "", ["Kernel.Laws.State"], "Kernel.lean"),
    module("Kernel.State", Layer.State, "", []),
    module("Kernel.Hooks", Layer.Hooks, "", ["Kernel.State"]),
    module("Kernel.Feature.Flow", Layer.Feature, "flow", ["Kernel.Hooks", "Kernel.Laws.Flow"]),
    module("Kernel.Feature.Data", Layer.Feature, "data", ["Kernel.Hooks"]),
    module("Kernel.Population.Contract", Layer.Dispatch, "population", ["Kernel.State"]),
    module("Kernel.Step", Layer.Dispatch, "step", ["Kernel.Hooks", "Kernel.Laws.Flow"]),
    module("Kernel.Run", Layer.Run, "", ["Kernel.Step", "Kernel.Laws.State"]),
    module("Kernel.Laws.State", Layer.Laws, "state", ["Kernel.State"]),
    module("Kernel.Laws.Flow", Layer.Laws, "flow", ["Kernel.Feature.Flow", "Kernel.Laws.State", "Kernel.Feature.Data"]),
    module("Kernel.Laws.Population", Layer.Laws, "population", ["Kernel.Population.Contract", "Kernel.Step"]),
  ];
  assert.deepEqual(layeringFindings(modules, (name) => name === "Kernel" || name.startsWith("Kernel.")), [
    "Kernel/Feature/Flow.lean: feature module imports laws module Kernel.Laws.Flow",
    "Kernel/Step.lean: dispatch module imports laws module Kernel.Laws.Flow",
    "Kernel/Run.lean: run module imports laws module Kernel.Laws.State",
    "Kernel/Laws/Flow.lean: laws module imports feature module Kernel.Feature.Data",
    "Kernel/Laws/Population.lean: laws module imports dispatch module Kernel.Step",
  ]);
  // The TypeScript kernel transcribes only executable modules, so it has no laws layer and its index exports none.
  const typeScript = [
    module("index", Layer.Root, "", ["laws/flow"], "packages/kernel/src/index.ts"),
    module("laws/flow", Layer.Laws, "flow", [], "packages/kernel/src/laws/flow.ts"),
  ];
  assert.deepEqual(layeringFindings(typeScript, (name) => !name.startsWith("node:")), [
    "packages/kernel/src/index.ts: root module imports laws module laws/flow",
    "packages/kernel/src/laws/flow.ts: the TypeScript kernel has no laws layer",
  ]);
});

test("a Proofs module is classified apart, imports Laws, Proofs and Step but no other dispatch module or the registry, and nothing executable imports it", () => {
  assert.deepEqual(classify(["Proofs", "Cancellation"]), [Layer.Proofs, "cancellation"]);
  const module = (name: string, layer: Layer, family: string, imports: string[], file = `${name.split(".").join("/")}.lean`): Module =>
    ({ name, layer, family, file, imports });
  const modules = [
    module("Kernel", Layer.Root, "", ["Kernel.Proofs.Step"], "Kernel.lean"),
    module("Kernel.Hooks", Layer.Hooks, "", []),
    module("Kernel.Step", Layer.Dispatch, "step", ["Kernel.Hooks"]),
    module("Kernel.Population", Layer.Dispatch, "population", ["Kernel.Step"]),
    module("Kernel.Registry", Layer.Registry, "", ["Kernel.Hooks"]),
    module("Kernel.Run", Layer.Run, "", ["Kernel.Registry", "Kernel.Proofs.Step"]),
    module("Kernel.Laws.Step", Layer.Laws, "step", ["Kernel.Step"]),
    module("Kernel.Laws.Registry", Layer.Laws, "registry", ["Kernel.Registry"]),
    module("Kernel.Laws.Flow", Layer.Laws, "flow", ["Kernel.Hooks", "Kernel.Registry"]),
    module("Kernel.Proofs.Step", Layer.Proofs, "step", ["Kernel.Laws.Step", "Kernel.Laws.Registry", "Kernel.Step"]),
    module("Kernel.Proofs.Cancellation", Layer.Proofs, "cancellation", ["Kernel.Proofs.Step", "Kernel.Registry", "Kernel.Population"]),
  ];
  assert.deepEqual(layeringFindings(modules, (name) => name === "Kernel" || name.startsWith("Kernel.")), [
    "Kernel/Run.lean: run module imports proofs module Kernel.Proofs.Step",
    "Kernel/Laws/Flow.lean: laws module imports registry module Kernel.Registry",
    "Kernel/Proofs/Cancellation.lean: proofs module imports registry module Kernel.Registry",
    "Kernel/Proofs/Cancellation.lean: proofs module imports dispatch module Kernel.Population",
  ]);
  const typeScript = [
    module("index", Layer.Root, "", ["proofs/step"], "packages/kernel/src/index.ts"),
    module("proofs/step", Layer.Proofs, "step", [], "packages/kernel/src/proofs/step.ts"),
  ];
  assert.deepEqual(layeringFindings(typeScript, (name) => !name.startsWith("node:")), [
    "packages/kernel/src/index.ts: root module imports proofs module proofs/step",
    "packages/kernel/src/proofs/step.ts: the TypeScript kernel has no proofs layer",
  ]);
});

test("import all opens only the body of a Laws module's own executable module or its submodules", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-import-all-"));
  try {
    const sources: Readonly<Record<string, string>> = {
      "Kernel.lean": "module\n",
      "packages/kernel/src/index.ts": "export const x = 1;\n",
      "packages/bpmn-source/src/a.ts": "export const y = 1;\n",
      "Kernel/Laws/Step.lean": "module\npublic import Kernel.Step\nimport all Kernel.Step\nimport all Kernel.Step.Jobs\n",
      "Kernel/Laws/Registry.lean": "module\nimport all Kernel.Registry\n",
      "Kernel/Laws/Flow.lean": "module\nimport all Kernel.Feature.Flow\nimport all Kernel.Feature.Data\n",
      "Kernel/Laws/State.lean": "module\nimport all Kernel.State\nimport all Kernel.Step\n",
      "Kernel/Proofs/Step.lean": "module\nimport all Kernel.Step\n",
    };
    for (const [file, text] of Object.entries(sources)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    assert.deepEqual(shapeFindings(root).sort(), [
      "Kernel/Laws/Flow.lean: import all Kernel.Feature.Data outside its own Laws module",
      "Kernel/Laws/State.lean: import all Kernel.Step outside its own Laws module",
      "Kernel/Proofs/Step.lean: import all outside Laws",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the name clause rejects a helper defined twice and exempts only the two halves of one family", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-names-"));
  try {
    const sources: Readonly<Record<string, string>> = {
      "Kernel/Feature/Flow.lean": "def exclusive := 1\ndef isAscii := 1\n",
      "Kernel/Admission/Flow.lean": "def exclusive := 1\n",
      "Kernel/Feature/Data/Juel.lean": "private def isAscii := 1\n",
      "Kernel/Laws/Flow.lean": "def exclusive := 1\n",
      "packages/kernel/src/feature/flow.ts": "function filled() {}\n",
      "packages/kernel/src/feature/multi-instance.ts": "export function filled() {}\n",
      "packages/bpmn-source/src/a.ts": "function filled() {}\n",
      "packages/bpmn-source/src/b.ts": "export const filled = (item: number): number => item;\n",
    };
    for (const [file, text] of Object.entries(sources)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    assert.deepEqual(duplicateNameFindings(root), [
      "filled is defined in packages/bpmn-source/src/a.ts, packages/bpmn-source/src/b.ts",
      "filled is defined in packages/kernel/src/feature/flow.ts, packages/kernel/src/feature/multi-instance.ts",
      "isAscii is defined in Kernel/Feature/Data/Juel.lean, Kernel/Feature/Flow.lean",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every feature module has its Laws module", () => {
  assert.deepEqual(lawsFindings(), []);
});

test("the Laws clause names a feature without its Laws module and fails on no features", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-laws-"));
  try {
    assert.deepEqual(lawsFindings(root), ["read no Kernel/Feature module; a renamed directory must not empty the guard's input"]);
    for (const file of ["Kernel/Feature/Flow.lean", "Kernel/Feature/Data.lean", "Kernel/Feature/Data/Juel.lean", "Kernel/Laws/Flow.lean"]) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "");
    }
    assert.deepEqual(lawsFindings(root), ["Kernel/Feature/Data.lean has no Kernel/Laws/Data.lean"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
