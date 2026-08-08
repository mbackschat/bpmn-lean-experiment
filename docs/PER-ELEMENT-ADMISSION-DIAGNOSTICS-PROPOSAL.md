# Per-element admission diagnostics proposal

## Status

**Closure-approved; graduation pending.** The review of immutable proposal target `8746bc6` returned `approve-with-required-edits` across four test-contract and guard-inventory findings, and correction audit `ad1a88b` closed all four. The owner approved all four rules together on 2026-08-08. Combined checkpoint-and-closure target `106f063` was rejected because embedded Sub-Process key admission still ran before classification and because the first green implementation commit was not a fully closed combined target. Ordinary semantic-checkpoint target `d2ad977` returned `approve-with-required-edits` for one incomplete closed-site guard, and correction audit `dfec90a` closed it by scanning every production source and seeding the pre-classification regression. The exact same reviewer approved closure target `1fb7534` under the byte-identical warm-continuity manifest. The increment changes no admitted source set, BPMN meaning, semantic profile meaning, checked graph, Semantic Process program, runtime transition, or Temporal refinement claim.

[PLAN.md](PLAN.md#exact-resume-point) owns sequencing, [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md#bpmn-source) owns the exact current absence, and [the BPMN XML ingestion decision](BPMN-XML-INGESTION-DECISION.md#admission-and-security-policy) owns the import stages this proposal preserves.

## The question

How should every current compiler dispatch locate an unsupported own property on an otherwise recognized executed flow element without creating a second answer to what each projector consumes?

The current generic compiler classifies unsupported keys only on `Definitions` and `Process`. It partitions flow elements by type and then lets projection predicates return `undefined` when a recognized node or Sequence Flow carries an extra own property. The three specialized readers for A12 CreateDocument, A12 boundary Error, and Call Activity use the same boolean projection shape. All four paths reject safely, but each reports one `unsupportedModel` diagnostic with `element: null`.

One separating perturbation reproduces the mechanism on all four paths: add `<bpmn:extensionElements/>` to the first executed Start Event of each path's admitted source. The generic compiler reports that every admitted node needs a supported plain shape; the three specialized readers report their respective model-shape failures. None names the Start Event, its containment path, or `extensionElements`.

## Proposed contract

### ADMDIAG-FLOWKEY-01 - locate unsupported own properties before projection

For every flow element that a current dispatch path has selected for execution, inspect its own enumerable modelled keys before projecting it. A key that the selected projector does not consume, that does not carry its declared metamodel default, and that the profile does not preserve produces `BpmnSourceDiagnosticCode.UnsupportedProperty` with the existing `BpmnSourceElement` location.

The record carries the element's nullable `id`, parsed `$type`, deterministic containment path, `subject` equal to the rejected property name, and `requiredCapability` equal to `BpmnAdmissionCapability.PreserveProperty`. If this is the source's only fault, the result contains that one located diagnostic and no document-level `unsupportedModel` fallback.

This rule applies to the executed flow-element layer only: recognized flow nodes, Call Activity in its selected reader, and Sequence Flows. It does not classify `Definitions`, `Process`, or root artifacts again, because existing owners already do so where promised. It also does not turn a nested event definition, mapping child, or extension value failure into an own-property location unless that nested element receives a separately reviewed inventory later.

### ADMDIAG-KEYOWNER-01 - one closed key inventory decides both checks

The exact projector-consumed top-level key sets move into one project-owned, profile-and-type-aware flow-element inventory. Projection predicates and the pre-projection classifier consume the same immutable entries. A projector does not retain a second literal list beside the diagnostic classifier.

The inventory distinguishes shapes that share a BPMN type but not a profile contract, including the generic Service Task, A12 CreateDocument Service Task, A12 boundary-Error Service Task, the boundary-Error reader's Sequence Flow, and the Call Activity reader's Call Activity and Sequence Flow. Shared plain-node, gateway, boundary-event, Sub-Process, and standard Sequence Flow entries remain shared only where their consumed key sets are exactly equal.

An inventory entry includes every top-level key the projector consumes or interprets, including a key used by a default-aware value check even when the current literal allowlist omits it because the admitted default is absent from the parsed object. In particular, the A12 boundary-Error Boundary Event entry includes `cancelActivity`: omitted/default-true remains admitted, while an explicit `cancelActivity="false"` passes key classification and keeps the reader's current document-level value refusal.

The inventory owns keys, not values or topology. A listed key with an unsupported value still reaches the existing projector or structural admission rule and keeps its current document-level refusal. This prevents a diagnostic-quality increment from silently broadening source admission or replacing profile-specific shape checks.

### ADMDIAG-DISPATCH-01 - cover the generic compiler and all three specialized readers

The generic compiler collects flow-element key rejections beside its existing type, foreign-attribute, retention, `Definitions`, and `Process` classification records, then orders and deduplicates them through the existing diagnostic owner. Each specialized reader runs the same key classifier over the flow elements of the Process roots it has selected before invoking its projectors.

The bounded dispatch denominator is exactly four paths: the generic compiler, A12 CreateDocument, A12 boundary Error, and Call Activity. A table-driven test derives one case from each current path's admitted source and applies the same unsupported-property perturbation.

Before a projection predicate changes, `packages/bpmn-source/test/fixtures/per-element-admission-baseline.json` is minted from the public compilation results at reviewed pre-change target `8746bc6`. It stores one canonical projection for each of the four unperturbed sources: status, source identity, diagnostics, checked graph, Semantic Process program, and the bytes returned by `copyExactBytes` encoded as lowercase hexadecimal. The implementation test compares the post-change result with that immutable projection by value; callable identity is the only excluded field. Compiling twice after the refactor is not an oracle.

The same fixture stores the complete current diagnostic projections for the four representative rejected inputs named below, including status, source identity, ordered diagnostics, and the absence of checked graph and program. Ordinary verification has no update mode. Replacing any fixture entry requires a separately owner-authorized, review-targeted commit that names the intentional public-result change; replacing an entry during this unchanged-result increment invalidates its oracle and stops implementation.

This proposal does not introduce the dispatch registry scheduled separately in [PLAN.md](PLAN.md#ordered-work). That later refactor has a complete-result equality oracle and must remain behavior-preserving. Folding it into this governed diagnostic change would remove that oracle.

### ADMDIAG-BOUNDARY-01 - preserve all semantic and host boundaries

The public result remains the existing `Accepted | Rejected` union, and the proposal adds no diagnostic code, capability, field, schema, or wire representation. It changes only which existing diagnostic is returned for this exact classification class and fills the existing element location.

An admitted source produces the same checked graph and Semantic Process program. A source rejected by this rule produces neither. Lean, the TypeScript semantic core, the Temporal adapter, and CIB receive no new or changed input. No CIB relationship is selected, and the two A12-shaped readers remain bounded vertical source-admission fixtures under the existing MIT/EUPL separation.

## Required, optional, and excluded

**Required.** One shared flow-element key inventory; pre-projection key classification in the generic compiler and all three specialized readers; exact located diagnostics for the four dispatch cases and the embedded Sub-Process pre-classification discriminator; immutable pre-change result projections for every unperturbed dispatch source and the four representative non-property refusals; an executable structural guard against a second top-level flow-element key list; unchanged complete accepted results for every unperturbed dispatch source; and unchanged document-level diagnostics for value, identity, topology, cardinality, and checked-graph refusals outside the own-property class.

**Optional.** None. A source-location range, normalized preserved subtree, or new public diagnostic renderer would expand this increment and needs its own consumer.

**Excluded.** New admitted BPMN, preservation of `extensionElements`, execution of extension content, foreign-attribute policy changes, exhaustive nested-element diagnostics, parser-warning changes, root-definition changes, checked-graph or IL changes, a profile/version successor, Lean work, CIB probes, Temporal work, and platform implementation.

## Cross-target invariant matrix

| Surface | Required fact | Explicit non-requirement |
|---|---|---|
| Source compiler, seeded property | `Rejected`; one located `unsupportedProperty`; no checked graph or program | No source-range location and no nested-child diagnosis |
| Source compiler, unperturbed inputs | Complete accepted result remains equal, including diagnostics, checked graph, and program | No new profile or compiler identity |
| Other rejected inputs | Results remain equal unless the deciding fault is an unadmitted own property on an executed flow element | No claim that every structural refusal can name one element |
| Lean and TypeScript semantic core | Receive byte-identical admitted artifacts and no rejected artifact | No new theorem or evaluator case |
| Temporal adapter | Starts exactly the same admitted programs; rejected inputs still stop before Workflow start | No ingress, wait, timer, effect, cancellation, history, or replay change |
| CIB and A12 evidence | No oracle execution or relationship change | No compatibility or adoption increase |

## Separating evidence

The smallest red matrix inserts an empty `extensionElements` child immediately before the closing tag of the first executed Start Event in four already-admitted sources.

| Dispatch path | Expected element ID | Expected containment path |
|---|---|---|
| Generic preserve-enabled compiler | `StartEvent_1` | `definitions/rootElements[1]/flowElements[0]` |
| A12 CreateDocument reader | `StartEvent_CreateDocument` | `definitions/rootElements[0]/flowElements[0]` |
| A12 boundary-Error reader | `StartEvent_None` | `definitions/rootElements[1]/flowElements[0]` |
| Call Activity reader | `CallerStart` | `definitions/rootElements[0]/flowElements[0]` |

Every case must first reproduce the current `unsupportedModel` plus `element: null`, then require the exact element ID, `bpmn:StartEvent`, path, `subject: "extensionElements"`, and `PreserveProperty` capability. The four-path parameterization prevents a correction installed only in the generic compiler or in the reader named by one observed failure.

One additional generic-compiler discriminator adds the same property to `SubProcess_Work` in the admitted embedded Sub-Process source and requires its exact `definitions/rootElements[0]/flowElements[1]` location. It separates dispatch coverage from classification order: scope collection must validate Sub-Process identity, containment, and listed values without deciding its key set before the shared classifier runs. The inventory-backed Embedded Sub-Process projector predicate remains after classification.

The nearest realistic inventory defect is a projector retaining a private key list while classification reads another. The implementation closes it structurally by making both operations consume the same exported immutable entry. A type or profile with no entry must refuse rather than fall back to a broader type's keys.

`packages/bpmn-source/test/projected-flow-element-keys.test.ts` is both the inventory completeness test and a source-structure ownership guard. It parses every production TypeScript source under `packages/bpmn-source/src` with the TypeScript compiler API. Its closed consumer-site table contains source path plus containing function or callback anchor, but no property names. Every table entry must reference exactly one exported inventory entry, every inventory entry must have at least one table entry, and each registered region must use the inventory-backed top-level predicate. The Embedded Sub-Process entry names the central projector rather than scope collection, so a pre-classification inventory predicate becomes an unregistered consumer and fails the closed-site comparison. Within the registered regions the guard rejects an array literal passed as the key argument to `hasOnlyModelledKeys` outside `projected-flow-element-keys.ts`; this also fails when a private literal replaces the inventory-backed predicate entirely. The test applies the scanner to two in-memory mutations and requires both to fail: the restored Inclusive Gateway private list and a restored pre-classification Embedded Sub-Process inventory call. Nested event-definition, mapping-child, and root-artifact functions are absent from the consumer-site table and remain under the stated exclusions.

The unchanged-refusal discriminator is also explicit rather than inferred from general source coverage.

| Refusal class | Representative perturbation | Required result |
|---|---|---|
| Consumed key with unsupported value | A12 boundary Error sets `cancelActivity="false"` | Exact pre-change document-level diagnostic projection; no `unsupportedProperty` |
| Consumed identity with unsupported value | Call Activity sets `calledElement="CalledProcess"` without a QName prefix | Exact pre-change document-level diagnostic projection; no `unsupportedProperty` |
| Nested mapping cardinality | A12 CreateDocument adds a second input parameter | Exact pre-change document-level diagnostic projection; no located top-level property claim |
| Checked-graph refusal | Generic source adds the second Start Event and incoming Sequence Flow already used by the per-element test | Exact pre-change `unsupportedModel` with `element: null` |

These four rejected projections live beside the four accepted projections in the immutable baseline fixture. They are exact ordered-diagnostic comparisons, not status-only assertions.

## Assurance lane and source-to-result claim

The assurance lane is **checked**. Lean cannot receive or state this claim because the rejected source never reaches checked source. The exact source-to-result claim is finite: every current dispatch path rejects an unadmitted own property on its representative executed Start Event with the correct existing located diagnostic; the generic recursive collection path does the same for an embedded Sub-Process; and the accepted result for every dispatch path's unperturbed source is unchanged.

This work makes no structure newly reachable, so closure bounds, multiple-enabledness, stable-state resumability, and Temporal host capability remain unchanged. No general checked-source preservation theorem reopens.

## Temporal hosting and refinement preflight

Admission still completes before Workflow start. The change adds no durable ingress, acknowledgement, wait, timer, subscription, effect, cancellation, lifecycle, ordering, concurrency, deduplication, retry, projection, replay, or versioning mechanism.

The state relation is unchanged because accepted checked graphs and programs are unchanged. A rejected source still creates no Workflow, and its diagnostic list is not a Workflow argument. The smallest host witness is therefore the existing pre-start rejection path; no live history can distinguish the proposed diagnostic from the current one, and inventing a Temporal test would confuse deployment admission with runtime refinement.

## Implementation and closure evidence

The first red matrix reproduced the same current mechanism on all four dispatch paths: each seeded Start Event `extensionElements` property produced a document-level `unsupportedModel` diagnostic with `element: null`. Combined review then supplied the nearest untested shape: an embedded Sub-Process with the same property reached its scope-shape fallback before classification and produced the same null-location result. The correction's red test reproduced that exact result. The green implementation keeps identity, containment, name, and `triggeredByEvent` checks in scope collection, moves only key admissibility to the central Sub-Process projector after shared classification, and returns the exact existing located `unsupportedProperty`. The focused BPMN-source gate passes all 277 tests, including the four dispatch cases, the Sub-Process ordering case, the duplicate-list mutation, and the pre-classification consumer mutation; source hygiene passes all 30 checks, and infrastructure passes all 191 tests.

The accepted-result oracle is the immutable fixture bound to reviewed pre-change target `8746bc6bbdeb126a79d56c6f510adc4e5f780d98`, not a post-change self-comparison. All four accepted public compilation results remain exactly equal by value, including source identity, ordered diagnostics, checked graph, Semantic Process program, and copied exact bytes. The four representative rejected projections also remain exactly equal: explicit `cancelActivity="false"`, the unprefixed Call Activity `calledElement`, duplicate A12 input mapping, and the generic checked-graph refusal. The inventory guard scans every production TypeScript source, requires the closed profile/type consumer matrix to match actual inventory consumers in both directions, and proves its own sensitivity with in-memory mutations that restore the former Inclusive Gateway private key list and the pre-classification Embedded Sub-Process inventory call.

The finite closure denominator is the four current dispatch paths plus the generic recursive Sub-Process pre-classification gate that the rejected review exposed. The implementation closes the own-property classification and location claim for that denominator without changing the accepted source set or any profile, checked graph, program, runtime, public result union, or pre-start host boundary. A second probe over the Sub-Process boundary-Timer profile returns the same located result, confirming that the recursive collection mechanism rather than one fixture caused the miss. Nested Event definitions, mapping children, unsupported listed-key values, and topology or cardinality refusals remain outside this location increment and retain their document-level behavior. Lean, CIB, the TypeScript semantic core, and Temporal received no new semantic artifact or evidence.

The complete gate passed at clean target `fb4b7dcfcb2d7c20b207fe83bb5e2b39437c4705` with 35 cross-target agreements, all 35 seeded semantic mutations detected, 18 retained-CIB comparisons, and 37 live histories. Its `22167.165708ms` warm total is correctness evidence only because the host was contended. The exact gate output is retained for closure review with SHA-256 `642c34b4373c6b78b344cf3b2dbe4142eb10206e2be835238d092b04f6fed6c8`. Cost from owner-approved baseline `312684f` through that target is `+1153/-110` nonblank code and `+43/-38` documentation. Both addition measures fell against the nearest same-layer preserve-only admission increment, so the closure reflection requires no further process-weight removal.

## Versioning and lifecycle

No semantic profile ID or compiler identity changes. The accepted source set and every produced semantic artifact remain unchanged, and the diagnostic union already contains the exact code, capability, and element shape this increment uses. Under the [pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy), all current diagnostic producers, renderers, tests, and documentation update atomically without retaining a legacy null-location branch for this classification class.

After implementation and governed closure, the stable delta moves into [the preserve-only admission specification](PRESERVE-ONLY-ADMISSION-SPEC.md) and this proposal is removed or archived under [the documentation discipline](DOC-DISCIPLINE.md#proposal-graduation). Combined target `106f063` did not meet the first-green combined-review prerequisite, so the corrected implementation pauses for an ordinary context-cold semantic checkpoint. After that approval, closure adds the complete gate, final cost, epistemic closure, and exact status before its own governed review.

## Producers, consumers, guards, and headroom

The implemented owner is `packages/bpmn-source/src/projected-flow-element-keys.ts`. It owns only the closed key inventory and the flow-element own-property classifier. [The generic compiler](../packages/bpmn-source/src/checked-process-compiler.ts), [the central projector](../packages/bpmn-source/src/checked-element-projection.ts), [the specialized gateway and event projectors](../packages/bpmn-source/src/event-based-gateway-source.ts), [inclusive projection](../packages/bpmn-source/src/inclusive-gateway-source.ts), [Message projection](../packages/bpmn-source/src/intermediate-catch-message-source.ts), [Receive Task projection](../packages/bpmn-source/src/receive-task-source.ts), [Exclusive Gateway projection](../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts), [Error projection](../packages/bpmn-source/src/subprocess-error-source.ts), and [boundary-Timer projection](../packages/bpmn-source/src/timer-boundary-event-source.ts) consume its entries instead of retaining their top-level flow-element key lists. [Scoped flow collection](../packages/bpmn-source/src/scoped-flow-elements.ts) deliberately does not consume the inventory because it runs before classification and owns only containment plus listed-value checks.

The three selected-shape consumers are [A12 CreateDocument](../packages/bpmn-source/src/a12-create-document-source.ts), [A12 boundary Error](../packages/bpmn-source/src/a12-boundary-error-source.ts), and [Call Activity](../packages/bpmn-source/src/call-activity-source.ts). The public behavior and baseline projection fixture are owned by [the per-element diagnostic test](../packages/bpmn-source/test/per-element-admission-diagnostics.test.ts), while the new `packages/bpmn-source/test/projected-flow-element-keys.test.ts` owns inventory completeness and the structural ownership mutation. [The package guide](../packages/bpmn-source/README.md), [the implementation map](IMPLEMENTATION-MAP.md), [the preserve-only admission specification](PRESERVE-ONLY-ADMISSION-SPEC.md), and [the plan](PLAN.md) own the changed public description and status.

`node scripts/what-binds.ts` was rerun over every planned source, test, fixture, package-guide, implementation-map, preserve-specification, proposal, and plan path. The complete distinct source-tree binding set is [the metamodel-default admission test](../packages/bpmn-source/test/metamodel-default-admission.test.ts), [the scoped-flow source guard](../packages/bpmn-source/test/bpmn-source.test.ts), [the A12 licence boundary](../scripts/a12-boundary.test.ts), [capsule cost](../scripts/capsule-cost.test.ts), [contract-schema coverage](../scripts/contract-schema-coverage.test.ts), [contributor setup](../scripts/contributor-setup.test.ts), [documentation reviewability](../scripts/document-reviewability.test.ts), [Markdown links](../scripts/markdown-links.test.ts), [pre-release architecture](../scripts/pre-release-architecture.test.ts), [source hygiene](../scripts/source-hygiene.test.ts), [what-binds coverage](../scripts/what-binds.test.ts), and [the package registry](../packages/bpmn-source/README.md).

The planned documentation paths additionally bind [activity boundary-Timer source](../packages/bpmn-source/test/activity-boundary-timer-source.test.ts), [foreign-attribute admission](../packages/bpmn-source/test/foreign-attribute-admission.test.ts), [non-interrupting boundary-Timer source](../packages/bpmn-source/test/non-interrupting-boundary-timer-source.test.ts), [per-element admission diagnostics](../packages/bpmn-source/test/per-element-admission-diagnostics.test.ts), [preserve-only admission](../packages/bpmn-source/test/preserve-only-admission.test.ts), [Sub-Process boundary-Timer source](../packages/bpmn-source/test/subprocess-boundary-timer-source.test.ts), [the differential pipeline](../packages/differential/test/pipeline.test.ts), [activity boundary-Timer semantics](../packages/semantic-core/test/activity-boundary-timer.test.ts), [non-interrupting boundary-Timer semantics](../packages/semantic-core/test/non-interrupting-boundary-timer.test.ts), [Sub-Process boundary-Timer semantics](../packages/semantic-core/test/subprocess-boundary-timer.test.ts), [the preserved-notation Temporal twin](../packages/temporal-adapter/test/preserved-notation-twin.test.ts), [BPMN corpus policy](../scripts/bpmn-corpus-policy.test.ts), [capsule cost comparison](../scripts/capsule-cost-comparison.test.ts), [CIB observation fidelity](../scripts/cib-observation-fidelity.test.ts), [independent review policy](../scripts/independent-review-policy.test.ts), [map scope delegation](../scripts/map-scope-delegation.test.ts), [normative reference resolution](../scripts/normative-reference-resolution.test.ts), [pinned toolchain](../scripts/pinned-toolchain.test.ts), [plan status consistency](../scripts/plan-status-consistency.test.ts), [publication statistics](../scripts/publication-statistics.test.ts), [requirement-ledger consistency](../scripts/requirement-ledger-consistency.test.ts), [semantic review packets](../scripts/semantic-review-packet.test.ts), [the verification entrypoint](../scripts/verification-entrypoint.test.ts), and [the documentation registry](README.md). The focused gate is `gtimeout 60s env CI=true ./scripts/pnpm.sh run test:bpmn-source`; the complete gate remains `./scripts/verify.sh`, run once at the governed review boundary and treated as correctness-only timing while the host is contended.

| Implemented owner | Checkpoint nonblank | Headroom to 600 |
|---|---:|---:|
| `projected-flow-element-keys.ts` | 255 | 345 |
| `checked-element-projection.ts` | 345 | 255 |
| `checked-process-compiler.ts` | 375 | 225 |
| `a12-create-document-source.ts` | 361 | 239 |
| `a12-boundary-error-source.ts` | 522 | 78 |
| `call-activity-source.ts` | 370 | 230 |
| `event-based-gateway-source.ts` | 44 | 556 |
| `inclusive-gateway-source.ts` | 125 | 475 |
| `intermediate-catch-message-source.ts` | 68 | 532 |
| `receive-task-source.ts` | 42 | 558 |
| `scoped-flow-elements.ts` | 120 | 480 |
| `simple-boolean-exclusive-gateway-source.ts` | 111 | 489 |
| `subprocess-error-source.ts` | 147 | 453 |
| `timer-boundary-event-source.ts` | 107 | 493 |
| `per-element-admission-diagnostics.test.ts` | 577 | 23 |
| `projected-flow-element-keys.test.ts` | 442 | 158 |
| Immutable baseline projection fixture | not applicable | not a hand-written source owner |

No implemented source owner exceeds the 600-nonblank target. The public-result test is the narrowest owner at 23 lines of headroom, while the boundary-Error reader retains 78; the correction needed no compression or unrelated extraction.

## Owner decision

**Approved 2026-08-08: `ADMDIAG-FLOWKEY-01`, `ADMDIAG-KEYOWNER-01`, `ADMDIAG-DISPATCH-01`, and `ADMDIAG-BOUNDARY-01` together.** The four rules are one minimal contract: location without a shared key owner would add a second admission account, while a shared key owner without all four dispatch paths would reproduce the omission this increment exists to close.

## Reopen conditions

Reopen before locating nested non-flow elements, changing the accepted source set, preserving extension content, adding another diagnostic code or field, changing profile identity, merging the separate dispatch-registry increment, or allowing a classified property to reach the checked graph or program.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `8746bc6` | `fork-turns-none` | `approve-with-required-edits` | `ad1a88b` |
| Semantic checkpoint | `d2ad977` | `fork-turns-none` | `approve-with-required-edits` | `dfec90a` |
| Closure | `1fb7534` | `checkpoint-reviewer-warm` | `approve` | `not-required` |

The proposal stage used one correction round. The context-cold review of target `8746bc6` returned four required findings about the pre-change result oracle, duplicate-list mutation guard, consumed-key value discriminator, and mechanically complete guard inventory. Correction audit `ad1a88b` closed all four with no new required defect, and the owner then approved the reviewed contract. The semantic checkpoint also used one correction round: review target `d2ad977` found that the guard's file selection omitted the exact pre-classification source it claimed to police, and correction audit `dfec90a` closed that finding with no new required defect. The same reviewer approved closure target `1fb7534` with no required or advisory finding after confirming complete warm-continuity selection, exact cost arithmetic, exact closure status, and preserved exclusions.
