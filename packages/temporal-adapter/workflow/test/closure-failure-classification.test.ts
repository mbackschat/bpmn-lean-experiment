import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

test("Workflow closure and native firing failures preserve committed state and never rearm", async () => {
  const probe = fileURLToPath(new URL("./closure-failure-classification-probe.ts", import.meta.url));
  const { NODE_TEST_CONTEXT: _runnerContext, ...environment } = process.env;
  const result = await promisify(execFile)(process.execPath, [
    "--experimental-test-module-mocks", "--test", "--test-reporter=tap", probe,
  ], { timeout: 20_000, env: environment });
  assert.match(result.stdout, /# pass 7\b/u);
});
