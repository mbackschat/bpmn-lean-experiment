/**
 * Guard 16 over the TypeScript kernel's unit cases (#108): every kernel unit test reaches the kernel through
 * `packages/kernel/test/lean-paired.ts`, which records each case it runs as a `kernelRun --batch` case with the TypeScript
 * answer. This test runs the unit suite with recording on, replays every recorded case through the Lean kernel and
 * requires Lean's answer to equal the TypeScript one, so kernel behavior that only a unit test reaches is still held to
 * Lean. A disagreement is listed with the unit test that recorded it and the first differing path, never adjusted away.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { firstValueDisagreement } from "@bpmn-lean/differential";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { runCommand } from "../../../scripts/run-command.ts";
import { runLeanKernelBatch } from "./kernel-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Recorded = Readonly<{ file: string; test: string; case: Readonly<{ entry: string }>; expected: unknown }>;

/** Cases per Lean process: bounds one process's output while keeping process start-up off the per-case cost. */
const batchSize = 500;

const unitTests = path.join(projectRoot, "packages/kernel/test");

/** Every case the unit suite records, once each, in recording order. */
async function recordedCases(directory: string): Promise<ReadonlyArray<Recorded>> {
  const files = (await readdir(unitTests)).filter((file) => file.endsWith(".test.ts")).sort();
  await mkdir(directory, { recursive: true });
  // The runner marks its own children with NODE_TEST_CONTEXT; a nested `node --test` that inherits it reports to this
  // runner instead of running its files.
  const { NODE_TEST_CONTEXT: _context, ...environment } = process.env;
  await runCommand(process.execPath, ["--test", "--test-concurrency=1", ...files.map((file) => path.join(unitTests, file))], {
    cwd: projectRoot,
    env: { ...environment, KERNEL_LEAN_PAIRS: directory },
    timeoutMs: pipelineTestTimeoutMs(),
  });
  const seen = new Set<string>();
  const cases: Recorded[] = [];
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".jsonl")).sort()) {
    for (const line of (await readFile(path.join(directory, file), "utf8")).split("\n").filter((text) => text !== "")) {
      const entry = JSON.parse(line) as Recorded;
      const key = JSON.stringify(entry.case);
      if (seen.has(key)) continue;
      seen.add(key);
      cases.push(entry);
    }
  }
  return cases;
}

/**
 * A refusal or harness error by its stable code, the first `codec.`, `population-`, `fixture-` or `batch-` token: the
 * detail after a code is each codec's own wording (Lean names `Kernel.` types, TypeScript prefixes the input it read),
 * so only the code is the contract, as in `kernel-behavior-oracle.integration-test.ts`. A message with no code is kept
 * whole behind `uncoded: `, so two different uncoded errors never compare equal.
 */
function stableCode(message: unknown): unknown {
  if (typeof message !== "string") return message;
  return /(?:codec\.[A-Za-z]+|(?:population|fixture|batch)-[a-z-]+)/u.exec(message)?.[0] ?? `uncoded: ${message}`;
}

/** A batch answer with its harness error, or its codec refusal, reduced to the stable code. */
function comparable(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null) return answer;
  const { error, answer: value } = answer as Readonly<{ error?: unknown; answer?: unknown }>;
  if (error !== undefined) return { error: stableCode(error) };
  if (typeof value === "object" && value !== null && "refusal" in value) {
    return { answer: { ...value, refusal: stableCode((value as Readonly<{ refusal: unknown }>).refusal) } };
  }
  return answer;
}

/** Each recorded case whose Lean answer differs from its TypeScript one, with the unit test and the first differing path. */
export function pairingDisagreements(cases: ReadonlyArray<Recorded>, lean: ReadonlyArray<unknown>): ReadonlyArray<string> {
  assert.equal(lean.length, cases.length, "Lean answered a different number of cases");
  return cases.flatMap((entry, index) => {
    const difference = firstValueDisagreement(comparable(entry.expected), comparable(lean[index]), "case");
    return difference === null ? [] : [
      `${entry.file} › ${entry.test} (${entry.case.entry}): ${difference.path}: TypeScript ${JSON.stringify(difference.expected)}, ` +
        `Lean ${JSON.stringify(difference.actual)}`,
    ];
  });
}

test("the Lean kernel answers every case the TypeScript kernel's unit tests run as TypeScript does", {
  timeout: pipelineTestTimeoutMs() * 2,
}, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-unit-pairs-"));
  try {
    const cases = await recordedCases(path.join(directory, "recorded"));
    const lean: unknown[] = [];
    for (let start = 0; start < cases.length; start += batchSize) {
      const batch = cases.slice(start, start + batchSize);
      const casesPath = path.join(directory, `batch-${String(start)}.json`);
      await writeFile(casesPath, JSON.stringify(batch.map((entry) => entry.case)), "utf8");
      lean.push(...await runLeanKernelBatch(casesPath, batch.length));
    }
    const entries = new Map<string, number>();
    for (const entry of cases) entries.set(entry.case.entry, (entries.get(entry.case.entry) ?? 0) + 1);
    t.diagnostic(`recorded cases ${String(cases.length)}: ${[...entries].map(([entry, count]) => `${entry} ${String(count)}`).join(", ")}`);
    assert.ok((entries.get("hostView") ?? 0) > 0 && (entries.get("decode") ?? 0) > 0, "the unit suite recorded no run or no decode");
    assert.deepEqual(pairingDisagreements(cases, lean), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Guard 23: a seeded wrong answer must be listed, or a comparison that passes everything passes.
test("the pairing comparison lists a case whose Lean answer differs", () => {
  const recorded = (expected: unknown): Recorded =>
    ({ file: "seeded.test.ts", test: "seeded", case: { entry: "evaluate" }, expected });
  assert.deepEqual(pairingDisagreements([recorded({ answer: { value: 1 } }), recorded({ answer: { value: 2 } })],
    [{ answer: { value: 1 } }, { answer: { value: 3 } }]),
  ["seeded.test.ts › seeded (evaluate): case.answer.value: TypeScript 2, Lean 3"]);
});

// Two uncoded harness errors are equal only when their messages are, or any harness failure would pass for any other.
test("the pairing comparison lists two different uncoded harness errors", () => {
  const recorded = (expected: unknown): Recorded =>
    ({ file: "seeded.test.ts", test: "seeded", case: { entry: "hostView" }, expected });
  assert.deepEqual(pairingDisagreements([recorded({ error: "stack overflow" }), recorded({ error: "codec.malformed: Program" })],
    [{ error: "out of memory" }, { error: "codec.malformed: Kernel.Program" }]),
  ["seeded.test.ts › seeded (hostView): case.error: TypeScript \"uncoded: stack overflow\", Lean \"uncoded: out of memory\""]);
});
