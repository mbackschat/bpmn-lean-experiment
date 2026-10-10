import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { assuranceAssessmentFindings, assuranceBindingsFor, assuranceChangedPaths, parseAssuranceFindings, type AssuranceFinding } from "./assurance-register.ts";

const active = { id: "BOUNDED-REPAIR", state: "active", detailMaps: [] } as const;
const findings: ReadonlyArray<AssuranceFinding> = [
  { id: "AA-01", disposition: "partial", owners: ["BpmnSemantics/First.lean"], trigger: "Add a third consumer." },
  { id: "AA-11", disposition: "held", owners: ["packages/semantic-core/src/second.ts"], trigger: "Change unsafe issuance." },
];

function plan(rows = ""): string {
  return `# Plan\n\n## Ordered work\n\n### Assurance trigger assessment\n\nAssurance work ID: \`BOUNDED-REPAIR\`.\n\n| Finding | Result | Reason | Bounded action | Acceptance |\n|---|---|---|---|---|\n${rows}\n\n## Current evidence\n`;
}

test("an omitted assessment cannot pass merely because no assessment schema was present", () => {
  assert.deepEqual(
    assuranceAssessmentFindings("# Plan\n\n## Ordered work\n\n## Current evidence\n", active, findings, ["BpmnSemantics/First.lean"]),
    ["AA-01: missing trigger assessment for BOUNDED-REPAIR"],
  );
});

test("a second changed owner must be assessed even when the first has a valid not-met judgment", () => {
  assert.deepEqual(
    assuranceAssessmentFindings(plan("| AA-01 | not-met | No third consumer is added. | — | — |"), active, findings,
      ["BpmnSemantics/First.lean", "packages/semantic-core/src/second.ts"]),
    ["AA-11: missing trigger assessment for BOUNDED-REPAIR"],
  );
});

test("held met triggers require decision review instead of implementation authorization", () => {
  assert.deepEqual(
    assuranceAssessmentFindings(plan("| AA-11 | met | Unsafe issuance changes. | Repair every issuing domain. | [contract](OWNER.md) |"), active, findings,
      ["packages/semantic-core/src/second.ts"]),
    ["AA-11: held findings require met-review, preserving the reviewed decision or amendment boundary"],
  );
});

test("a met trigger cannot omit its bounded action and deciding acceptance owner", () => {
  assert.deepEqual(
    assuranceAssessmentFindings(plan("| AA-01 | met | A third consumer is added. | — | — |"), active, findings, ["BpmnSemantics/First.lean"]),
    ["AA-01: met trigger needs a bounded action and linked acceptance"],
  );
});

test("unrelated paths do not force a registered owner assessment", () => {
  assert.deepEqual(assuranceAssessmentFindings(plan(), active, findings, ["BpmnSemantics/Unregistered.lean"]), []);
});

test("batched not-met judgments still assess each registered identity individually", () => {
  assert.deepEqual(assuranceAssessmentFindings(
    plan("| AA-01, AA-11 | not-met | No new consumer or issuing contract is selected. | — | — |"),
    active, findings, ["BpmnSemantics/First.lean", "packages/semantic-core/src/second.ts"],
  ), []);
});

const register = `# Register

## Active findings

| Finding | Disposition | Owners | Trigger |
|---|---|---|---|
| [AA-01](#aa-01) | partial | [owner](../BpmnSemantics/First.lean) | Add a third consumer. |
| [AA-11](#aa-11) | held | [owner](../packages/semantic-core/src/second.ts) | Change issuance. |

## AA-01

Complete residual contract.

## AA-11

Complete held contract.

## Resolved index

### AA-06

[Accepted finding](REPAIR-PROPOSAL.md#findings).
`;

test("registered records cannot lose enrollment by omitting or corrupting owners, trigger or active row", () => {
  assert.equal(parseAssuranceFindings(register).length, 2);
  for (const [mutated, expected] of [
    [register.replace("[owner](../BpmnSemantics/First.lean)", "—"), /missing declared Owner link/u],
    [register.replace("../BpmnSemantics/First.lean", "https://example.test/First.lean"), /repository links/u],
    [register.replace("Add a third consumer.", ""), /missing trigger/u],
    [register.replace(/^\| \[AA-01\].*\n/mu, ""), /complete record/u],
    [register.replace("| partial |", "| resolved |"), /invalid active disposition/u],
  ] as const) assert.throws(() => parseAssuranceFindings(mutated), expected);
});

test("routes only declared owner files and directories, keeping resolved and prose-only mentions out", () => {
  const parsed = parseAssuranceFindings(register.replace("Complete residual contract.", "Mention packages/semantic-core/src/unrelated.ts."));
  assert.deepEqual(assuranceBindingsFor("BpmnSemantics/First.lean", parsed).map(({ id }) => id), ["AA-01"]);
  assert.deepEqual(assuranceBindingsFor("packages/semantic-core/src/unrelated.ts", parsed), []);
  assert.deepEqual(assuranceBindingsFor("docs/REPAIR-PROPOSAL.md", parsed), []);
  assert.deepEqual(assuranceBindingsFor("BpmnSemantics/New.lean", [{ ...parsed[0]!, owners: ["BpmnSemantics/"] }]).map(({ id }) => id), ["AA-01"]);
  assert.deepEqual(assuranceBindingsFor("BpmnSemanticsOther/New.lean", [{ ...parsed[0]!, owners: ["BpmnSemantics/"] }]), []);
});

test("met-review retains held and deferred review boundaries with concrete acceptance", () => {
  for (const disposition of ["held", "deferred"]) {
    assert.deepEqual(assuranceAssessmentFindings(
      plan("| AA-11 | met-review | Delivery needs an outcome decision. | Review the bounded outcome amendment. | [acceptance](OWNER.md#acceptance) |"),
      active, [{ ...findings[1]!, disposition }], ["packages/semantic-core/src/second.ts"],
    ), []);
  }
});

test("task base includes dirty and pending paths and remains non-vacuous after committing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "assurance-base-test-"));
  const git = (args: ReadonlyArray<string>): string => execFileSync("git", [...args], { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    git(["init", "--quiet"]);
    git(["config", "user.name", "Assurance test"]);
    git(["config", "user.email", "assurance-test@example.invalid"]);
    await writeFile(path.join(root, "owner.ts"), "original\n");
    git(["add", "owner.ts"]);
    git(["commit", "--quiet", "-m", "test: establish base"]);
    const base = git(["rev-parse", "HEAD"]);
    const selectedPlan = `Assurance base: \`${base}\`.`;
    await writeFile(path.join(root, "owner.ts"), "changed\n");
    await writeFile(path.join(root, "pending.ts"), "pending\n");
    assert.deepEqual(assuranceChangedPaths(root, selectedPlan), ["owner.ts", "pending.ts"]);
    await rm(path.join(root, "pending.ts"));
    git(["add", "owner.ts"]);
    git(["commit", "--quiet", "-m", "test: retain assessed change"]);
    assert.equal(git(["status", "--porcelain"]), "");
    assert.deepEqual(assuranceChangedPaths(root, selectedPlan), ["owner.ts"]);
    assert.deepEqual(assuranceAssessmentFindings(plan(), active, [{ ...findings[0]!, owners: ["owner.ts"] }], assuranceChangedPaths(root, selectedPlan)),
      ["AA-01: missing trigger assessment for BOUNDED-REPAIR"]);
    for (const badPlan of ["", "Assurance base: `HEAD`.", `Assurance base: \`${"0".repeat(40)}\`.`]) {
      assert.throws(() => assuranceChangedPaths(root, badPlan));
    }
    const unrelated = git(["commit-tree", `${base}^{tree}`, "-m", "independent root"]);
    assert.throws(() => assuranceChangedPaths(root, `Assurance base: \`${unrelated}\`.`));
    assert.equal(await readFile(path.join(root, "owner.ts"), "utf8"), "changed\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
