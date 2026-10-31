import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  leanBodyEditBounds, leanBodyEditDefaultBound, leanExposedDefinitionAllowance, leanFanoutBounds, leanFanoutDefaultBound, leanFanoutKernel,
  leanHiddenEditBounds, leanHiddenEditDefaultBound, leanHiddenRewriteBounds, leanOpeningImportBound, leanOwnerDecidedRises,
} from "./lean-fanout-bounds.ts";
import {
  brokenDebtRecords, needlessRaises, settledOwnerDecisions, unexplainedAllowanceRises, unexplainedBoundRises, undecidedSettingRises,
  type LeanFanoutBound,
} from "./lean-fanout.ts";

// A bound raised to fit the graph instead of root-causing the growth protects nothing: the hidden-edit bounds of an
// uncommitted conversion were regenerated from a graph 10,830 `import all` lines heavier than needed before anyone asked
// why (process ledger, Finding 84). A rise above a base commit therefore states its reason in the entry, which the review
// packet shows the reviewer; the string itself proves nothing.
test("a bound or allowance above a base commit's needs a stated reason", () => {
  const previous = [{ module: "Pkg.Hub", bound: 40 }, { module: "Pkg.Wide", bound: 30 }];
  const current = [
    { module: "Pkg.Hub", bound: 40 },
    { module: "Pkg.Wide", bound: 31 },
    { module: "Pkg.New", bound: 12 },
    { module: "Pkg.Explained", bound: 50, raised: "fixture reduces the body (probe 2026-10-28)", raisedFrom: 40 },
    { module: "Pkg.Shrunk", bound: 9 },
  ];
  assert.deepEqual(unexplainedBoundRises(previous, current, 10), [
    "Pkg.Wide: bound 31 exceeds the base's 30 without a stated reason and the bound it rose from",
    "Pkg.New: bound 12 exceeds the base's 10 without a stated reason and the bound it rose from",
  ]);
  assert.deepEqual(unexplainedBoundRises([{ module: "Pkg.Hub", bound: 40 }], [{ module: "Pkg.Hub", bound: 41, raised: " " }], 10),
    ["Pkg.Hub: bound 41 exceeds the base's 40 without a stated reason and the bound it rose from"], "a blank reason states nothing");
  assert.deepEqual(unexplainedAllowanceRises({ "Pkg.Hub": { names: ["kept"] } }, {
    "Pkg.Hub": { names: ["kept", "added"] },
    "Pkg.New": { names: ["first"] },
    "Pkg.Explained": { names: ["first"], raised: "a Decidable instance reduces it" },
  }), [
    "Pkg.Hub: allows added beyond the base without a stated reason",
    "Pkg.New: allows first beyond the base without a stated reason",
  ]);
});

// A stated reason records why a bound rose and, in `raisedFrom`, the bound it rose from. A regression's reason goes
// once the bound falls back to `raisedFrom`; judging that against base commits instead erased every reason the moment
// its branch merged, while the bounds stayed high (cold review, 2026-10-28).
test("a stated reason needs the bound it rose from, and goes once the bound falls back to it", () => {
  assert.deepEqual(unexplainedBoundRises([], [
    { module: "Pkg.Unanchored", bound: 40, raised: "a reason without its starting bound" },
    { module: "Pkg.Anchored", bound: 40, raised: "a reason", raisedFrom: 30 },
  ], 10), ["Pkg.Unanchored: bound 40 exceeds the base's 10 without a stated reason and the bound it rose from"]);
  assert.deepEqual(needlessRaises([
    { module: "Pkg.Back", bound: 30, raised: "shrunk back by the conversion", raisedFrom: 30 },
    { module: "Pkg.Still", bound: 31, raised: "still above", raisedFrom: 30 },
    { module: "Pkg.Unanchored", bound: 31, raised: "no starting bound" },
  ]), ["Pkg.Back", "Pkg.Unanchored"]);
});

// A debt record must not vanish while its bound stays high, nor start from an invented bound: either would hide a
// regression the base still shows (cold review, 2026-10-28).
test("a debt record stays until its bound falls back, and starts from the base's bound", () => {
  const previous = [{ module: "Pkg.Debt", bound: 40, raised: "known regression", raisedFrom: 30 }, { module: "Pkg.Old", bound: 20 }];
  assert.deepEqual(brokenDebtRecords(previous, [
    { module: "Pkg.Debt", bound: 40 },
    { module: "Pkg.Old", bound: 25, raised: "rose again", raisedFrom: 22 },
  ], 10), [
    "Pkg.Debt: drops the record of its rise from 30 while its bound stays at 40",
    "Pkg.Old: records a rise from 22, but the base's bound is 20",
  ]);
  assert.deepEqual(brokenDebtRecords(previous, [
    { module: "Pkg.Debt", bound: 30 },
    { module: "Pkg.Old", bound: 25, raised: "rose again", raisedFrom: 20 },
  ], 10), []);
});

// A module the base already records as risen may rise further: its debt still starts where the main line's bound was,
// so the base's own `raisedFrom` carries on, but the further rise states its own reason. Requiring the base's current
// bound as `raisedFrom` made a rise that both base commits judge impossible to record (2026-10-29).
test("a further rise keeps the debt record's start and states its own reason", () => {
  const previous = [{ module: "Pkg.Debt", bound: 40, raised: "known regression", raisedFrom: 30 }];
  assert.deepEqual(brokenDebtRecords(previous, [{ module: "Pkg.Debt", bound: 50, raised: "a second cause", raisedFrom: 30 }], 10), []);
  assert.deepEqual(brokenDebtRecords(previous, [{ module: "Pkg.Debt", bound: 50, raised: "known regression", raisedFrom: 30 }], 10), [
    "Pkg.Debt: rises further from 40 to 50 with the reason of its earlier rise",
  ]);
  assert.deepEqual(brokenDebtRecords(previous, [{ module: "Pkg.Debt", bound: 50, raised: "a second cause", raisedFrom: 40 }], 10), [
    "Pkg.Debt: drops the record of its rise from 30 while its bound stays at 50",
  ]);
});

// A default or total rises only by an owner decision, recorded in its own commit before the rise, so that an agent
// cannot approve its own rise in the commit making it (owner decision B, 2026-10-29).
test("a default or total rises only to the extent an owner decision committed before the rise allows", () => {
  const decision = { setting: "leanOpeningImportBound", from: 100, to: 500, decision: "Owner decision X (2026-10-29): why" };
  assert.deepEqual(undecidedSettingRises([
    ["leanOpeningImportBound", 100, 400],
    ["leanFanoutDefaultBound", 100, 110],
  ], [decision], [decision]), [
    "leanFanoutDefaultBound: 110 exceeds the base's 100; a default or total rises only by owner decision",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 100, 600]], [decision], [decision]), [
    "leanOpeningImportBound: 600 exceeds the base's 100 beyond the owner decision's 500",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 200, 400]], [decision], [decision]), [
    "leanOpeningImportBound: 400 exceeds the base's 200; a default or total rises only by owner decision",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 100, 400]], [decision], []), [
    "leanOpeningImportBound: the owner decision for its rise from 100 must be committed before the rise",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 100, 400]], [{ ...decision, decision: " " }],
    [{ ...decision, decision: " " }]), [
    "leanOpeningImportBound: 400 exceeds the base's 100; a default or total rises only by owner decision",
  ]);
});

test("an owner decision goes once the main line carries its rise", () => {
  const decision = { setting: "leanOpeningImportBound", from: 100, to: 500, decision: "Owner decision X (2026-10-29): why" };
  assert.deepEqual(settledOwnerDecisions([decision], { leanOpeningImportBound: 100 }), []);
  assert.deepEqual(settledOwnerDecisions([decision], {}), []);
  assert.deepEqual(settledOwnerDecisions([decision], { leanOpeningImportBound: 500 }), [
    "leanOpeningImportBound: the main line already carries the owner decision's 500, so its record must go",
  ]);
});

test("every recorded owner decision is still needed", async () => {
  const mainLine = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8" }).trim();
  assert.deepEqual(settledOwnerDecisions(leanOwnerDecidedRises, await committedBounds(mainLine)), []);
});

/** The commits a rise is judged against: the last commit, and the merge base with `origin/main`, so the check still holds once the rise is committed. */
function baseCommits(): string[] {
  const mergeBase = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8" }).trim();
  return [...new Set(["HEAD", mergeBase])];
}

async function committedBounds(commit: string) {
  const committed = execFileSync("git", ["show", `${commit}:scripts/lean-fanout-bounds.ts`], { encoding: "utf8" });
  const file = path.join(mkdtempSync(path.join(tmpdir(), "lean-fanout-bounds-")), "lean-fanout-bounds.ts");
  writeFileSync(file, committed);
  return import(pathToFileURL(file).href);
}

test("no recorded bound, allowance or kernel entry rises above a base commit's without a stated reason", async () => {
  const committedDecisions = (await committedBounds("HEAD")).leanOwnerDecidedRises ?? [];
  for (const commit of baseCommits()) {
    const previous = await committedBounds(commit);
    // Every ratchet takes both checks from one table, so none can miss one: the body-edit ratchet once lacked the
    // debt-record check (stage-1 carry review, 2026-10-31). A ratchet's first recording is its baseline, so a ratchet
    // the base lacks has nothing to rise above.
    const ratchets: Array<[ReadonlyArray<LeanFanoutBound> | undefined, ReadonlyArray<LeanFanoutBound>, number]> = [
      [previous.leanFanoutBounds, leanFanoutBounds, previous.leanFanoutDefaultBound],
      [previous.leanHiddenEditBounds, leanHiddenEditBounds, previous.leanHiddenEditDefaultBound],
      [previous.leanHiddenRewriteBounds, leanHiddenRewriteBounds, 0],
      [previous.leanBodyEditBounds, leanBodyEditBounds, previous.leanBodyEditDefaultBound],
    ];
    const findings = [
      ...ratchets.flatMap(([before, now, defaultBound]) => before === undefined ? []
        : [...unexplainedBoundRises(before, now, defaultBound), ...brokenDebtRecords(before, now, defaultBound)]),
      ...(previous.leanExposedDefinitionAllowance === undefined ? []
        : unexplainedAllowanceRises(previous.leanExposedDefinitionAllowance, leanExposedDefinitionAllowance)),
      ...leanFanoutKernel.filter((module) => !previous.leanFanoutKernel.includes(module))
        .map((module) => `${module}: joins the kernel, which exempts it from the interface ratchet; only an owner decision adds one`),
    ];
    findings.push(...undecidedSettingRises([
      ["leanFanoutDefaultBound", previous.leanFanoutDefaultBound, leanFanoutDefaultBound],
      ["leanHiddenEditDefaultBound", previous.leanHiddenEditDefaultBound, leanHiddenEditDefaultBound],
      ["leanBodyEditDefaultBound", previous.leanBodyEditDefaultBound ?? leanBodyEditDefaultBound, leanBodyEditDefaultBound],
      ["leanOpeningImportBound", previous.leanOpeningImportBound ?? leanOpeningImportBound, leanOpeningImportBound],
    ], leanOwnerDecidedRises, committedDecisions));
    assert.deepEqual(findings, [], commit);
  }
});

test("no stated reason outlives the rise it explains", () => {
  const findings = [leanFanoutBounds, leanHiddenEditBounds, leanHiddenRewriteBounds, leanBodyEditBounds]
    .flatMap((bounds) => needlessRaises(bounds)).map((module) => `${module}: its stated reason outlives the rise, so it must go`);
  assert.deepEqual(findings, []);
});
