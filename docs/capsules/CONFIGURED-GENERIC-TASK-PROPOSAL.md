# Configured Task extension proposal

## Status

**First semantic checkpoint independently approved; registration and evidence active.** The unregistered checkpoint selects one exact versioned Task extension that binds a BPMN Task to the existing external-effect mechanism. It does not select plain Abstract Task execution, another Task extension, Service Task reinterpretation, data mappings, BPMN Error routing, Product 2 work queues, CIB compatibility, or a new Temporal host primitive. Profile/scenario registration, differential evidence, the retained CIB exclusion trace, and live Temporal reuse evidence are now the active closure lanes.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `add8367` | `fork-turns-none` | `approve-with-required-edits` | `19591d3` |
| Semantic checkpoint | `929ebd1` | `fork-turns-none` | `approve-with-required-edits` | `85d42aa` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The context-cold proposal review of `add8367` required four bounded corrections: occurrence-only effect-completion refusal, profile-aware Task classification, raw duplicate-`extensionElements` guarding, and consistent classification of the CIB trace as exclusion evidence. The same reviewer approved correction `19591d3`; the selected semantic account, public contract, exclusions, and evidence strategy did not change. The context-cold semantic-checkpoint review of `929ebd1` found no semantic defect and required three bounded evidence and ownership corrections: maintained XSD validation of the configured fixture, an executable direct Semantic XSD override, and exact profile-catalog and shape-owner prose. The same reviewer approved correction `85d42aa` without changing the selected account, public contract, exclusions, or evidence strategy.

## Question

May one explicitly configured BPMN Task retain its distinct checked-source identity while lowering to the existing neutral external-effect wait, so the engine can execute configured work without reinterpreting plain Abstract Task or adding another runtime transition family?

The recommendation is **yes, under the exact extension, descriptor, topology, proof, and evidence boundary below**. This follows established BPMN extension practice: the source carries one namespaced, versioned task-definition element; the profile maps that source value to one existing neutral effect descriptor; and the runtime reuses the already reviewed `awaitEffect` contract.

## Selection basis

[PLAN.md](../PLAN.md#ordered-work) selects the configured Task extension as the final M2 base-element capsule. The prior M2 increments already close resumption-bounded cycles, Message Start, Timer Start, and Terminate End. This increment supplies the remaining explicit external-work form without adding data semantics, a new public interaction family, or another Temporal adapter architecture.

The earlier [minimal-engine research](../research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md#37-abstract-task-and-configured-task-extension) correctly preferred explicit engine configuration for useful external work but incorrectly described a plain `bpmn:task` as semantically underspecified and prohibited no-op execution. BPMN 2.0.2 Clause 13.3.3 instead gives Abstract Task an exact conceptual meaning: it completes upon activation and is not executed by an IT system. This proposal corrects that research statement before selecting a distinct executable extension.

## Normative basis and forward-compatible boundary

BPMN 2.0.2 is authoritative for the standard Task and extension boundaries.

- Clause 7.7 and Clause 8.3.3 define BPMN extensibility and require an extension not to contradict the standard element's semantics.
- Clause 10.3 and Clause 13.3.2 own the shared Activity lifecycle and token propagation.
- Clause 10.3.3.1 and Table 10.4 identify an unspecified Task as Abstract Task and permit Task types to be extended with corresponding indicators.
- Clause 13.3.3 states that an Abstract Task completes upon activation and is conceptual only, never executed by an IT system.
- The XSD `tBaseElement.extensionElements` wildcard permits extension content while retaining a valid BPMN document.

Two requirements therefore remain separate:

1. `BPMN-ABSTRACT-TASK-01` records the standard immediate-completion behavior of an unextended `bpmn:task`. It remains conforming but deferred and `unsupported` in this bounded M2 profile.
2. `BPMN-TASK-EXTENSION-01` records one exact project-defined extended Task type that waits for external effect completion. It remains `unsupported` until implementation and closure evidence graduate this proposal.

The representation preserves this distinction permanently. Later admission of plain Abstract Task can lower to immediate control continuation without changing the checked or runtime meaning of a configured Task already accepted here. Other configured Task types can receive distinct profile bindings without changing this one.

- Ledger citation lock for `BPMN-ABSTRACT-TASK-01`: Clauses 10.3.3.1 and 13.3.3 plus Table 10.4
- Ledger citation lock for `BPMN-TASK-EXTENSION-01`: Clauses 7.7, 8.3.3, and 10.3.3.1

## CIB relationship

No new CIB relationship, compatibility profile, retained compatibility result, or declared CIB target is selected. The pinned CIB Seven source treats a plain Abstract Task as pass-through, which agrees with BPMN Clause 13.3.3, but CIB does not define this project extension and cannot be its oracle.

Before implementation, one bounded diagnostic compiles the exact extension source under CIB Seven and confirms that CIB ignores the project extension and reaches the trailing User Task without an external effect. The resulting trace is retained only as an exclusion oracle that prevents accidental use of CIB as configured-Task evidence. It creates no compatibility claim or relationship entry. Registered scenarios have `cib: null`; existing `CIB-AGR-0001` and `CIB-OP-0001` apply only to the unchanged trailing User Task lifecycle and host-identity mapping.

## Selected account and rejected alternatives

The representative Process is:

```text
None Start -> Configured Task -> User Task -> None End
```

Initial closure consumes the Start token and exposes exactly one effect occurrence. Completing that exact effect consumes the effect wait and exposes exactly one existing User Task occurrence. Completing that User Task reaches the None End and completes the Process.

The competing accounts are:

1. **Treat every plain Task as externally completed work.** Rejected because it contradicts the standard Abstract Task meaning and would reinterpret conforming models.
2. **Treat the configured Task as pass-through.** Rejected because it erases the selected extension's externally completed lifecycle and exposes the trailing User Task too early.
3. **Project the configured Task as `serviceTask`.** Rejected because it erases the BPMN Task-type distinction and would foreclose independent future admission of Abstract Task and other extended Task types.
4. **Add a second effect operation, command, state shape, or Activity host.** Rejected because the selected external-work behavior is exactly the existing neutral effect mechanism.
5. **Retain a distinct configured Task in checked source, then lower its reviewed binding to existing `awaitEffect`.** Selected.

The primary semantic negative replaces the configured wait with pass-through behavior and must publish the trailing User Task immediately after start. A second negative changes only the source handler type or checked descriptor and must fail exact artifact/profile binding before execution.

## Exact source profile

One immutable product-neutral BPMN-extension profile is proposed as `bpmn-2.0.2-bpmn-lean-configured-task-effect-draft`. Its identifier names both the BPMN baseline and the project extension, so the configured behavior cannot be mistaken for bare BPMN semantics. It admits one private executable Process containing the exact representative topology and one configured Task with this extension:

```xml
<bpmn:task id="ConfiguredTask_Probe">
  <bpmn:extensionElements>
    <bpmnLean:taskDefinition type="urn:bpmn-lean:task-handler:probe-v1" />
  </bpmn:extensionElements>
</bpmn:task>
```

The namespace URI is exactly `urn:bpmn-lean:bpmn:extensions:v1`. XML prefix spelling is not semantic. A different prefix bound to the same URI admits; the same local name under another URI rejects. The source package registers one ordinary `bpmn-moddle` extension descriptor for this namespace, type, property, and attribute. This uses the importer's standard extension mechanism rather than interpreting a generic unknown element or adding a parallel XML model.

The exact profile permits:

- one None Start, one configured Task, one User Task, one None End, and three conditionless Sequence Flows in one root scope;
- arbitrary well-formed element identifiers and optional ordinary `name` attributes, neither of which selects the handler;
- exactly one `extensionElements` container with exactly one empty `taskDefinition` child in the selected namespace;
- exactly one nonempty `type` attribute with value `urn:bpmn-lean:task-handler:probe-v1` and no other extension attribute, child, or text body;
- no input/output data, BPMN Error route, loop characteristic, compensation, boundary Event, resource role, rendering dependency, parser warning, or foreign executable content.

The source reader rejects an unconfigured plain Task under this profile while recording it as conforming-deferred, not malformed. It also rejects missing or repeated extension containers, missing or repeated definitions, wrong namespace, wrong local name, missing/empty/wrong handler type, extra attribute/body/child, unsupported inherited Activity property, wrong topology or arity, condition, extra root, extra Process, and unexpected parser warning. The exact fixture must pass the pinned OMG BPMN XSD; the custom child remains valid through the standard extension wildcard.

The compilation dispatch count remains unchanged. Before the existing node/flow partition, the generic source path derives a closed configured-Task projection policy only from the exact selected profile and binding. The partition treats `bpmn:Task` as projectable only when that policy is present, and the checked-node projector receives the same policy before it delegates to the configured source reader. Every other profile retains the existing global projectable-type set and the exact element-located `unsupportedElementType` diagnostic for `bpmn:Task`. No fifth compiler dispatch or raw-moddle export is added.

The raw-source containment gate also consumes the bounded `BaseElement.extensionElements` upper bound before structural import is discarded. It compares source occurrences with retained modeled containments, so a repeated container rejects even when `bpmn-moddle` emits no warning and retains only one value. The configured source reader then validates the one retained container and its exact child. This extends the existing singleton-containment mechanism rather than adding a second XML parser.

## Profile-owned source binding

The existing semantic-profile `effectBindings` field gains a closed source union. Existing Service Task bindings retain the exact `{ implementation, delegateExpression }` arm and exact artifact bytes. The new arm is:

```ts
type ConfiguredTaskEffectBinding = DeepReadonly<{
  source: {
    taskDefinitionNamespace: "urn:bpmn-lean:bpmn:extensions:v1";
    taskDefinitionType: "urn:bpmn-lean:task-handler:probe-v1";
  };
  descriptor: {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1";
    operation: "urn:bpmn-lean:effect-operation:probe-v1";
  };
}>;
```

The binding is a profile-owned source-to-neutral-descriptor mapping. The `taskDefinition` local name is fixed by the registered descriptor and configured-Task source reader; the profile carries the namespace and selected type. The binding does not become runtime configuration, a handler registry, or a public command. The strict profile schema uses `oneOf` to distinguish the two exact source arms and rejects mixed keys, extra keys, empty values, duplicate bindings, and a source or descriptor mismatch. Existing profile artifacts retain exact bytes and do not gain the new arm.

## Checked graph and lowering

The checked graph gains one distinct node:

```ts
type CheckedConfiguredTask = DeepReadonly<{
  kind: CheckedNodeKind.ConfiguredTask;
  id: string;
  descriptor: EffectDescriptor;
}>;
```

It has exactly one incoming and one outgoing Sequence Flow in the selected profile. Profile admission also checks the exact kind-ordered edges `None Start -> Configured Task -> User Task -> None End`; node cardinality and local arity alone are insufficient because they would also admit the reversed Task order. The descriptor is reconstructed only from the exact profile binding. XML extension syntax, namespace prefixes, and raw moddle objects do not cross the source-package boundary.

Lowering maps the checked node to the existing operation without widening that operation:

```ts
type ConfiguredTaskOperation = Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitEffect }
>;
```

The lowered operation has exact origin identity, endpoint-derived input and output, the checked descriptor, empty input and output mappings, and `bpmnErrorRoute: null`. Service Task retains its checked type, source binding, mappings, and Error route. Artifact consistency accepts `awaitEffect` only from the explicit closed origin set `serviceTask | configuredTask`, then applies origin-specific invariants. It does not weaken the existing Service Task checks.

## Runtime semantics and observation

No runtime contract changes. The configured Task specializes existing `awaitEffect` behavior:

- activation consumes one exact input token and publishes one effect occurrence with the configured Task element identity and existing descriptor;
- completing the exact occurrence with the existing successful Probe result consumes the wait and produces one token on the exact output;
- missing, stale, wrong-element, wrong-activation, wrong-instance, duplicate, or non-running completion rejects with exact state preservation;
- no result mapping, local variable, BPMN Error route, retry outcome, incident, or handler-specific state exists in this profile.

Canonical observation uses the existing `openEffects`, `enabledInteractions`, `openUserTasks`, variables, status, and logical-time fields. It gains no configured-Task field. Definition identity, semantic instance identity, effect occurrence identity, Activity attempt identity, and Temporal Workflow identity remain distinct.

## Stable semantic rules

| Rule ID | Proposition |
|---|---|
| `CTASK-SOURCE-01` | The selected source contains one exact versioned configured-Task extension in the exact linear topology; unconfigured Abstract Task and malformed or unsupported extension shapes refuse under this profile. |
| `CTASK-BIND-01` | The registered extension descriptor plus profile binding map the exact expanded extension name and handler type to one exact neutral effect descriptor; source, profile, checked node, and program descriptor drift refuses. |
| `CTASK-LOWER-01` | Lowering preserves configured Task identity and endpoint-derived control places, emits existing `awaitEffect` with empty mappings and no BPMN Error route, and never projects the node as Service Task. |
| `CTASK-WAIT-01` | Start closure reaches exactly one stable configured effect occurrence and does not expose the trailing User Task before successful exact effect completion. |
| `CTASK-COMPLETE-01` | Completing the exact configured effect uses existing effect semantics and exposes exactly the trailing User Task; completing that task then completes the Process. |
| `CTASK-REFUSE-01` | Wrong-identity, stale, duplicate, or non-running effect completion has no successor and preserves exact committed state. Descriptor drift refuses earlier under `CTASK-BIND-01` because the completion stimulus does not resubmit a descriptor. |
| `CTASK-OBSERVE-01` | The configured Task uses the existing effect and User Task observations and adds no public source-extension, handler, host, or retry field. |
| `CTASK-CLOSURE-01` | Start-to-effect, effect-to-User-Task, and User-Task-to-completion each have an exact finite closure length and one-smaller overflow witness; every stable running state exposes exactly one existing resumable interaction, and internal enabledness is unique. |
| `CTASK-HOST-01` | Existing Temporal Activity execution durably refines only the selected existing effect operation; the Workflow never parses the BPMN extension or defines configured-Task meaning. |

All rules except `CTASK-HOST-01` are standards-plus-profile rules. `CTASK-HOST-01` is a refinement constraint.

## Lean lane, laws, non-laws, and witnesses

The Lean lane is **proved** and introduces no new transition relation. A new configured checked node, strict decoder arm, profile cardinality, graph arity, and lowering clause specialize the existing `awaitEffect` relation, evaluator, soundness, refusal, and observation laws.

Required proved facts are:

- exact checked admission, descriptor binding, `1 -> 1` arity, endpoint-only lowering, empty mappings, and absent Error route;
- configured Task and Service Task remain distinct checked constructors;
- representative configured and Service Task nodes with the same descriptor lower to the same effect operation shape after normalizing source identity;
- existing effect activation/completion relation, evaluator soundness, owner preservation, and exact refusal apply unchanged;
- initial closure reaches only the configured effect, successful effect completion reaches only the trailing User Task, and User Task completion reaches the completed Process;
- exact closure lengths, one-smaller failures, unique enabledness, and stable effect/User-Task resumption;
- strict checked decoding for exact, missing, extra, malformed, empty, duplicate-key, wrong-kind, and descriptor-drift shapes;
- every frozen CheckedSource experiment that exhaustively consumes the widened node fails closed explicitly.

Checked non-laws are:

- configured Task behavior does not state the standard meaning of plain Abstract Task;
- reusing `awaitEffect` does not make configured Task a Service Task or assign Service Task properties;
- one Probe binding does not establish a general handler registry, payload, data mapping, Error, retry, or incident model;
- evaluator soundness does not establish host delivery, retry, fairness, or liveness outside the finite scenario;
- structural equality after normalized lowering does not erase exact checked-source, definition, or occurrence identity.

The first Lean change repeats the one-CPU, no-swap, 3 GiB Linux admission audit before further proof growth. macOS uses Docker only for the hard process-tree memory limit; native Linux may use equivalent cgroup controls directly.

## Temporal hosting and refinement preflight

No new durable ingress, wait, Timer, Signal, Child Workflow, cancellation, or projection mechanism is required. Manual Process start reaches existing `openEffects`; the Workflow schedules the existing Activity transport for the exact descriptor; successful Activity material is converted to the existing `CompleteEffect` stimulus; the later User Task uses the existing Update boundary.

The preserved relation is the existing effect relation: semantic committed state owns the wait and occurrence identity, one Workflow loop owns state mutation, the Activity carries only the reviewed transport material, idempotency is keyed by the existing effect occurrence, transport retries remain host facts, and replay reuses recorded Activity results. The extension is parsed and bound before Workflow start and never appears in Workflow state.

The smallest live witness:

1. compiles and starts the registered exact source;
2. proves the configured effect is the only published interaction and the trailing User Task is absent;
3. runs the existing Probe Activity through Worker absence or replacement and recovers the accepted result;
4. proves the trailing User Task appears with exact occurrence identity;
5. completes it and obtains the canonical terminal state;
6. inspects one Activity family, no new Timer/Signal/Child/cancellation family, and exact replay;
7. runs a test-owned pass-through mutation that exposes the User Task at start, reaching the public discriminator.

The existing Service Task retry, reconciliation, accepted-but-response-lost, and transport-failure matrices are not repeated because no host mechanism changes. The registered scenario, exact descriptor/origin mutation, pass-through mutation, Activity history, Worker replacement, and replay are required to prove this source family actually reaches the established mechanism.

## Rule-to-evidence matrix

| Rule | BPMN/profile | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|
| `CTASK-SOURCE-01` | Exact XSD-valid source and strict extension matrix | Exact checked fixture | Independent source projection | Pre-start compilation | Plain Abstract Task and malformed extension negatives |
| `CTASK-BIND-01` | Closed configured source arm in `effectBindings` | Binding and decoder theorems | Artifact consistency | Exact admitted program | Source-handler and descriptor drift mutations |
| `CTASK-LOWER-01` | Checked/IL artifact pair | Endpoint and normalized-shape theorems | Independent lowerer | Exact program preflight | Checked-kind collapse and endpoint swap |
| `CTASK-WAIT-01` | Representative profile | Initial closure theorem | Direct core witness | Query before Activity result | Pass-through mutation exposes User Task early |
| `CTASK-COMPLETE-01` | Answer-free scenario | Effect then User Task closure | Direct core witness and differential | Activity then Update | Dropped effect completion or output mutation |
| `CTASK-REFUSE-01` | Exact occurrence contract | State-identity refusal | State-identity refusal | Stale/duplicate durable command | Wrong element, activation, or instance identity |
| `CTASK-OBSERVE-01` | Existing observation schema | Normalized Service Task comparison | Full canonical comparison | Query projection | Private extension/handler field leak |
| `CTASK-CLOSURE-01` | Exact program cardinality | Exact limits, overflow, enabledness, resumption | Same finite closures | Stable waits in scenario | One-smaller limits and extra enabled operation |
| `CTASK-HOST-01` | Non-null Temporal relation, `cib: null` | Not a host theorem | Existing effect host preflight | Worker replacement, history, replay | CIB pass-through diagnostic and Temporal pass-through mutation |

## Runtime-only constructs

No runtime-only construct is added. Existing effect occurrence, transport material, Activity idempotency key, handler registry, open-effect observation, and completion stimulus retain their owners and serialized values. The new source extension and checked node disappear at lowering except for exact origin identity and the already public neutral descriptor.

## Required, optional, and excluded functionality

Required:

- the exact versioned source extension, one standard `bpmn-moddle` extension descriptor, and closed machine-readable profile binding;
- prefix-independent projection plus raw duplicate-container refusal before parser-erased source is discarded;
- distinct configured checked node, strict schema/decoders, graph admission, and endpoint-only lowering to existing `awaitEffect`;
- proved Lean specialization and independent TypeScript source/lowering evidence;
- one registered answer-free standards scenario with `cib: null`, one runnable example, one differential case, and meaningful source/descriptor/pass-through mutations;
- one focused live Temporal Activity/Worker-replacement/history/replay witness using existing effect hosting;
- one bounded retained CIB pass-through trace used only as an exclusion oracle;
- frozen pre-M2 preservation and atomic catalog guards.

Optional only if it adds no semantic or public claim:

- an additional namespace-prefix spelling beyond the required alternate-prefix witness.

Excluded:

- admission or execution of plain Abstract Task, Manual Task, Script Task, Business Rule Task, Send Task, or another custom Task type;
- dynamic handler lookup, arbitrary handler strings, handler deployment, class loading, expressions, payload, variables, data mappings, BPMN Error routes, incidents, retries as BPMN semantics, compensation, loops, multi-instance, or boundary Events;
- a new IL operation, command, state field, observation field, Activity transport, Worker protocol, or public API;
- CIB compatibility for the extension, Product 2 task configuration or work queues, UI, authorization, and A12 behavior or source.

## Preservation obligation and common-mode risks

Every source/profile/scenario registration present in immutable pre-M2 baseline `7529150bf3a83de7e36734cf8d401924a0811b7d` retains exact source bytes, profile bytes, admission result, checked graph, lowered program, scenario projection, and registry origin. The frozen cyclic-control-flow preservation fixture remains read-only. Configured Task is additive.

Primary common-mode risks are:

- both source implementations confuse Abstract Task with configured external work;
- checked source reuses Service Task and erases the extension's Task-type identity;
- profile and projector both hard-code the fixture or accept any handler string;
- Lean and TypeScript compare only the lowered operation and miss source-to-descriptor drift;
- the shared artifact verifier assumes every `awaitEffect` originates at Service Task or is weakened to accept arbitrary origins;
- the Temporal witness exercises the existing effect handler without proving the configured source reached it;
- the no-op mutation is asserted only inside the compiler and never reaches a public observation;
- profile, scenario, example, schemas, experiments, and differential catalog land non-atomically.

Separating evidence uses arbitrary source IDs, alternate prefixes with the same URI, wrong namespaces and handler types, independently constructed checked/program values, exact artifact mutations, normalized configured-versus-Service lowering comparison, pass-through public-state mutation, Worker replacement, Activity history/replay, and the frozen baseline oracle.

The nearest realistic unsupported claim is a second configured Task type with payload and result mappings. That requires a versioned handler binding and data contract, not a wider string field. This proposal neither blocks nor silently selects it.

## Versioning consequences

Pre-release replace-in-place policy applies. The checked-node union, importer extension descriptor, and semantic-profile source union widen atomically across strict schemas, Lean and TypeScript decoders, exhaustive switches, source projection, checked graph admission, lowering, artifact consistency, profile/scenario registries, product examples, differential evidence, Temporal preflight, and frozen experiments. The Semantic Process operation, runtime state, stimulus, result, and public observation wire contracts do not change. Adding the descriptor is additive because this namespace was previously rejected under every profile; changing projection for bytes and profile identity already admitted by an existing compiler would require a new compiler/importer identity.

### Owners this implementation grows

The owner inventory was mechanically derived with `node scripts/what-binds.ts`. Two extractions are mandatory before feature growth: [semantic profile capability](../../packages/semantic-core/src/semantic-process-profile.ts) has only 41 lines of headroom and must move cohesive checked/program shape catalogs into narrow owners; [contract artifact consistency](../../scripts/contract-artifact-consistency.ts) is exactly 600/600 and must move all `awaitEffect` origin checks into a cohesive effect-operation artifact verifier. Existing Service Task checks move intact and remain covered by the same guards.

| Owner | Headroom to 600 nonblank lines | Required consequence |
|---|---:|---|
| [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 358 | Add the distinct configured Task constructor only. |
| [profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts) | 553 | Add the checkpoint and later registered profile identity without changing prior values. |
| [profile capability](../../packages/semantic-core/src/semantic-process-profile.ts) | 481 | Extract checked/program shape catalogs first, then add exact configured-node and existing-effect cardinalities plus descriptor detail. |
| [graph policy](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 533 | Keep the new profile whole-graph acyclic. |
| [moddle adapter](../../packages/bpmn-source/src/moddle-adapter.ts) | 441 | Register one package-local extension descriptor through the standard constructor option. |
| [checked-process compiler](../../packages/bpmn-source/src/checked-process-compiler.ts) | 200 | Derive the closed profile-aware projection policy before partitioning and preserve the exact non-selected-profile Task diagnostic. |
| [checked-element projection](../../packages/bpmn-source/src/checked-element-projection.ts) | 204 | Accept the same closed projection policy and delegate selected `bpmn:Task` values to a new cohesive configured source reader. |
| [projected-key inventory](../../packages/bpmn-source/src/projected-flow-element-keys.ts) | 317 | Add the exact `Task` plus `extensionElements` key shape. |
| [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 279 | Add both unavoidable configured-node switches and `1 -> 1` ownership. |
| [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 146 | Add exact cardinality and Start-to-configured-to-User-to-End topology, not cardinality alone. |
| [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 55 | Delegate one configured arm to a new cohesive lowerer; do not grow the near-limit generic test owner. |
| [singleton containment admission](../../packages/bpmn-source/src/singleton-containment-admission.ts) | 469 | Consume the inherited `BaseElement.extensionElements` upper bound before parser projection can erase a duplicate. |
| [source compiler](../../packages/bpmn-source/src/compile.ts) | 236 | Keep the shared raw containment check before checked compilation and pass no raw XML into projectors. |
| [metamodel checker](../../scripts/check-bpmn-semantic-process-metamodel.ts) | 247 | Calibrate the Task, extension wildcard, and `BaseElement.extensionElements` upper-bound facts actually consumed. |
| [projected-key test](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | 152 | Register the new projector and prefix-independent exact-key behavior. |
| [singleton-containment test](../../packages/bpmn-source/test/singleton-containment-admission.test.ts) | 480 | Add the duplicate `extensionElements` discriminator to the existing parser-erasure oracle. |

The new focused source test owns the complete positive/negative matrix, including the same bytes under a non-selected profile retaining the exact `unsupportedElementType` diagnostic. The shared singleton-containment test owns the repeated-container parser-erasure discriminator. [Semantic Process lowering tests](../../packages/bpmn-source/test/semantic-process-lowering.test.ts) already use 571/600 nonblank lines and [the BPMN-source package integration test](../../packages/bpmn-source/test/bpmn-source.test.ts) uses 506/600, so neither receives the feature matrix.

| Owner | Headroom to 600 nonblank lines | Required consequence |
|---|---:|---|
| [artifact consistency](../../scripts/contract-artifact-consistency.ts) | 50 | Extract before change; leave orchestration only. |
| [contract artifact projection](../../scripts/contract-artifacts.ts) | 13 | Add only the exhaustive classifier arm; extract any additional responsibility. |
| [contract artifact cases](../../scripts/contract-artifact-cases.ts) | 385 | Register the one product-neutral extension scenario with no CIB target. |
| [definition artifact negatives](../../scripts/contract-definition-artifacts.test.ts) | 101 | Keep existing shared tests; add configured effect-origin/profile tests in a new cohesive owner. |
| [pipeline cases](../../packages/differential/test/pipeline-cases.ts) | 24 | Put configured cases in a capsule-owned module and add only one import/spread. |
| [pipeline test](../../packages/differential/test/pipeline.test.ts) | 123 | Update only the exact ordered inventory and end-to-end assertion. |
| [pipeline catalog test](../../packages/differential/test/pipeline-catalog.test.ts) | 246 | Lock additive profile/case classification and meaningful mutation. |
| [product-example guard](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | 379 | Require one runnable example using the existing Probe handler and trailing User Task plan. |

The new `effect-operation-artifact-consistency.ts` accepts only checked `serviceTask | configuredTask` origins. It compares element identity, descriptor, mappings, and Error route. Configured Task requires empty maps and a null route; Service Task keeps its exact current descriptor, mapping, and route rules. A second new `configured-task-profile-consistency.ts` proves the exact namespace/type-to-Probe binding because schema shape alone cannot establish that selected value.

Strict [checked-process schema](../../contracts/schemas/checked-process.schema.json) and [semantic-profile schema](../../contracts/schemas/semantic-profile.schema.json) change atomically but are declarative JSON rather than hand-written source headroom owners. The bounded BPMN metamodel manifest adds the consumed `BaseElement.extensionElements` cardinality fact. The local moddle descriptor, configured source reader/lowerer/tests, effect-origin verifier, profile-consistency verifier, pipeline cases, and live witness are cohesive new owners and begin below 600.

| Owner | Headroom to 600 nonblank lines | Required consequence |
|---|---:|---|
| [semantic contract](../../BpmnSemantics/SemanticProcessContract.lean) | 120 | Add distinct checked configured Task only; the operation union stays unchanged. |
| [checked decoder](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 347 | Decode the exact configured node and descriptor strictly. |
| [JSON conformance](../../BpmnSemantics/SemanticProcessJsonConformance.lean) | 425 | Add exact/missing/extra/empty/duplicate/mismatch facts at the existing controlled decision boundary. |
| [checked graph validation](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean) | 464 | Add configured `1 -> 1` arity and reachability classification. |
| [checked admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 282 | Count one configured Task separately from Service Task and other Tasks. |
| [lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 68 | Delegate one configured lowering specialization; add no unrelated proof. |
| [profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 205 | Require checked configured count 1 while the program count remains effect 1 and User Task 1. |
| [conformance executable](../../BpmnSemantics/ConformanceMain.lean) | 582 | Import one independently buildable configured Task conformance owner. |

New `BpmnSemantics/ConfiguredTaskConformance.lean` proves the binding, distinctness, lowering specialization, effect/User-Task closure, refusal, normalized Service Task comparison, and mutations. The frozen direct checked-source experiment remains unsupported and receives explicit fail-closed arms in [decomposition](../../BpmnSemantics/Experiments/CheckedSourceDecomposition.lean) at 171/600, [transition](../../BpmnSemantics/Experiments/CheckedSourceTransition.lean) at 313/600, [coverage](../../BpmnSemantics/Experiments/CheckedSourceCoverage.lean) at 251/600, [graph](../../BpmnSemantics/Experiments/CheckedSourceGraph.lean) at 86/600, and [chain](../../BpmnSemantics/Experiments/CheckedSourceChain.lean) at 195/600. Scenario, Admission, and Frontier use non-exhaustive facts and need no feature edit unless the post-widening sweep proves otherwise.

No production Temporal owner changes. Existing [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), Workflow, Activity, runner, evidence, and effect-probe owners already host the exact `awaitEffect` plus passive User Task shape. The feature adds only a focused live witness and example/catalog registration; touching Workflow code merely for this source family is a stop condition.

The profile, one scenario, BPMN fixture, product example, and differential case register atomically in [profiles](../../profiles/README.md), [scenarios](../../scenarios/README.md), [semantic-core](../../packages/semantic-core/README.md), [BPMN source](../../packages/bpmn-source/README.md), [shared contracts](../../contracts/README.md), [differential](../../packages/differential/README.md), and [Temporal adapter](../../packages/temporal-adapter/README.md). Closure also updates the IL, admission, testing, implementation-map, lifecycle, plan, capsule-cost, root README, and both documentation registries. The independent review treats any exhaustive owner missing from this inventory as a required edit.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [document reviewability](../../scripts/document-reviewability.test.ts) | Recompute owner figures and require proposal routing. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | Keep the two Task requirements, citations, dispositions, and capsule aligned. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) and [contract artifacts](../../scripts/contract-artifacts.test.ts) | Cover the new checked/profile shapes and reject malformed exact values. |
| [definition artifact consistency](../../scripts/contract-definition-artifacts.test.ts) | Bind configured origin, descriptor, endpoints, empty mappings, and absent Error route without weakening Service Task. |
| [projected keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | Close the Task projector and exact consumed-key inventory without changing another profile's Task diagnostic. |
| [singleton containment](../../packages/bpmn-source/test/singleton-containment-admission.test.ts) | Reject repeated `extensionElements` before `bpmn-moddle` can erase one container. |
| [frozen cyclic baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation.test.ts) | Preserve every pre-M2 source, profile, checked, IL, and registry-origin value. |
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) and [differential pipeline](../../packages/differential/test/pipeline.test.ts) | Land profile, scenario, target, and ordered inventories atomically. |
| [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | Give the registered profile one runnable existing-handler example. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | Prove the sequential effect-plus-User-Task program uses the existing admitted host shape. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Prevent a new engine, handler transport, public private-state leak, or BPMN parsing in Workflow code. |
| [platform boundary](../../scripts/platform-product-boundary.test.ts) | Keep Product 2 outside private checked, IL, handler, and Activity values. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) and [normative references](../../scripts/normative-reference-resolution.test.ts) | Validate the exact fixture and resolve the Task/extension citations. |
| [source hygiene](../../scripts/source-hygiene.test.ts), [Lean contracts](../../scripts/lean-source-contracts.test.ts), and [what-binds](../../scripts/what-binds.test.ts) | Keep cohesive owners, exhaustive switches, comments, native decisions, and registries within bounds. |
| [semantic review packet](../../scripts/semantic-review-packet.test.ts) and [Markdown links](../../scripts/markdown-links.test.ts) | Bind governed reviews to immutable targets and resolve every owner/guard link. |

## Epistemic closure and cost boundary

Closure may establish only one exact configured Task extension, its profile binding to the existing Probe effect descriptor, distinct checked identity, neutral lowering, finite effect/User-Task execution, registered answer-free evidence, and existing Activity refinement. It does not establish plain Abstract Task support, a general Task handler system, another descriptor, data, failures, retries as semantics, CIB compatibility, Product 2 work queues, or Process Execution Conformance.

Meaningful mutations are: erase the configured checked kind; accept a plain Task; accept another namespace or handler type; alter the descriptor; swap endpoints; add mappings or an Error route; bypass the effect; expose the User Task early; drop effect completion; leak source configuration publicly; execute without an Activity; and omit one atomic registration. Each must reach a source, artifact, semantic, public, proof, or durable-host discriminator.

At closure, [CAPSULE-COST-LEDGER.md](../CAPSULE-COST-LEDGER.md) records commit-bounded code and documentation churn against the Service Task effect capsule, the nearest completed increment that uses the same neutral effect runtime and Temporal Activity host. The reflection must explain the cost of preserving a distinct checked-source Task type while reusing the IL/runtime mechanism.

## Stop conditions

Stop and return to research or owner decision if:

- the exact extension cannot remain BPMN-XSD-valid and warning-free without a bespoke parser or duplicate metamodel;
- implementation requires treating plain Abstract Task as external work or changing its standard immediate-completion meaning;
- configured and Service Task identity cannot remain distinct through checked source and exact artifact binding;
- the profile binding cannot map one exact expanded source name and type to one exact neutral descriptor without dynamic lookup;
- lowering requires a new operation, runtime state, stimulus, result, observation, Activity transport, or Workflow parser;
- the existing effect relation cannot prove the selected closure and refusal facts by specialization;
- the pass-through mutation cannot reach a public durable discriminator;
- existing Service Task artifact checks, source/profile bytes, or the frozen baseline must weaken;
- any A12 or unreviewed CIB behavior becomes necessary;
- an owner would cross 600 nonblank lines without a cohesive extraction, or the first Lean change cannot pass the one-CPU, no-swap, 3 GiB resource audit.

## Owner decisions after review

Owner approval is requested for these exact decisions:

1. Preserve BPMN Abstract Task as conforming immediate completion but defer its admission, and select one distinct versioned configured Task extension for external work.
2. Register one standard `bpmn-moddle` descriptor for namespace `urn:bpmn-lean:bpmn:extensions:v1`, element `taskDefinition`, and type `urn:bpmn-lean:task-handler:probe-v1`, with prefix-independent expanded-name matching.
3. Add a distinct checked configured Task plus a closed configured-Task source arm in existing profile `effectBindings`, then lower only the exact binding to existing Probe `awaitEffect` with empty mappings and no Error route.
4. Add no new IL operation, runtime transition, stimulus, state, observation, handler transport, or Temporal mechanism.
5. Use a proved Lean specialization, one conditional semantic checkpoint review, and exact closure/resumption/refusal laws.
6. Register one product-neutral answer-free extension scenario with `cib: null`, reuse the existing Probe Activity handler, and require pass-through plus descriptor-binding mutations and focused Worker-replacement/history/replay evidence.
7. Keep Abstract Task admission, other configured types, payload/data/Error/retry/incident semantics, CIB compatibility, Product 2 work queues, and A12 outside the capsule.
