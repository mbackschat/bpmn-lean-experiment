/**
 * Guard 21's decoders (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation): every row fixture the
 * traceability map decodes strictly in the built TypeScript kernel and in `kernelRun --decode`, and is exactly what
 * `scripts/row-fixtures.ts` generates. The fast half, which needs no build, is `rowFixtureFindings` in
 * scripts/kernel-guards.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { decodeProgram, parseStrict } from "@bpmn-lean/kernel";

import { existingRowFixtures, shapeSufficiencyFindings, type RowDecoders } from "../../../scripts/kernel-guards-refusal.ts";
import { generateRowFixtures, rowFixtureDirectory, rowFixtureDrift } from "../../../scripts/row-fixtures.ts";
import { decodeLeanPrograms } from "./kernel-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";

function typeScriptRefusal(fixture: string): string | null {
  const parsed = parseStrict(readFileSync(fixture, "utf8"));
  if (!parsed.ok) return parsed.refusal;
  const decoded = decodeProgram(parsed.value);
  return decoded.ok ? null : decoded.refusal;
}

/** Both kernels' decoders over `fixtures`, the Lean answers read in one `kernelRun` process. */
async function decoders(fixtures: ReadonlyArray<string>): Promise<RowDecoders> {
  const lean = await decodeLeanPrograms(fixtures);
  return {
    typeScript: typeScriptRefusal,
    lean: (fixture) => {
      const refusal = lean.get(fixture);
      if (refusal === undefined) throw new Error(`kernelRun --decode gave no answer for ${fixture}`);
      return refusal;
    },
  };
}

const code = (refusal: string | null): string | null => refusal === null ? null : refusal.split(":")[0] ?? refusal;

// Guard 23: a seeded undecodable fixture must fail in each kernel, or a decoder that accepts everything passes the guard.
test("guard 21 fails a seeded undecodable row fixture in each kernel and passes the canonical program in both", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "row-fixtures-"));
  try {
    const canonical = await readFile(path.join(projectRoot, "packages/kernel/test/fixtures/simple-boolean.program.json"), "utf8");
    const program = JSON.parse(canonical) as Record<string, unknown>;
    const withoutOptions = { ...program };
    delete withoutOptions["options"];
    const seeded: ReadonlyArray<readonly [string, string, string]> = [
      ["PC-SEED-01", "canonical.json", canonical],
      ["PC-SEED-02", "unknown-field.json", JSON.stringify({ ...program, unexpected: 1 })],
      ["PC-SEED-03", "missing-field.json", JSON.stringify(withoutOptions)],
      ["PC-SEED-04", "repeated-key.json", canonical.replace(/^\{/u, `{"options": null,`)],
    ];
    const rows = path.join(root, "packages", "kernel", "test", "fixtures", "rows");
    await mkdir(rows, { recursive: true });
    await mkdir(path.join(root, "docs", "kernel"), { recursive: true });
    await writeFile(path.join(root, "docs", "PRACTICAL-CIB7-COVERAGE-TARGET.md"),
      seeded.map(([row]) => `| \`${row}\` | outcome | - | open | x |\n`).join(""));
    await writeFile(path.join(root, "docs", "kernel", "ROW-TRACEABILITY-MAP.md"),
      seeded.map(([row, file]) => `| ${row} | ${file} | Program.identity, ProfileOptions.evaluator | x |\n`).join(""));
    for (const [, file, text] of seeded) await writeFile(path.join(rows, file), text);

    const fixtures = existingRowFixtures(root);
    const decode = await decoders(fixtures);
    const answers = fixtures.map((fixture) => [path.basename(fixture), code(decode.typeScript(fixture)), code(decode.lean(fixture))]);
    assert.deepEqual(answers, [
      ["canonical.json", null, null],
      ["unknown-field.json", "codec.unknownField", "codec.unknownField"],
      ["missing-field.json", "codec.malformed", "codec.malformed"],
      ["repeated-key.json", "codec.duplicateField", "codec.duplicateField"],
    ]);
    const findings = shapeSufficiencyFindings(root, decode);
    for (const row of ["PC-SEED-02", "PC-SEED-03", "PC-SEED-04"]) {
      for (const kernel of ["TypeScript", "Lean"]) {
        assert.ok(findings.some((line) => line.startsWith(`G21 ${row}:`) && line.includes(`does not decode in the ${kernel} kernel`)),
          `${row} fails in the ${kernel} kernel`);
      }
    }
    assert.ok(!findings.some((line) => line.startsWith("G21 PC-SEED-01:")), "the canonical program passes");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the tree passes guard 21: every row has a fixture that decodes strictly in both kernels", async () => {
  assert.deepEqual(shapeSufficiencyFindings(projectRoot, await decoders(existingRowFixtures(projectRoot))), []);
});

// Guard 23 for the generator's check: a fixture edited by hand, deleted or added beside the generated ones must fail.
test("the row fixture check fails on a stale, missing or extra fixture", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "row-fixtures-drift-"));
  try {
    const expected = new Map([["PC-A-01.json", "{}\n"], ["PC-A-02.json", "[]\n"], ["PC-A-03.json", "null\n"]]);
    for (const [name, text] of expected) await writeFile(path.join(directory, name), text);
    await writeFile(path.join(directory, "sources.json"), "{}\n");
    assert.deepEqual(rowFixtureDrift(expected, directory), []);
    await writeFile(path.join(directory, "PC-A-01.json"), "{ }\n");
    await rm(path.join(directory, "PC-A-02.json"));
    await writeFile(path.join(directory, "PC-A-09.json"), "{}\n");
    assert.deepEqual(rowFixtureDrift(expected, directory), ["PC-A-01.json is stale", "PC-A-02.json is missing", "PC-A-09.json is not generated"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the committed row fixtures are exactly the generator's output", async () => {
  assert.deepEqual(rowFixtureDrift(await generateRowFixtures(), path.join(projectRoot, rowFixtureDirectory)), []);
});
