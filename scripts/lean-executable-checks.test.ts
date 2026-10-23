/**
 * Completeness of the executable Lean checks.
 *
 * A converted conformance check is a `def name : Bool`, and a `*ChecksMain` driver runs only the
 * checks its modules list, so a check missing from its module's list would compile and never run.
 * Kernel decision had no such gap, because every theorem was checked by elaborating it (owner pilot
 * decision 2026-10-23, docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#proposed-contract).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { leanCodeWithoutComments, leanDeclarationPrefix, leanHeader } from "./lean-source-analysis.ts";

type ChecksModule = Readonly<{ path: string; source: string }>;

/** Each way a driver's modules leave a `Bool` check unrun or misnamed, as `<module>: <reason>` lines. */
export function executableCheckFindings(
  driver: ChecksModule,
  modules: readonly ChecksModule[],
): readonly string[] {
  const driverCode = leanCodeWithoutComments(driver.source);
  return modules.flatMap(({ path, source }) => {
    const code = leanCodeWithoutComments(source);
    const namespace = /^namespace BpmnSemantics\.(\S+)$/mu.exec(code)?.[1];
    const listBodies = [...code.matchAll(
      new RegExp(`^${leanDeclarationPrefix()}def (\\w+) : List \\(String × Bool\\) := \\[\\n([\\s\\S]*?)^\\]$`, "gmu"))];
    const lists = listBodies.map((match) => match[1]!);
    const checks = [...code.matchAll(new RegExp(`^${leanDeclarationPrefix()}def (\\w+) : Bool :=`, "gmu"))]
      .map((match) => match[1]!);
    const entries = listBodies.flatMap((match) => [...match[2]!.matchAll(/^ {2}\("(\w+)", (\w+)\),?$/gmu)])
      .map((match) => [match[1]!, match[2]!] as const);
    const listed = entries.map(([, check]) => check);
    return [
      ...(namespace === undefined || lists.length === 0 ? [`${path}: declares no check list`] : []),
      ...lists.filter((list) => !driverCode.includes(`${namespace}.${list}`))
        .map((list) => `${path}: the driver does not run ${list}`),
      ...checks.filter((check) => !listed.includes(check)).map((check) => `${path}: ${check} is in no check list`),
      ...entries.filter(([label, check]) => label !== check || !checks.includes(check))
        .map(([label, check]) => `${path}: entry ("${label}", ${check}) names no check of its own`),
      ...listed.filter((check, index) => listed.indexOf(check) !== index)
        .map((check) => `${path}: ${check} is listed twice`),
    ];
  });
}

function checksDrivers(): readonly string[] {
  return readdirSync("BpmnSemantics").filter((name) => name.endsWith("ChecksMain.lean"))
    .map((name) => `BpmnSemantics/${name}`);
}

test("every executable check is listed once and every list runs in its driver", () => {
  const drivers = checksDrivers();
  assert.ok(drivers.length > 0, "no executable checks driver was discovered");
  for (const driverPath of drivers) {
    const driver = { path: driverPath, source: readFileSync(driverPath, "utf8") };
    const modules = leanHeader(driver.source).imports.filter(({ module }) => module.startsWith("BpmnSemantics."))
      .map(({ module }) => `${module.replaceAll(".", "/")}.lean`)
      .map((path) => ({ path, source: readFileSync(path, "utf8") }));
    assert.deepEqual(executableCheckFindings(driver, modules), [], driverPath);
  }
});

test("reports an unlisted check, a mislabelled entry and an unrun list", () => {
  const module = {
    path: "BpmnSemantics/ExampleConformance.lean",
    source: [
      "namespace BpmnSemantics.ExampleConformance",
      "def first : Bool := decide (1 = 1)",
      "def second : Bool := decide (2 = 2)",
      "def checks : List (String × Bool) := [",
      "  (\"other\", first)",
      "]",
      "end BpmnSemantics.ExampleConformance",
    ].join("\n"),
  };
  const driver = { path: "BpmnSemantics/ExampleChecksMain.lean", source: "import BpmnSemantics.ExampleConformance\n" };
  assert.deepEqual(executableCheckFindings(driver, [module]), [
    "BpmnSemantics/ExampleConformance.lean: the driver does not run checks",
    "BpmnSemantics/ExampleConformance.lean: second is in no check list",
    "BpmnSemantics/ExampleConformance.lean: entry (\"other\", first) names no check of its own",
  ]);
});
