/**
 * The command ledger binds a command's content, never its arrival
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#message-key-correlation, engine contract (5)): a retry arrives
 * later than the command it repeats, so a step whose identifier and content equal an earlier command's answers that
 * command's resolution again whatever its logical time `at`, and a step with other content is
 * `rejected command-content-mismatch`. Every discovered population schedule that repeats a command identifier is
 * checked against that oracle, computed here from the steps without the digest, so a new replay witness joins without
 * an edit here; the later-time replay of each command kind must be among them.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runPopulation } from "@bpmn-lean/kernel";
import { canonicalJson } from "@bpmn-lean/temporal-host/host";

import { populationStepDigests } from "./population-digest.ts";
import { populationPrograms } from "./population-programs.ts";
import { DiscoveredKind, discoverScenarios } from "./scenario-discovery.ts";

type Step = Readonly<Record<string, unknown>>;
type StepResult = Readonly<{ commandId: string; resolution: unknown }>;

const commandKinds = ["broadcast", "evaluateConditions", "publish", "timerStart"];

/** A step's content: everything but its logical time. */
const content = (step: Step): string => {
  const { at: _at, ...rest } = step;
  return canonicalJson(rest);
};

test("a step's digest binds its content and not its logical time", () => {
  const broadcast = { kind: "broadcast", commandId: "c", address: { name: "S" }, variables: [] };
  const [first, later, inherited, other] = populationStepDigests([
    { ...broadcast, at: 0 }, { ...broadcast, at: 60_000 }, broadcast, { ...broadcast, address: { name: "T" } },
  ]);
  assert.equal(later, first);
  assert.equal(inherited, first);
  assert.notEqual(other, first);
});

test("a repeated command answers its recorded resolution at any later time, and one of other content is rejected", async () => {
  const laterReplays = new Set<string>();
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.PopulationScenario) continue;
    const commands = (scenario.document.steps as readonly Step[]).filter((step) => typeof step["commandId"] === "string");
    const repeats = commands.some((step, index) => commands.findIndex((other) => other["commandId"] === step["commandId"]) !== index);
    if (!repeats) continue;
    const document = scenario.document;
    const result = runPopulation(await populationPrograms(scenario.relativePath, document), document,
      populationStepDigests(document.steps)) as unknown as Readonly<{ steps: readonly StepResult[] }>;
    assert.equal(result.steps.length, commands.length, `${scenario.relativePath}: one result per command`);
    for (const [index, step] of commands.entries()) {
      const recorded = commands.findIndex((other) => other["commandId"] === step["commandId"]);
      if (recorded === index) continue;
      const where: string = `${scenario.relativePath}: command ${String(index + 1)}`;
      if (content(step) === content(commands[recorded]!)) {
        assert.deepEqual(result.steps[index]!.resolution, result.steps[recorded]!.resolution, where);
        if (step["at"] !== undefined && step["at"] !== commands[recorded]!["at"]) laterReplays.add(String(step["kind"]));
      } else {
        assert.deepEqual(result.steps[index]!.resolution, { kind: "rejected", code: "command-content-mismatch" }, where);
      }
    }
  }
  assert.deepEqual([...laterReplays].sort(), commandKinds, "a later-time replay witness of each command kind");
});
