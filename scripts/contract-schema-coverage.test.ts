import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { compareCanonicalStrings } from "./contract-artifacts.ts";
import {
  declaredEnumValues,
  isRecord,
  reachableDiscriminators,
} from "./schema-structure.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * The projection guard is one-directional: it validates the artifacts that exist, so a semantic
 * variant with no registered artifact can be added to the code enums while both closed wire schemas
 * silently reject it. This closes that direction — every enum member must have a schema branch —
 * and is the reason the interrupting boundary Timer's operation and node kinds were absent from both
 * schemas while every other gate passed.
 */
test("gives every semantic operation and checked node kind a wire-schema branch", async () => {
  const contract = await readFile(
    `${projectRoot}/packages/semantic-core/src/semantic-process-contract.ts`,
    "utf8",
  );
  const cases = [
    {
      schema: "semantic-process.schema.json",
      kinds: declaredEnumValues(contract, "SemanticOperationKind"),
      anchor: "awaitBoundedUserTask",
    },
    {
      schema: "checked-process.schema.json",
      kinds: declaredEnumValues(contract, "CheckedNodeKind"),
      anchor: "timerBoundaryEvent",
    },
  ];
  for (const { schema, kinds, anchor } of cases) {
    // Anti-vacuity: an earlier version of this guard read an enum that was in scope only as a type,
    // so it compared an empty list and passed while both schemas were in fact missing a branch.
    assert.ok(kinds.length > 10, `${schema}: enum extraction returned ${kinds.length} members`);
    assert.ok(kinds.includes(anchor), `${schema}: enum extraction lost ${anchor}`);
    const document: unknown = JSON.parse(
      await readFile(`${projectRoot}/contracts/schemas/${schema}`, "utf8"),
    );
    assert.ok(isRecord(document));
    const definitions = document.$defs;
    assert.ok(isRecord(definitions));
    const discriminators = reachableDiscriminators(
      Object.fromEntries(
        Object.entries(document).filter(([key]) => key !== "$defs"),
      ),
      definitions,
    );
    const absent = kinds
      .filter((kind) => !discriminators.has(kind))
      .sort(compareCanonicalStrings);
    assert.deepEqual(absent, [], `${schema} has no branch for these kinds`);
  }
});
