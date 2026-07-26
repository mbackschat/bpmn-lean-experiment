import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const verifyScriptPath = fileURLToPath(
  new URL("./verify.sh", import.meta.url),
);

test("default verification includes the focused Temporal history gate", async () => {
  const verifyScript = await readFile(verifyScriptPath, "utf8");
  const commands = verifyScript
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  assert.equal(
    commands.filter(
      (command) => command === "./scripts/pnpm.sh run test:temporal",
    ).length,
    1,
  );
});
