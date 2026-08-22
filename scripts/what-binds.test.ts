import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BindingKind,
  bindingsFor,
  loadBindingCorpus,
  ownerMeasurement,
  presentBindingCorpusCandidates,
  reportLines,
  searchTerms,
} from "./what-binds.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("binding corpus excludes tracked paths deleted by an unstaged rename", () => {
  assert.deepEqual(
    presentBindingCorpusCandidates(
      [
        "scripts/kept.test.ts",
        "scripts/renamed-away.test.ts",
        "packages/semantic-core/README.md",
      ],
      (candidate) => candidate !== "scripts/renamed-away.test.ts",
    ),
    ["scripts/kept.test.ts", "packages/semantic-core/README.md"],
  );
});

/**
 * Contract: the enumerator answers "which executable guards and registries already constrain this
 * path?" mechanically, before an edit begins.
 *
 * The oracle is deliberately historical. Each fixture below reproduces one constraint that was
 * missed while planning the interrupting-boundary-Timer capsule, so a regression here means the
 * enumerator would again fail to surface a bound that already existed in the repository.
 */

test("search terms widen from the exact path to every ancestor tree", () => {
  assert.deepEqual(
    searchTerms("examples/temporal-mvp/event-based-gateway-timer-wins.json"),
    [
      "examples/temporal-mvp/event-based-gateway-timer-wins.json",
      "event-based-gateway-timer-wins.json",
      "examples/temporal-mvp",
      "examples",
    ],
  );
});

test("search terms of a root-level path stop at the path itself", () => {
  assert.deepEqual(searchTerms("CLAUDE.md"), ["CLAUDE.md"]);
});

test("pure binding resolution rejects traversal before matching", () => {
  for (const target of [
    "platform/../packages/bpmn-source/src/compile.ts",
    "packages/semantic-core/../../platform/apps/web/src/main.tsx",
  ]) assert.throws(() => bindingsFor(target, []), /canonical repository-relative path/u, target);
});

// Historical miss: a second example configuration was planned for one profile while an oracle
// asserted exact multiset equality between profiles and example files. The tree term is what
// reaches it, because the planned file did not exist yet and no guard could name it.
test("reports the guard that constrains a not-yet-existing artifact through its tree", () => {
  const bindings = bindingsFor(
    "examples/temporal-mvp/activity-boundary-timer-deadline-wins.json",
    [
      {
        path: "packages/temporal-adapter/testkit/test/product-example-configs.test.ts",
        text: 'const exampleRoot = "examples/temporal-mvp";',
      },
      {
        path: "packages/semantic-core/test/unrelated.test.ts",
        text: "const graph = compile(program);",
      },
    ],
  );

  assert.deepEqual(bindings, [
    {
      kind: BindingKind.Guard,
      path: "packages/temporal-adapter/testkit/test/product-example-configs.test.ts",
      matchedTerm: "examples/temporal-mvp",
    },
  ]);
});

// Historical miss: a new scenario family directory was created while a reachability guard required
// every directory under the tree to be linked from its registry README.
// Historical miss: a guard pinning the exact text of root commands was invisible because its name
// ends in `-test.ts` rather than `.test.ts`, so a change to those commands was planned without it
// and only failed later, in a lane the focused gates did not run.
test("reports a guard whatever supported test suffix its name carries", () => {
  const bindings = bindingsFor("package.json", [
    {
      path: "scripts/ordinary.test.ts",
      text: 'const root = read("package.json");',
    },
    {
      path: "scripts/product-two.platform-test.ts",
      text: 'const root = read("package.json");',
    },
    {
      path: "packages/temporal-adapter/testkit/test/hosted.temporal-test.ts",
      text: 'const root = read("package.json");',
    },
  ]);

  assert.deepEqual(bindings.map(({ kind, path: file }) => ({ kind, path: file })), [
    { kind: BindingKind.Guard, path: "packages/temporal-adapter/testkit/test/hosted.temporal-test.ts" },
    { kind: BindingKind.Guard, path: "scripts/ordinary.test.ts" },
    { kind: BindingKind.Guard, path: "scripts/product-two.platform-test.ts" },
  ]);
});

test("reports both the tree guard and the registry a new artifact family must reach", () => {
  const bindings = bindingsFor(
    "scenarios/activity-boundary-timer/deadline-wins-scenario.json",
    [
      {
        path: "scripts/document-reviewability.test.ts",
        text: 'const artifactRegistries = ["profiles", "scenarios"] as const;',
      },
      {
        path: "scenarios/README.md",
        text: "This registry lists every scenario family.",
      },
      {
        path: "docs/PLAN.md",
        text: "Ordered work mentioning scenarios in prose only.",
      },
    ],
  );

  assert.deepEqual(bindings, [
    {
      kind: BindingKind.Guard,
      path: "scripts/document-reviewability.test.ts",
      matchedTerm: "scenarios",
    },
    {
      kind: BindingKind.Registry,
      path: "scenarios/README.md",
      matchedTerm: "scenarios",
    },
  ]);
});

test("prefers the most specific matching term for each binding", () => {
  const bindings = bindingsFor("packages/semantic-core/src/runtime.ts", [
    {
      path: "packages/semantic-core/test/runtime.test.ts",
      text: 'import { step } from "../src/runtime.ts";\nconst root = "packages/semantic-core";',
    },
  ]);

  assert.deepEqual(bindings, [
    {
      kind: BindingKind.Guard,
      path: "packages/semantic-core/test/runtime.test.ts",
      matchedTerm: "runtime.ts",
    },
  ]);
});

test("an unconstrained path reports no binding rather than a nearest guess", () => {
  assert.deepEqual(
    bindingsFor("packages/semantic-core/src/fresh-owner.ts", [
      { path: "scripts/document-reviewability.test.ts", text: "docs only" },
    ]),
    [],
  );
});

// Historical miss: the module a plan named as a change site had five lines of headroom, and the
// ceiling surfaced only after editing began.
test("measures remaining headroom for a hand-written source owner", () => {
  const source = `${"const x = 1;\n".repeat(595)}\n\n`;
  for (const target of [
    "packages/semantic-core/src/runtime.ts",
    "platform/apps/web/src/runtime.tsx",
    "packages/semantic-core/src/runtime.mts",
  ]) {
    assert.deepEqual(
      ownerMeasurement(target, source),
      { path: target, lines: 595 },
    );
  }
});

test("a non-source or absent target has no owner measurement", () => {
  assert.equal(ownerMeasurement("scenarios/a-scenario.json", "{}\n"), null);
  assert.equal(ownerMeasurement("packages/semantic-core/src/gone.ts", null), null);
});

test("the report names the owner ceiling and every binding with its total", () => {
  assert.deepEqual(
    reportLines({
      target: "packages/semantic-core/src/runtime.ts",
      owner: { path: "packages/semantic-core/src/runtime.ts", lines: 595 },
      bindings: [
        {
          kind: BindingKind.Guard,
          path: "packages/semantic-core/test/runtime.test.ts",
          matchedTerm: "runtime.ts",
        },
        {
          kind: BindingKind.Registry,
          path: "packages/semantic-core/README.md",
          matchedTerm: "packages/semantic-core",
        },
      ],
    }),
    [
      "TARGET packages/semantic-core/src/runtime.ts",
      "OWNER packages/semantic-core/src/runtime.ts 595/600 nonblank, 5 lines before the review target",
      'GUARD packages/semantic-core/test/runtime.test.ts (matched "runtime.ts")',
      'REGISTRY packages/semantic-core/README.md (matched "packages/semantic-core")',
      "BINDINGS 1 guard, 1 registry",
    ],
  );
});

test("the report of an unconstrained target says so explicitly", () => {
  assert.deepEqual(
    reportLines({
      target: "docs/NEW-PROPOSAL.md",
      owner: null,
      bindings: [],
    }),
    [
      "TARGET docs/NEW-PROPOSAL.md",
      "BINDINGS 0 guards, 0 registries",
    ],
  );
});

// Locks the enumerator against the live repository rather than a synthetic corpus. Both trees below
// carry a real reachability or multiset oracle today; a refactor that renames either constant must
// keep this path discoverable at planning time.
test("the live corpus binds a new artifact in each historically missed tree", async () => {
  const corpus = await loadBindingCorpus();
  const scenarioGuards = bindingsFor(
    "scenarios/not-yet-created/deadline-wins-scenario.json",
    corpus,
  ).filter((binding) => binding.kind === BindingKind.Guard).map(({ path }) => path);
  const exampleGuards = bindingsFor(
    "examples/temporal-mvp/not-yet-created.json",
    corpus,
  ).filter((binding) => binding.kind === BindingKind.Guard).map(({ path }) => path);

  assert.equal(
    scenarioGuards.includes("scripts/document-reviewability.test.ts"),
    true,
    "the scenario-registry reachability guard must be discoverable from a new scenario path",
  );
  assert.equal(
    exampleGuards.includes(
      "packages/temporal-adapter/testkit/test/product-example-configs.test.ts",
    ),
    true,
    "the product-example oracle must be discoverable from a new example path",
  );
});

test("the live corpus routes scripts work through its task-oriented README", async () => {
  const corpus = await loadBindingCorpus();
  const registries = bindingsFor("scripts/semantic-review-packet.ts", corpus)
    .filter((binding) => binding.kind === BindingKind.Registry)
    .map(({ path }) => path);

  assert.equal(
    registries.includes("scripts/README.md"),
    true,
    "scripts work must surface its task-oriented entry-point guide",
  );
});

test("the command reports implementation maps and fails closed for an unknown root path", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/what-binds.ts", "packages/engine-api/src/index.ts", "scripts/what-binds.ts"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.match(
    output,
    /MAP ENGINE-CONTRACTS-SOURCE docs\/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP\.md/u,
  );
  assert.match(
    output,
    /MAP TEMPORAL-HOSTING docs\/TEMPORAL-HOSTING-IMPLEMENTATION-MAP\.md/u,
  );
  assert.match(
    output,
    /MAP ASSURANCE-ADOPTION docs\/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP\.md/u,
  );
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/what-binds.ts", "root-new-engine.ts"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
    }),
  );
  for (const target of [
    "platform/../packages/bpmn-source/src/compile.ts",
    "packages/semantic-core/../../platform/apps/web/src/main.tsx",
  ]) {
    assert.throws(
      () => execFileSync(process.execPath, ["scripts/what-binds.ts", target], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: "pipe",
      }),
      /canonical repository-relative path/u,
      target,
    );
  }
});
