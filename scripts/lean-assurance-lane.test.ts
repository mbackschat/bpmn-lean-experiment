import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  type DeclarationLookup,
  leanAssuranceFindings,
  runtimeProofMap,
} from "./lean-assurance-lane.ts";
import type { LeanDeclaration } from "./lean-declarations.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const stubModules = new Map<string, ReadonlyArray<LeanDeclaration>>([
  ["BpmnSemantics/Proved.lean", [{ kind: "theorem", name: "proved_law" }]],
  ["BpmnSemantics/Checked.lean", [{ kind: "def", name: "finite_fixture" }]],
  // Declares nothing, like the aggregation modules AA-15 found behind four retained lanes.
  ["BpmnSemantics/Aggregate.lean", []],
]);

const declarationsOf: DeclarationLookup = (repositoryPath) =>
  stubModules.get(repositoryPath) ?? null;

function laneFindings(markdown: string, entry: string): ReadonlyArray<string> {
  return leanAssuranceFindings(markdown, entry, declarationsOf);
}

function lane(shape: "proved" | "checked", evidence: string): string {
  return `## Lean assurance lane\n\nLane shape: ${shape}\n\nEvidence: ${evidence}\n`;
}

test("every capsule declares one canonical Lean assurance lane", async () => {
  const capsuleRoot = path.join(projectRoot, "docs/capsules");
  const capsules = (await readdir(capsuleRoot)).filter((entry) =>
    entry.endsWith("-PROPOSAL.md") || entry.endsWith("-SPEC.md")
  );
  const findings: string[] = [];
  for (const capsule of capsules) {
    const markdown = await readFile(path.join(capsuleRoot, capsule), "utf8");
    findings.push(...leanAssuranceFindings(markdown, capsule));
  }
  assert.ok(capsules.length > 40, `capsule enumeration returned ${capsules.length} files`);
  assert.deepEqual(findings, []);
});

test("Lean assurance parsing rejects absent, invalid, unsupported, and fragmented lanes", () => {
  assert.deepEqual(laneFindings("## Status\n\nclosed\n", "missing.md"), [
    "missing.md: expected one ## Lean assurance lane, found 0",
  ]);
  assert.deepEqual(
    laneFindings("## Lean assurance lane\n\nLane shape: finite\n", "invalid.md"),
    ['invalid.md: invalid first Lean assurance line "Lane shape: finite"'],
  );
  assert.deepEqual(
    laneFindings(
      "## Lean assurance lane\n\nLane shape: deliberately open\n\nEvidence: unresolved.\n",
      "open.md",
    ),
    [`open.md: deliberately open lane does not link ${runtimeProofMap}`],
  );
  assert.deepEqual(
    laneFindings(
      "## Lean assurance lane\n\nLane shape: proved\n\nLane shape: **proved** for fixtures.\n",
      "duplicate.md",
    ),
    ["duplicate.md: expected one Lane shape field, found 2"],
  );
  assert.deepEqual(
    laneFindings("## Lean assurance lane\n\nLane shape: proved\n", "stub.md"),
    ["stub.md: expected one Lean Evidence statement, found 0"],
  );
  assert.deepEqual(
    laneFindings(
      "## Lean assurance lane\n\nLane shape: proved\n\nThe basis appears later.\n\nEvidence: [owner](../../BpmnSemantics/Proved.lean#proved_law) proves the law.\n",
      "detached.md",
    ),
    ["detached.md: Lean Evidence statement must immediately follow the Lane shape field"],
  );
  assert.deepEqual(
    laneFindings(
      "## Lean assurance lane\n\nLane shape: proved\n\nEvidence: asserted without an owner.\n",
      "unsupported.md",
    ),
    ["unsupported.md: proved lane does not link a Lean evidence owner"],
  );
  for (const heading of ["## Lean laws", "## Assurance boundary", "## Separating witnesses and proof boundary", "## Laws, non-laws, and separating witnesses", "## Closure, enabledness, laws, and witnesses", "## Declarative relation, evaluator, and laws", "## Proof-boundaries and witnesses"]) {
    assert.deepEqual(
      laneFindings(
        `## Lean assurance lane\n\nLane shape: checked\n\nEvidence: [owner](../../BpmnSemantics/Checked.lean#finite_fixture) checks the finite case.\n\n${heading}\n`,
        "fragmented.md",
      ),
      [`fragmented.md: noncanonical Lean assurance heading ${JSON.stringify(heading)}`],
    );
  }
  assert.deepEqual(
    laneFindings("## Lean assurance lane\n\nLane shape: proved\n\nEvidence: [owner](../../BpmnSemantics/Proved.lean#proved_law) proves the law.\n\n```md\n## Lean laws\n```\n", "fenced.md"),
    [],
  );
  assert.deepEqual(laneFindings("```md\n## Lean assurance lane\n```\n", "fenced-only.md"), ["fenced-only.md: expected one ## Lean assurance lane, found 0"]);
  assert.deepEqual(laneFindings("## Lean assurance lane\n\nLane shape: proved\n\nEvidence: [owner](../../BpmnSemantics/Proved.lean#proved_law) proves the law.\n\n    ## Lean laws\n", "indented.md"), []);
  assert.deepEqual(laneFindings("    ## Lean assurance lane\n", "indented-only.md"), ["indented-only.md: expected one ## Lean assurance lane, found 0"]);
  assert.deepEqual(
    laneFindings(
      "## Lean assurance lane\n\nLane shape: proved\n\nEvidence: [owner](../../BpmnSemantics/Proved.lean#proved_law) proves the quantified law.\n",
      "proved.md",
    ),
    [],
  );
  assert.deepEqual(
    laneFindings(
      "## Lean assurance lane\n\nLane shape: deliberately open\n\nEvidence: [owner](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md) records the reopen trigger.\n",
      "owned-open.md",
    ),
    [],
  );
});

test("a proved or checked lane must name an existing guaranteeing declaration", () => {
  const aggregate = "[aggregate](../../BpmnSemantics/Aggregate.lean)";
  assert.deepEqual(
    laneFindings(lane("proved", `${aggregate} collects the family.`), "AGGREGATE-ONLY-SPEC.md"),
    ["AGGREGATE-ONLY-SPEC.md: proved lane names no guaranteeing declaration; link it as Module.lean#declarationName"],
  );
  assert.deepEqual(
    laneFindings(lane("checked", "[owner](../../BpmnSemantics/Checked.lean) checks the finite case."), "UNNAMED-SPEC.md"),
    ["UNNAMED-SPEC.md: checked lane names no guaranteeing declaration; link it as Module.lean#declarationName"],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "[aggregate](../../BpmnSemantics/Aggregate.lean#umbrella) collects the family."), "NAMED-UMBRELLA-SPEC.md"),
    ["NAMED-UMBRELLA-SPEC.md: BpmnSemantics/Aggregate.lean#umbrella names no declaration in that module"],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "[owner](../../BpmnSemantics/Proved.lean#missing_law) proves the law."), "MISSING-DECLARATION-SPEC.md"),
    ["MISSING-DECLARATION-SPEC.md: BpmnSemantics/Proved.lean#missing_law names no declaration in that module"],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "[owner](../../BpmnSemantics/Absent.lean#proved_law) proves the law."), "MISSING-MODULE-SPEC.md"),
    ["MISSING-MODULE-SPEC.md: BpmnSemantics/Absent.lean#proved_law names a module that does not exist"],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "[owner](../../BpmnSemantics/Proved.lean#proved_law) proves the law."), "NAMED-SPEC.md"),
    [],
  );
  assert.deepEqual(
    laneFindings(lane("checked", "[owner](../../BpmnSemantics/Checked.lean#finite_fixture) checks the finite case."), "NAMED-CHECKED-SPEC.md"),
    [],
  );
});

test("a proposal's lane may name only its starting owners but cannot cite a missing declaration", () => {
  const aggregate = "[aggregate](../../BpmnSemantics/Aggregate.lean) is the planned starting owner.";
  assert.deepEqual(
    laneFindings(lane("proved", aggregate), "PLANNED-PROPOSAL.md"),
    [],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "[owner](../../BpmnSemantics/Proved.lean#proved_law) proves the law."), "NAMED-PROPOSAL.md"),
    [],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "[owner](../../BpmnSemantics/Proved.lean#renamed_law) proves the law."), "STALE-PROPOSAL.md"),
    ["STALE-PROPOSAL.md: BpmnSemantics/Proved.lean#renamed_law names no declaration in that module"],
  );
  assert.deepEqual(
    laneFindings(lane("proved", "asserted without an owner."), "UNLINKED-PROPOSAL.md"),
    ["UNLINKED-PROPOSAL.md: proved lane does not link a Lean evidence owner"],
  );
});

test("a named guarantee may be supported by unnamed owners but not by stale references", () => {
  const named = "[owner](../../BpmnSemantics/Proved.lean#proved_law)";
  const supporting = "[basis](../../BpmnSemantics/Aggregate.lean)";
  assert.deepEqual(
    laneFindings(lane("proved", `${named} rests on ${supporting}.`), "SUPPORTED-SPEC.md"),
    [],
  );
  assert.deepEqual(
    laneFindings(
      lane("proved", `${named} and [stale](../../BpmnSemantics/Proved.lean#renamed_law).`),
      "STALE-SPEC.md",
    ),
    ["STALE-SPEC.md: BpmnSemantics/Proved.lean#renamed_law names no declaration in that module"],
  );
});
