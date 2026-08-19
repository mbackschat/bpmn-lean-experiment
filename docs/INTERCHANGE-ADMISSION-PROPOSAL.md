# Interchange admission proposal

## Status

Lifecycle: draft
Review: pending

## Current boundary

This proposal selects the first `INTERCHANGE-ADMISSION` tranche. Immutable proposal review target `db18ea3` changes no repository behavior and remains blocked on independent review and owner approval. The first exact requirement is `BPMN-STRUCT-DIAGRAM-INTERCHANGE-01` in the [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements), with the admission consequence **preserve**.

The source compiler already implements the complete reviewed preservation mechanism under `bpmn-2.0.2-user-task-preserved-notation-draft`. The current gap is composition: that capability is unavailable to the CIB Seven User Task Process-data profile used to calibrate external whole models. This proposal reuses the reviewed mechanism and its four adjacent structural requirements. It does not reinterpret Diagram Interchange, Collaboration, Lanes, Artifacts, Documentation, User Task lifecycle, or Process data.

[PRESERVE-ONLY-ADMISSION-SPEC.md](PRESERVE-ONLY-ADMISSION-SPEC.md) owns preservation meaning, [PROFILE-PARAMETERIZED-ADMISSION-SPEC.md](PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) owns executable profile composition, the [CIB-BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md) owns CIB calibration, and [executable model corpus research](research/EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md) owns the external blocker ranking.

## Decision

Add one named profile, `cibseven-2.2.0-user-task-process-data-preserved-notation-draft`, that composes:

- the exact executable operation, graph, string/null Process-start data, string/null User Task completion data, observation, environment, and CIB relationship boundary of `cibseven-2.2.0-user-task-process-data-draft`; and
- the exact standard preservation capability of `bpmn-2.0.2-user-task-preserved-notation-draft`.

The composition is registered as one closed profile identity. A caller does not select an execution profile and an independent preservation overlay. This prevents unreviewed arbitrary combinations and keeps admitted meaning content-bound to one profile ID.

Production source may internally map several registered profiles to one enum-valued preservation capability. That internal reuse is not a second public profile language, wire field, manifest, or source of truth. The profile artifact remains the public declaration.

## Required, optional, and excluded

Required:

- one new CIB Seven User Task Process-data profile with the exact preservation bundle below;
- unchanged old profile behavior and diagnostics;
- exact-source retention with preserved material excluded from the checked graph, Semantic Process program, runtime state, and public observation;
- one source/twin witness using nonempty string/null start and completion data;
- exact CIB, Lean, TypeScript, differential, Temporal, and replay evidence appropriate to the already-selected behavior;
- external-corpus diagnostics regenerated under the new closest profile without accepting a model whose executable shape remains unsupported;
- a generalized non-interference guard for every profile that selects the standard preservation capability.

Optional:

- none for this tranche.

Excluded:

- any new BPMN transition, Process-data value kind, checked node, Semantic Process operation, runtime field, public observation, or Temporal primitive;
- execution of Collaboration, Participant, Message Flow, Lane, Artifact, Documentation, or Diagram Interchange;
- public access to normalized preserved subtrees;
- a caller-selected preservation overlay or arbitrary profile-capability product;
- Camunda or other foreign source metadata, including `camunda:historyTimeToLive`;
- data objects, data stores, references, associations, transformations, and assignments;
- broader User Task cardinality, a second unbound executable Process, or acceptance of any currently rejected external whole model;
- BPMN Process Execution Conformance, general CIB compatibility, export, or diagram-rendering claims;
- Product 2 behavior.

## Execute, preserve, reject

The profile partitions the parsed source before checked projection. The public compilation result remains only `Accepted` or `Rejected`.

| Consequence | Exact selected surface |
|---|---|
| Execute | One private executable None Start to User Task to None End Process; one User Task occurrence; string/null Process-start variables; string/null completion patch; the existing User Task and Process-data result algebra. |
| Preserve | BPMN Diagram Interchange; definitional Collaboration, Participants, and Message Flows; Lane Sets and Lanes; Associations, Groups, and Text Annotations; Documentation at every `BaseElement` locus; standard Definitions `name`, `exporter`, and `exporterVersion`. |
| Reject | Every unlisted executable node or property; all foreign elements and attributes; `mustUnderstand="true"` not understood by the profile; data notation; an unrelated executable Process; malformed or wrong-typed references; every profile or graph cardinality mismatch. |

Preservation remains closed and recursive. A container is preserved only when every descendant is preserved, every declared inert reference resolves to the required target type, and no descendant carries executable meaning. The default remains rejection.

`camunda:historyTimeToLive` is not safe inert metadata in this tranche. It is a source-level CIB configuration choice, while `CIB-CFG-0001` records the pinned host environment and default history TTL. The attribute remains rejected until a separate classified requirement selects its exact source spelling, value, and consequence. Rejecting it prevents the standard-preservation bundle from becoming a blanket vendor-extension bypass.

## Profile contract

The new profile has one executable-oracle authority: pinned CIB Seven `2.2.0` at the existing revision and environment. It carries the same relationship set as its process-data predecessor:

- `CIB-AGR-0001` and `CIB-AGR-0002` for the bounded sequential Process and User Task lifecycle;
- `CIB-EXT-0005` and `CIB-EXT-0006` for string/null completion and start data;
- `CIB-OP-0001` for private host-task identity mapping;
- `CIB-CFG-0001` for the pinned oracle environment.

No new CIB relationship is needed. The standard preservation requirements are independently owned by the BPMN requirement ledger and the existing preservation specification. CIB execution of the composed scenario checks that the selected executable behavior remains available with the notation present; it does not make CIB the authority for Diagram Interchange meaning.

The profile's executable checked graph and Semantic Process operation multiset are identical to the current CIB Seven User Task Process-data profile. The exact source digest and semantic profile ID remain distinct by design. Old profiles continue to reject every source shape they reject today.

## Public contract

The only new public value is the registered semantic profile ID:

```ts
type InterchangeAdmissionProfile =
  "cibseven-2.2.0-user-task-process-data-preserved-notation-draft";
```

No compilation-result union changes. An accepted result still has empty diagnostics and exposes only exact source identity plus the executed project-owned representation. Preserved material remains reachable only through the already-retained exact source bytes.

No Product 1 start, command, observation, terminal result, Workflow, Run, or recovery shape changes. No Product 2 contract changes.

## Corpus consequence

The external CIB model rows move from `cibseven-2.2.0-user-task-process-data-draft` to the new closest profile and receive freshly generated normalized diagnostic digests. This is an admission-analysis change, not an acceptance claim.

The expected reach is exact and separately counted:

- Diagram Interchange ceases to be a blocker for four deduplicated clone families;
- definitional Collaboration presentation ceases to be a blocker for three;
- Lane presentation ceases to be a blocker for two;
- standard Definitions provenance and the other selected notation cease to be blockers where present;
- every model remains rejected for at least one foreign-metadata, executable-shape, task-metadata, data, or unsupported-mechanism reason.

Physical files and clone families remain separate denominators. A smaller diagnostic set is not BPMN support, CIB compatibility, model execution, or Product 2 catalog eligibility.

## Evidence strategy

The first red is a source/profile composition discriminator: the preserved-notation BPMN source with nonempty string/null start and completion data cannot run under one registered profile today. The existing CIB Process-data profile rejects its notation, while the existing preserved-notation profile rejects its data surface.

The first green reuses the exact [preserved-notation BPMN source](../scenarios/user-task-preserved-notation/process.bpmn) and adds a separate answer-free scenario for the new profile with nonempty start data, one overwritten or added string value, and one present null completion value. The executed-only twin is authored independently and compiled under the same new profile. After normalizing only exact source identity, both must have the same checked execution projection, Semantic Process program, and semantic trace.

The evidence lanes remain independent:

- source admission proves the closed recursive preserve/reject partition and typed refusals;
- the generalized seeded non-interference guard proves that notation cannot reach the executed projection for either preserve-enabled profile;
- Lean and the pure TypeScript core execute the existing User Task Process-data account under the new profile identity;
- pinned CIB Seven executes the exact notation-bearing source with the same selected string/null public-service behavior and produces new content-bound evidence;
- the differential pipeline compares the same answer-free scenario across declared targets;
- Temporal starts the new profile through the existing product path, preserves data and occurrence identity, and proves Worker replacement, terminal result, history, and replay without inspecting notation;
- the corpus guard proves every updated external row still rejects and that each changed blocker digest is explicit.

The new profile does not need a new Lean semantic theorem. It does need the ordinary narrow Lean gate for its registered profile and scenario because a profile ID that Lean cannot admit is not a completed composition.

## Temporal hosting preflight

Admission still completes before Workflow start. Preserved content never enters the Semantic Process program, so it adds no durable ingress, wait, timer, effect, cancellation, lifecycle, ordering, concurrency, deduplication, retry, replay, or projection mechanism.

The new scenario uses the existing Process-start command and User Task completion Update. The state relation, stable waits, committed observation, and terminal result are unchanged. Exact source and semantic profile identity change intentionally; Workflow and Run identity remain private. The existing pre-start host-capability gate receives the same executable program shape and must return the same result as for the executed-only twin.

## Compatibility and evolution

This is an additive pre-release successor. It does not widen or replace an evidence-bound profile in place. Existing scenario, evidence, public example, and caller bytes remain valid and retain their current profile identity.

The shared internal preservation capability is selected by an enum-based exhaustive switch over registered profile IDs. Unknown profiles and registered profiles without that capability reject the notation exactly as before. A second public capability-composition language is deferred unless repeated named successors demonstrate that the closed profile catalog is no longer maintainable.

## Implementation constraints

The current preservation owner, [preserved-element-classification.ts](../packages/bpmn-source/src/preserved-element-classification.ts), is near its owner limit. Reuse must extract the cohesive standard-notation capability rather than grow a second classifier or duplicate its lists. The current [pipeline case catalog](../packages/differential/test/pipeline-cases.ts) is at its owner limit and must not grow; the new case belongs in a separate registered case owner. `node scripts/what-binds.ts` remains the authority for the exact guards, registries, and current headroom when implementation begins.

The implementation must not alter [semantic-profile.schema.json](../contracts/schemas/semantic-profile.schema.json) to admit two authorities or a caller-selected overlay. It must not add a second preservation manifest. The root profile artifact and the registered capability switch remain the two appropriate views: public declaration and executable dispatch.

## Review and implementation boundary

Proposal review is required because this adds a semantic profile and an admission capability composition. Owner approval is required after proposal review and before production changes.

A semantic-checkpoint review is required after the first complete executable profile/scenario checkpoint because registered admission changes. Closure review follows the ordinary policy. No combined checkpoint and closure is assumed by this proposal.

## Reopen conditions

Reopen before preserving any construct that can change execution; before admitting foreign source content; before accepting a second unbound executable Process; before letting notation reach checked source, IL, runtime, or public observation; before changing the selected CIB relationships or value domain; before making preservation caller-selectable; or if the independent source/twin and seeded-defect guard cannot discriminate a leak.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `db18ea3` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
