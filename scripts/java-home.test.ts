/**
 * Verifies the Java 21 trust boundary independently of one host's installation layout.
 *
 * Explicit configuration must fail closed, while every selected home must contain bin/java and report Java major version 21.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveJavaHome } from "./java-home.ts";

const validHomes = new Set([
  "/approved/bpmn-java",
  "/approved/java",
  "/usr/lib/jvm/java-21-openjdk-amd64",
].map((home) => `${home}/bin/java`));
const exists = (candidate: string): boolean => validHomes.has(candidate);
const javaMajorVersion = (home: string): number =>
  home === "/wrong/java" ? 25 : 21;

test("prefers explicit BPMN Java configuration", () => {
  assert.equal(
    resolveJavaHome({
      environment: {
        BPMN_JAVA_HOME: "/approved/bpmn-java",
        JAVA_HOME: "/approved/java",
      },
      platform: "linux",
      exists,
      javaMajorVersion,
    }),
    "/approved/bpmn-java",
  );
});

test("rejects invalid explicit configuration instead of falling back", () => {
  assert.throws(
    () =>
      resolveJavaHome({
        environment: { BPMN_JAVA_HOME: "/missing/java" },
        platform: "linux",
        exists,
        javaMajorVersion,
      }),
    /BPMN_JAVA_HOME does not contain bin\/java/,
  );
});

test("rejects an explicit Java home with the wrong major version", () => {
  assert.throws(
    () =>
      resolveJavaHome({
        environment: { BPMN_JAVA_HOME: "/wrong/java" },
        platform: "linux",
        exists: () => true,
        javaMajorVersion,
      }),
    /must identify Java 21, found 25/,
  );
});

test("uses a valid platform default when configuration is absent", () => {
  assert.equal(
    resolveJavaHome({
      environment: {},
      platform: "linux",
      exists,
      javaMajorVersion,
      resolvePathJava: () => undefined,
    }),
    "/usr/lib/jvm/java-21-openjdk-amd64",
  );
});
