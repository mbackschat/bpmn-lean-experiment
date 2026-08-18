import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPlanControlPlane,
  parseOrderedWork,
} from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const planPath = path.join(projectRoot, "docs/PLAN.md");

test("keeps the plan as one compact execution control document", async () => {
  const plan = await readFile(planPath, "utf8");
  assert.doesNotThrow(() => assertPlanControlPlane(plan));
});

test("rejects multiple active items, malformed states, duplicate IDs, and a dangling resume", async () => {
  const plan = await readFile(planPath, "utf8");
  const entries = parseOrderedWork(plan);
  const activeEntry = entries.find((entry) => entry.state === "active");
  const queuedEntry = entries.find((entry) => entry.state === "queued");
  assert.ok(activeEntry !== undefined);
  assert.ok(queuedEntry !== undefined);
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${queuedEntry.id}\` · **queued**`,
      `\`${queuedEntry.id}\` · **active**`,
    )),
    /exactly one active/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${queuedEntry.id}\` · **queued**`,
      `\`${queuedEntry.id}\` · **completed**`,
    )),
    /stable work contract/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `\`${queuedEntry.id}\` · **queued**`,
      `\`${activeEntry.id}\` · **queued**`,
    )),
    /duplicate work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      `Active work ID: \`${activeEntry.id}\`.`,
      "Active work ID: `UNKNOWN-WORK`.",
    )),
    /resume work ID/u,
  );
});

test("keeps the binding showcase ladder in its decision owner", async () => {
  const ladder = await readFile(
    path.join(projectRoot, "docs/SHOWCASE-MILESTONE-LADDER-DECISION.md"),
    "utf8",
  );
  const milestones = [...ladder.matchAll(/^### (M[0-6]) /gmu)].map((match) => match[1]);
  assert.deepEqual(milestones, ["M0", "M1", "M2", "M3", "M4", "M5", "M6"]);
  for (const milestone of milestones) {
    const start = ladder.indexOf(`### ${milestone} `);
    const next = ladder.indexOf("\n### ", start + 4);
    const section = ladder.slice(start, next === -1 ? undefined : next);
    assert.match(section, /\*\*Status: closed\.\*\*/u, milestone);
  }
});

test("keeps the root README free of volatile implementation status", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  assert.doesNotMatch(readme, /^## Current state$/mu);
  assert.doesNotMatch(readme, /^\| Active work \|/mu);
  for (const link of [
    "docs/PLAN.md",
    "docs/IMPLEMENTATION-MAP.md",
    "docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md",
    "model-corpus/README.md",
  ]) assert.match(readme, new RegExp(link.replaceAll("/", "\\/"), "u"));
});
