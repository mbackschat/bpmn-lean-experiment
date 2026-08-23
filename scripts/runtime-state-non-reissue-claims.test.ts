import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { readWorktreeSources } from "./worktree-source-read.ts";

const guardPath = "scripts/runtime-state-non-reissue-claims.test.ts";

const counterPreservationEntailsNonReissue = [
  /\b(?:neither|no|never)\b[^.\n]{0,200}\brewinds?\b[^.\n]{0,200}\bso\b[^.\n]{0,200}\b(?:can never|cannot|never)\b[^.\n]{0,100}\breissued?\b/giu,
  /\bsuccessor\b[^.\n]{0,200}\blowers?\b[^.\n]{0,200}\bhas reissued\b/giu,
] as const;

function staleNonReissueClaims(source: string): ReadonlyArray<string> {
  return counterPreservationEntailsNonReissue.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[0]),
  );
}

function projectSourceFiles(): ReadonlyArray<string> {
  return execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.lean",
      "*.ts",
    ],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((sourcePath) => sourcePath.length > 0)
    .filter((sourcePath) => sourcePath !== guardPath)
    .filter((sourcePath) => !sourcePath.startsWith("adoption/"));
}

test("source text does not derive identity non-reissue from counter preservation", () => {
  const findings = readWorktreeSources(projectSourceFiles()).flatMap(
    ({ path, source }) =>
      staleNonReissueClaims(source).map((claim) => `${path}: ${claim}`),
  );

  assert.deepEqual(findings, []);
});

test("the non-reissue claim guard separates every stale causal form", () => {
  assert.deepEqual(
    staleNonReissueClaims([
      "Neither arm rewinds an activation counter, so a withdrawn occurrence can never be reissued.",
      "No transition rewinds the counter, so the identity cannot be reissued.",
      "A successor that lowers either counter has reissued an identity it already retired.",
    ].join("\n")),
    [
      "Neither arm rewinds an activation counter, so a withdrawn occurrence can never be reissued",
      "No transition rewinds the counter, so the identity cannot be reissued",
      "successor that lowers either counter has reissued",
    ],
  );
  assert.deepEqual(
    staleNonReissueClaims(
      "The counter does not rewind in this transition. Non-reissue still needs a separate issuing discipline.",
    ),
    [],
  );
});
