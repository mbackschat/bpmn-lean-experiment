/**
 * The host restrictions the Product 2 About page discloses (`model-corpus/host-restrictions.ts`) against their owners:
 * the codes against the host's refused capacity bounds, the engine API's cross-deployment code and the kernel status
 * map's Host restrictions table, each limit against the host's capacity table, and each issue against the status map.
 * Product 2 cannot import the host, so this is the guard that keeps its restated values from drifting.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { engineCrossDeploymentCallCode } from "@bpmn-lean/engine-api";
import { CapacityBound, capacityCode, chainCapacity } from "@bpmn-lean/temporal-host/host";

import { hostRestrictions } from "../../../model-corpus/host-restrictions.ts";

type StatusMapRow = Readonly<{ codes: ReadonlyArray<string>; issue: number }>;

/** The Host restrictions table of the kernel status map: each row's codes and its issue number. */
async function statusMapRows(): Promise<ReadonlyArray<StatusMapRow>> {
  const map = await readFile(new URL("../../../docs/kernel/KERNEL-STATUS-MAP.md", import.meta.url), "utf8");
  const start = map.indexOf("\n### Host restrictions\n");
  assert.notEqual(start, -1, "the status map must keep its Host restrictions section");
  const section = map.slice(start, map.indexOf("\n## ", start));
  const rows = section.split("\n").filter((line) => /^\| PC-/u.test(line)).map((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    const issue = /\[#(\d+)\]/u.exec(cells[4] ?? "")?.[1];
    assert.ok(issue !== undefined, `status-map row without an issue: ${line}`);
    return { codes: [...(cells[3] ?? "").matchAll(/`(host\.[\w.]+)`/gu)].map((match) => match[1] ?? ""), issue: Number(issue) };
  });
  assert.ok(rows.length > 0, "the Host restrictions table must have rows");
  return rows;
}

const capacityCodes = Object.values(CapacityBound).map(capacityCode);

test("discloses exactly the refused capacity bounds and the status map's host restrictions", async () => {
  const mapCodes = (await statusMapRows()).flatMap(({ codes }) => codes);
  assert.ok(mapCodes.includes(engineCrossDeploymentCallCode), "the status map lists the engine API's cross-deployment code");
  const codes = hostRestrictions.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length, "one row per code");
  assert.deepEqual(codes.toSorted(), [...new Set([...capacityCodes, ...mapCodes])].sort());
});

test("every disclosed limit equals the host's capacity table", () => {
  for (const { code, limit } of hostRestrictions) {
    if (limit === null) continue;
    assert.ok(Object.hasOwn(chainCapacity, limit.capacity), `${code}: ${limit.capacity} is not a capacity key`);
    assert.equal(limit.value, chainCapacity[limit.capacity as keyof typeof chainCapacity], `${code}: ${limit.capacity}`);
  }
  // A refused bound's code names its key: `program` reads `programBytes`, `updates` reads `updatesPerRun`.
  for (const bound of Object.values(CapacityBound)) {
    const limit = hostRestrictions.find(({ code }) => code === capacityCode(bound))?.limit;
    assert.ok(limit !== null && limit !== undefined, `${bound} must state its limit`);
    assert.ok([bound, `${bound}Bytes`, `${bound}PerRun`].includes(limit.capacity), `${bound} must not read ${limit.capacity}`);
  }
});

test("every row names the issue the status map tracks its restriction under", async () => {
  const rows = await statusMapRows();
  const capacityRow = rows.find(({ codes }) => codes.some((code) => capacityCodes.includes(code)));
  assert.ok(capacityRow !== undefined, "the status map tracks the capacity bounds");
  for (const { code, issue } of hostRestrictions) {
    const tracking: StatusMapRow = rows.find(({ codes }) => codes.includes(code)) ?? capacityRow;
    assert.equal(issue, tracking.issue, code);
  }
});
