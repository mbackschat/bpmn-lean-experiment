# Per-element admission diagnostics proposal

## Status

**Draft for independent cold proposal review; not owner-approved and not implemented.** This proposal closes the two diagnostic-location limits that [the preserve-only admission specification](PRESERVE-ONLY-ADMISSION-SPEC.md#d3--typed-per-element-diagnostics-with-a-deterministic-identity) deliberately left for a governed increment. It changes where an existing rejection is classified and the location carried by that rejection. It changes no admitted source set, BPMN meaning, semantic profile meaning, checked graph, Semantic Process program, runtime transition, or Temporal refinement claim.

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

The exact admitted key arrays move into one project-owned, profile-and-type-aware flow-element inventory. Projection predicates and the pre-projection classifier consume the same immutable entries. A projector does not retain a second literal list beside the diagnostic classifier.

The inventory distinguishes shapes that share a BPMN type but not a profile contract, including the generic Service Task, A12 CreateDocument Service Task, A12 boundary-Error Service Task, the boundary-Error reader's Sequence Flow, and the Call Activity reader's Call Activity and Sequence Flow. Shared plain-node, gateway, boundary-event, Sub-Process, and standard Sequence Flow entries remain shared only where their consumed key sets are exactly equal.

The inventory owns keys, not values or topology. A listed key with an unsupported value still reaches the existing projector or structural admission rule and keeps its current document-level refusal. This prevents a diagnostic-quality increment from silently broadening source admission or replacing profile-specific shape checks.

### ADMDIAG-DISPATCH-01 - cover the generic compiler and all three specialized readers

The generic compiler collects flow-element key rejections beside its existing type, foreign-attribute, retention, `Definitions`, and `Process` classification records, then orders and deduplicates them through the existing diagnostic owner. Each specialized reader runs the same key classifier over the flow elements of the Process roots it has selected before invoking its projectors.

The bounded dispatch denominator is exactly four paths: the generic compiler, A12 CreateDocument, A12 boundary Error, and Call Activity. A table-driven test derives one case from each current path's admitted source and applies the same unsupported-property perturbation. Every unperturbed source must still compile to the same complete accepted result by value: status, source identity, diagnostics, checked graph, Semantic Process program, and the bytes returned by `copyExactBytes`. Callable identity is not compared.

This proposal does not introduce the dispatch registry scheduled separately in [PLAN.md](PLAN.md#ordered-work). That later refactor has a complete-result equality oracle and must remain behavior-preserving. Folding it into this governed diagnostic change would remove that oracle.

### ADMDIAG-BOUNDARY-01 - preserve all semantic and host boundaries

The public result remains the existing `Accepted | Rejected` union, and the proposal adds no diagnostic code, capability, field, schema, or wire representation. It changes only which existing diagnostic is returned for this exact classification class and fills the existing element location.

An admitted source produces the same checked graph and Semantic Process program. A source rejected by this rule produces neither. Lean, the TypeScript semantic core, the Temporal adapter, and CIB receive no new or changed input. No CIB relationship is selected, and the two A12-shaped readers remain bounded vertical source-admission fixtures under the existing MIT/EUPL separation.

## Required, optional, and excluded

**Required.** One shared flow-element key inventory; pre-projection key classification in the generic compiler and all three specialized readers; exact located diagnostics for the four separating cases; unchanged complete accepted results for every unperturbed dispatch source; and unchanged document-level diagnostics for value, identity, topology, cardinality, and checked-graph refusals outside the own-property class.

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

The nearest realistic inventory defect is a projector retaining a private key list while classification reads another. The implementation closes it structurally by making both operations consume the same exported immutable entry, and the focused test enumerates every current profile/type entry and every dispatch path. A type or profile with no entry must refuse rather than fall back to a broader type's keys.

## Assurance lane and source-to-result claim

The assurance lane is **checked**. Lean cannot receive or state this claim because the rejected source never reaches checked source. The exact source-to-result claim is finite: for every current dispatch path, an unadmitted own property on an executed flow element is rejected with the correct existing located diagnostic, while the accepted result for that path's unperturbed source is unchanged.

This work makes no structure newly reachable, so closure bounds, multiple-enabledness, stable-state resumability, and Temporal host capability remain unchanged. No general checked-source preservation theorem reopens.

## Temporal hosting and refinement preflight

Admission still completes before Workflow start. The change adds no durable ingress, acknowledgement, wait, timer, subscription, effect, cancellation, lifecycle, ordering, concurrency, deduplication, retry, projection, replay, or versioning mechanism.

The state relation is unchanged because accepted checked graphs and programs are unchanged. A rejected source still creates no Workflow, and its diagnostic list is not a Workflow argument. The smallest host witness is therefore the existing pre-start rejection path; no live history can distinguish the proposed diagnostic from the current one, and inventing a Temporal test would confuse deployment admission with runtime refinement.

## Versioning and lifecycle

No semantic profile ID or compiler identity changes. The accepted source set and every produced semantic artifact remain unchanged, and the diagnostic union already contains the exact code, capability, and element shape this increment uses. Under the [pre-release evolution policy](PROJECT-DESIGN.md#pre-release-evolution-policy), all current diagnostic producers, renderers, tests, and documentation update atomically without retaining a legacy null-location branch for this classification class.

After implementation and governed closure, the stable delta moves into [the preserve-only admission specification](PRESERVE-ONLY-ADMISSION-SPEC.md) and this proposal is removed or archived under [the documentation discipline](DOC-DISCIPLINE.md#proposal-graduation). Because this is one source-only lane with no downstream artifacts or host work, the first green implementation target may use a combined semantic-checkpoint and closure review only if it already includes the complete focused and repository gates, exact implementation/map/plan status, cost record, and epistemic closure. Otherwise implementation pauses for the ordinary cold semantic checkpoint.

## Producers, consumers, guards, and headroom

The planned new owner is `packages/bpmn-source/src/projected-flow-element-keys.ts`. It owns only the closed key inventory and the flow-element own-property classifier. [The generic compiler](../packages/bpmn-source/src/checked-process-compiler.ts), [the central projector](../packages/bpmn-source/src/checked-element-projection.ts), [scoped flow collection](../packages/bpmn-source/src/scoped-flow-elements.ts), [the specialized gateway and event projectors](../packages/bpmn-source/src/event-based-gateway-source.ts), [inclusive projection](../packages/bpmn-source/src/inclusive-gateway-source.ts), [Message projection](../packages/bpmn-source/src/intermediate-catch-message-source.ts), [Receive Task projection](../packages/bpmn-source/src/receive-task-source.ts), [Exclusive Gateway projection](../packages/bpmn-source/src/simple-boolean-exclusive-gateway-source.ts), [Error projection](../packages/bpmn-source/src/subprocess-error-source.ts), and [boundary-Timer projection](../packages/bpmn-source/src/timer-boundary-event-source.ts) consume its entries instead of retaining their top-level flow-element key lists.

The three selected-shape consumers are [A12 CreateDocument](../packages/bpmn-source/src/a12-create-document-source.ts), [A12 boundary Error](../packages/bpmn-source/src/a12-boundary-error-source.ts), and [Call Activity](../packages/bpmn-source/src/call-activity-source.ts). The public behavior is guarded in [the per-element diagnostic test](../packages/bpmn-source/test/per-element-admission-diagnostics.test.ts), and a new `packages/bpmn-source/test/projected-flow-element-keys.test.ts` owns the complete profile/type inventory guard. [The package guide](../packages/bpmn-source/README.md), [the implementation map](IMPLEMENTATION-MAP.md), and [the plan](PLAN.md) own the changed public description and status.

The mechanically discovered executable constraints are [the metamodel-default admission test](../packages/bpmn-source/test/metamodel-default-admission.test.ts), [the A12 licence boundary](../scripts/a12-boundary.test.ts), [contract-schema coverage](../scripts/contract-schema-coverage.test.ts), [pre-release architecture](../scripts/pre-release-architecture.test.ts), [source hygiene](../scripts/source-hygiene.test.ts), [documentation reviewability](../scripts/document-reviewability.test.ts), [Markdown links](../scripts/markdown-links.test.ts), and [the independent-review policy](../scripts/independent-review-policy.test.ts). The focused gate is `gtimeout 60s env CI=true ./scripts/pnpm.sh run test:bpmn-source`; the complete gate remains `./scripts/verify.sh`, run once at the governed review boundary and treated as correctness-only timing while the host is contended.

| Owner expected to grow | Current nonblank | Headroom to 600 |
|---|---:|---:|
| New projected-flow-element key owner | 0 | 600 |
| `checked-element-projection.ts` | 333 | 267 |
| `checked-process-compiler.ts` | 358 | 242 |
| `a12-create-document-source.ts` | 329 | 271 |
| `a12-boundary-error-source.ts` | 495 | 105 |
| `call-activity-source.ts` | 334 | 266 |
| `event-based-gateway-source.ts` | 47 | 553 |
| `inclusive-gateway-source.ts` | 119 | 481 |
| `intermediate-catch-message-source.ts` | 66 | 534 |
| `receive-task-source.ts` | 44 | 556 |
| `scoped-flow-elements.ts` | 128 | 472 |
| `simple-boolean-exclusive-gateway-source.ts` | 110 | 490 |
| `subprocess-error-source.ts` | 143 | 457 |
| `timer-boundary-event-source.ts` | 107 | 493 |
| `per-element-admission-diagnostics.test.ts` | 355 | 245 |
| New projected-flow-element key inventory test | 0 | 600 |

No measured owner requires a preliminary extraction. The narrowest headroom is 105 lines in the boundary-Error reader, while that reader should gain only an import and one pre-projection call as its existing literal keys move out. If the implementation needs more than that bound permits, it stops and extracts a cohesive owner in a separate behavior-preserving commit rather than compressing the reader.

## Owner decision

**Recommendation: approve `ADMDIAG-FLOWKEY-01`, `ADMDIAG-KEYOWNER-01`, `ADMDIAG-DISPATCH-01`, and `ADMDIAG-BOUNDARY-01` together after the cold proposal review passes.** The four rules are one minimal contract: location without a shared key owner would add a second admission account, while a shared key owner without all four dispatch paths would reproduce the omission this increment exists to close.

## Reopen conditions

Reopen before locating nested non-flow elements, changing the accepted source set, preserving extension content, adding another diagnostic code or field, changing profile identity, merging the separate dispatch-registry increment, or allowing a classified property to reach the checked graph or program.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `8746bc6` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

A documentation-only follow-up will record the immutable proposal target before the review prompt is handed off. Implementation remains blocked until the proposal review passes and the owner approves the reviewed contract.
