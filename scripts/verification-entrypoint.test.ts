import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const verifyScriptPath = fileURLToPath(
  new URL("./verify.sh", import.meta.url),
);

async function readVerificationCommands(): Promise<readonly string[]> {
  const verifyScript = await readFile(verifyScriptPath, "utf8");
  return verifyScript
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function assertCommandOccursOnce(command: string): Promise<void> {
  const commands = await readVerificationCommands();
  assert.equal(
    commands.filter((candidate) => candidate === command).length,
    1,
  );
}

test("default verification includes the focused Temporal history gate", async () => {
  await assertCommandOccursOnce("./scripts/pnpm.sh run test:temporal");
});

test("default verification compiles the checked-source proof experiment", async () => {
  await assertCommandOccursOnce(
    "lake build checkCheckedSourceRelationExperiment",
  );
});
