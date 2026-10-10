import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BindingKind,
  bindingsFor,
  classifyBindings,
  loadBindingCorpus,
  ownerMeasurement,
  presentBindingCorpusCandidates,
  reportLines,
  searchTerms,
} from "./what-binds.ts";
import { EnumerationKind } from "./what-binds-source-facts.ts";
import { EvidenceKind, GuardTier } from "./what-binds-classification.ts";

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

// Import chains and imported enumeration helpers are followed through non-guard sources, so those
// must reach the corpus even though they are never reported themselves.
test("binding corpus keeps non-guard TypeScript sources for import chains and nothing else", () => {
  assert.deepEqual(
    presentBindingCorpusCandidates(
      [
        "scripts/helper.ts",
        "platform/apps/web/src/main.tsx",
        "packages/semantic-core/src/runtime.mts",
        "docs/PLAN.md",
        "scenarios/a/b.json",
        "BpmnSemantics/SemanticProcess/Execution.lean",
      ],
      () => true,
    ),
    [
      "scripts/helper.ts",
      "platform/apps/web/src/main.tsx",
      "packages/semantic-core/src/runtime.mts",
    ],
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
// reaches it, because the planned file did not exist yet and no guard could name it. The oracle must
// also enumerate that tree: a guard that only spells the directory constrains nothing about it.
test("reports the guard that constrains a not-yet-existing artifact through the tree it enumerates", () => {
  const { bindings, mentions } = classifyBindings(
    "examples/temporal-mvp/activity-boundary-timer-deadline-wins.json",
    [
      {
        path: "packages/temporal-adapter/testkit/test/product-example-configs.test.ts",
        text: 'const exampleRoot = "examples/temporal-mvp";\nconst names = await readdir(exampleRoot);',
      },
      {
        path: "packages/temporal-adapter/testkit/test/example-prose.test.ts",
        text: 'const where = "examples/temporal-mvp"; assert.ok(where);',
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
      tier: GuardTier.Scanning,
      path: "packages/temporal-adapter/testkit/test/product-example-configs.test.ts",
      evidence: {
        kind: EvidenceKind.Scan,
        enumeration: EnumerationKind.DirectoryRead,
        scope: 'root "examples/temporal-mvp"',
        via: null,
      },
    },
  ]);
  assert.deepEqual(mentions, [
    {
      path: "packages/temporal-adapter/testkit/test/example-prose.test.ts",
      evidence: { kind: EvidenceKind.Text, term: "examples/temporal-mvp" },
    },
  ]);
});

// Historical miss: a new scenario family directory was created while a reachability guard required
// every directory under the tree to be linked from its registry README.
// Historical miss: a guard pinning the exact text of root commands was invisible because its name
// ends in `-test.ts` rather than `.test.ts`, so a change to those commands was planned without it
// and only failed later, in a lane the focused gates did not run.
test("reports a guard whatever supported test suffix its name carries", () => {
  const suffixes = [
    "test",
    "platform-test",
    "temporal-test",
    "temporal-serial-test",
    "integration-test",
    "type-test",
  ];
  const bindings = bindingsFor(
    "package.json",
    suffixes.map((suffix) => ({
      path: `packages/x/test/subject.${suffix}.ts`,
      text: 'const root = read("package.json");',
    })),
  );

  assert.deepEqual(
    bindings.map(({ kind, path: file }) => ({ kind, path: file })),
    [...suffixes].sort().map((suffix) => ({
      kind: BindingKind.Guard,
      path: `packages/x/test/subject.${suffix}.ts`,
    })),
  );
});

test("reports both the tree guard and the registry a new artifact family must reach", () => {
  const { bindings, mentions } = classifyBindings(
    "scenarios/activity-boundary-timer/deadline-wins-scenario.json",
    [
      {
        path: "scripts/document-reviewability.test.ts",
        text: 'const artifactRegistries = ["profiles", "scenarios"] as const;\n' +
          "for (const registry of artifactRegistries) await readdir(registry);",
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
      tier: GuardTier.Scanning,
      path: "scripts/document-reviewability.test.ts",
      evidence: {
        kind: EvidenceKind.Scan,
        enumeration: EnumerationKind.DirectoryRead,
        scope: 'root "scenarios"',
        via: null,
      },
    },
    {
      kind: BindingKind.Registry,
      path: "scenarios/README.md",
      matchedTerm: "scenarios",
    },
  ]);
  assert.deepEqual(mentions, []);
});

test("reports the source map that claims a package's source files", () => {
  const bindings = bindingsFor(
    "packages/semantic-core/src/parallel-multi-instance-controller.ts",
    [
      {
        path: "packages/semantic-core/SOURCE-MAP.md",
        text: "This contributor map assigns source-file responsibilities.",
      },
    ],
  );

  assert.deepEqual(bindings, [
    {
      kind: BindingKind.Registry,
      path: "packages/semantic-core/SOURCE-MAP.md",
      matchedTerm: "packages/semantic-core",
    },
  ]);
});

test("a guard that names the target is a named binding even when it also enumerates its tree", () => {
  const bindings = bindingsFor("packages/semantic-core/src/runtime.ts", [
    {
      path: "packages/semantic-core/test/runtime.test.ts",
      text: 'import { step } from "../src/runtime.ts";\nconst names = await readdir("packages/semantic-core");',
    },
  ]);

  assert.deepEqual(bindings, [
    {
      kind: BindingKind.Guard,
      tier: GuardTier.Named,
      path: "packages/semantic-core/test/runtime.test.ts",
      evidence: { kind: EvidenceKind.Text, term: "runtime.ts" },
    },
  ]);
});

test("bindings list the most direct evidence first, then scanners, then registries", () => {
  const bindings = bindingsFor("packages/core/src/runtime.ts", [
    { path: "packages/core/README.md", text: "registry" },
    {
      path: "scripts/scan.test.ts",
      text: 'git(["ls-files", "--", "packages/core"]);',
    },
    {
      path: "packages/core/test/viaMiddle.test.ts",
      text: 'import { a } from "../src/middle.ts";',
    },
    {
      path: "packages/core/src/middle.ts",
      text: 'import { run } from "./runtime.ts";',
    },
    {
      path: "packages/core/test/direct.test.ts",
      text: 'import { run } from "../src/runtime.ts";',
    },
  ]);

  assert.deepEqual(bindings.map(({ kind, path: file }) => `${kind} ${file}`), [
    "GUARD packages/core/test/direct.test.ts",
    "GUARD packages/core/test/viaMiddle.test.ts",
    "GUARD scripts/scan.test.ts",
    "REGISTRY packages/core/README.md",
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
  const source = `${"const x = 1;\n".repeat(795)}\n\n`;
  for (const target of [
    "packages/semantic-core/src/runtime.ts",
    "platform/apps/web/src/runtime.tsx",
    "packages/semantic-core/src/runtime.mts",
  ]) {
    assert.deepEqual(
      ownerMeasurement(target, source),
      { path: target, lines: 795 },
    );
  }
});

test("a non-source or absent target has no owner measurement", () => {
  assert.equal(ownerMeasurement("scenarios/a-scenario.json", "{}\n"), null);
  assert.equal(ownerMeasurement("packages/semantic-core/src/gone.ts", null), null);
});

test("the report names the owner ceiling, every binding with its tier and the unbound mentions", () => {
  const result = {
    target: "packages/semantic-core/src/runtime.ts",
    owner: { path: "packages/semantic-core/src/runtime.ts", lines: 795 },
    bindings: [
      {
        kind: BindingKind.Guard,
        tier: GuardTier.Named,
        path: "packages/semantic-core/test/runtime.test.ts",
        evidence: { kind: EvidenceKind.Text, term: "runtime.ts" },
      },
      {
        kind: BindingKind.Guard,
        tier: GuardTier.Named,
        path: "packages/semantic-core/test/trace.test.ts",
        evidence: { kind: EvidenceKind.Import, via: "packages/semantic-core/src/trace.ts" },
      },
      {
        kind: BindingKind.Guard,
        tier: GuardTier.Scanning,
        path: "scripts/source-hygiene.test.ts",
        evidence: {
          kind: EvidenceKind.Scan,
          enumeration: EnumerationKind.GitListing,
          scope: 'whole repository filtered by ".ts"',
          via: null,
        },
      },
      {
        kind: BindingKind.Registry,
        path: "packages/semantic-core/README.md",
        matchedTerm: "packages/semantic-core",
      },
    ],
    mentions: [
      {
        path: "scripts/pinned-toolchain.test.ts",
        evidence: { kind: EvidenceKind.Text, term: "scripts" },
      },
    ],
  } as const;

  assert.deepEqual(reportLines(result), [
    "TARGET packages/semantic-core/src/runtime.ts",
    "OWNER packages/semantic-core/src/runtime.ts 795/800 nonblank, 5 lines before the review target",
    'GUARD[named] packages/semantic-core/test/runtime.test.ts (matched "runtime.ts")',
    'GUARD[named] packages/semantic-core/test/trace.test.ts (imports via "packages/semantic-core/src/trace.ts")',
    'GUARD[scan] scripts/source-hygiene.test.ts (git ls-files, whole repository filtered by ".ts")',
    'REGISTRY packages/semantic-core/README.md (matched "packages/semantic-core")',
    "BINDINGS 3 guards (2 named, 1 scanning), 1 registry, 1 unbound mention (not bindings)",
  ]);
  assert.deepEqual(reportLines(result, { listMentions: true }).slice(-2), [
    'MENTION scripts/pinned-toolchain.test.ts (matched "scripts")',
    "BINDINGS 3 guards (2 named, 1 scanning), 1 registry, 1 unbound mention (not bindings)",
  ]);
});

test("the report of an unconstrained target says so explicitly", () => {
  assert.deepEqual(
    reportLines({
      target: "docs/NEW-PROPOSAL.md",
      owner: null,
      bindings: [],
      mentions: [],
    }),
    [
      "TARGET docs/NEW-PROPOSAL.md",
      "BINDINGS 0 guards (0 named, 0 scanning), 0 registries, 0 unbound mentions (not bindings)",
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

type ReportedGuard = Readonly<{ tier: string; path: string; evidence: string }>;

type TargetReport = Readonly<{
  guards: ReadonlyArray<ReportedGuard>;
  mentionPaths: ReadonlyArray<string>;
  bindingsLine: string;
}>;

function runReport(args: ReadonlyArray<string>): ReadonlyMap<string, TargetReport> {
  const output = execFileSync(process.execPath, ["scripts/what-binds.ts", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const reports = new Map<string, TargetReport>();
  let current: { target: string; guards: ReportedGuard[]; mentions: string[] } | null = null;
  for (const line of output.split("\n")) {
    const target = /^TARGET (\S+)$/u.exec(line);
    const guard = /^GUARD\[(named|scan)\] (\S+) \((.*)\)$/u.exec(line);
    const mention = /^MENTION (\S+) \(/u.exec(line);
    if (target?.[1] !== undefined) {
      current = { target: target[1], guards: [], mentions: [] };
    } else if (current !== null && guard?.[1] !== undefined) {
      current.guards.push({ tier: guard[1], path: guard[2] ?? "", evidence: guard[3] ?? "" });
    } else if (current !== null && mention?.[1] !== undefined) {
      current.mentions.push(mention[1]);
    } else if (current !== null && line.startsWith("BINDINGS ")) {
      reports.set(current.target, {
        guards: current.guards,
        mentionPaths: current.mentions,
        bindingsLine: line,
      });
    }
  }
  return reports;
}

function reportOf(
  reports: ReadonlyMap<string, TargetReport>,
  target: string,
): TargetReport {
  const report = reports.get(target);
  assert.notEqual(report, undefined, `no report for ${target}`);
  return report as TargetReport;
}

// AA-14: the report for `Execution.lean` listed 19 guards of which twelve assert nothing about it, a
// guard appeared for `strict-json.ts` only because its text contained `scripts`, the decisive
// contract-artifact oracle was missing because it reaches `strict-json.ts` by import, and
// `.integration-test.ts` guards were not recognised at all. The expectations below are the guards
// those targets are actually bound by, read from the guards rather than from the old output.
test("the live report gives each AA-14 path its actual oracles and no word-only guard", () => {
  const targets = [
    "BpmnSemantics/SemanticProcess/Execution.lean",
    "scripts/strict-json.ts",
    "packages/semantic-core/src/internal-choice-schedule.ts",
  ] as const;
  const reports = runReport(targets);
  const bound = (target: string): ReadonlyArray<string> =>
    reportOf(reports, target).guards.map(({ path }) => path);
  const tierOf = (target: string, guardPath: string): string | undefined =>
    reportOf(reports, target).guards.find(({ path }) => path === guardPath)?.tier;

  const lean = targets[0];
  for (const scanner of [
    "scripts/lean-source-contracts.test.ts",
    "scripts/source-hygiene.test.ts",
    "scripts/lean-module-cost.test.ts",
  ]) assert.equal(tierOf(lean, scanner), "scan", scanner);
  assert.equal(tierOf(lean, "scripts/lean-import-boundaries.test.ts") !== undefined, true);
  for (const wordOnly of [
    "scripts/activity-occurrence-join.test.ts",
    "scripts/internal-commutation-census.test.ts",
    "scripts/runtime-collection-removal-completeness.test.ts",
    "scripts/execution-publication-contract-coverage.test.ts",
    "scripts/semantic-review-packet.test.ts",
    "scripts/evaluation-distribution.platform-test.ts",
    "scripts/ui-quality-boundary.platform-test.ts",
    "scripts/test-feedback-efficiency.platform-test.ts",
    "packages/differential/test/parallel-scope-command-comparison.test.ts",
  ]) assert.equal(bound(lean).includes(wordOnly), false, `${wordOnly} names other Lean files only`);

  const json = targets[1];
  assert.deepEqual(
    reportOf(reports, json).guards.find(({ path }) => path === "scripts/contract-artifacts.test.ts"),
    {
      tier: "named",
      path: "scripts/contract-artifacts.test.ts",
      evidence: 'imports via "scripts/contract-artifacts.ts"',
    },
  );
  assert.equal(tierOf(json, "packages/temporal-adapter/testkit/test/product-example-configs.test.ts"), "named");
  assert.equal(tierOf(json, "scripts/source-hygiene.test.ts"), "scan");
  for (const wordOnly of [
    "scripts/pinned-toolchain.test.ts",
    "scripts/live-demo.test.ts",
    "scripts/project-tags.test.ts",
    "scripts/run-command.test.ts",
    "platform/apps/web/test/distribution.test.ts",
  ]) assert.equal(bound(json).includes(wordOnly), false, `${wordOnly} only shares the word scripts`);

  const schedule = targets[2];
  for (const oracle of [
    "packages/semantic-core/test/internal-choice-schedule.test.ts",
    "packages/semantic-core/test/parallel-scope-effect.test.ts",
    "packages/differential/test/parallel-scope-admission-lean-core.integration-test.ts",
  ]) assert.equal(tierOf(schedule, oracle), "named", oracle);
  for (const wordOnly of [
    "packages/temporal-adapter/testkit/test/runnable-mvp.test.ts",
    "scripts/capsule-cost.test.ts",
    "scripts/contributor-setup.test.ts",
  ]) assert.equal(bound(schedule).includes(wordOnly), false, `${wordOnly} only shares the word packages`);

  for (const target of targets) {
    const leanModule = target.replace(/\.lean$/u, "").replaceAll("/", ".");
    const basename = target.slice(target.lastIndexOf("/") + 1);
    for (const { tier, path: guardPath, evidence } of reportOf(reports, target).guards) {
      if (tier === "scan") {
        assert.match(evidence, /^(?:git ls-files|directory read|glob), /u, `${guardPath}: ${evidence}`);
      } else {
        const matched = /^matched "(.*)"$/u.exec(evidence)?.[1];
        assert.equal(
          matched === undefined || [target, basename, leanModule].includes(matched),
          true,
          `${guardPath} is named only through an ancestor word: ${evidence}`,
        );
      }
    }
    assert.match(reportOf(reports, target).bindingsLine, /unbound mentions? \(not bindings\)$/u);
  }
});

test("unbound mentions are counted by default and listed only on request", () => {
  const target = "scripts/strict-json.ts";
  const quiet = reportOf(runReport([target]), target);
  const verbose = reportOf(runReport(["--mentions", target]), target);
  const counted = Number(/ (\d+) unbound mentions?/u.exec(verbose.bindingsLine)?.[1]);

  assert.deepEqual(quiet.mentionPaths, []);
  assert.equal(counted > 0, true, "scripts is a word nearly every guard mentions");
  assert.equal(verbose.mentionPaths.length, counted);
  assert.equal(
    verbose.mentionPaths.some((mentioned) => quiet.guards.some(({ path }) => path === mentioned)),
    false,
    "a guard is either a binding or a mention, never both",
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
