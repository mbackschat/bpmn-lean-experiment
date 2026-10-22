import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Names the Maven-wrapper launchers that leave the wrapper on the inherited host `JAVA_HOME`.
 *
 * The wrapper runs whatever `JAVA_HOME` names, so a launcher that passes only `BPMN_JAVA_HOME` or the
 * inherited environment silently runs CIB Seven on the host's default Java instead of the pinned Java 21
 * (the integration pipeline ran on Java 25 until 2026-10-22 and failed once Homebrew removed that JDK).
 */
export function unresolvedMavenJavaHomeFindings(
  surfaces: ReadonlyArray<Readonly<{ relativePath: string; source: string }>>,
): ReadonlyArray<string> {
  return surfaces
    .filter(({ source }) => /["'`/]mvnw["'`]/u.test(source))
    .filter(({ source }) => !/\bJAVA_HOME:\s/u.test(source) || !/\bresolveJavaHome\(/u.test(source))
    .map(({ relativePath }) => relativePath);
}

test("every CIB Maven-wrapper launcher sets JAVA_HOME to the resolved Java 21 home", () => {
  const surfaces = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "scripts", "packages"],
    { encoding: "utf8" })
    .split("\n")
    .filter((relativePath) => /\.ts$/u.test(relativePath) && !/\.test\.ts$/u.test(relativePath))
    .map((relativePath) => ({ relativePath, source: readFileSync(relativePath, "utf8") }));
  assert.deepEqual(unresolvedMavenJavaHomeFindings(surfaces), []);
});

test("a launcher that inherits the host environment is reported", () => {
  assert.deepEqual(unresolvedMavenJavaHomeFindings([
    { relativePath: "inherited.ts", source: 'runCommand("runners/cibseven/mvnw", [], { env: process.env });' },
    { relativePath: "resolved.ts", source: 'runCommand("runners/cibseven/mvnw", [], { env: { ...process.env, JAVA_HOME: resolveJavaHome() } });' },
  ]), ["inherited.ts"]);
});
