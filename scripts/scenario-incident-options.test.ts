/**
 * A scenario's CIB runner incident options must agree with its profile. `options.incidents.cancellable` tells the CIB
 * runner to offer `cancelIncidentProcess` (`ScenarioProtocol.Options`), while the kernel offers it exactly when the
 * profile selects the option `incidentProcessCancellation` (CIB-OP-0009). Runner options are declared by the scenario,
 * never by a profile check in the runner (ARCHITECTURE-SPEC "Contracts"), so a scenario that contradicts its profile
 * gets CIB evidence the kernel can never match: seen in `terminate-containing-region` (two schedules),
 * `transaction-cancel-mixed/refund-incident-retried` and `compensation-handler-failures/technical-failure-retried`,
 * 2026-11-10.
 *
 * The relations that select the option are read from the reader's own derivation (`kernelProfileOptions` in
 * `packages/bpmn-source/src/kernel-reader/wire.ts`), so this guard keeps no second copy of the mapping.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { differentialDiscoveryRoots } from "./pipeline-budget.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const wirePath = "packages/bpmn-source/src/kernel-reader/wire.ts";
const scenarioSuffix = "scenario.json";

type Json = Record<string, unknown>;

/** The relation identifiers whose selection turns `incidentProcessCancellation` on, from the reader's derivation. */
export function cancellationRelations(wireSource: string): ReadonlyArray<string> {
  const selector = /incidentProcessCancellation:\s*selects\(([^)]*)\)/u.exec(wireSource);
  if (selector === null) throw new Error(`${wirePath} derives incidentProcessCancellation by no selects(...) call`);
  const ids = [...selector[1]!.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!);
  if (ids.length === 0) throw new Error(`${wirePath} selects incidentProcessCancellation by no relation`);
  return ids;
}

/** A finding for a scenario whose declared cancellability differs from what its profile's relations select. */
export function incidentOptionFinding(
  relativePath: string,
  scenario: Json,
  profileRelations: ReadonlyArray<string>,
  selecting: ReadonlyArray<string>,
): string | null {
  const incidents = (scenario["options"] as Json | undefined)?.["incidents"] as Json | undefined;
  if (incidents === undefined) return null;
  const selected = selecting.some((id) => profileRelations.includes(id));
  return incidents["cancellable"] === selected
    ? null
    : `${relativePath}: options.incidents.cancellable is ${String(incidents["cancellable"])}, profile ${String(scenario["profile"])} selects ${String(selected)}`;
}

async function scenarioFiles(relativeRoot: string): Promise<string[]> {
  const entries = await readdir(path.join(projectRoot, relativeRoot), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) return scenarioFiles(relativePath);
    return entry.isFile() && entry.name.endsWith(scenarioSuffix) ? [relativePath] : [];
  }));
  return nested.flat();
}

async function profileRelations(profile: string): Promise<ReadonlyArray<string>> {
  const document = JSON.parse(await readFile(path.join(projectRoot, "profiles", profile, "profile.json"), "utf8")) as Json;
  return ((document["bpmn"] as Json | undefined)?.["relationships"] ?? []) as ReadonlyArray<string>;
}

test("every scenario's incident options agree with the cancellation its profile selects", async () => {
  const selecting = cancellationRelations(await readFile(path.join(projectRoot, wirePath), "utf8"));
  const files = (await Promise.all(differentialDiscoveryRoots.map(scenarioFiles))).flat().sort();
  const relations = new Map<string, ReadonlyArray<string>>();
  const findings: string[] = [];
  let declaring = 0;
  for (const relativePath of files) {
    const scenario = JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8")) as Json;
    if (((scenario["options"] as Json | undefined)?.["incidents"]) === undefined) continue;
    declaring += 1;
    const profile = String(scenario["profile"]);
    if (!relations.has(profile)) relations.set(profile, await profileRelations(profile));
    const finding = incidentOptionFinding(relativePath, scenario, relations.get(profile)!, selecting);
    if (finding !== null) findings.push(finding);
  }
  assert.ok(declaring > 0, "no discovered scenario declares incident options");
  assert.deepEqual(findings, []);
});

test("the guard reports a seeded contradiction and fails closed when the derivation moves", () => {
  const selecting = cancellationRelations('incidentProcessCancellation: selects("CIB-OP-0009"),');
  assert.deepEqual(selecting, ["CIB-OP-0009"]);
  const declared = (cancellable: boolean): Json => ({ profile: "p", options: { incidents: { cancellable } } });
  assert.equal(incidentOptionFinding("s", declared(true), ["CIB-OP-0009"], selecting), null);
  assert.equal(incidentOptionFinding("s", declared(false), [], selecting), null);
  assert.notEqual(incidentOptionFinding("s", declared(false), ["CIB-OP-0009"], selecting), null);
  assert.notEqual(incidentOptionFinding("s", declared(true), [], selecting), null);
  assert.equal(incidentOptionFinding("s", { profile: "p" }, ["CIB-OP-0009"], selecting), null);
  assert.throws(() => cancellationRelations("incidentProcessCancellation: true,"), /no selects/u);
});
