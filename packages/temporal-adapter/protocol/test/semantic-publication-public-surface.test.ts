import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL(
  "../../../..",
  import.meta.url,
));

test("compiles a neutral protocol consumer without Node ambient types", () => {
  const result = spawnSync(
    `${project}/node_modules/.bin/tsc`,
    [
      "-p",
      `${project}/packages/temporal-adapter/protocol/test/semantic-publication-neutral-consumer.tsconfig.json`,
    ],
    { cwd: project, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
