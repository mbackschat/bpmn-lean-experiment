/**
 * Guard 23 of docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation: every guard is held against a clean
 * self-contained tree, a seeded violation and an empty input, so none can pass by matching nothing. The "tree passes"
 * tests read the real repository and are the guards themselves. Guard 21's decoders need the built kernels and run in
 * packages/differential/test/row-fixtures.integration-test.ts; its fast half runs here.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { buildFindings, inflateLayer, moduleTimes, worstModule } from "./kernel-build-budget.ts";
import { branchCommits, ilRecordCommits, reportLines } from "./kernel-guard-report.ts";
import { loadTree, structureInputFindings, tokenizeLean, tokenizeTypeScript, type KernelTree } from "./kernel-guard-scan.ts";
import {
  closedDispatchFindings,
  commitScopeFindings,
  fanOutFindings,
  mirrorEnumerationFindings,
  noCatchAllFindings,
  tsMatchSiteCounts,
} from "./kernel-guards-dispatch.ts";
import { effectWriterFindings, fieldLivenessFindings } from "./kernel-guards-effects.ts";
import {
  boundedNumberFindings,
  discoveryFindings,
  justifiedRuleFindings,
  kernelOptionFindings,
  longFunctions,
  proofPlacementFindings,
  shapeLimitFindings,
  singleEntryFindings,
} from "./kernel-guards-placement.ts";
import {
  coverageRows,
  refusalParityFindings,
  refusalTestFindings,
  rowFixtureFindings,
  shapeSufficiencyFindings,
} from "./kernel-guards-refusal.ts";
import { ilRecordScopeFindings, rebuildFindings, shapeEditReport } from "./kernel-rebuild-model.ts";
import { pairingFindings, profileLiteralFindings, shapeFindings } from "./kernel-structure.ts";
import { unitPairingFindings } from "./kernel-guards-pairing.ts";

const roots: string[] = [];
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const dispatchTable = `def owners : List (Name × List Name) := [
  (\`Kernel.Element, [\`Kernel.Step]),
  (\`Kernel.Work, [\`Kernel.Feature.Work, \`Kernel.Admission.Work])]
`;

const stateTs = `export function emit(state, flows) { return { ...state, tokens: flows }; }
export function setVariable(state, name) { return { ...state, variables: [name] }; }
export function beginOccurrence(state) { return { ...state, occurrences: [1] }; }
export function removeOccurrence(state) { return { ...state, occurrences: [] }; }
export function activate(state) { return { ...state, activations: [1] }; }
`;

const cleanFiles: Readonly<Record<string, string>> = {
  "scripts/kernel-dispatch.lean": dispatchTable,
  "Kernel.lean": "module\n\npublic import Kernel.Step\n",
  "Kernel/IL/Types.lean": `module
inductive Element where
  | task (header : Nat) (payload : Nat)
  | gateway
inductive Work where
  | none
  | user
structure Program where
  count : Nat
`,
  "Kernel/State.lean": "module\npublic import Kernel.IL.Types\nstructure State where\n  count : Nat\n",
  "Kernel/Hooks.lean": `module
public import Kernel.State
-- The default for an unregistered mechanism.
def refused : Except Failure Nat := .error (.unsupported "work-user-assignee")
`,
  "Kernel/Step.lean": "module\npublic import Kernel.Hooks\nnamespace Kernel.Step\ndef step (state : Nat) : Nat := state\nend Kernel.Step\n",
  "Kernel/Population.lean": "module\npublic import Kernel.Step\ndef run (state : Nat) : Nat := Step.step state\n",
  "Kernel/Registry.lean": "module\npublic import Kernel.Feature.Flow\n",
  "Kernel/AdmissionRegistry.lean": "module\npublic import Kernel.Admission.Work\n",
  "Kernel/Run.lean": "module\npublic import Kernel.Registry\npublic import Kernel.AdmissionRegistry\n",
  "Kernel/Feature/Flow.lean": "module\npublic import Kernel.Hooks\nnamespace Kernel.Feature.Flow\ndef gateway (state : Nat) : Nat := state\nend Kernel.Feature.Flow\n",
  "Kernel/Admission/Work.lean": `module
public import Kernel.IL.Types
def work (value : Nat) : Option String := if value == 0 then some "work.user.assignee" else none
`,
  "packages/kernel/src/il/types.ts": `export enum ElementTag { Task = "task", Gateway = "gateway" }
export enum WorkTag { None = "none", User = "user" }
export function assertNever(value: never): never { throw new Error(String(value)); }
export interface Payload { readonly assignee: string; }
export type Work = { readonly tag: WorkTag };
`,
  "packages/kernel/src/il/codec.ts": "export const decode = 1;\n",
  "packages/kernel/src/state.ts": stateTs,
  "packages/kernel/src/hooks.ts": "export const hooks = 1;\n",
  "packages/kernel/src/step.ts": `import { ElementTag, assertNever } from "./il/types.js";
import { beginOccurrence, removeOccurrence, activate } from "./state.js";
export function step(hooks, state, element) {
  hooks.outflow(state);
  beginOccurrence(state); removeOccurrence(state); activate(state);
  switch (element.tag) {
    case ElementTag.Task:
      return 1;
    case ElementTag.Gateway:
      return 2;
  }
  return assertNever(element);
}
`,
  "packages/kernel/src/population.ts": `import { step } from "./step.js";\nexport function run(hooks, state) { return step(hooks, state, state.element); }\n`,
  "packages/kernel/src/registry.ts": `import { gateway } from "./feature/flow.js";\nexport const hooks = { gateway };\n`,
  "packages/kernel/src/admission-registry.ts": `import { work } from "./admission/work.js";\nexport const admit = work;\n`,
  "packages/kernel/src/run.ts": `import { hooks } from "./registry.js";\nimport { admit } from "./admission-registry.js";\nexport const run = [hooks, admit];\n`,
  "packages/kernel/src/index.ts": `export { run } from "./run.js";\n`,
  "packages/kernel/src/feature/flow.ts": `import { emit } from "../state.js";\nexport function gateway(state, flows) { return emit(state, flows); }\n`,
  "packages/kernel/src/feature/data.ts": `import { setVariable } from "../state.js";\nexport function store(payload, state) { return [setVariable(state, "x"), payload.assignee]; }\n`,
  "packages/kernel/src/admission/work.ts": `import { WorkTag, assertNever } from "../il/types.js";
export function work(value) {
  switch (value.tag) {
    case WorkTag.None:
      return null;
    case WorkTag.User:
      return "work.user.assignee";
  }
  return assertNever(value);
}
`,
  "packages/bpmn-source/src/kernel-reader/model.ts": "export enum ReadRefusalCode { ParserFailure = \"source.parser-failure\" }\n",
  "packages/kernel/test/slice.test.ts": `import { readdirSync } from "node:fs";\nimport type { Program } from "@bpmn-lean/kernel";\nconst cases = readdirSync("scenarios");\nassert("work.user.assignee", cases);\n`,
  "packages/kernel/test/lean-paired.ts": `import * as kernel from "@bpmn-lean/kernel";\nexport { WorkTag } from "@bpmn-lean/kernel";\nexport const run = kernel.run;\n`,
  "packages/bpmn-source/test/reader.test.ts": `assert.equal(code, "source.parser-failure");\n`,
  "scenarios/one/scenario.json": "{}\n",
  "scenarios/two/scenario.json": "{}\n",
  "scenarios/three/scenario.json": "{}\n",
  "docs/PRACTICAL-CIB7-COVERAGE-TARGET.md": "| `PC-CF-02` | outcome | - | open | x |\n| `PC-JOURNEY-01` | outcome | - | open | x |\n",
  "docs/kernel/ROW-TRACEABILITY-MAP.md":
    "| PC-CF-02 | PC-CF-02.json | GatewayKind.exclusive~, Flow.condition+ | x |\n| PC-JOURNEY-01 | n/a | - | x |\n",
  "packages/kernel/test/fixtures/rows/PC-CF-02.json": `{"flows": [{"condition": null}], "kind": "exclusive"}\n`,
};

function fixture(overrides: Readonly<Record<string, string | null>> = {}): KernelTree {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-guard-fixture-"));
  roots.push(root);
  for (const [file, text] of Object.entries({ ...cleanFiles, ...overrides })) {
    if (text === null) continue;
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return loadTree(root);
}

function emptyFixture(): KernelTree {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-guard-empty-"));
  roots.push(root);
  return loadTree(root);
}

const clean = fixture();

function seeded(guard: (tree: KernelTree) => string[], overrides: Readonly<Record<string, string | null>>, pattern: RegExp): void {
  const findings = guard(fixture(overrides));
  assert.match(findings.join("\n"), pattern);
}

function holdsItsGround(name: string, guard: (tree: KernelTree) => string[], overrides: Readonly<Record<string, string | null>>, pattern: RegExp): void {
  test(`${name} is clean on a clean tree, rejects its seeded violation and fails on an empty tree`, () => {
    assert.deepEqual(guard(clean), []);
    seeded(guard, overrides, pattern);
    assert.notDeepEqual(guard(emptyFixture()), [], "an empty tree must fail");
  });
}

test("the tokenizers keep comments, strings and regular expressions out of the code stream", () => {
  const typeScript = tokenizeTypeScript('const a = /x"y/u; // not "code"\nconst b = `t${ "s" }`; /* switch */ const c = "default:";\n');
  assert.deepEqual(typeScript.tokens.filter((token) => token.kind === "word").map((token) => token.text), ["const", "a", "const", "b", "const", "c"]);
  assert.match(typeScript.comments.get(1) ?? "", /not "code"/u);
  const lean = tokenizeLean('/- theorem -/ def Kernel.Step.step (x : Nat) := x -- decide\n#eval ".unsupported"\n');
  assert.ok(lean.tokens.some((token) => token.text === "Kernel.Step.step"));
  assert.ok(!lean.tokens.some((token) => token.text === "theorem" || token.text === "decide"));
});

holdsItsGround("guard 1 (closed dispatch)", closedDispatchFindings, {
  "packages/kernel/src/feature/flow.ts": `import { WorkTag, ElementTag } from "../il/types.js";
import { emit } from "../state.js";
export function gateway(state, flows, work) { emit(state, flows); return work.tag === WorkTag.User; }
const table: Record<ElementTag, number> = {} as never;
`,
}, /Record table over guarded ElementTag[\s\S]*G1 packages\/kernel\/src\/feature\/flow\.ts:3: compares guarded WorkTag/u);

test("guard 1 rejects a switch, an `in` narrowing and a filter outside owners, and honours a justified site", () => {
  seeded(closedDispatchFindings, { "packages/kernel/src/feature/flow.ts": `import { WorkTag } from "../il/types.js";
import { emit } from "../state.js";
export function gateway(state, flows, work) {
  emit(state, flows);
  switch (work.tag) { case WorkTag.User: return 1; case WorkTag.None: return 2; }
  return assertNever(work);
}
` }, /switch on guarded WorkTag outside its owner/u);
  seeded(closedDispatchFindings, { "packages/kernel/src/hooks.ts": `export const hooks = 1;\nexport const has = (item) => "payload" in item;\nexport const some = (items) => items.filter((item) => item.kind);\n` },
    /`in` narrowing[\s\S]*`filter` on a kind/u);
  const justified = fixture({ "packages/kernel/src/hooks.ts": `// guard-exception(1): a scan fixture demonstrating the exception mark\nexport const has = (item) => "payload" in item;\n` });
  assert.deepEqual(closedDispatchFindings(justified), []);
});

holdsItsGround("guard 2 (no catch-all)", noCatchAllFindings, {
  "packages/kernel/src/admission/work.ts": `import { WorkTag } from "../il/types.js";
export function work(value) {
  switch (value.tag) {
    case WorkTag.User:
      return 1;
    default:
      return 2;
  }
}
`,
  "packages/kernel/src/feature/work.ts": `import { WorkTag } from "../il/types.js";
export const isUser = (work) => work.tag === WorkTag.User;
`,
}, /switch over WorkTag has a default arm[\s\S]*does not end in assertNever[\s\S]*equality test on guarded WorkTag member inside its owner/u);

holdsItsGround("guard 3 (mirror enumerations)", mirrorEnumerationFindings, {
  "packages/kernel/src/feature/flow.ts": `import { ElementTag } from "../il/types.js";
import { emit } from "../state.js";
export const kinds = [ElementTag.Task, ElementTag.Gateway];
export function isTask(element: Element): boolean { return Boolean(element); }
export function gateway(state, flows) { return emit(state, flows); }
`,
  "Kernel/Feature/Mirror.lean": `module
inductive MyWork where
  | none
  | user
  | extra
def Kernel.Feature.Mirror.isGate (x : Element) : Bool := true
def allow : List Element := [.task, .gateway]
`,
}, /allowlist of 2 ElementTag members[\s\S]*classifier isTask[\s\S]*inductive MyWork mirrors guarded Work[\s\S]*classifier Kernel\.Feature\.Mirror\.isGate|allowlist of 2 ElementTag members/u);

test("guard 3 reports each of its second-enumeration shapes", () => {
  const findings = mirrorEnumerationFindings(fixture({
    "packages/kernel/src/feature/flow.ts": `import { ElementTag } from "../il/types.js";
import { emit } from "../state.js";
export const kinds = [ElementTag.Task, ElementTag.Gateway];
export function isTask(element: Element): boolean { return Boolean(element); }
export enum Mirror { Task, Gateway, Other, Another }
export function gateway(state, flows) { return emit(state, flows); }
`,
    "Kernel/Feature/Mirror.lean": `module
inductive MyWork where
  | none
  | user
  | task
def isGate (x : Element) : Bool := true
def allow : List Element := [.task, .gateway]
`,
  })).join("\n");
  assert.match(findings, /allowlist of 2 ElementTag members/u);
  assert.match(findings, /classifier isTask over guarded Element/u);
  assert.match(findings, /classifier isGate over guarded Element/u);
  assert.match(findings, /allowlist of 2 Element constructors/u);
});

/** `Token` and `Value` share constructor names with the guarded `Element` and `Work`, as `Token.flow` shares
`Continuation.flow` and `Value.null` shares `JuelNode.null` in the kernel (#109). */
const sharedNames = `module
inductive Element where
  | task (header : Nat) (payload : Nat)
  | gateway
  | flow
inductive Work where
  | none
  | user
  | null
inductive Token where
  | flow (flow : Nat) (scope : Nat)
  | gateway
inductive Value where
  | null
  | map (entries : List Nat)
structure Program where
  count : Nat
`;

test("guard 3 counts a constructor list only for the type its names resolve to", () => {
  const lists = (body: string): string[] =>
    mirrorEnumerationFindings(fixture({ "Kernel/IL/Types.lean": sharedNames, "Kernel/Laws/Lists.lean": `module\n${body}` }));
  assert.deepEqual(lists("def twice (s : State) (f p : Nat) : State := { s with tokens := [.flow f p, .flow f p] }\n"), []);
  assert.deepEqual(lists(`theorem unordered : P (.map [("b", .null), ("a", .null)]) := sorry\n`), []);
  assert.deepEqual(lists("def nulls := [.null, .null]\n"), []);
  assert.deepEqual(lists("def tokens : List Token := [.flow 1 2, .gateway]\n"), []);
  for (const body of [
    "def allow : List Element := [.flow, .gateway]\n",
    "def allow := ([.flow, .gateway] : List Kernel.Element)\n",
    "def plain (e : Element) : Bool := [.task, .gateway].contains e\n",
    "def plain (e : Element) : Bool := [Element.flow, Element.gateway].contains e\n",
  ]) {
    assert.match(lists(body).join("\n"), /G3 Kernel\/Laws\/Lists\.lean:2: allowlist of 2 Element constructors outside its owner/u, body);
  }
});

holdsItsGround("guard 6 (proof placement)", proofPlacementFindings, {
  "Kernel/Feature/Flow.lean": `module
theorem bad : 1 = 1 := by decide
namespace Kernel.Feature.Flow
def gateway (state : Nat) : Nat := state
end Kernel.Feature.Flow
`,
  "Kernel/Laws/Other.lean": "module\ntheorem reduce : Step.step 0 = 0 := rfl\ntheorem opened : True := by simp [gateway]\n",
}, /theorem bad in an executable module[\s\S]*decide in an executable module[\s\S]*rfl reduces Step[\s\S]*opens feature body gateway/u);

test("guard 6 rejects a literal longer than 50 lines and accepts `decide (a < b)`", () => {
  const long = `module\ndef big : List Nat := [\n${"  1,\n".repeat(60)}  1]\n`;
  seeded(proofPlacementFindings, { "Kernel/Publish.lean": long }, /literal spans \d+ lines/u);
  assert.deepEqual(proofPlacementFindings(fixture({ "Kernel/Publish.lean": "module\ndef order (a b : Nat) : Bool := decide (a < b)\n" })), []);
});

holdsItsGround("guard 9 (binder cap and constructor shape)", shapeLimitFindings, {
  "Kernel/Feature/Flow.lean": `module
def f : Nat × Nat × Nat × Nat × Nat → Nat
  | ⟨a, b, c, d, e⟩ => a
`,
  "Kernel/IL/Types.lean": `module
inductive Element where
  | task (header : Nat) (payload : Nat) (extra : Nat)
`,
}, /anonymous-constructor pattern with 5 binders[\s\S]*Element\.task has 3 fields/u);

test("guard 9 reports shape-file edits per branch, marking a kernel-shape commit accepted", () => {
  const report = shapeEditReport([
    { sha: "a".repeat(40), subject: "feat(kernel-shape): widen", files: ["Kernel/State.lean"] },
    { sha: "b".repeat(40), subject: "feat(kernel): quiet edit", files: ["packages/kernel/src/hooks.ts"] },
    { sha: "c".repeat(40), subject: "docs: nothing", files: ["README.md"] },
  ]).join("\n");
  assert.match(report, /shape edits on this branch: 2/u);
  assert.match(report, /\[accepted\]: feat\(kernel-shape\): widen/u);
  assert.match(report, /\[NOT scoped kernel-shape\]: feat\(kernel\): quiet edit/u);
});

test("guard 9 fails an IL record edit outside a kernel-shape commit", () => {
  const edit = (sha: string, subject: string, files: string[]) => ({ sha: sha.repeat(40), subject, files });
  const commits = [
    edit("a", "feat(kernel-shape): widen", ["Kernel/IL/Types.lean"]),
    edit("b", "fix(data): quiet field", ["Kernel/IL/Types/Options.lean", "Kernel/Feature/Data.lean"]),
    edit("c", "feat(kernel): untouched records", ["packages/kernel/src/il/codec.ts"]),
    edit("d", "fix(data): quiet type", ["packages/kernel/src/il/types.ts"]),
  ];
  assert.deepEqual(ilRecordScopeFindings(commits), [
    "G9 bbbbbbbb fix(data): quiet field: edits IL records outside a kernel-shape commit (Kernel/IL/Types/Options.lean)",
    "G9 dddddddd fix(data): quiet type: edits IL records outside a kernel-shape commit (packages/kernel/src/il/types.ts)",
  ]);
});

test("after main's merge base, IL records change only in kernel-shape commits", () => {
  assert.deepEqual(ilRecordScopeFindings(ilRecordCommits()), []);
});

test("guard 10 reports functions above 80 lines in both languages", () => {
  const body = "  1\n".repeat(90);
  const spans = longFunctions(fixture({
    "Kernel/Feature/Flow.lean": `module\ndef long (x : Nat) : Nat :=\n${body}`,
    "packages/kernel/src/hooks.ts": `export function longOne() {\n${body}}\n`,
  }));
  assert.ok(spans.some((span) => span.name === "long" && span.file === "Kernel/Feature/Flow.lean"));
  assert.ok(spans.some((span) => span.name === "longOne"));
  assert.deepEqual(longFunctions(clean), []);
});

holdsItsGround("guard 12 (admission refusal tests)", refusalTestFindings, {
  "Kernel/Admission/Work.lean": "module\ndef work (value : Nat) : Option String := if value == 0 then some \"work.user.untested\" else none\n",
}, /refusal code work\.user\.untested has no refusal test/u);

holdsItsGround("guard 13 (single entry)", singleEntryFindings, {
  "Kernel/Feature/Flow.lean": "module\ndef step (x : Nat) : Nat := x\ndef isProgramMode (x : Nat) : Bool := true\n",
  "packages/kernel/src/feature/data.ts": "export function evaluate() { return 1; }\nexport function hasMultiInstanceDefinitions() { return true; }\n",
  "Kernel/Population.lean": "module\ndef run (x : Nat) : Nat := x\n",
}, /population does not call the step function[\s\S]*second entry or evaluator step[\s\S]*program-mode predicate isProgramMode/u);

test("guard 13 rejects a TypeScript evaluator outside Data and a second step", () => {
  seeded(singleEntryFindings, { "packages/kernel/src/hooks.ts": "export function evaluate() { return 1; }\n" }, /second entry or evaluator evaluate/u);
  seeded(singleEntryFindings, { "packages/kernel/src/step.ts": "export function other() {}\n" }, /step\.ts does not declare exactly one step function/u);
});

holdsItsGround("guard 14 (discovery by convention)", discoveryFindings, {
  "packages/kernel/test/slice.test.ts": `const cases = ["one", "two", "three"];\nassert.equal(scenarios.length, 80);\nimport { readdirSync } from "node:fs";\nreaddirSync("x");\n`,
}, /lists 3 scenario names[\s\S]*writes the count of scenarios as 80/u);

holdsItsGround("guard 15 (elaboration options and derivations)", kernelOptionFindings, {
  "Kernel/Hooks.lean": "module\nset_option maxHeartbeats 400000\nset_option synthInstance.maxSize 8\n",
  "Kernel/State.lean": "module\nstructure State where\n  count : Nat\n  deriving Repr\n",
}, /elaboration option maxHeartbeats[\s\S]*elaboration option synthInstance\.maxSize[\s\S]*derived instance on State without a named consumer/u);

test("guard 15 accepts a derivation with a named consumer", () => {
  assert.deepEqual(kernelOptionFindings(fixture({ "Kernel/State.lean": "module\nstructure State where\n  count : Nat\n  -- consumer: Kernel.Run\n  deriving Repr\n" })), []);
});

holdsItsGround("guard 15 (static rebuild-set model)", rebuildFindings, {
  "Kernel/Step.lean": "module\npublic import Kernel.Hooks\npublic import Kernel.Feature.Flow\n",
  "packages/kernel/src/step.ts": `import { gateway } from "./feature/flow.js";\nexport const s = gateway;\n`,
}, /G15 Lean: editing Kernel\.Feature\.Flow rebuilds Kernel\.Step[\s\S]*G15 TypeScript: editing feature\/flow rebuilds step/u);

test("guard 15 rejects a sixth direct importer and allows the three hubs", () => {
  const importers = Object.fromEntries(["A", "B", "C", "D", "E", "F"].map((name) => [`packages/kernel/src/il/${name}.ts`, `import { x } from "./query.js";\nexport { x };\n`]));
  seeded(rebuildFindings, { ...importers, "packages/kernel/src/il/query.ts": "export const x = 1;\n" }, /il\/query has 6 direct importers, above 5/u);
  const hub = Object.fromEntries(["A", "B", "C", "D", "E", "F"].map((name) => [`packages/kernel/src/il/${name}.ts`, `import { assertNever } from "./types.js";\nexport { assertNever };\n`]));
  assert.deepEqual(rebuildFindings(fixture(hub)), []);
});

test("the measured lane parses module timings, enforces its bounds and rejects an unread timing", () => {
  const output = "✔ [2/108] Built Kernel.IL.Types (1.6s)\n✔ [3/108] Built Kernel.IL.Query (341ms)\n✔ [4/108] Built Kernel.IL.Types:c.o (2.1s)\n";
  assert.deepEqual(moduleTimes(output), [{ module: "Kernel.IL.Types", seconds: 1.6 }, { module: "Kernel.IL.Query", seconds: 0.341 }]);
  assert.deepEqual(buildFindings("clean", 200, 180, [{ module: "Kernel.Step", seconds: 45 }]), [
    "G15 clean: 200.0 s, above the 180 s bound",
    "G15 clean: Kernel.Step took 45.0 s, above 30 s",
  ]);
  assert.match(buildFindings("clean", 1, 180, [])[0] ?? "", /read no module timings/u);
});

test("the growth probe copies each module under renamed namespaces and picks the largest module to edit", () => {
  const tree = fixture({
    "Kernel/Feature/Work.lean": "module\npublic import Kernel.Feature.Work.Call\nnamespace Kernel.Feature.Work\ndef a := 1\ndef b := 2\nend Kernel.Feature.Work\n",
    "Kernel/Feature/Work/Call.lean": "module\nnamespace Kernel.Feature.Work.Call\nend Kernel.Feature.Work.Call\n",
  });
  const created = inflateLayer(path.join(tree.root, "Kernel"), "Feature", [2]);
  assert.deepEqual(created.sort(), ["Kernel.Feature.FlowCopy2", "Kernel.Feature.WorkCopy2", "Kernel.Feature.WorkCopy2.Call"]);
  const copy = loadTree(tree.root).lean.find((source) => source.file === "Kernel/Feature/WorkCopy2.lean");
  assert.match(copy?.text ?? "", /public import Kernel\.Feature\.WorkCopy2\.Call/u);
  assert.match(copy?.text ?? "", /namespace Kernel\.Feature\.WorkCopy2\n/u);
  assert.match(worstModule(tree.root), /Work(Copy2)?\.lean$/u);
  assert.throws(() => worstModule(emptyFixture().root));
});

holdsItsGround("guard 17 (one writer per effect)", effectWriterFindings, {
  "packages/kernel/src/feature/data.ts": `import { emit, setVariable } from "../state.js";
export function store(state, hooks) { setVariable(state, "x"); hooks.outflow(state); return { ...state, occurrences: [] }; }
export function leak(state) { return emit(state, []); }
`,
}, /spread update writes State\.occurrences[\s\S]*pipeline hook outflow[\s\S]*emit called outside its writer|emit called outside its writer/u);

test("guard 17 gives each Token case one writer: deferred begins are stacked only by MultiInstance", () => {
  const deferring = `${stateTs}export function deferBegins(state, requests) { return { ...state, tokens: requests }; }\n`;
  assert.deepEqual(effectWriterFindings(fixture({
    "packages/kernel/src/state.ts": deferring,
    "packages/kernel/src/feature/multi-instance.ts": `import { deferBegins } from "../state.js";\nexport function begin(state) { return deferBegins(state, []); }\n`,
  })), []);
  seeded(effectWriterFindings, {
    "packages/kernel/src/state.ts": deferring,
    "packages/kernel/src/feature/flow.ts": `import { emit, deferBegins } from "../state.js";\nexport function gateway(state, flows) { return deferBegins(emit(state, flows), []); }\n`,
  }, /deferBegins called outside its writer \(deferred begins are stacked only by MultiInstance\)/u);
});

// The Lean twin admits a writer's sub-modules by name prefix (`allowedFor` in scripts/kernel-effects.lean), so a State
// sub-module such as `state/removal.ts` is State here too, while a feature stays outside.
test("guard 17 reads a State sub-module as State, as the Lean rule does", () => {
  const removal = `import { removeOccurrence } from "../state.js";
export function removeOccurrence(state, id) { return { ...state, occurrences: [] }; }
export function cancelOccurrence(state, id) { return removeOccurrence(state, id); }
`;
  assert.deepEqual(effectWriterFindings(fixture({
    "packages/kernel/src/state/removal.ts": removal,
    "packages/kernel/src/step.ts": `import { cancelOccurrence } from "./state/removal.js";\nexport function step(state) { return cancelOccurrence(state, 1); }\n`,
  })).filter((line) => !line.startsWith("G17:")), []);
  seeded(effectWriterFindings, {
    "packages/kernel/src/state/removal.ts": removal,
    "packages/kernel/src/feature/scopes.ts": `import { cancelOccurrence } from "../state/removal.js";\nexport function leave(state) { return cancelOccurrence(state, 1); }\n`,
  }, /cancelOccurrence called outside its writer/u);
});

holdsItsGround("guard 19 (field liveness)", fieldLivenessFindings, {
  "packages/kernel/src/feature/data.ts": `import { setVariable } from "../state.js";\nexport function store(state) { return setVariable(state, "x"); }\n`,
}, /IL field assignee is read by no non-codec module/u);

test("guard 19 counts a member read in an IL type helper, never an IL declaration or a codec read", () => {
  const unread = `import { setVariable } from "../state.js";\nexport function store(state) { return setVariable(state, "x"); }\n`;
  const ilTypes = `export enum ElementTag { Task = "task", Gateway = "gateway" }
export enum WorkTag { None = "none", User = "user" }
export function assertNever(value: never): never { throw new Error(String(value)); }
export interface Payload { readonly assignee: string; }
export type Work = { readonly tag: WorkTag };
`;
  assert.deepEqual(fieldLivenessFindings(fixture({
    "packages/kernel/src/feature/data.ts": unread,
    "packages/kernel/src/il/types.ts": `${ilTypes}export function payloadAssignee(payload: Payload): string { return payload?.assignee; }\n`,
  })), []);
  seeded(fieldLivenessFindings, {
    "packages/kernel/src/feature/data.ts": unread,
    "packages/kernel/src/il/types.ts": `${ilTypes}export interface Other { assignee: string, tag: WorkTag }\nexport type Pair = { assignee: string };\n`,
  }, /IL field assignee is read by no non-codec module/u);
  seeded(fieldLivenessFindings, {
    "packages/kernel/src/feature/data.ts": unread,
    "packages/kernel/src/il/codec.ts": "export const decode = (payload) => payload.assignee;\n",
  }, /IL field assignee is read by no non-codec module/u);
});

holdsItsGround("guard 20 (refusal parity)", refusalParityFindings, {
  "Kernel/Feature/Flow.lean": `module
def f (x : Nat) : Except Failure Nat := .error (.unsupported "work-user-assignee")
def g (x : Nat) : Except Failure Nat := .error (.unsupported "not-admitted")
`,
  "packages/kernel/src/hooks.ts": `export const a = failed(FailureTag.Unsupported, "also-not-admitted");
// dynamic-only: a host evaluator answers after admission.
export const b = failed(FailureTag.Unsupported, "marked-dynamic");
`,
}, /Kernel\/Feature\/Flow\.lean:3: runtime unsupported "not-admitted"[\s\S]*"also-not-admitted"/u);

test("guard 20 matches admission codes across spellings and honours the dynamic-only mark", () => {
  const findings = refusalParityFindings(fixture({
    "Kernel/Feature/Flow.lean": `module
def f : Except Failure Nat := .error (.unsupported "work-user-assignee")
-- dynamic-only: the host answers this after admission.
def g : Except Failure Nat := .error (.unsupported "marked-dynamic")
`,
  }));
  assert.deepEqual(findings, []);
});

test("guard 20 reads runtime codes only, so a law naming an unsupported outcome is no runtime site", () => {
  assert.deepEqual(refusalParityFindings(fixture({
    "Kernel/Laws/Population.lean": `module
def Stop (entry : Failure) : Prop := entry = .unsupported "never-admitted"
`,
  })), []);
});

holdsItsGround("guard 11 (bounded wire numbers)", boundedNumberFindings, {
  "Kernel/Run.lean": "module\ndef deployedAt (input : Json) := input.getNat?\n",
}, /G11 Kernel\/Run\.lean:2: raw JSON number read input\.getNat\?/u);

test("guard 11 honours the bounded decoder's justified read", () => {
  assert.deepEqual(boundedNumberFindings(fixture({
    "Kernel/Run.lean": "module\n-- guard-exception(11): the bounded decoder itself reads the number\ndef bounded (json : Json) := json.getInt?\n",
  })), []);
});

holdsItsGround("guard 16 (unit cases through the Lean-paired helper)", unitPairingFindings, {
  "packages/kernel/test/slice.test.ts": `import { run, type Program } from "@bpmn-lean/kernel";\nrun();\n`,
}, /G16 packages\/kernel\/test\/slice\.test\.ts:1: reaches the TypeScript kernel outside/u);

test("guard 16 refuses a helper that passes on kernel behavior and a dynamic kernel import, and reads no comment", () => {
  seeded(unitPairingFindings, {
    "packages/kernel/test/lean-paired.ts": `export { WorkTag, run } from "@bpmn-lean/kernel";\n`,
  }, /lean-paired\.ts:1: the helper passes on run, which is no kernel enum/u);
  seeded(unitPairingFindings, {
    "packages/kernel/test/slice.test.ts": `const kernel = await import("../dist/index.js");\n`,
  }, /slice\.test\.ts:1: reaches the kernel by a dynamic import/u);
  assert.deepEqual(unitPairingFindings(fixture({
    "packages/kernel/test/slice.test.ts": `/** import { run } from "@bpmn-lean/kernel"; */\n// import { step } from "@bpmn-lean/kernel";\n`,
  })), []);
  assert.match(unitPairingFindings(fixture({ "packages/kernel/test/lean-paired.ts": null })).join("\n"), /G16: read no packages\/kernel\/test\/lean-paired\.ts/u);
});

holdsItsGround("guard 24 (justified rules)", justifiedRuleFindings, {
  "packages/kernel/src/feature/flow.ts": `// The frozen evaluator orders the arrivals this way.\nexport function gateway(state) { return state; }\n`,
}, /rule justified by "frozen evaluator"/u);

test("guard 24 accepts a past result cited beside a BPMN clause or register identifier", () => {
  assert.deepEqual(justifiedRuleFindings(fixture({
    "packages/kernel/src/feature/flow.ts": `// BPMN 2.0.2 §13.5.6; the retained baselines agree.\nexport function gateway(state) { return state; }\n`,
  })), []);
  assert.deepEqual(justifiedRuleFindings(fixture({
    "packages/kernel/src/feature/flow.ts": `// CIB-EXT-0020, and the baseline agrees.\nexport function gateway(state) { return state; }\n`,
  })), []);
});

test("guard 18 fails above a budget, on an unbudgeted type and on no sites", () => {
  assert.deepEqual([...tsMatchSiteCounts(clean)], [["ElementTag", 1], ["WorkTag", 1]]);
  assert.deepEqual(fanOutFindings(new Map([["ElementTag", 1]]), { ElementTag: 1 }), []);
  assert.deepEqual(fanOutFindings(new Map([["ElementTag", 2]]), { ElementTag: 1 }), ["G18: 2 match sites on ElementTag, above its budget of 1"]);
  assert.match(fanOutFindings(new Map([["NewTag", 1]]), {})[0] ?? "", /no site budget/u);
  assert.match(fanOutFindings(new Map(), {})[0] ?? "", /read no guarded match sites/u);
});

test("guard 18 limits a commit outside kernel-shape to eight modules, a pair counting once", () => {
  const paired = Array.from({ length: 9 }, (_, index) => [`Kernel/Feature/F${index}.lean`, `packages/kernel/src/feature/f${index}.ts`]).flat();
  const within = Array.from({ length: 8 }, (_, index) => [`Kernel/Feature/F${index}.lean`, `packages/kernel/src/feature/f${index}.ts`]).flat();
  assert.deepEqual(commitScopeFindings([{ sha: "a".repeat(40), subject: "feat(kernel): small", files: within }]), []);
  assert.deepEqual(commitScopeFindings([{ sha: "a".repeat(40), subject: "feat(kernel-shape): wide", files: paired }]), []);
  assert.match(commitScopeFindings([{ sha: "a".repeat(40), subject: "feat(kernel): wide", files: paired }])[0] ?? "", /changes 9 kernel modules, above 8/u);
  assert.match(commitScopeFindings([])[0] ?? "", /read no commits/u);
});

test("guard 21 fails on a missing row, entry or fixture and on a decode failure, and passes when both kernels decode", () => {
  const decodes = { typeScript: () => null, lean: () => null };
  assert.deepEqual(shapeSufficiencyFindings(clean.root, decodes), []);
  const missingFixture = fixture({ "packages/kernel/test/fixtures/rows/PC-CF-02.json": null });
  assert.match(shapeSufficiencyFindings(missingFixture.root, decodes).join("\n"), /G21 PC-CF-02: fixture PC-CF-02\.json is missing/u);
  const missingEntry = fixture({ "docs/kernel/ROW-TRACEABILITY-MAP.md": "| PC-JOURNEY-01 | n/a | - | x |\n" });
  assert.match(shapeSufficiencyFindings(missingEntry.root, decodes).join("\n"), /G21 PC-CF-02: no traceability entry/u);
  assert.match(shapeSufficiencyFindings(clean.root, { typeScript: () => "bad", lean: () => null }).join("\n"), /does not decode in the TypeScript kernel: bad/u);
  assert.match(shapeSufficiencyFindings(clean.root, { typeScript: () => null, lean: () => "bad" }).join("\n"), /does not decode in the Lean kernel: bad/u);
  assert.match(shapeSufficiencyFindings(emptyFixture().root, decodes)[0] ?? "", /read no coverage target rows/u);
});

// A generic decodable program copied to every row would pass a decode-only check while proving nothing about the row.
test("guard 21 refuses a row fixture that does not carry the IL members its traceability entry names", () => {
  assert.deepEqual(rowFixtureFindings(clean.root), []);
  const generic = fixture({ "packages/kernel/test/fixtures/rows/PC-CF-02.json": `{"kind": "parallel"}\n` });
  assert.deepEqual(rowFixtureFindings(generic.root), ["G21 PC-CF-02: fixture PC-CF-02.json carries no GatewayKind.exclusive, Flow.condition"]);
  const malformed = fixture({ "packages/kernel/test/fixtures/rows/PC-CF-02.json": "{\n" });
  assert.match(rowFixtureFindings(malformed.root)[0] ?? "", /G21 PC-CF-02: fixture PC-CF-02\.json is not JSON/u);
  assert.match(rowFixtureFindings(emptyFixture().root)[0] ?? "", /read no coverage target rows/u);
});

test("the structural guards of kernel-structure.ts reject seeded violations and fail on empty inputs", () => {
  const seededTree = fixture({
    "Kernel/Hooks.lean": `module\nimport all Kernel.Step\n-- "bpmn-2.0.2-private"\ndef p := "bpmn-2.0.2-private"\n`,
    "Kernel/Step.lean": `module\n${"def x := 1\n".repeat(650)}`,
    "Kernel/Feature/Huge.lean": `module\n${"def y := 1\n".repeat(1300)}`,
    "packages/kernel/src/index.ts": `export * from "./run.js";\n`,
  });
  const shape = shapeFindings(seededTree.root).join("\n");
  assert.match(shape, /Kernel\/Step\.lean: \d+ nonblank lines, above Step's 600/u);
  assert.match(shape, /Kernel\/Feature\/Huge\.lean: \d+ nonblank lines, above 1,200/u);
  assert.match(shape, /Kernel\/Hooks\.lean: import all outside Laws/u);
  assert.match(shape, /index\.ts: export \*/u);
  assert.match(profileLiteralFindings(seededTree.root).join("\n"), /profile identifier bpmn-2\.0\.2-private/u);
  assert.match(pairingFindings(fixture({ "packages/kernel/src/feature/orphan.ts": "export const o = 1;\n" }).root).join("\n"), /TypeScript module without a Lean pair: feature\/orphan/u);
  assert.notDeepEqual(structureInputFindings(emptyFixture()), [], "an empty tree must fail the structural input check");
  assert.deepEqual(structureInputFindings(clean), []);
});

const tree = loadTree();

for (const [name, guard] of [
  ["guard 1", closedDispatchFindings],
  ["guard 2", noCatchAllFindings],
  ["guard 3", mirrorEnumerationFindings],
  ["guard 6", proofPlacementFindings],
  ["guard 9", shapeLimitFindings],
  ["guard 12", refusalTestFindings],
  ["guard 13", singleEntryFindings],
  ["guard 14", discoveryFindings],
  ["guard 15 (options)", kernelOptionFindings],
  ["guard 15 (rebuild model)", rebuildFindings],
  ["guard 17", effectWriterFindings],
  ["guard 19", fieldLivenessFindings],
  ["guard 20", refusalParityFindings],
  ["guard 23 (structural inputs)", structureInputFindings],
  ["guard 11 (bounded wire numbers)", boundedNumberFindings],
  ["guard 24", justifiedRuleFindings],
  ["guard 16 (unit cases through the Lean-paired helper)", unitPairingFindings],
] as const) {
  test(`the tree passes ${name}`, () => assert.deepEqual(guard(tree), []));
}

test("the tree stays within the guard 18 site budgets and the commit-scope rule", () => {
  assert.deepEqual([...fanOutFindings(tsMatchSiteCounts(tree)), ...commitScopeFindings(branchCommits())], []);
});

// Two retained-evidence commits of about 1,100 files each overflowed the 1 MiB buffer of the history read (2026-11-11,
// `spawnSync git ENOBUFS`): a commit that touches no kernel file must not grow what guard 18 reads.
test("guard 18 reads only kernel paths, so a large commit outside the kernel never overflows its history read", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kernel-guard-history-"));
  roots.push(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  git("init", "-q");
  git("config", "user.email", "guard@example.invalid");
  git("config", "user.name", "guard");
  writeFileSync(path.join(root, "README.md"), "fixture\n");
  git("add", ".");
  git("commit", "-q", "-m", "chore: epoch");
  const epoch = git("rev-parse", "HEAD").trim();
  mkdirSync(path.join(root, "evidence"));
  for (let i = 0; i < 16_000; i += 1) writeFileSync(path.join(root, "evidence", `retained-evidence-of-a-long-scenario-name-${String(i).padStart(5, "0")}.json`), "");
  git("add", ".");
  git("commit", "-q", "-m", "chore(evidence): retained evidence");
  mkdirSync(path.join(root, "Kernel"));
  writeFileSync(path.join(root, "Kernel", "Flow.lean"), "-- fixture\n");
  git("add", ".");
  git("commit", "-q", "-m", "feat(kernel): one module");
  assert.deepEqual(branchCommits(root, epoch).map((commit) => [commit.subject, commit.files]), [
    ["feat(kernel): one module", ["Kernel/Flow.lean"]],
  ]);
});

test("the tree passes guard 21: every row has a fixture that carries its traced members", () => {
  assert.deepEqual(rowFixtureFindings(tree.root), []);
});

test("the reports print without blocking", (t) => {
  const lines = reportLines(tree, branchCommits());
  assert.ok(lines.some((line) => line.startsWith("shape edits on this branch")));
  for (const line of lines) t.diagnostic(line);
});
