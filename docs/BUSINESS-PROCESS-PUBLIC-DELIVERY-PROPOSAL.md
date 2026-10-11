# Business Process public delivery proposal

## Status

Lifecycle: implementation-in-progress
Review: approved

## Question and boundary

Can the three registered business models become usable through public deployment, exact-version start and claimed Work without adding a semantic transition family? This proposal selects one complete increment: retained source overlays, optional complete string-field task metadata in the current business profiles, and caller-selected real handlers. The [selected behavioral variants](PRACTICAL-CIB7-COVERAGE-TARGET.md#selected-behavioral-variants) own their stable identities and model links. Registration and private engine evidence do not establish this public acceptance.

The existing public deployment accepts only XML and omits overlay selection; stored versions and reconstructed starts omit overlay identity. Business admission separately excludes human metadata. These are shared contract gaps, not invoice-specific behavior. Historical review receipts remain unchanged.

## Basis and scope

Inherit BPMN 2.0.2 task/control meaning, string/null data, mappings, closure bounds and Error routing from the [serial](capsules/SERIAL-BUSINESS-TASK-COMPOSITION-PROPOSAL.md), [mixed](capsules/MIXED-TASK-CONTROL-FLOW-PROPOSAL.md) and [business Error](capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md) owners. Inherit the [neutral overlay contract](A12-ADD-ON-BOUNDARY-SPEC.md#public-source-overlay-contract) and the [passive metadata contract](capsules/USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md). BPMN clauses 10.3.1/10.3.4 leave standard Resource/Rendering meaning distinct; `CIB-EXT-0011/0012` classify the selected candidate/form extensions. Retain the existing mapping/Error relationship selections. No new CIB deviation or whole-profile equivalence is selected.

Required functionality comprises exact overlay retention and forwarding, current-profile admission widening with metadata-free preservation, both publication identity joins, configured business Activities, and three production browser journeys. Metadata is optional per User Task; when present, its complete candidate/form pair is mandatory. Optional multipart deployment without an overlay is supported. Exclude new values, M6 forms, field defaults/validation, broader assignment, engine authorization, new commands/observations, UI redesign, model switches, inferred overlays, handler defaults and another maintained status registry.

## Public deployment contract

Keep `POST /api/v1/definitions?sourceId=…&semanticProfile=…`. Existing raw XML media types continue to mean no overlay. Add one closed `multipart/form-data` alternative:

| Part | Required contract |
|---|---|
| `bpmn` | Exactly one nonempty file; existing XML media types; exact bytes bounded by configured `maxSourceBytes`. |
| `sourceOverlay` | Optional nonempty `application/json` file; exact UTF-8 bytes, at most 65,536 bytes. |
| `sourceOverlayId` | Required iff overlay file is present; literal well-formed Unicode, 1–256 code points. Accept a scalar text part or a `text/plain` file containing at most 1,024 bytes of strict UTF-8. Preserve BOM and line endings. |
| `sourceOverlaySha256` | Required iff overlay file is present; exactly 64 lowercase hexadecimal ASCII characters. |

The overlay triple is present together or absent together. Reject unknown/duplicate parts or query fields, nested multipart, unsupported part media types and partial triples. Filenames carry no authority. Count actual received bytes before unbounded parsing: the complete multipart envelope is bounded by `maxSourceBytes + 81,920`, including overlay and 16,384 bytes of framing/text overhead; enforce each part's independent bound. Transport malformation, excessive size, unsupported media and engine rejection retain the existing `400`, `413`, `415` and `422` distinctions. Do not parse/re-encode an overlay or infer its identity from its contents.

The owner-approved UTF-8 ID-file alternative preserves literal line endings that [HTML multipart scalar serialization](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#multipart/form-data-encoding-algorithm) normalizes. The browser client uses native `FormData` with that file representation; it neither rewrites the serialized envelope nor chooses its boundary. Existing scalar clients remain supported. This transport extension changes no source-overlay identity, semantic admission or observation contract; closure must include serialized client and actual-route discriminators.

The [engine API](../packages/engine-api/src/index.ts) remains admission authority. Its existing input is:

```ts
type SourceOverlaySelection = Readonly<{
  id: string;
  sha256: string;
  bytes: Uint8Array;
}>;
type SourceOverlayIdentity = Readonly<{ id: string; sha256: string }>;
```

`BPD-CAPTURE-01`: at deployment-service entry, capture BPMN bytes, overlay bytes, IDs, digests and profile before its first await; compiler-returned source/profile/overlay identity must equal that captured selection before any artifact or version publication. Omission selects `null`; it never selects a registered or probe default. [Overlay admission](../packages/bpmn-source/src/source-overlay.ts) owns strict JSON, content hashing, profile matching and allowed descriptors.

## Exact versions, persistence and recovery

`BPD-IDENTITY-01`: every deployed/public definition version and confirmed instance snapshot carries required `sourceOverlay: SourceOverlayIdentity | null`. Cloning, equality, repository roundtrip and content-bound intent preserve both ID and digest. [E1](../platform/contracts/src/execution-publications.ts) and [E2](../platform/contracts/src/flow-node-occurrence-publications.ts) expected identities use this retained value; their existing codecs already admit it. Same ID with another digest cannot join History, Diagram or metrics.

`BPD-RETAIN-01`: use the existing [exact artifact port](../platform/foundation/artifact-store/src/artifact-contracts.ts) for both source and overlay. Publish verified immutable bytes before version metadata; a failed metadata write may leave only invisible unreferenced artifacts. Retain the overlay reference in Definitions, not a second overlay inventory. Missing, corrupt or mismatched artifacts fail closed.

`BPD-START-01`: exact-version preparation, dispatch and direct-start recovery retrieve the retained artifacts and reconstruct the same selection. Compare Product 1's returned definition identity, including overlay, before accepting the result. Recovery uses the reserved version snapshot, never latest-version lookup or caller reselection. Apply this same reconstruction contract to existing version-recompilation consumers without admitting new Message/Timer capabilities. Preserve existing reserve/dispatch/describe-only rules; uncertain starts cannot redispatch.

Extend both SQLite and PostgreSQL repository contracts. Shared mode uses a new forward-only checksum-bound migration and atomic exact schema-epoch advance under the [shared persistence contract](BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md#definition-artifacts). Preserve prior migration bytes, Unicode identities, source/overlay artifact references and concurrent version allocation. Migrate pre-extension definition snapshots to explicit null only because the old public contract admitted no overlay; never guess nonnull identity. Include retained downstream instance/start snapshots in that migration. Do not rewrite private intents, command IDs or historical outcomes. Old/mismatched schema readers fail readiness; mixed-version operation and silent decoder fallback are excluded.

## Passive Human Work composition

`BPD-METADATA-01`: widen only `cibseven-2.2.0-serial-business-tasks-draft`, `cibseven-2.2.0-mixed-task-control-flow-draft` and `cibseven-2.2.0-mixed-task-business-error-draft`. Reuse exact URI-expanded literal candidate-group and one-field syntax, strict duplicate/namespace/boundary-space rules, and physical omission when absent. The field type is exactly `string`; its key must satisfy the inherited writable business-identifier policy and exclude selected handler names. Boolean and partial metadata reject. A form key such as `invoiceValidator` or `execution` is not writable merely because the legacy metadata syntax accepts it.

Preserve each task's metadata through checked source, IL, wait and published task by element/occurrence identity. Metadata changes no enabled operation, data patch, branch, Error route, closure or completion admission. Claims, authorization, rendering and field validation remain [Product 2 Work facts](BPM-PLATFORM-HUMAN-WORK-SPEC.md), outside Lean meaning. No form-to-command restriction is added to the engine.

The three delivery sources use literal group `reviewers` and string field `request` on every human task. Existing empty-patch review/finalization steps submit the current request unchanged through the legacy form. Required start bindings remain required; metadata promises no write.

## Configured handlers and hosting preflight

`BPD-HOST-01`: caller-selected hosts supply the existing [invoice Activity factories](../packages/temporal-adapter/runner/examples/invoice-effect-activities.ts). Serial/rework use `createInvoiceEffectActivities`; Error recovery uses `createInvoiceRecoveryEffectActivities` in a separate explicit host configuration. Their shared `invoiceValidator` name has different business policy. That configured policy is external to semantic-profile meaning; do not merge policies, rename retained operations, select by model/profile/overlay identity, or invent a handler registry. Unknown operations fail explicitly without probe fallback.

Reuse existing native Worker deployment, content-bound start/completion, Query, effect occurrence/idempotency keys, result ledger, cancellation, replacement and replay. No Temporal primitive, wait-set shape, ordering or retry policy changes. Admission widening only adds passive data to existing User waits; inherited stable-state resumption and host-capability boundaries remain required. A live witness replaces a Worker at a metadata-bearing wait and an existing effect boundary, preserves exact arguments/metadata, completes the model and replays. Retained runtime failures remain qualification limits, not grounds for a workaround.

## Lean assurance lane

Lane shape: checked

Evidence: reuse [metadata conformance laws](../BpmnSemantics/UserTaskMetadataConformance.lean), especially exact lowering/wait/projection preservation, `completion_is_metadata_irrelevant` and wrong-occurrence preservation, and the [checked composition precedent](capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md#lean-assurance-lane). Check the three actual lowered business programs across Lean/TypeScript: metadata erasure preserves control/data results at start, completion, rework and caught Error; task metadata survives until its exact occurrence completes; stale/refused commands preserve it; closure bounds and resumption surfaces remain unchanged.

These finite checks do not prove arbitrary metadata-bearing business execution. Preserve inherited proved guarantees at their stated scope; add no universal command-proof programme, evaluator arm or relation constructor. If composition changes those guarantees or needs a new runtime mechanism, stop and reopen scope.

## Acceptance and epistemic limits

| Claim | Decisive oracle and negative |
|---|---|
| Admission/semantics | [Shared source checks](../packages/bpmn-source/test/serial-business-task-composition-source.test.ts), [metadata reader checks](../packages/bpmn-source/test/user-task-metadata-source.test.ts), independent checked/IL admission and Lean/core comparison. Metadata-free bytes persist; wrong namespace, partial/Boolean metadata, forbidden field and metadata-dependent control mutations fail. |
| Overlay lifecycle | [Deployment](../platform/modules/definitions/test/definition-deployment-service.test.ts), [HTTP](../platform/modules/definitions/test/definition-http-routes.test.ts), [start](../platform/modules/definitions/test/definition-start-service.test.ts), [recovery](../platform/modules/definitions/test/definition-start-recovery.test.ts), [repository contract](../platform/modules/definitions/test/support/definitions-repository-contract.ts): caller mutation, same-ID/wrong-digest, missing bytes, changed version and response-loss controls. |
| Retained-data upgrade | Extend the [PostgreSQL migration tests](../platform/modules/definitions/test/postgresql/postgresql-definition-repositories.test.ts) and [SQLite upgrade/readback tests](../platform/modules/definitions/test/database-schema-epoch.test.ts): upgrade populated pre-extension stores, then read through current Definitions, start, Work and Operations readers, including completed projection generations. Preserve Unicode identities, backfill exactly null, and compare private intent, command and historical outcome bytes unchanged. Exercise reserved dispatch versus already-dispatched describe-only recovery. A mutation omitting a downstream snapshot, including Work's `expected_public_instance_json`, must fail readback. Fresh-row roundtrips and catalog/epoch guards cannot substitute. |
| Published joins | [E1 contract](../platform/contracts/test/execution-publication-contract.test.ts) and [E2 contract](../platform/contracts/test/flow-node-occurrence-publication-contract.test.ts): matching retained overlay joins; wrong digest never joins. No new observation schema. |
| CIB extension calibration | Inherit public TaskService/FormService observation requirements from the metadata owner on composed source; never construct expected metadata from XML. Retain mapping/Error calibrations; do not claim whole-profile CIB execution equivalence. |
| Hosting/platform delivery | Qualify the [serial/rework browser journeys](../showcase/m3-human-work/e2e/business-invoice.spec.ts) and [business-Error browser journey](../showcase/m3-human-work/e2e/business-invoice-recovery.spec.ts) for all three models with their selected hosts: deploy/start, claim/string form, rework/Error fresh activations, stale refusal, terminal Operations, contiguous History and exact Work audit; replacement/replay remain separate hosting evidence. |

The nearest wrong account retains an overlay ID but substitutes its digest, or admits a form key that Work cannot submit. Shared compiler/decoder code and source-derived expectations are common-mode risks; independently mutate captured identities, stored artifacts, public joins and projected metadata. Registration, finite checks and command duration establish neither public closure nor delivery effort. Applicable gates follow [TESTING-SPEC](TESTING-SPEC.md); acceptance remains open until exact-source/profile/configuration evidence and independent closure are complete.

## Versioning consequences

This is atomic pre-release widening of current profiles, not a successor transition family. Metadata-free model meaning and historical replay remain unchanged. Profile relationship declarations, source digests, scenarios/evidence, public codecs, version/instance snapshots, migration epoch and expected publication identities change together. Preserve immutable receipts; fresh [proposal/checkpoint/closure review](REVIEW-POLICY.md#independent-cold-review-gate) governs this scope. Cost comparison uses the prior [metadata composition](capsules/PARALLEL-USER-TASK-METADATA-COMPOSITION-SPEC.md) increment in the existing [cost ledger](CAPSULE-COST-LEDGER.md), not a new register.

Mechanical routing uses [what-binds](../scripts/what-binds.ts). Required structural constraints include [source hygiene](../scripts/source-hygiene.test.ts), [reviewability](../scripts/document-reviewability.test.ts), [publication coverage](../scripts/execution-publication-contract-coverage.test.ts), [product boundary](../scripts/platform-product-boundary.test.ts), [migration composition](../scripts/postgresql-migration-composition.platform-test.ts) and [host policy](../scripts/platform-harness-policy.platform-test.ts). The implementation must satisfy inherited artifact/corpus guards and existing complete affected-package gates; this inventory selects no all-repository gate.

### Owners this implementation grows

Measured 2026-10-09 against the 800-nonblank review target. Each row's headroom is recomputed by reviewability; if planned growth reaches that target, reassess/extract before growth. These figures justify no extraction at this draft boundary and expire when their source changes.

| Owner | Headroom |
|---|---|
| [Business source](../packages/bpmn-source/src/serial-business-task-source.ts) | 662 |
| [Metadata reader](../packages/bpmn-source/src/user-task-metadata-source.ts) | 311 |
| [Serial admission](../packages/semantic-core/src/serial-business-task-admission.ts) | 662 |
| [Mixed admission](../packages/semantic-core/src/mixed-task-control-flow-admission.ts) | 595 |
| [Profile selection](../packages/semantic-core/src/semantic-process-profile.ts) | 477 |
| [Lean serial admission](../BpmnSemantics/SemanticProcess/SerialBusinessTaskAdmission.lean) | 622 |
| [Lean mixed admission](../BpmnSemantics/SemanticProcess/MixedTaskControlFlowAdmission.lean) | 451 |
| [Lean profile shape](../BpmnSemantics/SemanticProcess/ProfileShapeCatalog.lean) | 147 |
| [Public definitions](../platform/contracts/src/definitions.ts) | 670 |
| [E1 identity](../platform/contracts/src/execution-publications.ts) | 324 |
| [E2 identity](../platform/contracts/src/flow-node-occurrence-publications.ts) | 684 |
| [Engine gateway](../platform/foundation/engine-gateway/src/index.ts) | 425 |
| [Definitions contracts](../platform/modules/definitions/src/contracts.ts) | 613 |
| [HTTP request](../platform/modules/definitions/src/http-request.ts) | 605 |
| [HTTP routes](../platform/modules/definitions/src/http-routes.ts) | 385 |
| [Deployment](../platform/modules/definitions/src/definition-deployment-service.ts) | 560 |
| [Start/recovery](../platform/modules/definitions/src/definition-start-service.ts) | 432 |
| [Definition values](../platform/modules/definitions/src/definition-values.ts) | 733 |
| [Public values](../platform/modules/definitions/src/definition-public-values.ts) | 756 |
| [SQLite definitions](../platform/modules/definitions/src/sqlite-definition-repository.ts) | 447 |
| [PostgreSQL definitions](../platform/modules/definitions/src/postgresql-definition-repository.ts) | 663 |
| [PostgreSQL values](../platform/modules/definitions/src/postgresql-definition-values.ts) | 535 |
| [Journey host](../showcase/m3-human-work/src/host.ts) | 793 |
| [Shared journey lifecycle](../showcase/m3-human-work/src/host-runtime.ts) | 709 |
| [Browser journey](../showcase/m3-human-work/e2e/corpus-user-task-journey.spec.ts) | 687 |

## Review question and stop conditions

The review must decide whether the transport bounds, passive current-profile widening and retained-instance migration jointly preserve the inherited contracts. Recommended selections are stated above; no semantic choice is silently delegated to implementation. Stop for a new value/transition/observation, handler-policy merging, weakened identity/qualification, unreviewed migration of digest-bound material, or a Work prerequisite unavailable through published facts. Broader Practical CIB7 acceptance and its remaining denominator stay outside this proposal.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4715564a6feaaf3fe92d75daae322806432100c3` | `fork-turns-none` | `approve-with-required-edits` | `6e7261a89b379f124071ed4d9feefe99093f5974` |
| Semantic checkpoint | `3f64ddd07d24c895689822160acd0f8f44836e73` | `fork-turns-none` | `approve-with-required-edits` | `9133ea7b4ad406e6e45063551179b1348163da25` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
