/**
 * The cases of the opposite-key-order build (KD7): every discovered scenario the reader admits, as one `kernelRun --batch`
 * case, a host-view run for a single-instance scenario and a population run for a population scenario, and the
 * TypeScript kernel's answer to a case as text. Both kernels run the same cases, so each build is compared with its own
 * language's normal build on identical inputs (`opposite-key-order.test.ts`, `opposite-key-order.integration-test.ts`).
 *
 * Run as a program, each step in its own process, so no process holds discovery's heap and a corpus of answers at once
 * (together they passed the lane's 2,048 MiB memory brake, 2026-11-24):
 * - `key-order-cases.ts cases <cases.json>` writes the cases;
 * - `[node --import ./opposite-key-order.ts] key-order-cases.ts digests <cases.json> <digests.json>` writes the sha256 of
 *   each answer of the kernel it loads, releasing each answer once hashed, with whether that kernel's scope order is
 *   reversed (`scopeOrderReversed`), so a substitution that did not take is never read as agreement, and the published
 *   scope identities the answers break (`scopeIdentityBreaches`), read here because this step reads every answer once;
 * - `[...] key-order-cases.ts answers <cases.json> <answers.json> <index>...` writes the whole answers of the named cases,
 *   which a comparison reads only for a case whose digests differ.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { compareScopeOccurrenceId, rootScope, runHostView, runPopulation } from "@bpmn-lean/kernel";
import type { ScopeOccurrenceId } from "@bpmn-lean/kernel";
import { withScriptResults } from "@bpmn-lean/temporal-host/testing";
import type { JsonValue } from "@bpmn-lean/temporal-host/host";

import { populationStepDigests } from "./population-digest.ts";
import { populationPrograms } from "./population-programs.ts";
import { DiscoveredKind, discoverScenarios, scenarioKernelInput } from "./scenario-discovery.ts";
import { scriptTimeoutMs } from "./pipeline-target-support.ts";

/** One case: the scenario it runs, by its path, and the `kernelRun --batch` case that runs it. */
export type KeyOrderCase = Readonly<{
  scenario: string;
  batch: Readonly<{ entry: "hostView"; program: unknown; scenario: unknown }> |
    Readonly<{ entry: "population"; sources: readonly unknown[]; scenario: unknown; digests: readonly string[] }>;
}>;

const wireValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

/**
 * Every discovered scenario the reader admits, in discovery order. A Script Task's result is the input the host
 * evaluator records once (`withScriptResults`), as in the behavior oracle; a scenario whose source the reader refuses
 * reaches no kernel and is left out.
 */
export async function keyOrderCases(): Promise<KeyOrderCase[]> {
  const cases: KeyOrderCase[] = [];
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind === DiscoveredKind.PopulationScenario) {
      const sources = await populationPrograms(scenario.relativePath, scenario.document);
      cases.push({ scenario: scenario.relativePath, batch: wireValue({
        entry: "population", sources, scenario: scenario.document, digests: populationStepDigests(scenario.document.steps),
      }) as KeyOrderCase["batch"] });
      continue;
    }
    const input = await scenarioKernelInput(scenario.relativePath, scenario.document.bpmn, scenario.document.profile);
    if (input.kind === "refused") continue;
    const program = wireValue(input.program);
    const document = withScriptResults(program as JsonValue, wireValue(scenario.document) as JsonValue, { timeoutMs: scriptTimeoutMs });
    cases.push({ scenario: scenario.relativePath, batch: { entry: "hostView", program, scenario: wireValue(document) } });
  }
  return cases;
}

/** The TypeScript kernel's whole answer to a case, as the text a comparison reads byte for byte. */
export function typeScriptAnswer(batch: KeyOrderCase["batch"]): string {
  switch (batch.entry) {
    case "hostView":
      return JSON.stringify(runHostView(batch.program, batch.scenario));
    case "population":
      return JSON.stringify(runPopulation(batch.sources, batch.scenario, batch.digests));
  }
}

/**
 * What the `digests` step writes: each case's scenario and its answer's sha256, in case order, and the published scope
 * identities the answers break.
 */
export type KeyOrderDigests = Readonly<{
  scopeOrderReversed: boolean; scenarios: readonly string[]; digests: readonly string[]; scopeIdentityBreaches: readonly string[];
}>;

/**
 * The published scope identities `answer` breaks (PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md, "State
 * observation"): in each state observation it holds, at any depth, a scope key published twice, or a scope other than a
 * called instance's root whose activation names no occurrence, being below 1.
 */
export function scopeIdentityBreaches(answer: unknown): string[] {
  const breaches: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record["kind"] === "state" && Array.isArray(record["scopes"])) {
      const keys = (record["scopes"] as ReadonlyArray<Record<string, unknown>>).map((entry) => entry["scope"] as Record<string, unknown>);
      const texts = keys.map((key) => JSON.stringify(key));
      for (const [index, text] of texts.entries()) {
        if (texts.indexOf(text) !== index) breaches.push(`published twice: ${text}`);
        const key = keys[index] as Record<string, unknown>;
        if (key["role"] !== "processInstance" && !(Number(key["activation"]) >= 1)) breaches.push(`no occurrence: ${text}`);
      }
    }
    for (const field of Object.values(record)) visit(field);
  };
  visit(answer);
  return breaches;
}

/**
 * Whether the loaded kernel orders a scope occurrence before the root: never in the normal order, which puts an ancestor
 * first. The key is a child of the root in the kernel's canonical key text (`state/key.ts`).
 */
export const scopeOrderReversed = (): boolean => compareScopeOccurrenceId(rootScope, "1:a#0/" as ScopeOccurrenceId) > 0;

const readCases = async (casesPath: string): Promise<KeyOrderCase[]> => JSON.parse(await readFile(casesPath, "utf8")) as KeyOrderCase[];

if (import.meta.main) {
  const [command, casesPath, outPath, ...indexes] = process.argv.slice(2);
  if (casesPath === undefined) throw new TypeError("usage: key-order-cases.ts cases|digests|answers <cases.json> [<out.json> <index>...]");
  switch (command) {
    case "cases": {
      const cases = await keyOrderCases();
      if (!cases.some((one) => one.batch.entry === "hostView") || !cases.some((one) => one.batch.entry === "population")) {
        throw new Error("discovery found no cases of a required kind");
      }
      await writeFile(casesPath, JSON.stringify(cases), "utf8");
      break;
    }
    case "digests": {
      if (outPath === undefined) throw new TypeError("digests needs <digests.json>");
      const cases = await readCases(casesPath);
      const breaches: string[] = [];
      const digests = cases.map((one) => {
        const answer = typeScriptAnswer(one.batch);
        breaches.push(...scopeIdentityBreaches(JSON.parse(answer)).map((breach) => `${one.scenario}: ${breach}`));
        return createHash("sha256").update(answer).digest("hex");
      });
      const written: KeyOrderDigests = {
        scopeOrderReversed: scopeOrderReversed(), scenarios: cases.map((one) => one.scenario), digests, scopeIdentityBreaches: breaches,
      };
      await writeFile(outPath, JSON.stringify(written), "utf8");
      break;
    }
    case "answers": {
      if (outPath === undefined) throw new TypeError("answers needs <answers.json>");
      const cases = await readCases(casesPath);
      await writeFile(outPath, `[${indexes.map((index) => typeScriptAnswer((cases[Number(index)] as KeyOrderCase).batch)).join(",")}]`, "utf8");
      break;
    }
    default:
      throw new TypeError(`unknown step ${String(command)}`);
  }
}
