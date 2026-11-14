/**
 * Holds the kernel status map's "Absent surface" table to the refusal codes the Lean admission modules and
 * `Kernel.AdmissionRegistry` can return. The table is the public list of what admission refuses; it drifted from the
 * modules twice (`work.configuredTask` and `flow.concurrentInterference`, final reconciliation 2026-11-14).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { loadTree } from "./kernel-guard-scan.ts";
import { admissionCodes } from "./kernel-guards-refusal.ts";

const statusMapPath = "docs/kernel/KERNEL-STATUS-MAP.md";
const codeForm = /`([a-z][A-Za-z]*(?:\.[A-Za-z]+)+)`/gu;

/** The codes the "Absent surface" table lists, read from its rows' second cell. */
function tabledCodes(markdown: string): Set<string> {
  const section = markdown.split("\n### Absent surface\n")[1]?.split("\n### ")[0];
  assert.ok(section !== undefined, `${statusMapPath} has no Absent surface section`);
  const rows = section.split("\n").filter((line) => line.startsWith("| [") && line.endsWith(" |"));
  assert.ok(rows.length > 0, "the Absent surface table has no module rows");
  return new Set(rows.flatMap((row) => [...(row.split(" | ")[1] ?? "").matchAll(codeForm)].map((match) => match[1]!)));
}

test("the status map's Absent surface table lists exactly the Lean admission refusal codes", () => {
  const tree = loadTree();
  const registry = (file: string): boolean => file === "Kernel/AdmissionRegistry.lean";
  const lean = new Set([...admissionCodes(tree), ...admissionCodes(tree, registry)]
    .filter(({ source }) => source.file.endsWith(".lean")).map(({ code }) => code));
  const tabled = tabledCodes(readFileSync(path.join(tree.root, statusMapPath), "utf8"));
  assert.deepEqual([...lean].filter((code) => !tabled.has(code)).sort(), [], "Lean refusal codes the table omits");
  assert.deepEqual([...tabled].filter((code) => !lean.has(code)).sort(), [], "tabled codes no Lean module returns");
});
