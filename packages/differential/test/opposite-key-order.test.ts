/**
 * The opposite-key-order build of the TypeScript kernel (KD7, promise row 810): the storage order of a scope-keyed map
 * never reaches an output. Every discovered scenario the reader admits (`key-order-cases.ts`) runs through the built
 * kernel twice: once as built, and once in a process that loads `opposite-key-order.ts` first, which substitutes the
 * kernel's `state/key-order.js` so every scope-led key order is reversed. Each scenario's whole answer, its trace, host
 * views and result, must be byte-identical, compared by sha256; a case whose digests differ is run again whole in both
 * builds and listed by scenario and first differing path, never adjusted away. Such a difference is a reader that takes
 * an order from storage, which must read a declared order instead (an order position, a declared sort key). The
 * opposite run must report its scope order reversed, so a substitution that did not take fails instead of agreeing.
 * Each step is its own process (`key-order-cases.ts`), so this one holds only digests. The Lean kernel's build is
 * `opposite-key-order.integration-test.ts`.
 *
 * The same pass checks every answer's published scopes in both builds: within one state observation no scope identity
 * is published twice, and each but a called instance's root names an occurrence (PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md,
 * "State observation"; the hand-built witnesses are `packages/kernel/test/scope-publication-identity.test.ts`). The behavior
 * oracle holds the Lean kernel's answers to the TypeScript kernel's.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { firstValueDisagreement } from "@bpmn-lean/differential";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { runCommand } from "../../../scripts/run-command.ts";
import type { KeyOrderDigests } from "./key-order-cases.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const here = (file: string): string => fileURLToPath(new URL(file, import.meta.url));

/** How many differing cases are run again whole to name their first differing path. */
const namedDifferences = 5;

/** One step of `key-order-cases.ts` in its own process, in the opposite-key-order build when `opposite`. */
async function step(opposite: boolean, args: readonly string[]): Promise<void> {
  await runCommand(process.execPath, [...(opposite ? ["--import", here("./opposite-key-order.ts")] : []), here("./key-order-cases.ts"), ...args], {
    cwd: projectRoot, env: process.env, timeoutMs: pipelineTestTimeoutMs(),
  });
}

test("the TypeScript kernel's answers are byte-identical with every scope-led key order reversed and name each scope once", {
  timeout: pipelineTestTimeoutMs(),
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-opposite-key-order-"));
  const file = (name: string): string => path.join(directory, name);
  const read = async <Value>(name: string): Promise<Value> => JSON.parse(await readFile(file(name), "utf8")) as Value;
  try {
    await step(false, ["cases", file("cases.json")]);
    await step(false, ["digests", file("cases.json"), file("normal.json")]);
    await step(true, ["digests", file("cases.json"), file("opposite.json")]);
    const [normal, opposite] = [await read<KeyOrderDigests>("normal.json"), await read<KeyOrderDigests>("opposite.json")];
    assert.equal(normal.scopeOrderReversed, false, "the normal build orders an ancestor first");
    assert.equal(opposite.scopeOrderReversed, true, "the opposite-key-order build did not take: its scope order is the normal one");
    assert.deepEqual([normal.scopeIdentityBreaches, opposite.scopeIdentityBreaches], [[], []], "a published scope identity is broken");
    assert.ok(normal.digests.length > 0 && opposite.digests.length === normal.digests.length, "the builds ran different case lists");
    const differing = normal.digests.flatMap((digest, index) => digest === opposite.digests[index] ? [] : [index]);
    const named = differing.slice(0, namedDifferences).map(String);
    if (named.length > 0) {
      await step(false, ["answers", file("cases.json"), file("normal-answers.json"), ...named]);
      await step(true, ["answers", file("cases.json"), file("opposite-answers.json"), ...named]);
    }
    const [expected, reversed] = named.length === 0 ? [[], []]
      : [await read<unknown[]>("normal-answers.json"), await read<unknown[]>("opposite-answers.json")];
    const differences = differing.map((index, at) => {
      const scenario = normal.scenarios[index] ?? String(index);
      if (at >= named.length) return scenario;
      const first = firstValueDisagreement(expected[at], reversed[at], "answer");
      return `${scenario}: ${first === null ? "the same value, written differently" : JSON.stringify(first)}`;
    });
    assert.deepEqual(differences, [], `storage order reached ${String(differing.length)} of ${String(normal.digests.length)} answers`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
