import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("binds the ordinal-0006 migration name to its exact bytes", async () => {
  const directory = fileURLToPath(new URL("../migrations", import.meta.url));
  const names = await readdir(directory);
  assert.equal(names.length, 1);
  const name = names[0];
  assert.match(name ?? "", /^0006_recovery-leases__[0-9a-f]{64}\.sql$/u);
  const bytes = await readFile(`${directory}/${name}`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(name, `0006_recovery-leases__${digest}.sql`);
});
