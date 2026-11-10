/**
 * Locks the BPMN 2.0.2 schema table (`packages/bpmn-source/src/bpmn-2.0.2-schema-table.json`) to its generator, so
 * the reader's `source.schema` check reads exactly the pinned OMG schemas. The schemas are external; their absence
 * fails this guard.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { projectRoot, renderTable, tablePath } from "./bpmn-schema-table.ts";

test("the committed schema table is the generator's output", () => {
  assert.equal(readFileSync(path.join(projectRoot, tablePath), "utf8"), renderTable(),
    "run node scripts/bpmn-schema-table.ts --write");
});
