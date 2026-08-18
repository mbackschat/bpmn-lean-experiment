import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { scanMarkdownLinks } from "./markdown-link-lexer.ts";
import { validateStructuralMapRoutes } from "./structural-map-routes.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function delegationDocuments(): Promise<ReadonlyMap<string, string>> {
  const paths = [
    "CLAUDE.md",
    "docs/PLAN.md",
    "docs/README.md",
    "docs/IMPLEMENTATION-MAP.md",
    "docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md",
    "docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md",
    "docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md",
    "docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md",
    "docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md",
    "docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md",
    "docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md",
    "docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md",
  ] as const;
  return new Map(await Promise.all(paths.map(async (file) =>
    [file, await readFile(path.join(projectRoot, file), "utf8")] as const
  )));
}

test("answers every structural capsule delegation with its exact detail-map section", async () => {
  const documents = await delegationDocuments();
  const delegations = [...documents]
    .filter(([file]) => /^docs\/capsules\/[^/]+-SPEC\.md$/u.test(file))
    .flatMap(([file, markdown]) =>
      scanMarkdownLinks(markdown).flatMap(({ label, destination }) =>
        label === "`implementation-status-delegation:ENGINE-RUNTIME-PROOF`"
          ? [{ file, destination }]
          : []
      )
    )
    .sort((left, right) => left.file.localeCompare(right.file));

  assert.deepEqual(delegations, [
    {
      file: "docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md",
      destination: "../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#interrupting-activity-boundary-timer",
    },
    {
      file: "docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md",
      destination: "../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#non-interrupting-boundary-timer",
    },
    {
      file: "docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md",
      destination: "../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#interrupting-sub-process-boundary-timer",
    },
  ]);
  assert.deepEqual(
    validateStructuralMapRoutes(documents).filter((error) =>
      /delegation|downgraded/u.test(error)
    ),
    [],
  );
});
