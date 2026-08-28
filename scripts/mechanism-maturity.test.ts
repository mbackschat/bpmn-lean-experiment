import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessMechanismMaturitySources,
  loadMechanismMaturityVector,
  renderMechanismMaturityVector,
  type MechanismMaturitySources,
} from "./mechanism-maturity.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function sourceFixture(overrides: Partial<MechanismMaturitySources> = {}): MechanismMaturitySources {
  return {
    ledger: [
      "## Process Execution mechanism-family map",
      "",
      "| Family ID | Normative source and machine-readable anchors | Reusable mechanism obligation | Depends on or is co-defined with | Family disposition | Closed reviewed slice |",
      "|---|---|---|---|---|---|",
      "| `BPMN-MECH-A-01` | Source A | Obligation A | — | `unsupported` | None. |",
      "| `BPMN-MECH-B-01` | Source B | Obligation B | `BPMN-MECH-A-01` | `unsupported` | Slice B. |",
      "",
    ].join("\n"),
    testing: [
      "## Mechanism-maturity classifications",
      "",
      "### Classification evidence",
      "",
      "Evidence.",
      "",
      "| Family ID | Invariant coverage | Activity occurrence adoption | Multiple-enabled closure | Composition evidence |",
      "|---|---|---|---|---|",
      "| `BPMN-MECH-A-01` | `reusable` [evidence](#classification-evidence) | `not-applicable` [evidence](#classification-evidence) | `not-reachable` [evidence](#classification-evidence) | `profile-local` [evidence](#classification-evidence) |",
      "| `BPMN-MECH-B-01` | `slice-local` [evidence](#classification-evidence) | `shared` [evidence](#classification-evidence) | `order-invariant` [evidence](#classification-evidence) | `reusable` [evidence](#classification-evidence) |",
      "",
    ].join("\n"),
    ...overrides,
  };
}

test("joins every ledger family to one evidence-owned classification per dimension", () => {
  const assessment = assessMechanismMaturitySources(sourceFixture());

  assert.deepEqual(assessment.findings, []);
  assert.equal(assessment.rows.length, 2);
  assert.deepEqual(assessment.rows[1], {
    familyId: "BPMN-MECH-B-01",
    familyDisposition: "unsupported",
    mechanismObligation: "Obligation B",
    invariantCoverage: {
      classification: "slice-local",
      evidence: "docs/TESTING-SPEC.md#classification-evidence",
      owner: "docs/TESTING-SPEC.md",
    },
    activityOccurrenceAdoption: {
      classification: "shared",
      evidence: "docs/TESTING-SPEC.md#classification-evidence",
      owner: "docs/TESTING-SPEC.md",
    },
    multipleEnabledClosure: {
      classification: "order-invariant",
      evidence: "docs/TESTING-SPEC.md#classification-evidence",
      owner: "docs/TESTING-SPEC.md",
    },
    compositionEvidence: {
      classification: "reusable",
      evidence: "docs/TESTING-SPEC.md#classification-evidence",
      owner: "docs/TESTING-SPEC.md",
    },
  });
});

test("rejects missing, duplicate, stale, invalid, and evidence-less classifications", () => {
  const fixture = sourceFixture();
  const assessment = assessMechanismMaturitySources({
    ...fixture,
    testing: fixture.testing
      .replace(
        "| `BPMN-MECH-A-01` | `reusable` [evidence](#classification-evidence) | `not-applicable` [evidence](#classification-evidence) | `not-reachable` [evidence](#classification-evidence) | `profile-local` [evidence](#classification-evidence) |",
        "| `BPMN-MECH-A-01` | `imagined` [evidence](#classification-evidence) | `not-applicable` | `not-reachable` [evidence](#classification-evidence) | `profile-local` [evidence](#classification-evidence) |\n| `BPMN-MECH-A-01` | `reusable` [evidence](#classification-evidence) | `not-applicable` [evidence](#classification-evidence) | `not-reachable` [evidence](#classification-evidence) | `profile-local` [evidence](#classification-evidence) |",
      )
      .replace(
        "| `BPMN-MECH-B-01` | `slice-local` [evidence](#classification-evidence) | `shared` [evidence](#classification-evidence) | `order-invariant` [evidence](#classification-evidence) | `reusable` [evidence](#classification-evidence) |",
        "| `BPMN-MECH-STALE-01` | `open` [evidence](#classification-evidence) | `open` [evidence](#classification-evidence) | `open` [evidence](#classification-evidence) | `open` [evidence](#classification-evidence) |",
      ),
  });

  assert.deepEqual(assessment.findings, [
    "duplicate mechanism-maturity classification for BPMN-MECH-A-01",
    "invalid invariant coverage classification imagined for BPMN-MECH-A-01",
    "activity occurrence adoption for BPMN-MECH-A-01 has no explicit evidence link",
    "missing mechanism-maturity classification for BPMN-MECH-B-01",
    "stale mechanism-maturity classification for BPMN-MECH-STALE-01",
  ]);
  assert.deepEqual(assessment.rows, []);
});

test("live owners resolve every evidence anchor and render no aggregate or percentage", async () => {
  const [vector, ledger] = await Promise.all([
    loadMechanismMaturityVector(projectRoot),
    readFile(new URL("../docs/BPMN-REQUIREMENT-LEDGER.md", import.meta.url), "utf8"),
  ]);
  const rendered = renderMechanismMaturityVector(vector);
  const familyMap = ledger.split("## Process Execution mechanism-family map\n", 2)[1]?.split("\n## ", 1)[0] ?? "";
  const ledgerIds = [...familyMap.matchAll(/^\| `(BPMN-MECH-[A-Z0-9-]+)` \|/gmu)].map((match) => match[1]);

  assert.ok(ledgerIds.length > 0);
  assert.equal(vector.families.length, ledgerIds.length);
  assert.equal(new Set(vector.families.map(({ familyId }) => familyId)).size, ledgerIds.length);
  assert.doesNotMatch(rendered, /%|percentage/iu);
  assert.equal(Object.hasOwn(vector, "aggregate"), false);
  assert.deepEqual(
    vector.families.map(({ familyId }) => familyId),
    ledgerIds,
  );
});
