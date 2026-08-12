# User Task assignment and form metadata proposal

## Status

**Owner-approved proposal with the semantic checkpoint approved on 2026-08-12 and closure corrections green.** Exact source admission, checked and Semantic Process representation, committed wait and public observation, strict wire shapes, the proved Lean lane, profile/scenario registration, retained public-service CIB evidence, differential comparison, runnable configuration, and live Temporal Worker-replacement/replay evidence are green. Independent closure review of `1e8cc5d` required a quote-aware duplicate-attribute guard, live source-variation evidence, and a quantified completion-passivity theorem; those corrections are implemented and await the same reviewer's audit. Product 2 use remains paused until that audit approves semantic closure.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ae9f977` | `fork-turns-none` | `approve-with-required-edits` | `652327c` |
| Semantic checkpoint | `7670add` | `fork-turns-none` | `approve-with-required-edits` | `845f17e` |
| Closure | `1e8cc5d` | `not-recorded` | `pending` | `not-applicable` |

## Question

May one new profile admit one literal candidate group and one typed generated-form field on an existing User Task, carry that passive immutable metadata through the checked graph, Semantic Process IL, runtime wait, and public open-task observation, while leaving completion identity, submitted-value behavior, authorization, claim lifecycle, form validation, every old profile, and every Temporal primitive unchanged?

The recommendation is **yes, for one exact CIB extension shape and no broader assignment or form claim**. This is the smallest engine prerequisite for the M3 inbox and typed form. It publishes only facts the source and pinned CIB engine expose, composes the already closed Boolean completion value policy, and leaves Product 2 to own identity resolution, authorization, claiming, rendering, and audit.

## Authority and forward-compatible boundary

BPMN 2.0.2 Clauses 10.3.1 and 10.3.4 define Resource Roles, Human Performer, Potential Owner, User Task rendering, and the managed human-task lifecycle. Table 10.3 permits zero or more Resource Roles on an Activity. Tables 10.5 and 10.6 define `resourceRef`, `resourceAssignmentExpression`, and parameter binding. Table 10.13 defines User Task `renderings` as an extension hook, and the Rendering prose explicitly leaves rendering content opaque. `BPMN20.cmof` and `Semantic.xsd` preserve those distinctions: `PotentialOwner` specializes `HumanPerformer`, `UserTask.renderings` has upper `*`, and `ResourceRole` selects either a resource reference path or an assignment expression path.

Those standard constructs are not reinterpreted here. A Resource name does not establish whether it denotes a user, group, role, or organization, and the pinned CIB phase-zero probe does not turn a standard `potentialOwner` with `resourceRef` into a public task candidate link. BPMN Rendering supplies an extension point but no portable field identity or field type. Standard Potential Owner, Human Performer, Resource Role, and Rendering admission therefore remain conforming but deferred under new requirement-ledger rows.

The selected source instead uses two separately classified CIB extensions:

- selected [`CIB-EXT-0011`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0011-one-literal-candidate-group-on-a-user-task) for exact `{http://camunda.org/schema/1.0/bpmn}candidateGroups`;
- selected [`CIB-EXT-0012`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0012-one-typed-generated-form-field-on-a-user-task) for exact `{http://camunda.org/schema/1.0/bpmn}formData/formField`.

This restriction is forward-compatible because the checked and public metadata representation carries neutral candidate and field concepts rather than Camunda XML names. A later standard Resource Role, WSHumanTask rendering, or another reviewed vendor source can project the same neutral values when its own identity and type account is independently selected. No already admitted source is reinterpreted.

## Selected source profile

The selected profile ID is `cibseven-2.2.0-user-task-assignment-form-metadata-draft`. It composes the registered Boolean-completion value policy and reuses the exact root `None Start Event -> User Task -> None End Event` graph. Process Start stays string/null-only. Exact User Task completion stays string/null/Boolean and continues to match only the existing semantic occurrence identity.

The one User Task may have no metadata or one complete metadata block. Metadata is complete only when all of these hold:

1. the User Task carries exactly one foreign attribute whose expanded name is `{http://camunda.org/schema/1.0/bpmn}candidateGroups`;
2. its value is a nonempty Unicode scalar string whose first and last code points are not in the profile boundary-space set, and which contains no comma and no `${` or `#{` expression opener;
3. the User Task carries exactly one standard `bpmn:extensionElements` container;
4. that container carries exactly one child with expanded name `{http://camunda.org/schema/1.0/bpmn}formData`;
5. `formData` carries exactly one child with expanded name `{http://camunda.org/schema/1.0/bpmn}formField`;
6. the field has exactly the unqualified XML attributes `id` and `type`, with a nonempty scalar `id` whose first and last code points are not in the profile boundary-space set, and `type` exactly `string` or `boolean`;
7. the User Task, extension container, form container, and field have no other non-default modeled keys, foreign attributes, or children.

The profile boundary-space set is exactly U+0009 through U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000 through U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, and U+FEFF. TypeScript, Lean, and Java test the decoded string's first and last Unicode code points against that explicit set and reject a match without trimming, normalizing, or rewriting the value. Internal occurrences remain literal content. In particular, a leading or trailing non-ASCII U+00A0 refuses, preventing ECMAScript `trim`, Java `trim` or `strip`, and an independently written Lean predicate from choosing different accepted identities.

The parser prefix is not semantic identity. The source reader resolves every foreign element and attribute by namespace URI plus local name, so the ordinary `camunda` prefix and an alternate prefix compile equally. A matching prefix or local name under another namespace refuses. The installed `bpmn-moddle@10.0.0` probe preserves this exact graph with zero warnings, retains the candidate attribute in `$attrs`, and retains `formData/formField` with the unqualified field attributes. A quote-aware raw start-tag scanner refuses duplicate expanded candidate attributes before parser erasure even when a quoted value contains `>` or a line terminator. The existing raw singleton-containment guard remains responsible for refusing duplicate `BaseElement.extensionElements` containers before parser erasure.

The profile refuses partial metadata and all broader siblings: multiple or empty candidate groups, comma lists, expressions, assignee, candidate users, owner, due or follow-up dates, form keys, duplicate or nested form containers, multiple fields, duplicate field keys, labels, defaults, constraints, properties, scripts, validation, standard Resource Roles, Human Performer, Potential Owner, Rendering, and Lane-derived assignment. Metadata-free User Tasks under every existing profile retain their current bytes, checked graph, IL, runtime state, observation, and result.

## Neutral metadata contract

One shared immutable contract is carried without vendor vocabulary:

```ts
type UserTaskMetadata = DeepReadonly<{
  assignment: {
    candidates: [{ kind: "group"; id: string }];
  };
  form: {
    fields: [{ key: string; type: "string" | "boolean" }];
  };
}>;
```

The selected User Task node, `awaitUserTask.task`, semantic User Task wait, and public `OpenUserTask` gain one optional `metadata` property. The property is physically absent when source metadata is absent. It is never serialized as `null` or as empty assignment/form collections, which preserves all existing artifacts byte-for-byte. Exact metadata is deeply immutable and ordered even though this profile admits one candidate and one field, so future reviewed multiplicity can widen the tuple without changing the item meaning.

Changed candidate identity, changed field key, or `string` versus `boolean` compiles to unequal checked nodes, unequal IL operations, unequal runtime waits, and unequal public observations. The public metadata contains no CIB task ID, assignee, claimant, authorization decision, directory identity, form renderer, validation rule, default value, submitted value, Workflow ID, Run ID, Task Queue, or Event History field.

## Runtime, command, and observation account

No new transition family or command is added. When the existing `awaitUserTask` operation arms, it copies the operation's optional metadata into the semantic wait. Public open-task projection copies the same value. Exact completion still:

1. matches the active semantic User Task occurrence by Process instance, BPMN element, and activation;
2. applies the profile-owned string/null/Boolean completion patch;
3. removes the wait and its metadata;
4. continues through the existing bounded internal closure.

Metadata is passive. It neither authorizes nor rejects completion, and it is not part of the completion stimulus. Two otherwise equal active waits that differ only in metadata produce the same post-completion semantic state after the same admissible submission because the completed wait is removed. Wrong, stale, terminal, or value-domain-invalid completion preserves the full wait including metadata.

The canonical CIB lane must obtain candidate links through public `TaskService` identity-link queries and field identity/type through public `FormService` data. Under only the selected new profile, each raw task row gains required `identityLinks: [{ type: string, userId: string | null, groupId: string | null }]` and `formFields: [{ id: string, typeName: string }]`, retained in producer order from those public services. Every old-profile producer omits both properties physically, preserving its retained evidence bytes. The strict schema admits the two properties only as a pair on the new profile's evidence path and rejects either property on an old-profile artifact. The selected canonical projection requires exactly one identity link with `type: "candidate"`, `userId: null`, and a non-null group ID satisfying the profile string predicate, plus exactly one form field whose ID satisfies that predicate and whose `typeName` is exactly `string` or `boolean`. The raw schema permits no preconstructed `metadata`, candidate-kind discriminator, or canonical field-type discriminator. This keeps the deciding link type, user/group distinction, field identity, and engine type name visible before the canonical projector constructs neutral metadata. The projector must not copy metadata from the scenario, expected result, BPMN source, profile, or checked program.

## Stable semantic rules

| Rule ID | Proposition | Layer |
|---|---|---|
| `UTMETA-SOURCE-01` | Only the exact URI-expanded candidate-group and generated-form source shape is consumed; prefix twins agree and namespace, multiplicity, expression, list, and sibling surfaces refuse. | BPMN source and selected CIB overlay |
| `UTMETA-PROJECT-01` | Exact immutable metadata is preserved through checked User Task, `awaitUserTask.task`, runtime wait, and public open-task observation; candidate, key, and type drift remain unequal. | Checked graph, IL, runtime, public observation |
| `UTMETA-OMIT-01` | Metadata-free source omits the property at every representation and preserves every old profile and artifact byte. | Shared wire and versioning boundary |
| `UTMETA-PASSIVE-01` | Metadata does not alter occurrence identity, completion admission, submitted-value merge, continuation, or post-completion state. | Semantic transition and Lean laws |
| `UTMETA-CIB-01` | Public CIB identity links and Form Service expose the selected candidate group and exact `string` or `boolean` field type; canonical projection does not infer them from source. | CIB evidence |
| `UTMETA-HOST-01` | The existing core-owned User Task wait, Query, completion Update, Worker replacement, history, and replay preserve metadata without a new Temporal primitive or host-owned semantic write. | Temporal refinement |

## Lean lane

The Lean lane is **proved**. It adds the same immutable metadata type and optional field to the checked User Task, `awaitUserTask`, runtime wait, and open-task observation. The narrow conformance module proves:

- exact metadata survives checked-to-IL lowering, wait creation, public projection, strict JSON decode, and strict JSON encode;
- candidate, field key, and field type mutations remain structurally unequal;
- metadata-free values retain the existing serialized shape;
- completion removes the wait and yields the same post-completion state for two otherwise equal waits that differ only in metadata;
- wrong occurrence and inadmissible value preserve the complete metadata-bearing state;
- finite closure and the existing Boolean completion result are unchanged.

No new declarative transition relation or soundness bridge is needed because no evaluator clause is added. If carrying metadata requires a new transition constructor or changes the existing completion result, stop and reopen the proposal rather than weakening this lane.

## Temporal hosting and refinement preflight

The durable ingress remains `bpmn-complete-user-task`; the semantic wait remains committed Workflow state; one Workflow loop remains the only caller of `applyStimulus`; Query remains the public stable-state projection; and the completed receipt remains the terminal projection. Metadata adds no Signal, Timer, Activity, Child Workflow, cancellation path, Search Attribute, retry policy, delivery rule, deduplication key, ordering policy, or command kind.

The smallest live witness compiles the selected source, starts with string/null data, observes exact metadata in Query, stops the Worker while the wait is active, starts a replacement Worker, observes the same metadata, completes with a Boolean patch, observes the existing terminal result, inspects the Workflow-start program and completion Update in history, and replays. The nearest host mutation removes or changes only metadata in Query projection while leaving occurrence identity and completion intact; the public observation must disagree. A second mutation changes source candidate or field type without changing task identity and proves the compiled program, not Event History inference, owns the value.

The adapter does not call CIB Form Service, parse BPMN, resolve users/groups, render fields, or validate submitted values. Product 2 later consumes only the published metadata and existing completion command.

## Rule-to-evidence matrix

| Rule | BPMN/profile | CIB | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|---|
| `UTMETA-SOURCE-01` | New profile plus `CIB-EXT-0011/0012` | Model API and namespace controls | Strict checked JSON | Expanded-name reader and diagnostics | Compiled program only | wrong URI, prefix twin, duplicate/list/expression/sibling negatives |
| `UTMETA-PROJECT-01` | Neutral public contract | identity links plus Form Service | lowering/wait/projection equality | independent source/core projections | Query before and after Worker replacement | candidate, key, and field-type mutations |
| `UTMETA-OMIT-01` | Existing profiles unchanged | old retained evidence unchanged | optional-field serialization | exact old artifact bytes | old histories replay | absent versus null/empty mutation |
| `UTMETA-PASSIVE-01` | no authorization claim | unclaimed completion succeeds | metadata-irrelevance and refusal theorems | direct semantic equality | same Update and receipt | metadata-dependent completion mutation |
| `UTMETA-CIB-01` | bounded extension only | public runtime APIs | not a CIB theorem | raw-to-canonical check | not a host fact | source-derived canonical metadata mutation |
| `UTMETA-HOST-01` | non-null Temporal relation | not a CIB claim | not a host theorem | host-capability admission | Worker replacement, history, replay | Query metadata removal/drift mutation |

## Required, optional, and excluded functionality

Required:

- one new profile composing the registered Boolean-completion policy;
- exact alternate-prefix-safe source admission for one literal group and one typed field;
- optional immutable metadata in checked source, IL, runtime wait, and public open-task observation;
- strict shared schemas and exhaustive TypeScript, Lean, Java, differential, and Temporal consumers;
- engine-observed CIB raw evidence for group identity links and Form Service field identity/type;
- one answer-free scenario, content-bound CIB evidence, runnable example, differential metadata mutation, Worker-replacement/history/replay witness, and old-profile byte-preservation oracle;
- conditional semantic checkpoint review after the first green source/checked/IL/runtime/proof checkpoint, before registration and live evidence.

Optional only if it changes no semantic claim:

- one metadata-free task compiled under the new profile as an additional omission control.

Excluded:

- standard Resource Role, Performer, Human Performer, Potential Owner, Rendering, WSHumanTask, Data Input/Output, Data Association, and form-submission mapping support;
- candidate users, assignee, owner, claim, release, delegation, authorization, authentication, identity lookup, organization or role semantics, due/follow-up dates, priority, notifications, escalation, and audit actor;
- multiple candidates, multiple fields, field labels/defaults/constraints/properties, nested forms, form keys, scripts, rendering, validation, number/date/file/object values, task-local data, or expression evaluation;
- new completion identity, command kind, transition family, runtime collection, Temporal primitive, Product 2 contract, platform package import, or Event History-derived semantic fact.

## Versioning consequences

Pre-release atomic replacement applies to checked-process, Semantic Process, scenario, canonical-result, and CIB-evidence shapes because `OpenUserTask` gains an optional public field. Existing metadata-free serialized objects remain byte-identical because the property is omitted. No retained production-history compatibility baseline exists; approval of one would require explicit version, migration, replay, rollback, and old-Worker decisions.

The implementation must atomically update or satisfy the strict [checked-process schema](../../contracts/schemas/checked-process.schema.json), [Semantic Process schema](../../contracts/schemas/semantic-process.schema.json), [scenario schema](../../contracts/schemas/scenario.schema.json), [CIB evidence schema](../../contracts/schemas/cibseven-evidence.schema.json), TypeScript [checked contract](../../packages/semantic-core/src/checked-process-contract.ts), [IL contract](../../packages/semantic-core/src/semantic-process-contract.ts), [runtime state](../../packages/semantic-core/src/semantic-process-state.ts), [public contract](../../packages/semantic-core/src/contract.ts), [wait creation](../../packages/semantic-core/src/semantic-process-wait-runtime.ts), [public projection](../../packages/semantic-core/src/scenario.ts), [profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts), [checked shape](../../packages/semantic-core/src/checked-process-profile-shape.ts), [program shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts), [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), BPMN [dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts), [exact foreign-attribute classification](../../packages/bpmn-source/src/preserved-element-classification.ts), [compiler](../../packages/bpmn-source/src/checked-process-compiler.ts), [exact key inventory](../../packages/bpmn-source/src/projected-flow-element-keys.ts), [checked projector](../../packages/bpmn-source/src/checked-element-projection.ts), [graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), and [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), Lean [checked and IL contract](../../BpmnSemantics/SemanticProcessContract.lean), [public scenario contract](../../BpmnSemantics/Scenario.lean), [strict checked JSON](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean), [strict program JSON](../../BpmnSemantics/SemanticProcessJson/Program.lean), [public JSON entry point](../../BpmnSemantics/SemanticProcessJsonMain.lean), [lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean), [runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [transition](../../BpmnSemantics/SemanticProcess/Transition.lean), [scenario](../../BpmnSemantics/SemanticProcess/Scenario.lean), [profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), and [JSON support](../../BpmnSemantics/SemanticProcess/JsonSupport.lean), Java [scenario protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java), [diagnostics protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioDiagnosticsProtocol.java), [User Task projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenUserTaskProjector.java), [state projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java), and [value policy](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableValuePolicy.java), plus artifact, differential, runnable, and live-evidence registries. The implementation also updates the complete nested-field denominator in [Canonical CIB observation fidelity](../TESTING-SPEC.md#canonical-cib-observation-fidelity) for the new `openUserTasks[].metadata` paths.

A new cohesive `user-task-metadata.ts` owns the neutral TypeScript contract and the exact boundary-space predicate. A new `user-task-metadata-source.ts` owns URI-expanded source decoding and is the only source owner that reads the CIB extension tree. The selected profile receives its own dispatch entry, which calls `exactForeignAttributeRejections` with one predicate admitting only `bpmn:UserTask` plus the exact candidate-group expanded name; it never enters `foreignAttributeConsumingTypes`, so no User Task whole-type exemption is possible. The existing direct foreign-attribute guard adds wrong-URI, unknown-sibling, and U+00A0 boundary controls. Metadata equality is extracted from [artifact consistency](../../scripts/contract-artifact-consistency.ts), and raw CIB evidence types are extracted from [contract artifacts](../../scripts/contract-artifacts.ts) before either crowded owner grows. A new family-specific `user-task-metadata-pipeline-cases.ts` contains the differential case body; the existing catalog receives only an import and spread. A separate Java metadata projector uses Task Service and Form Service; the scenario runner receives delegation only. New Temporal fixture and test owners carry live evidence without growing the Workflow implementation or Boolean test.

### Owners this implementation grows

| Owner | Headroom |
|---|---:|
| [BPMN compilation dispatch](../../packages/bpmn-source/src/compilation-dispatch.ts) | 399 |
| [BPMN exact foreign-attribute classification](../../packages/bpmn-source/src/preserved-element-classification.ts) | 75 |
| [BPMN checked projector](../../packages/bpmn-source/src/checked-element-projection.ts) | 169 |
| [BPMN key inventory](../../packages/bpmn-source/src/projected-flow-element-keys.ts) | 267 |
| [BPMN semantic lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 48 |
| [TypeScript checked contract](../../packages/semantic-core/src/checked-process-contract.ts) | 356 |
| [TypeScript IL contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 199 |
| [TypeScript operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 124 |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 66 |
| [Lean external execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 17 |
| [Lean runtime state](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 157 |
| [Lean public scenario contract](../../BpmnSemantics/Scenario.lean) | 383 |
| [Lean strict checked JSON](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 339 |
| [Lean strict program JSON](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 142 |
| [Lean public JSON entry point](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 287 |
| [Java scenario protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | 154 |
| [Java scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | 13 |
| [Java state projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java) | 316 |
| [Artifact owner](../../scripts/contract-artifacts.ts) | 98 |
| [Artifact consistency](../../scripts/contract-artifact-consistency.ts) | 50 |
| [CIB evidence projection](../../scripts/contract-cib-evidence-projection.ts) | 46 |
| [Differential catalog](../../packages/differential/test/pipeline-cases.ts) | 12 |
| [Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 |
| [Boolean Temporal test](../../packages/temporal-adapter/testkit/test/boolean-process-data-temporal.test.ts) | 59 |

At the semantic checkpoint, the BPMN dispatch owner measured 201/600, the exact classifier measured 525/600, and the lowering owner measured 552/600 after receiving only the narrow metadata copy and bounded-task refusal. Parsing stayed in the new source owner. The strict Lean program JSON owner measured 458/600 after cohesive optional task-metadata decoding/encoding. The closure correction added one reusable completion-equivalence law to the external execution owner, leaving 17 lines of headroom, rather than exposing its private admission and closure helpers to the conformance module. Before retained evidence, the artifact owner measured 587/600, so raw CIB evidence types were extracted before metadata evidence was added. The differential catalog and Java runner received only their approved registration and delegation calls. The Workflow implementation and Boolean Temporal test did not grow. The table records the current post-implementation measurements enforced by the reviewability guard.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts), [foreign-attribute admission](../../packages/bpmn-source/test/foreign-attribute-admission.test.ts), and [per-element diagnostics](../../packages/bpmn-source/test/per-element-admission-diagnostics.test.ts) | Consume only the exact profile-owned URI-expanded source and locate every refusal. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), and [artifact projections](../../scripts/contract-artifact-projections.test.ts) | Reach every optional metadata arm, retain old artifact bytes, and reject drift or malformed values. |
| [CIB observation fidelity](../../scripts/cib-observation-fidelity.test.ts) | Bind raw identity-link and Form Service facts to every nested canonical metadata path, reject source-derived substitution, and keep the fidelity denominator in the Testing Specification complete. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce cohesive owners, exhaustive variants, registries, and measured line limits. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep metadata contracts exhaustive and conformance facts public and descriptive. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register one exact case and detect candidate, field-key, and field-type mutations. |
| [runnable product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | Give the registered profile exactly one existing-host example. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Prevent Product 2, Workflow, CIB, or source details from defining neutral metadata meaning. |
| [document reviewability](../../scripts/document-reviewability.test.ts), [independent review policy](../../scripts/independent-review-policy.test.ts), and [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Keep the governed lifecycle, owner inventory, receipts, and immutable routing complete. |
| [Markdown links](../../scripts/markdown-links.test.ts) and [normative references](../../scripts/normative-reference-resolution.test.ts) | Resolve every owner, guard, relationship, and normative basis. |

## Epistemic closure and cost boundary

The exact claim to establish is one literal group candidate and one exact typed generated-form field preserved as passive neutral metadata from source through checked graph, IL, committed wait, public observation, CIB raw/canonical evidence, independent Lean/core evaluation, and Temporal Query/replay. It does not establish standard Resource assignment, a form engine, authorization, a task inbox, or Product 2 behavior.

The nearest unsupported claims are standard Potential Owner projection and general rendering/form support. The nearest realistic counterexamples are wrong-namespace twins, CIB comma/expression expansion, duplicate parser-retained form children, source-derived CIB projection, field-type stringification, optional-field `null` insertion that changes old artifacts, completion that consults metadata, and Query metadata dropped while completion still succeeds.

At closure, [the capsule cost ledger](../CAPSULE-COST-LEDGER.md) records the implementation baseline through the closure target and compares it with Boolean Process data, the nearest completed increment changing the same User Task, wire, CIB, Lean, differential, and Temporal layers. Closure review decides whether the two extension relationships remain independent, whether shared source/artifact schemas are a common mode, whether passive metadata can be removed without an independent lane failing, and whether E2 actually leaves platform assignment and form behavior unclaimed.

The closure claim is one exact literal group candidate and one exact typed generated-form field preserved as passive neutral metadata from exact source through checked graph, IL, committed wait, public observation, retained CIB public-service facts, independent Lean/core evaluation, and Temporal Query/replay. The closest unsupported claims remain standard Potential Owner projection and general rendering/form behavior. Shared TypeScript compilation is the main common mode between the core and Temporal lanes, so the quote-aware raw-cardinality refusal, Lean checked-to-IL relation, independent CIB public-service projection, source-derived-projection mutation, live Query-omission mutation, and live field-type source variation bind distinct seams. Canonical observation depends only on admitted program/runtime state and explicit completion input; it contains no future command, expected result, CIB host identity, or Temporal identity. The realistic counterexamples are the wrong-namespace source twin, duplicate expanded attributes split by a quoted `>`, changed candidate or field identity/type, source-derived CIB projection, and a host Query that drops metadata while completion still succeeds, all of which have separating failures at the source or public open-task boundary. The proved Lean lane states reusable exact preservation, refusal-state preservation, completion irrelevance for arbitrary admitted metadata and completion patches, physical omission, and JSON identity over the selected value rather than only one serialized scenario. BPMN authority, the two selected CIB extensions, Lean facts, TypeScript realization, and Temporal durability remain distinct claims.

The closure self-assessment found one recurrence of the existing incomplete syntactic-class guard mechanism: the raw duplicate-attribute guard covered quote delimiters and line terminators but not an unquoted tag delimiter inside a quoted value. The process ledger increments that guarded class and the retained regression varies both quote delimiters and attribute orders. Every implementation correction either failed an executable gate or remained inside the governed semantic checkpoint, every reported count comes from its named command, the only resource-limited aggregate was reported as timed out rather than green, and the cost endpoint is the immutable implementation target named in the row above.

## Stop conditions

Stop and return to research or owner direction if:

- standard Potential Owner, Rendering, Resource Role, Lane, or another vendor source must be reinterpreted to implement the selected profile;
- candidate-group or field metadata cannot be resolved by namespace URI plus local name without a new dependency;
- metadata must enter the completion stimulus, occurrence identity, authorization, submitted-value validation, or transition result;
- multiple candidates, multiple fields, expression evaluation, form validation, claim lifecycle, Product 2, or a new value kind becomes necessary;
- CIB raw evidence cannot observe candidate links and field type independently of the expected source;
- Temporal requires a new command, Workflow branch, Signal, Activity, Child Workflow, Search Attribute, or host-owned semantic write;
- any existing profile, source, artifact, result, or history must gain `metadata: null` or an empty metadata object;
- the measured extractions cannot preserve old bytes and focused results;
- the complete gate can pass only by weakening exact foreign-attribute refusal, strict schemas, old-profile equality, a seeded mutation, or a product boundary.

## Owner decisions requested

Approval of this proposal settles all of these together:

1. Select `cibseven-2.2.0-user-task-assignment-form-metadata-draft` as a successor composing the Boolean-completion value policy.
2. Classify exact literal `candidateGroups` and exact generated-form `formData/formField` as separate bounded CIB extensions `CIB-EXT-0011` and `CIB-EXT-0012`.
3. Publish one neutral immutable optional metadata property through checked source, IL, runtime wait, and public open-task observation, omitting it entirely when absent.
4. Keep standard Resource Role, Human Performer, Potential Owner, Rendering, assignment expressions, Lane inference, authorization, claiming, form validation, and Product 2 outside this capability.
5. Leave completion occurrence identity, submitted values, transition behavior, and Temporal hosting primitives unchanged.
6. Use a proved Lean lane for exact lowering/projection, metadata irrelevance to completion, full-state refusal preservation, optional-field byte preservation, and JSON identity.
7. Require independent raw CIB identity-link and Form Service evidence, candidate/key/type mutations, Worker replacement, history, replay, and Query metadata drift discrimination.
8. Perform the measured artifact and equality extractions before semantic growth, and keep every near-limit owner to delegation or a narrow copy call.
