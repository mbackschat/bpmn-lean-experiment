# MUE Preview Beta integration proposal

## Status

Lifecycle: draft
Review: pending

## Decision

MUE Preview Beta is one Product 2 delivery checkpoint over seven already reviewed content boundaries. It adds a read-only seven-row checkpoint disclosure to the existing About destination and one release-acceptance command that composes the existing production-backed Sequential Multi-Instance and definition-scoped Message-correlation journeys with the existing responsive UI-quality lane. It adds no BPMN meaning, semantic profile, source admission, runtime transition, Temporal hosting mechanism, public engine operation, or new interactive product workflow.

The checkpoint catalog is separate from the canonical executable-capability catalog. Its purpose is to state which exact evidence boundary Beta consumes, how that boundary is visible in Product 2, and what remains open. It must not change the executable-capability count, turn a proof checkpoint into a product capability, or combine BPMN, CIB, platform, and assurance evidence into one percentage.

## Required, optional, and excluded

Required:

- exactly the seven content IDs and order owned by [PLAN.md](PLAN.md#mue-preview-beta-critical-path);
- a closed evidence classification that distinguishes a production journey, a registered executable capability disclosed in About, generated evidence, and a reviewed checkpoint with no Product 2 executable surface;
- one explicit Product 2 surface and one remaining-limit statement per row;
- a visible statement that Beta is a delivery checkpoint, not full MUE closure or BPMN conformance;
- responsive and accessible browser evidence for the complete row set;
- one build-once Beta release command that reuses the existing Alpha, correlated-Message, and UI-quality gates;
- a clean committed target, governed closure review, and immutable annotated `phase/mue-preview-beta` tag.

Optional:

- compact status styling that reuses existing tokens and keeps every classification available as text.

Excluded:

- a new navigation destination, dashboard, workflow, engine API, server route, persistence record, runtime query, or Temporal service;
- another real-Temporal showcase package or duplicated actor/runtime harness;
- a public Compensation capability, a Product 2 Compensation workflow, or Temporal scheduled-mode admission for Internal Commutation;
- treating the generated mechanism-maturity vector as semantic support;
- claiming that any underlying content family is fully closed;
- a package SemVer release or any automatic tag push.

## Public checkpoint catalog

Product 2 owns one immutable catalog with this closed shape:

```ts
type MuePreviewBetaCheckpoint = Readonly<{
  id:
    | "SEQUENTIAL-MULTI-INSTANCE"
    | "INTERNAL-COMMUTATION"
    | "PARALLEL-MULTI-INSTANCE"
    | "MECHANISM-MATURITY-EVIDENCE"
    | "DATA-AND-TASK-MECHANISMS"
    | "EVENT-SUBSCRIPTIONS"
    | "COMPENSATION-TRANSACTIONS";
  title: string;
  evidenceKind:
    | "productionJourney"
    | "registeredExecutableCapability"
    | "generatedEvidence"
    | "reviewedCheckpointOnly";
  productSurface: "Operations" | "Definitions / Triggers" | "About" | "None";
  boundary: string;
  remainingLimit: string;
}>;
```

The seven rows carry these exact classifications:

| Content ID | Evidence kind | Product 2 surface | Exact boundary and remaining limit |
|---|---|---|---|
| `SEQUENTIAL-MULTI-INSTANCE` | `productionJourney` | Operations | Closure-reviewed bounded natural and Timer-interrupted Sequential Multi-Instance journey; broader Multi-Instance behavior remains outside the slice. |
| `INTERNAL-COMMUTATION` | `reviewedCheckpointOnly` | None | Approved first green final-implementation semantic checkpoint; scheduled-mode admission, region footprints, and arbitrary-batch theorem remain open. |
| `PARALLEL-MULTI-INSTANCE` | `registeredExecutableCapability` | About | Closure-reviewed bounded parallel User Task capability; no dedicated Product 2 journey is claimed. |
| `MECHANISM-MATURITY-EVIDENCE` | `generatedEvidence` | About | Complete generated family vector with separate dimensions; it is not a support percentage or semantic capability. |
| `DATA-AND-TASK-MECHANISMS` | `registeredExecutableCapability` | About | Closure-reviewed direct Activity input and output slices; no Work form or browser data-editing workflow is claimed. |
| `EVENT-SUBSCRIPTIONS` | `productionJourney` | Definitions / Triggers | Closure-reviewed one-key definition-scoped Message correlation; composite keys, buffering, broadcast, and other Message loci remain open. |
| `COMPENSATION-TRANSACTIONS` | `reviewedCheckpointOnly` | None | First reviewed end-to-end private Compensation checkpoint; profile registration, public commands, corpus, and Product 2 capability remain absent. |

The implementation exports the immutable row array from a bounded Product 2 source owner. An executable integration guard derives the seven IDs from PLAN, compares them with that array, requires the exact evidence-kind and surface matrix above, and rejects duplicate or missing rows. This is deliberate cross-owner coupling: PLAN owns the Beta denominator, while Product 2 owns its presentation, so either side must fail when they drift.

## Product surface

The existing About page places a `MUE Preview Beta` section after the coverage-boundary warning and before the executable-capability table. It uses a native table with the columns Checkpoint, Evidence, Product surface, and Remaining limit. Each body row carries `data-beta-content-id` for exact browser assertions. At narrower container widths it reflows with the same labelled-row pattern as the capability table, with no horizontal page overflow.

The section states that all seven reviewed checkpoint boundaries are integrated, while the row text preserves which items are public executable journeys, About-only registered capabilities, generated evidence, or private reviewed checkpoints. “None” is rendered as “No Product 2 executable surface.” Neither color, placement, nor the word Beta may imply a stronger evidence kind than the row text.

The existing [version and capability disclosure preflight](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#version-and-capability-disclosure-preflight) settles the UI precedent. Beta extends the same read-only About reference; it does not select another analogous CIB interaction or operational workflow. The research record names this reuse explicitly before production code changes.

## Acceptance and tag boundary

`test:release:mue-preview-beta` builds the Product 2 release graph once, then runs the prebuilt MUE Preview Alpha real-Temporal browser gate, the prebuilt M2 correlated-Message real-Temporal browser gate, and the prebuilt UI-quality gate. It does not rerun all seven content programmes: their immutable review receipts are Beta inputs, while this command verifies only the new integration and the two public production journeys Beta presents.

The platform-web component test and UI-quality browser test require the exact seven-row order, text classifications, checkpoint-only absences, capability-catalog separation, and responsive containment. The cross-owner integration guard requires the build-once release command, the PLAN denominator, this proposal's evidence matrix, the web catalog, and the relevant documentation owners to agree.

After implementation and documentation are committed, the complete path-selected clean-commit pre-push gate and `test:release:mue-preview-beta` must pass. Closure review must approve that immutable target before `node scripts/project-tags.ts create phase mue-preview-beta --message "MUE Preview Beta"` creates or verifies the local annotated tag. Tag creation never implies a push.

## Same-change owners and reopen conditions

Implementation updates the Product 2 web catalog, About panel and CSS, component and browser tests, root release graph, feedback-efficiency guard, [web source map](../platform/apps/web/SOURCE-MAP.md), [web guide](../platform/apps/web/README.md), [showcase registry](../showcase/README.md), [UI-quality acceptance guide](../showcase/platform-ui-quality/README.md), [testing specification](TESTING-SPEC.md), [contributor setup guide](CONTRIBUTOR-SETUP-GUIDE.md), [architecture](ARCHITECTURE.md), [root contributor guidance](../CLAUDE.md), [`implementation-status-owner:BPM-PLATFORM`](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), [documentation registry](README.md), and [PLAN.md](PLAN.md). The other five routed detail maps change only if implementation evidence invalidates one of their current claims.

Reopen before changing the seven-item denominator or order, reclassifying an item, adding an interactive Beta workflow, using runtime state to populate the catalog, adding another production journey, changing a content boundary, replacing the existing capability catalog, making a release-version claim, or pushing the tag.

## Guard and owner preflight

`node scripts/what-binds.ts` routes this proposal through all seven detail maps and 49 documentation guards. The bounded implementation owners are the new checkpoint catalog, the 93-nonblank-line About panel with 707 lines before its review target, the 82-line component test with 718 lines before its target, the 299-line UI-quality test with 501 lines before its target, a new integration guard, the 263-line feedback-efficiency guard with 537 lines before its target, and root `package.json`. No size exception or dependency change is proposed.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
