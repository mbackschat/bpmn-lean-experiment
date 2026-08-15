# Parallel User Task metadata composition proposal

## Status

**Owner-approved after independent review on 2026-08-15; the first private semantic checkpoint is implemented and awaits its required independent checkpoint verdict.** This proposal selects one bounded successor profile that composes the already implemented balanced two-branch Parallel Gateway account with the already implemented passive User Task assignment and form metadata account. It widens profile admission and CIB calibration evidence, but adds no BPMN meaning, Semantic Process operation, runtime collection, command, public field, Temporal primitive, or Product 2 contract. CIB evidence, profile and scenario registration, live Temporal execution, and Product 2 integration remain unauthorized until the checkpoint review passes.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `b5c8ff5` | `fork-turns-none` | `approve-with-required-edits` | `92f72ac` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question and recommendation

May one new profile admit an independently authored balanced Parallel Gateway Process whose two simultaneously active User Tasks each carry the existing exact candidate-group and generated-form metadata, so the BPM platform can offer a second honest catalog journey without reinterpreting the metadata-free parallel fixture?

**Recommendation: yes, through one exact composed profile and one new source model.** Reuse the normative two-branch fork/join semantics, the existing passive metadata representation, the existing completion command, and the existing Product 2 claim/form/audit behavior. Require combined evidence at every seam because separate green fixtures do not prove that two metadata-bearing tasks coexist correctly.

## Authority and classification

The [parallel fork/join specification](PARALLEL-FORK-JOIN-SPEC.md) remains authoritative for the bounded BPMN control-flow account. The [User Task assignment and form metadata specification](USER-TASK-ASSIGNMENT-FORM-METADATA-SPEC.md) remains authoritative for the two selected CIB extensions and their passive neutral projection. This proposal selects their intersection under a new profile; it does not alter either rule family.

The profile ID is `cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft`. Its exact composed CIB relationship set is [`CIB-AGR-0001`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0001--sequential-process-and-user-task-lifecycle), [`CIB-AGR-0002`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0002--active-user-task-discovery-and-basic-completion), [`CIB-AGR-0003`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0003--balanced-two-branch-parallel-gateway-lifecycle), [`CIB-EXT-0005`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0005--public-user-task-completion-installs-submitted-process-variables), [`CIB-EXT-0010`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0010--public-user-task-completion-preserves-a-boolean-process-variable), [`CIB-EXT-0011`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0011-one-literal-candidate-group-on-a-user-task), [`CIB-EXT-0012`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0012-one-typed-generated-form-field-on-a-user-task), [`CIB-OP-0001`](../CIB-BPMN-RELATION-REGISTER.md#cib-op-0001--cib-host-task-identity-mapped-to-project-semantic-task-identity), [`CIB-CFG-0001`](../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0001--pinned-milestone-0-oracle-environment), and candidate deviation [`CIB-DEV-0001`](../CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow). Initial Process data is not admitted by this exact profile, so `CIB-EXT-0006` is not selected.

The exact composed CIB observation must show both live tasks; each task's exact public identity-link and form-field facts; both submitted Boolean Process-variable patches; the intermediate live sibling; and the final historic variables. Existing `CIB-AGR-0001/0002/0003`, `CIB-EXT-0005`, `CIB-EXT-0010/0011/0012`, `CIB-OP-0001`, and `CIB-CFG-0001` may be reused only if that combined observation preserves each relationship's existing meaning and boundary. If simultaneous publication changes a proposition, evidence shape, or fidelity boundary, stop and register a separately classified relationship before implementation.

## Exact admitted model

The new source is independently authored for this repository. It does not modify, rename, or copy the retained metadata-free parallel source.

```text
None Start
    |
Parallel split
    |---------------------------|
Review content                 Review risk
candidate group: reviewers     candidate group: reviewers
Boolean field: contentApproved Boolean field: riskApproved
    |---------------------------|
Parallel join
    |
None End
```

The profile admits exactly one private executable root Process with one None Start Event, one diverging Parallel Gateway, two distinct User Tasks, one converging Parallel Gateway, one None End Event, and exact unconditional Sequence Flows forming that balanced graph. Both User Tasks must carry one complete metadata block under the existing identifier and source-shape rules. Each block contains one arbitrary admitted literal group and one `string` or `boolean` generated-form field. The exact catalog source chooses group `reviewers`, distinct Boolean keys `contentApproved` and `riskApproved`, and distinct task element IDs and names; those adoption values are not engine-profile constants.

All source-shape, namespace, Unicode-identity, parser-warning, graph, arity, lowering, closure, stable-state, and host-capability rules remain those of the two owning specifications. The composed artifact is a reviewed selection, not a JSON union of their feature and exclusion arrays.

## Selected decisions

1. Add one new successor profile and one independently authored parallel-review source. Do not widen or reinterpret `parallel-fork-join-draft` or the sequential metadata profile.
2. Admit only the exact balanced two-branch topology above. More branches, repeated task elements, nested gateways, loops, implicit fan-out or fan-in, and unbalanced joins remain excluded.
3. Require one complete existing metadata block on each User Task: one admitted literal group and one admitted `string` or `boolean` field. Metadata-free or partially annotated tasks refuse under this profile. The exact catalog model, not the engine profile, selects group `reviewers`, Boolean fields, and distinct keys `contentApproved` and `riskApproved`.
4. Keep metadata passive. It does not affect fork order, join readiness, occurrence identity, completion admission, or control flow. Claim, authorization, form validation, rendering, and actor audit remain Product 2 behavior.
5. Keep the existing public and command contracts unchanged. Start exposes two canonically ordered `OpenUserTask` values with distinct occurrence identities and exact metadata. Completing one removes only that occurrence and preserves the sibling and its metadata. Completing both permits the existing join and terminal closure.
6. Preserve accepted command order for Process-variable writes. The catalog journey submits the two distinct declared Boolean keys, so its final variables agree in either task order. The profile does not claim order independence for arbitrary overlapping completion patches and does not bind engine completion payloads to form metadata.
7. Keep every relationship in the exact composed set under [Authority and classification](#authority-and-classification) separate, including lifecycle, completion data, Boolean value, metadata, identity mapping, oracle configuration, and unresolved `CIB-DEV-0001` claims. Add one combined raw-service observation instead of inferring composition from separate fixtures.
8. Use a proved Lean composition lane and independently written TypeScript evidence. Prove metadata preservation and control-state equivalence after metadata erasure, and state disjoint submitted keys as an explicit hypothesis for final-data order equivalence. Add no evaluator clause or topology-specific runtime path.
9. Make catalog eligibility depend on one local production-preview Chromium journey through deploy, exact-version start, two visible unclaimed tasks, two claims, both task details and Boolean forms, one intermediate sibling state, both completion orders across bounded evidence, terminal Operations History, and exact per-occurrence Work audit. No successful engine-only case is advertised in the browser.

## Public contract and example

No public type changes. The existing observation must represent the post-start state as two ordinary open tasks:

```ts
type ParallelReviewOpenTasks = readonly [
  Readonly<{
    id: { processInstanceId: string; elementId: "UserTask_ContentReview"; activation: 1 };
    name: "Review content";
    state: "active";
    metadata: {
      assignment: { candidates: readonly [{ kind: "group"; id: "reviewers" }] };
      form: { fields: readonly [{ key: "contentApproved"; type: "boolean" }] };
    };
  }>,
  Readonly<{
    id: { processInstanceId: string; elementId: "UserTask_RiskReview"; activation: 1 };
    name: "Review risk";
    state: "active";
    metadata: {
      assignment: { candidates: readonly [{ kind: "group"; id: "reviewers" }] };
      form: { fields: readonly [{ key: "riskApproved"; type: "boolean" }] };
    };
  }>,
];
```

Canonical task order remains the existing semantic occurrence order. Product 2 consumes the exact published identities and metadata; it does not reconstruct task identity from the diagram, source XML, CIB task ID, or Temporal Event History.

After exact completion of `UserTask_ContentReview`, only `UserTask_RiskReview` remains open with byte-equivalent metadata. The reverse order has the symmetric result. After both exact completions, the existing synchronization operation consumes one offer from each incoming Sequence Flow and the Process completes.

The two form submissions in the catalog journey are `{ contentApproved: true }` and `{ riskApproved: true }`. Distinct keys make their Process-data merge commute. A caller that submits overlapping keys still receives the existing accepted-command ordering semantics; this proposal neither rejects nor normalizes that input.

## Stable rules

| Rule ID | Proposition | Owner |
|---|---|---|
| `PARMETA-SOURCE-01` | Only the exact balanced graph with two distinct, completely metadata-bearing User Tasks is admitted by the new profile; both predecessor profiles retain their exact source boundaries. | Profile and BPMN source admission |
| `PARMETA-PROJECT-01` | Each task's exact candidate, field key, field type, element identity, and occurrence identity remain paired through checked graph, Semantic Process, runtime wait, and public observation. | Checked graph, IL, semantic core, and Lean |
| `PARMETA-PASSIVE-01` | Erasing metadata from the composed program and state yields the existing parallel control account; metadata cannot change enabled operations, join readiness, rejection, or closure. | Lean and semantic core |
| `PARMETA-SIBLING-01` | Exact completion removes only its named wait and metadata; the other task remains unchanged until its own exact completion. | Semantic transition and public projection |
| `PARMETA-DATA-01` | Accepted completion patches retain command order generally; final-data order equivalence is claimed only under disjoint submitted keys. | Existing Process-data semantics |
| `PARMETA-CIB-01` | One combined pinned-engine observation exposes two live task identities and each task's own exact candidate and field, without source-derived canonical metadata. | CIB evidence adapter |
| `PARMETA-HOST-01` | Semantic/profile admission rejects programs outside the exact selected shape; the host-capability gate accepts the two passive User Task waits while retaining its refusals for unsupported host-driven scheduler compositions. Existing Update ingress, committed semantic state, Query, Worker replacement, replay, and terminal receipt add no Temporal primitive or host-owned meaning. | Semantic admission and Temporal adapter |
| `PARMETA-JOURNEY-01` | The exact model becomes catalog-visible only after its complete local production-preview Chromium journey proves two claims, two form completions, intermediate state, terminal history, and per-occurrence audit. | Product 2 acceptance |

## Lean lane and semantic evidence

The Lean lane is **proved**. A new focused conformance owner imports the existing parallel and metadata contracts rather than growing either existing conformance fixture. It proves:

- start closure creates exactly the two distinct metadata-bearing waits;
- changing either candidate, field key, or field type changes only the selected metadata fact and remains observable;
- metadata erasure commutes with start, either exact task completion, synchronization, and terminal closure;
- completing either task preserves the other task and its metadata exactly;
- stale or wrong-occurrence completion preserves both waits and metadata;
- both completion orders reach the same terminal control state;
- both completion orders reach the same final Process data under the explicit hypothesis that the two submitted key sets are disjoint;
- closure bounds and the legal independent two-User-Task activation pair remain unchanged.

No new declarative transition, evaluator branch, RuntimeState field, or Semantic Process operation is selected. If the composition requires any of those, stop and reopen the proposal.

## Temporal hosting and refinement preflight

The durable ingress remains the existing content-bound User Task completion Update. The semantic core still owns both waits, command admission, completion, join readiness, and terminal state. The Workflow hosts one committed state and uses the existing Query and result ledger. No Signal, Timer, Activity, Child Workflow, Search Attribute, Task Queue rule, retry policy, or cancellation path is added.

Semantic/profile admission must reject every program or wait-set shape outside the exact selected profile before host assessment. The host-capability gate must accept the exact pair of independent metadata-bearing User Task waits before Workflow start while retaining its existing refusals for unsupported host-driven scheduler compositions. Duplicate recovery returns the retained result and creates no second semantic completion. Worker replacement between the two completions and exact history replay must preserve both metadata values, the remaining sibling, and the final receipt.

The smallest combined live witness starts the exact model, observes both tasks and metadata, completes one task, replaces the Worker while the sibling remains open, observes the unchanged sibling, completes it, verifies terminal state, and replays. A second schedule reverses completion order. A metadata-drop Query mutation and a sibling-drop mutation must each fail independently.

## Product 2 journey

The browser journey uses only production HTTP routes and the production-built web application. It deploys the exact source, selects the admitted version, starts one instance, and opens the Work inbox. Neither unclaimed task exposes detail or completion. The configured `reviewers` actor claims each exact occurrence before using Form, Diagram, Details, or completion.

After the first completion, Work shows only the sibling and Operations shows the instance still running. After the second completion, Work shows no current task for the instance, Operations shows completed, History shows contiguous committed revisions, and Work audit shows the exact claim, reserved completion, and committed completion chain for each occurrence. All assertions run at 1280 CSS pixels; a 1600 smoke path is required only where it exercises materially different layout behavior.

This journey is one sequential user story. Do not duplicate the whole story at both widths. Unit and component tests own strict decoders, currentness, focus, and projection permutations; the browser owns only the cross-package composition that those tests cannot prove.

## Evidence matrix

| Rule | Profile/source | Lean | TypeScript/differential | CIB | Temporal | Product 2 |
|---|---|---|---|---|---|---|
| `PARMETA-SOURCE-01` | exact new profile and source plus old-profile refusal controls | exact checked/program fixture | source/compiler admission and binding mutations | exact deployment source echo | pre-start host capability | upload and admission verdict |
| `PARMETA-PROJECT-01` | two source-local metadata blocks | exact preservation and inequality | two-task checked/IL/runtime/public equality | per-task public identity-link and form-service rows | Query before and after replacement | two task details and forms |
| `PARMETA-PASSIVE-01` | no new semantic feature | erasure and control-state theorems | old/new control projection equality | not a CIB semantic claim | unchanged Workflow mechanism | no platform-derived control fact |
| `PARMETA-SIBLING-01` | distinct task and Flow identities | symmetric completion laws | A-then-B, B-then-A, stale, sibling-drop mutation | both orders plus live sibling | intermediate Query and replay | intermediate running instance and one task |
| `PARMETA-DATA-01` | distinct declared fields in exact model | disjoint-key hypothesis | accepted-order and disjoint-commutation tests | `CIB-EXT-0005/0010` raw intermediate and final variables | exact command order | exact form submissions |
| `PARMETA-CIB-01` | exact composed relationship set | not a CIB theorem | raw-to-canonical comparison | combined lifecycle, task, identity-link, form-field, and variable observation | not a host fact | no CIB IDs exposed |
| `PARMETA-HOST-01` | non-null Temporal relation | no host machinery | core-owned wait-set projection | not applicable | Worker replacement, duplicate recovery, replay | public routes only |
| `PARMETA-JOURNEY-01` | exact model identity | not applicable | lower-layer gates remain separate | not inferred from CIB UI | real local Temporal | one complete 1280 journey plus targeted 1600 smoke |

## Runtime-only and synthetic construct inventory

No new runtime-only construct is selected. Existing flow-token multiplicity and incoming-Sequence-Flow provenance remain private parallel state. Existing task activation numbers remain part of public semantic occurrence identity. Existing metadata is immutable data on the checked task, `awaitUserTask` operation, runtime wait, and public task. Existing Product 2 claim and audit rows remain platform facts and never enter semantic state.

CIB task IDs, Temporal Workflow/Run/Update IDs, Product 2 locators, claim IDs, and audit IDs remain host-local. None may determine BPMN element identity, task occurrence identity, canonical order, join readiness, or submitted Process data.

## Required, optional, and excluded functionality

Required:

- the exact profile, exact independently authored BPMN source, answer-free schedules, and profile/scenario registries;
- strict two-task metadata source admission and checked-to-IL identity binding by element ID, not array position;
- unchanged public shapes carrying two exact task occurrences and metadata blocks;
- proved Lean composition, independent TypeScript tests, combined pinned-CIB evidence for the exact selected relationship set, four-target differential comparison, live Temporal replacement/replay, and the complete Chromium journey;
- old parallel and old sequential metadata profile byte and behavior controls;
- a conditional semantic checkpoint cold review after source, checked graph, IL, Lean, core, and host-capability gates are green, before Product 2 catalog integration.

Optional only when it changes no selected claim:

- the reversed browser completion order as a second focused browser case if the lower-level schedule plus one journey cannot expose a Product 2 ordering defect;
- one targeted 1600 layout smoke assertion where the wider breakpoint changes composition.

Excluded:

- arbitrary parallel graphs, more branches, repeated task elements, loops, nested scopes, mixed waits, conditions, data-based routing, initial Process data, or multiple-enabled shapes beyond the approved independent User Task pair;
- standard Resource Roles, Human Performers, Potential Owners, Renderings, multiple candidates, multiple fields, assignee, owner, expressions, field defaults or constraints, or form-renderer semantics;
- auto-claim, completion without claim, engine-owned authorization, engine validation against form fields, or mapping form metadata into the completion command;
- a claim that arbitrary concurrent variable patches commute;
- new public types, wire fields, commands, Semantic Process operations, RuntimeState collections, Workflow primitives, Event History inference, platform-derived semantic facts, or broad CIB parallel compatibility;
- mobile-specific acceptance, 1024-specific acceptance, screenshot baselines, color-scale metrics, or unrelated M5 work.

## Versioning consequences

This is a pre-release additive profile registration. Existing checked-process, Semantic Process, runtime, observation, command, receipt, publication, and Product 2 contract shapes remain unchanged. The new profile, source, scenarios, CIB evidence, runnable configuration, and browser catalog entry are atomic. Existing histories must replay unchanged; no durable profile or Event History compatibility baseline is created.

### Owners this implementation grows

| Owner | Lines before 600 |
|---|---:|
| [semantic-profile-catalog.ts](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 540 |
| [checked-process-profile-shape.ts](../../packages/semantic-core/src/checked-process-profile-shape.ts) | 363 |
| [semantic-program-profile-shape.ts](../../packages/semantic-core/src/semantic-program-profile-shape.ts) | 350 |
| [semantic-process-graph-policy.ts](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 528 |
| [semantic-process-profile.ts](../../packages/semantic-core/src/semantic-process-profile.ts) | 436 |
| [semantic-profile-value-domain.ts](../../packages/semantic-core/src/semantic-profile-value-domain.ts) | 506 |
| [compilation-dispatch.ts](../../packages/bpmn-source/src/compilation-dispatch.ts) | 382 |
| [checked-process-compiler.ts](../../packages/bpmn-source/src/checked-process-compiler.ts) | 194 |
| [checked-element-projection.ts](../../packages/bpmn-source/src/checked-element-projection.ts) | 169 |
| [compile.ts](../../packages/bpmn-source/src/compile.ts) | 209 |
| [user-task-metadata-source.ts](../../packages/bpmn-source/src/user-task-metadata-source.ts) | 174 |
| [ProfileAdmission.lean](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 155 |
| [ValueDomain.lean](../../BpmnSemantics/SemanticProcess/ValueDomain.lean) | 562 |
| [pipeline-cases.ts](../../packages/differential/test/pipeline-cases.ts) | 4 |

The implementation must update the exact profile denominator in [semantic-profile-catalog.ts](../../packages/semantic-core/src/semantic-profile-catalog.ts) at 60/600 nonblank, [checked-process-profile-shape.ts](../../packages/semantic-core/src/checked-process-profile-shape.ts) at 237/600, [semantic-program-profile-shape.ts](../../packages/semantic-core/src/semantic-program-profile-shape.ts) at 250/600, [semantic-process-graph-policy.ts](../../packages/semantic-core/src/semantic-process-graph-policy.ts) at 72/600, [semantic-process-profile.ts](../../packages/semantic-core/src/semantic-process-profile.ts) at 164/600, and [semantic-profile-value-domain.ts](../../packages/semantic-core/src/semantic-profile-value-domain.ts) at 94/600. Each measured semantic-core owner retains at least 350 lines before the 600-line review target.

Source admission must update [compilation-dispatch.ts](../../packages/bpmn-source/src/compilation-dispatch.ts) at 218/600, [checked-process-compiler.ts](../../packages/bpmn-source/src/checked-process-compiler.ts) at 406/600, [checked-element-projection.ts](../../packages/bpmn-source/src/checked-element-projection.ts) at 431/600, [compile.ts](../../packages/bpmn-source/src/compile.ts) at 391/600, and [user-task-metadata-source.ts](../../packages/bpmn-source/src/user-task-metadata-source.ts) at 426/600. The narrowest owner has 169 lines before the review target. Extract a cohesive metadata-profile selector or binding owner first if the exact change would leave any of these owners above 600 or give it a second independent responsibility.

Lean admission must update [ProfileAdmission.lean](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) at 445/600 and [ValueDomain.lean](../../BpmnSemantics/SemanticProcess/ValueDomain.lean) at 38/600. New composition fixtures and theorems belong in a new independently buildable conformance owner; do not grow [UserTaskMetadataConformance.lean](../../BpmnSemantics/UserTaskMetadataConformance.lean) at 351/600 or repurpose [ParallelForkJoinConformance.lean](../../BpmnSemantics/ParallelForkJoinConformance.lean) as the combined owner.

Differential registration must not grow [pipeline-cases.ts](../../packages/differential/test/pipeline-cases.ts) beyond its measured 596/600. Put the combined case and mutations in a new focused owner and extract the catalog assembly before registration if the thin import/spread cannot remain within 600. Likewise, do not add combined assertions to [user-task-metadata.test.ts](../../packages/semantic-core/test/user-task-metadata.test.ts) at 588/600 or [pipeline-catalog.test.ts](../../packages/differential/test/pipeline-catalog.test.ts) at 568/600; use new focused test owners. A new Temporal fixture/test owner keeps [user-task-metadata-temporal.test.ts](../../packages/temporal-adapter/testkit/test/user-task-metadata-temporal.test.ts) at its current 516/600.

The profile and evidence artifacts must satisfy the strict [semantic profile schema](../../contracts/schemas/semantic-profile.schema.json), [CIB evidence schema](../../contracts/schemas/cibseven-evidence.schema.json), [contract artifact registry](../../scripts/contract-artifact-cases.ts), and the generated catalog and corpus guards. The current `node scripts/what-binds.ts` report for the 14 owners above contains 35 unique executable guards and three package registries. Re-run that command at implementation start because this inventory and the headroom measurements are valid only for the current worktree.

### Guards and registries

Must change:

- the generated package registries: [semantic core](../../packages/semantic-core/README.md), [source compiler](../../packages/bpmn-source/README.md), and [differential harness](../../packages/differential/README.md);
- the human registries: [profiles](../../profiles/README.md), [scenarios](../../scenarios/README.md), [Temporal adapter](../../packages/temporal-adapter/README.md), and [shared contracts](../../contracts/README.md).

Must satisfy unchanged unless their own red result requires a focused oracle correction:

- [A12 foreign-attribute admission](../../adoption/a12/legacy/source-tree/packages/bpmn-source/test/foreign-attribute-admission.test.ts), [A12 projected-flow keys](../../adoption/a12/legacy/source-tree/packages/bpmn-source/test/projected-flow-element-keys.test.ts), and [corpus policy](../../model-corpus/test/executable-model-corpus.test.ts);
- [committed-publication parity](../../packages/bpmn-source/test/committed-execution-publication-parity.test.ts), [foreign-attribute admission](../../packages/bpmn-source/test/foreign-attribute-admission.test.ts), [metamodel-default admission](../../packages/bpmn-source/test/metamodel-default-admission.test.ts), and [projected-flow keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts);
- [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts), [Service Task incident-cancellation pipeline](../../packages/differential/test/service-task-incident-cancellation-pipeline.test.ts), and [Service Task incident pipeline](../../packages/differential/test/service-task-incident-pipeline.test.ts);
- [semantic-publication surface](../../packages/temporal-adapter/protocol/test/semantic-publication-public-surface.test.ts) and [runnable MVP](../../packages/temporal-adapter/testkit/test/runnable-mvp.test.ts);
- [A12 boundary](../../scripts/a12-boundary.test.ts), [capsule cost](../../scripts/capsule-cost.test.ts), [CIB incident-cancellation projection](../../scripts/contract-cib-incident-cancellation-projection.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [schema coverage](../../scripts/contract-schema-coverage.test.ts), and [contributor setup](../../scripts/contributor-setup.test.ts);
- [document reviewability](../../scripts/document-reviewability.test.ts), [effect-operation consistency](../../scripts/effect-operation-artifact-consistency.test.ts), [execution-publication coverage](../../scripts/execution-publication-contract-coverage.test.ts), [harness source policy](../../scripts/harness-source-policy.test.ts), [Lean source contracts](../../scripts/lean-source-contracts.test.ts), and [Markdown links](../../scripts/markdown-links.test.ts);
- [platform boundary](../../scripts/platform-product-boundary.test.ts), [pnpm project configuration](../../scripts/pnpm-project-config.test.ts), [pre-release architecture](../../scripts/pre-release-architecture.test.ts), [semantic-closure documentation](../../scripts/semantic-closure-documentation.test.ts), [semantic review packet](../../scripts/semantic-review-packet.test.ts), and [source hygiene](../../scripts/source-hygiene.test.ts);
- [start-operation consistency](../../scripts/start-operation-artifact-consistency.test.ts), [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [verification entry point](../../scripts/verification-entrypoint.test.ts), [binding inventory](../../scripts/what-binds.test.ts), and [Workflow occurrence authority](../../scripts/workflow-occurrence-semantic-authority.test.ts).

The profile-wide [admission composition oracle](../../packages/semantic-core/test/admission-composition.test.ts) and [runnable profile configuration oracle](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) also constrain the new profile even though the path-derived report above does not reach them. The implementation must satisfy both.

## Epistemic closure and nearest counterexamples

The exact intended claim is limited to one content-bound balanced two-branch model whose two distinct User Tasks each publish one exact metadata block and complete through the existing semantic and Product 2 mechanisms.

The nearest semantic counterexample remains duplicate arrivals through one join input and none through the other. This proposal does not resolve `CIB-DEV-0001`. The nearest data counterexample is two valid task completions writing the same Process-variable key with different values; accepted command order decides the result, so arbitrary final-data commutativity is explicitly unsupported. The nearest source counterexample is one task with metadata and one without; the new profile rejects it because Product 2 would otherwise advertise a task the configured actor cannot work.

The principal common-mode risks are array-position pairing of source tasks to operations, using the open-task projector as the metadata constructor and oracle, deriving CIB metadata from the BPMN source or expected scenario, treating Product 2 claim as BPMN state, and letting a browser fixture bypass the production server. Required mutations independently swap task metadata, drop the sibling, use one metadata-free task, submit overlapping keys, alter raw CIB identity-link/form rows, remove metadata only from Query, and try completion before claim.

Proposal closure requires a read-only context-cold review against an immutable target. Because this proposal changes profile admission, checked/source capability, and the Lean proof boundary, implementation also requires the conditional semantic checkpoint review and a governed closure review. A commit-bounded entry in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md) compares the completed composition increment with the prior metadata and parallel increments rather than claiming the new model is a new semantic family.

## Stop conditions

Stop and return to owner review if the work requires a new semantic transition, runtime collection, public field, command, Workflow primitive, Product 2 authorization rule, CIB relationship proposition, general parallel admission, form-to-command binding, overlapping-write normalization, or reinterpretation of an existing profile. Stop if the exact combined CIB public-service observation does not expose both tasks and both metadata blocks, or if the complete production journey cannot pass locally within the three-level testing policy without rebuilding the same dependency graph.
