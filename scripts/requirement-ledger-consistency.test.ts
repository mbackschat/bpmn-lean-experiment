/**
 * Keeps [the BPMN requirement ledger](../docs/BPMN-REQUIREMENT-LEDGER.md) consistent with what cites it.
 *
 * The ledger owns requirement dispositions, so both directions of that ownership are checkable and
 * neither is about whether a disposition is *correct*: the mechanism-family map must not cite a
 * requirement whose own row stayed undecided, and a capsule must not name a requirement identifier
 * that has no row at all. Both failures leave the roadmap denominator understating closed scope.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { markdownTableRows, withoutBackticks } from "./markdown-tables.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const ledgerPath = path.join(projectRoot, "docs/BPMN-REQUIREMENT-LEDGER.md");
const capsuleRoot = path.join(projectRoot, "docs/capsules");
const familyMapSectionStart = "## Process Execution mechanism-family map";
const reviewedRequirementSectionStart = "## Reviewed requirements";
const familyMapSectionEnd = reviewedRequirementSectionStart;
const reviewedRequirementSectionEnd = "## Growth rule";
const familyMapCellCount = 6;
const requirementCellCount = 7;
const closedSliceCell = 5;
const normativeSourceCell = 1;
const dispositionCell = 4;
const familyIdPrefix = "BPMN-MECH-";
const ruleDispositionSectionStart = "### Rule-keyed disposition lock";
const ruleDispositionSectionEnd = "## CIB relationship";
const ruleDispositionCellCount = 3;
const decidedDispositions: ReadonlySet<string> = new Set([
  "supported",
  "rejected",
]);
const capsuleDispositions: ReadonlySet<string> = new Set([
  "required",
  "deferred",
  "optional",
  "excluded",
]);

/** Requirement identifiers a passage cites, excluding the mechanism-family identifiers themselves. */
function citedRequirementIds(text: string): ReadonlyArray<string> {
  return [...text.matchAll(/`(BPMN-[A-Z0-9-]+)`/gu)]
    .map((match) => {
      const requirementId = match[1];
      if (requirementId === undefined) {
        throw new Error("Requirement citation matched without an identifier.");
      }
      return requirementId;
    })
    .filter((requirementId) => !requirementId.startsWith(familyIdPrefix));
}

function dispositionByRequirementId(
  ledger: string,
): ReadonlyMap<string, string> {
  return new Map(
    markdownTableRows(
      ledger,
      reviewedRequirementSectionStart,
      reviewedRequirementSectionEnd,
      requirementCellCount,
    ).map((cells) => [
      withoutBackticks(cells[0] ?? ""),
      withoutBackticks(cells[dispositionCell] ?? ""),
    ]),
  );
}

function normativeSourceByRequirementId(
  ledger: string,
): ReadonlyMap<string, string> {
  return new Map(
    markdownTableRows(
      ledger,
      reviewedRequirementSectionStart,
      reviewedRequirementSectionEnd,
      requirementCellCount,
    ).map((cells) => [
      withoutBackticks(cells[0] ?? ""),
      cells[normativeSourceCell]?.trim() ?? "",
    ]),
  );
}

type RequirementCitationLock = Readonly<{
  requirementId: string;
  normativeSource: string;
}>;

function requirementCitationLocks(markdown: string): ReadonlyArray<RequirementCitationLock> {
  return [...markdown.matchAll(
    /^- Ledger citation lock for `(BPMN-[A-Z0-9-]+)`: (.+)$/gmu,
  )].map((match) => ({
    requirementId: match[1] ?? "",
    normativeSource: match[2]?.trim() ?? "",
  }));
}

function citationLockFindings(
  locks: ReadonlyArray<RequirementCitationLock>,
  normativeSources: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  const findings: string[] = [];
  for (const lock of locks) {
    const ledgerSource = normativeSources.get(lock.requirementId);
    if (ledgerSource === undefined) {
      findings.push(`${lock.requirementId}: requirement is absent from the ledger`);
    } else if (ledgerSource !== lock.normativeSource) {
      findings.push(
        `${lock.requirementId}: capsule cites "${lock.normativeSource}" but ledger cites "${ledgerSource}"`,
      );
    }
  }
  return findings;
}

function capsuleDispositionFindings(markdown: string): ReadonlyArray<string> {
  if (!markdown.includes(ruleDispositionSectionStart)) {
    return [];
  }

  const ruleIds = new Set(
    [...markdown.matchAll(/^### `(\w[\w-]+-\d{2})`\s/gmu)].map(
      (match) => match[1] ?? "",
    ),
  );
  const entries = markdownTableRows(
    markdown,
    ruleDispositionSectionStart,
    ruleDispositionSectionEnd,
    ruleDispositionCellCount,
  ).map((cells) => ({
    obligationKey: withoutBackticks(cells[0] ?? ""),
    disposition: withoutBackticks(cells[1] ?? ""),
  }));
  const keyCounts = new Map<string, number>();
  const findings: string[] = [];
  for (const entry of entries) {
    const keyMatch = /^(\w[\w-]+-\d{2})\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.exec(
      entry.obligationKey,
    );
    if (keyMatch === null) {
      findings.push(`${entry.obligationKey}: invalid obligation key`);
    } else if (!ruleIds.has(keyMatch[1] ?? "")) {
      findings.push(`${entry.obligationKey}: unknown semantic rule`);
    }
    if (!capsuleDispositions.has(entry.disposition)) {
      findings.push(`${entry.obligationKey}: invalid disposition ${entry.disposition}`);
    }
    keyCounts.set(
      entry.obligationKey,
      (keyCounts.get(entry.obligationKey) ?? 0) + 1,
    );
  }
  for (const [obligationKey, count] of keyCounts) {
    if (count > 1) {
      findings.push(`${obligationKey}: obligation has ${count} dispositions`);
    }
  }
  return findings;
}

// Contract: a requirement the mechanism-family map cites as a closed reviewed slice must carry a
// decided disposition in the same ledger. The oracle is the ledger itself, so this detects a row
// whose disposition was never advanced when its capsule closed rather than judging correctness.
//
// The check is deliberately one-directional. Requiring every `supported` row to be cited back would
// turn the prose closed-slice column into a second copy of the requirement inventory, and it would
// wrongly reject a row such as `BPMN-RECEIVE-TASK-IMPLEMENTATION-01`, which links an implemented
// specification while its own Web-service requirement stays unsupported.
test("keeps every closed reviewed slice consistent with its requirement disposition", async () => {
  const ledger = await readFile(ledgerPath, "utf8");
  const dispositions = dispositionByRequirementId(ledger);
  const familyRows = markdownTableRows(
    ledger,
    familyMapSectionStart,
    familyMapSectionEnd,
    familyMapCellCount,
  );
  const citedRequirements = [
    ...new Set(
      familyRows.flatMap((cells) =>
        citedRequirementIds(cells[closedSliceCell] ?? "")
      ),
    ),
  ].sort();

  assert.deepEqual(
    {
      // A restructured table that cites nothing would satisfy both lists below.
      citedRequirementCount: citedRequirements.length > 0,
      unknownRequirementIds: citedRequirements.filter(
        (requirementId) => !dispositions.has(requirementId),
      ),
      undecidedClosedSlices: citedRequirements.filter((requirementId) => {
        const disposition = dispositions.get(requirementId);
        return (
          disposition !== undefined && !decidedDispositions.has(disposition)
        );
      }),
    },
    {
      citedRequirementCount: true,
      unknownRequirementIds: [],
      undecidedClosedSlices: [],
    },
  );
});

// Contract: a requirement identifier a capsule cites must exist as a row in the ledger that owns
// requirement dispositions. The oracle is the ledger table, so a capsule naming its own new
// requirement fails here until that row lands.
//
// This is the direction the closed-slice check cannot see. The interrupting Activity boundary Timer
// capsule wrote "the ledger requirement is new: `BPMN-BOUNDARY-TIMER-01`", scheduled the row for its
// implementation, and explicitly predicted that the one-directional check above would not notice its
// absence. The prediction held and the row was missed at both implementation and graduation, so the
// obligation is now read from the capsule that stated it.
//
// Deliberately not the converse. Three closed capsules cite no requirement at all because they
// dispose a CIB extension or a runtime representation rather than a BPMN requirement, and demanding a
// row from every capsule would manufacture dispositions the standard does not ask for.
test("every requirement a capsule cites exists in the requirement ledger", async () => {
  const ledgerRequirementIds = new Set(
    dispositionByRequirementId(await readFile(ledgerPath, "utf8")).keys(),
  );
  const capsules = (await readdir(capsuleRoot)).filter((entry) =>
    entry.endsWith("-PROPOSAL.md") || entry.endsWith("-SPEC.md")
  );

  const findings: string[] = [];
  for (const capsule of capsules) {
    const markdown = await readFile(path.join(capsuleRoot, capsule), "utf8");
    for (const requirementId of new Set(citedRequirementIds(markdown))) {
      if (!ledgerRequirementIds.has(requirementId)) {
        findings.push(`${capsule}: ${requirementId}`);
      }
    }
  }

  assert.deepEqual(
    {
      // A capsule set that cites nothing would satisfy the finding list alone.
      ledgerRequirementCount: ledgerRequirementIds.size > 0,
      capsuleCount: capsules.length > 0,
      findings,
    },
    { ledgerRequirementCount: true, capsuleCount: true, findings: [] },
  );
});

test("keeps converted capsule and requirement-ledger normative citations identical", async () => {
  const normativeSources = normativeSourceByRequirementId(await readFile(ledgerPath, "utf8"));
  const capsules = (await readdir(capsuleRoot)).filter((entry) =>
    entry.endsWith("-PROPOSAL.md") || entry.endsWith("-SPEC.md")
  );
  const locks: RequirementCitationLock[] = [];
  for (const capsule of capsules) {
    locks.push(...requirementCitationLocks(await readFile(path.join(capsuleRoot, capsule), "utf8")));
  }

  assert.deepEqual(
    {
      convertedCapsuleCount: locks.length > 0,
      findings: citationLockFindings(locks, normativeSources),
    },
    { convertedCapsuleCount: true, findings: [] },
  );
});

test("keeps converted capsule dispositions keyed to one semantic rule", async () => {
  const capsules = (await readdir(capsuleRoot)).filter((entry) =>
    entry.endsWith("-PROPOSAL.md") || entry.endsWith("-SPEC.md")
  );
  let convertedCapsuleCount = 0;
  const findings: string[] = [];
  for (const capsule of capsules) {
    const markdown = await readFile(path.join(capsuleRoot, capsule), "utf8");
    if (!markdown.includes(ruleDispositionSectionStart)) {
      continue;
    }
    convertedCapsuleCount += 1;
    findings.push(
      ...capsuleDispositionFindings(markdown).map(
        (finding) => `${capsule}: ${finding}`,
      ),
    );
  }

  assert.deepEqual(
    { convertedCapsuleCount: convertedCapsuleCount > 0, findings },
    { convertedCapsuleCount: true, findings: [] },
  );
});

test("rejects a converted capsule whose normative citation drifts from the ledger", () => {
  const locks = requirementCitationLocks(
    "- Ledger citation lock for `BPMN-EXAMPLE-01`: Clause 13.5.2",
  );
  assert.deepEqual(
    citationLockFindings(locks, new Map([["BPMN-EXAMPLE-01", "Clause 13.5.3"]])),
    [
      'BPMN-EXAMPLE-01: capsule cites "Clause 13.5.2" but ledger cites "Clause 13.5.3"',
    ],
  );
});

test("rejects one rule obligation classified as both required and excluded", () => {
  const markdown = `### \`ABTIMER-REFUSE-01\` - preserve state

### Rule-keyed disposition lock

| Obligation key | Disposition | Boundary |
|---|---|---|
| \`ABTIMER-REFUSE-01/pre-due-core-and-lean\` | \`required\` | Core and Lean witness. |
| \`ABTIMER-REFUSE-01/pre-due-core-and-lean\` | \`excluded\` | Temporal scenario. |

## CIB relationship`;

  assert.deepEqual(capsuleDispositionFindings(markdown), [
    "ABTIMER-REFUSE-01/pre-due-core-and-lean: obligation has 2 dispositions",
  ]);
});
