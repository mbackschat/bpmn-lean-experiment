import assert from "node:assert/strict";
import test from "node:test";

import { cibSevenReleaseBuildDirectory } from "./cibseven-maven-build.ts";

test("isolates complete CIB compilation output by exact engine release", () => {
  const runner = "/repo/runners/cibseven";
  assert.equal(
    cibSevenReleaseBuildDirectory(runner, "2.2.0"),
    "/repo/runners/cibseven/target/verify-2.2.0",
  );
  assert.equal(
    cibSevenReleaseBuildDirectory(runner, "2.0.0"),
    "/repo/runners/cibseven/target/verify-2.0.0",
  );
  assert.notEqual(
    cibSevenReleaseBuildDirectory(runner, "2.2.0"),
    cibSevenReleaseBuildDirectory(runner, "2.0.0"),
  );
  assert.throws(
    () => cibSevenReleaseBuildDirectory(runner, "latest"),
    /exact semantic version/,
  );
});
