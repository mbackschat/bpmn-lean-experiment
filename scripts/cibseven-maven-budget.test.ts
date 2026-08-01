import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultCibSevenMavenTimeoutMs,
  resolveCibSevenMavenTimeoutMs,
  wrapCibSevenMavenFailure,
} from "./cibseven-maven-budget.ts";
import { CommandTimeoutError } from "./run-command.ts";

test("uses the workstation CIB Maven deadline unless explicitly overridden", () => {
  assert.equal(defaultCibSevenMavenTimeoutMs, 60_000);
  assert.equal(resolveCibSevenMavenTimeoutMs({}), 60_000);
  assert.equal(
    resolveCibSevenMavenTimeoutMs({ BPMN_CIB_MAVEN_TIMEOUT_MS: "120000" }),
    120_000,
  );
});

test("rejects malformed CIB Maven deadline overrides", () => {
  for (const declared of ["", "0", "-1", "60000ms", "1.5", "9007199254740992"]) {
    assert.throws(
      () =>
        resolveCibSevenMavenTimeoutMs({
          BPMN_CIB_MAVEN_TIMEOUT_MS: declared,
        }),
      /BPMN_CIB_MAVEN_TIMEOUT_MS must be a positive safe integer/u,
    );
  }
});

test("classifies a CIB Maven timeout without hiding other failures", () => {
  const timeout = new CommandTimeoutError("mvnw", 120_000, "", "");
  const classified = wrapCibSevenMavenFailure("2.0.0", timeout);
  assert.ok(classified instanceof Error);
  assert.match(
    classified.message,
    /^CIB_MAVEN_BUDGET_EXCEEDED release=2\.0\.0 budgetMs=120000 /u,
  );
  assert.match(classified.message, /BPMN_CIB_MAVEN_TIMEOUT_MS/u);
  assert.equal(classified.cause, timeout);

  const ordinaryFailure = new Error("Maven test failed");
  assert.equal(
    wrapCibSevenMavenFailure("2.2.0", ordinaryFailure),
    ordinaryFailure,
  );
});
