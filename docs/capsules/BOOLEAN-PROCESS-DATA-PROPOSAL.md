# Boolean Process-data proposal

## Status

**Owner-approved on 2026-08-12; the first green semantic checkpoint awaits independent review.** This proposal selects one additive Boolean Process-variable value only for exact User Task completion under a new CIB Seven compatibility profile. The checkpoint implements the unregistered wire, TypeScript, Lean, CIB-runner, and shared Temporal-encoding mechanism. Profile registration, retained evidence, differential and live Temporal lanes, and product use remain paused until the semantic checkpoint is approved.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `9937378` | `fork-turns-none` | `approve-with-required-edits` | `389d748` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

May the existing exact User Task completion command carry a primitive Boolean Process-variable value under one new profile, while every existing profile, Process Start, effect mapping, expression language, BPMN source shape, Semantic Process operation, Temporal primitive, and Product 2 contract retains its current meaning?

The recommendation is **yes, for one exact Boolean completion profile and no broader value-domain claim**. This is the smallest dependency-first M3 increment because it proves one non-string value survives the established command, state, observation, CIB, differential, and Temporal boundaries before E2 assigns typed form metadata to a User Task.

## Selection basis and dependency order

The M3 demo needs both a non-string value and E2 User Task assignment/form metadata. The value increment comes first for three reasons.

1. A primitive Boolean is the smallest truthful non-string witness and extends the existing tagged union without reinterpreting any accepted string or null value.
2. Number would require an exact integer, decimal, range, and cross-language precision policy. Recursive JSON would additionally require object-key ordering, array and depth limits, and serialization ownership. Neither policy is needed to prove the first M3 value round trip.
3. E2 first would freeze a misleading form contract. BPMN User Task renderings and the selected CIB `formKey` surfaces do not define typed fields, so E2 would either advertise a Boolean field the engine cannot carry or publish string/null-only metadata that this value increment immediately replaces. Assignment alone would not be the named E2 prerequisite.

The selected profile ID is `cibseven-2.2.0-user-task-boolean-completion-data-draft`. It reuses the exact sequential one-User-Task checked graph and Semantic Process program shape of `cibseven-2.2.0-user-task-process-data-draft`. It differs only in its admitted User Task completion value domain and classified CIB extension. Process Start remains the existing string/null extension. The separate CIB phase-zero calibration uses two User Tasks so it can observe the submitted value before Process completion; that probe topology is not the profile graph.

## Authority and CIB relationship

BPMN 2.0.2 Clauses 10.3.3 and 13.3.3 own the User Task lifecycle but do not define `TaskService.complete(taskId, variables)`, primitive variable serialization, or a universal form-submission-to-Process-variable rule. This proposal therefore does not add a BPMN requirement or claim that Boolean variables are BPMN semantics.

The existing [`CIB-EXT-0005`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0005--public-user-task-completion-installs-submitted-process-variables) stays frozen to string/null completion data, and [`CIB-EXT-0006`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0006--public-process-start-installs-initial-process-variables) stays frozen to string/null start data. Selected [`CIB-EXT-0010`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0010--public-user-task-completion-preserves-a-boolean-process-variable) classifies only the additional Java `Boolean` completion fact.

The pinned CIB Seven `2.2.0` phase-zero probe constructs a two-User-Task Process with public Model API, starts it with string/null data, completes the first task with `Boolean.TRUE` and a string control, and reads the next-task, Runtime Service, and final historic variables. All three public projections retain `java.lang.Boolean`; an explicit anti-stringification assertion rejects `"true"`. Unknown and stale task IDs preserve the complete live state. That source observation establishes the selected extension's feasibility without making CIB the semantic authority for the project representation.

## Selected value and profile contract

The shared tagged value union becomes:

```ts
type VariableValue = DeepReadonly<
  | { kind: "string"; value: string }
  | { kind: "null" }
  | { kind: "boolean"; value: boolean }
>;
```

The Boolean arm has exactly the keys `kind` and `value`. Its value is a JSON Boolean, never the strings `"true"` or `"false"`, the numbers `1` or `0`, or a truthy coercion. Unknown keys, duplicate keys, a missing value, and a non-Boolean value reject at the strict wire boundary.

The shared schemas and decoders recognize the shape so every producer and consumer remains exhaustive. Recognition alone does not authorize execution. One profile-aware value-domain owner applies this closed policy at both scenario/program admission and every live command admission:

| Surface | Existing profiles | New Boolean-completion profile |
|---|---|---|
| `StartProcess.initialVariables` | Existing profile-specific string/null or empty rule | String/null only |
| `CompleteUserTaskInstance.submittedValues` | Existing profile-specific string/null or empty rule | String/null/Boolean |
| `CompleteEffect.localPatch` and Error patch | Existing mapping-specific string/null rule | Not present in the admitted program and Boolean always rejected |
| Simple Boolean/JUEL input | Existing string/null profile boundary | Not present in the admitted program and no Boolean expression capability |
| Checked source, IL operations, runtime scopes, observations | Unchanged | Unchanged except the new tagged value may appear in Process bindings and their existing projection |

The value policy is checked before a transition commits. An old-profile Boolean completion is a semantic rejection with an equivalent committed state, including the active User Task and every Process binding. A later valid old-profile string/null completion must still succeed, proving the refusal did not poison the Workflow. Scenario-only validation is insufficient because direct `applyStimulus` and Temporal Update paths are public execution boundaries too.

## Runtime account

No new transition family is added. The existing completion rule remains:

1. identify the exact active semantic User Task occurrence;
2. validate the profile-owned submitted-value domain;
3. atomically merge the canonical patch into Process scope;
4. remove the User Task wait;
5. run existing bounded internal closure;
6. publish the ordinary canonical Process variables and command result.

Merge remains name-based replace-or-create with unrelated bindings preserved and explicit null distinct from absence. Boolean adds no delete, coercion, nested value, local scope, field schema, or expression evaluation. Wrong occurrence, stale occurrence, wrong Process instance, terminal Process, and old-profile Boolean all reject before merge and preserve the exact state.

The new profile's source bytes, checked graph, Semantic Process operations, control places, closure limits, wait set, and observation fields match the existing sequential User Task profile after profile identity is normalized. The profile admits no effect operation, condition, gateway, mapping, Timer, Message, or second simultaneous task.

## Stable semantic rules

| Rule ID | Proposition | Layer |
|---|---|---|
| `BVAL-WIRE-01` | Boolean is one exact tagged primitive value and is distinct from string `"true"`, string `"false"`, null, and absence in every strict decoder, encoder, comparator, and command identity. | Shared wire and canonical encoding |
| `BVAL-PROFILE-01` | Only the new profile admits Boolean in exact User Task completion; Process Start, effects, expressions, mappings, and every existing profile reject it before state change. | Profile-aware admission |
| `BVAL-COMPLETE-01` | Exact completion atomically creates or replaces Boolean Process bindings before existing continuation closure. | Selected CIB compatibility overlay implemented by the semantic core |
| `BVAL-REFUSE-01` | Wrong/stale occurrence and profile-value mismatch reject with the complete committed state unchanged; a later admissible command remains usable. | Semantic command admission |
| `BVAL-OBSERVE-01` | Committed Boolean values appear unchanged in the existing Process-variable observation, CIB raw/canonical evidence, command receipt, Query result, and terminal result without a new observation field. | Existing observation boundary |
| `BVAL-LAW-01` | Value-parametric merge, occurrence, refusal, closure, and projection laws survive the widened type; value-specific effect and expression laws retain explicit string/null hypotheses or exclusions. | Lean and independent TypeScript semantics |
| `BVAL-HOST-01` | The existing content-bound User Task Update durably carries, commits, replays, and returns the tagged Boolean without a new Workflow command or host-owned write. | Temporal refinement |

## Lean lane and M3 research question

The Lean lane is **proved**. It answers M3's named question, whether the current law set survives a widened value domain or needs explicit value hypotheses.

The shared `VariableValue` inductive gains `.boolean (value : Bool)`. Value-parametric definitions and laws remain quantified over the widened type: canonical patch merge, exact completion, mismatch preservation, occurrence identity, Process-scope projection, and finite closure. The new conformance module proves at least one exact Boolean create/replace witness, full-state refusal preservation, and the existing closure result under the new profile.

Domain-specific owners remain narrow:

- Process Start under this profile proves an explicit string/null premise and rejects Boolean.
- Effect result admission rejects Boolean before mapping or Activity-local merge for every current effect profile.
- Simple Boolean v1 remains a string/null language. Its admitted-profile law carries that premise. The total internal evaluator may identify a Boolean binding as present and not null while `stringEquals` remains false, but no registered profile can route on such a value; no `booleanEquals`, coercion, or JUEL rule is introduced.
- Scenario and program decoders prove exact, missing, extra, malformed, duplicate-key, stringified, and wrong-profile cases.

If a reusable law fails only because it silently assumed string/null, the correction is an explicit hypothesis at the narrowest domain-specific theorem, not a coercion and not a weakening of the new value representation.

## Temporal hosting and refinement preflight

No new Temporal primitive is required. The existing Workflow start input remains string/null for this profile. The existing `bpmn-complete-user-task` Update is the durable ingress, the semantic core owns the active wait and Process bindings, one Workflow loop alone calls `applyStimulus`, and Query plus completed receipt project only committed semantic state.

Canonical command identity must distinguish Boolean `true`, Boolean `false`, string `"true"`, and null. Exact duplicate delivery returns the first result. Reusing one semantic command ID with any of those values changed reaches the existing identity-conflict result rather than aliasing the first Update.

The smallest live witness:

1. compiles and starts the registered new profile with string/null initial data;
2. observes the exact User Task and replaces the Worker while the semantic wait remains active;
3. completes through the existing Update with a Boolean patch;
4. proves the next User Task and terminal receipt expose the exact tagged Boolean;
5. inspects the recorded Update result, excludes Timer, Signal, Child Workflow, Activity, and cancellation families, and replays the history;
6. starts the old profile, submits the same Boolean Update, observes state-preserving rejection, then completes successfully with a valid string/null patch.

The nearest host counterexample stringifies the Boolean before core application or final projection. A second retained mutation installs the binding outside `applyStimulus`. Both must disagree with the direct semantic and durable observations. Workflow, Worker, client, and test support never parse the BPMN source or infer value meaning from Event History.

## Rule-to-evidence matrix

| Rule | Profile/CIB | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|
| `BVAL-WIRE-01` | Exact primitive in new profile artifacts and raw evidence | Strict decode/encode checks | Strict union, comparator, artifact checks | Command-ID encoder | Boolean versus string/null/absence mutations |
| `BVAL-PROFILE-01` | New `CIB-EXT-0010`; old profiles exact | Profile-value admission theorems | Program and command admission tests | Old-profile rejected Update then valid completion | Direct `applyStimulus` old-profile Boolean negative |
| `BVAL-COMPLETE-01` | Public `TaskService.complete` phase-zero and retained scenario | Boolean merge theorem | Independent direct core witness | Existing Update commits | Stringification mutation |
| `BVAL-REFUSE-01` | Unknown/stale public task controls | Full-state equality theorem | Wrong/stale/profile mismatch exact state | Rejected Update leaves wait usable | Later valid completion |
| `BVAL-OBSERVE-01` | Next-task, runtime, and historic Java Boolean | Canonical projection | Scenario/result projection | Query, receipt, history, replay | Raw text versus canonical Boolean mutation |
| `BVAL-LAW-01` | Profile excludes other value consumers | Generic laws plus explicit hypotheses | Merge/expression/effect exhaustive checks | Not a host theorem | Effect or Simple Boolean admission mutation |
| `BVAL-HOST-01` | Non-null Temporal relation | Not a host theorem | Existing host-capability admission | Worker replacement and replay | Outside-core write and stringify mutations |

## Required, optional, and excluded functionality

Required:

- one new profile identity over the existing exact sequential User Task graph, with string/null Process Start and string/null/Boolean User Task completion;
- one exact Boolean tagged union arm across strict scenario, semantic, canonical-result, and CIB evidence contracts;
- profile-aware value admission at deployment/scenario and live command boundaries in Lean, TypeScript, and the CIB runner;
- exact canonical comparison and identity encoding across Boolean true, Boolean false, string `"true"`, and null;
- one new answer-free scenario, retained CIB evidence, independent Lean/core execution, differential stringify mutation, runnable example, live Worker-replacement/history/replay witness, and old-profile live refusal witness;
- byte-identical existing profile, scenario, evidence, and result artifacts;
- the mandatory Java protocol extraction and focused preservation gate before the value variant grows that owner;
- the standing one-thread, one-CPU, no-swap, OS-enforced 3 GiB Lean admission build before the complete gate.

Optional only if it changes no semantic claim:

- a second Boolean field in the same completion patch to demonstrate both true and false in one direct test.

Excluded:

- Boolean Process Start, effect arguments or result patches, input/output mappings, Simple Boolean or JUEL routing on Boolean, numbers, decimals, dates, binary values, arrays, objects, serialization metadata, variable deletion, and task-local variables;
- BPMN Properties, Data Inputs/Outputs, Data Associations, Assignments, transformations, forms, field definitions, validation, assignment, identity, authorization, inboxes, audit actors, Product 2 API/UI, or E2 metadata;
- a new checked node, Semantic Process operation, runtime scope, command kind, observation field, Temporal Update, Signal, Activity, Child Workflow, Search Attribute, or Event History-derived fact;
- modification of an existing profile identity or retained artifact, a general CIB variable API claim, A12 behavior, or a dependency addition.

## Preservation and common-mode risks

Every registered pre-M3 profile, scenario, result, and retained CIB evidence artifact remains byte-identical. Shared schemas may accept the new tagged syntax, but executable profile admission prevents the syntax from becoming meaning in an old artifact or direct command.

Primary common-mode risks are:

- every language recognizes Boolean but one boundary stringifies it;
- schemas accept Boolean globally and direct execution bypasses the profile gate;
- scenario admission rejects an old-profile Boolean while live `applyStimulus` or Temporal Update accepts it;
- Process Start or effect patches inherit the widened union without their own surface policy;
- Simple Boolean evaluation silently becomes a Boolean expression language;
- Java raw evidence records `String.valueOf(Boolean)` and the canonical projector appears to agree;
- command identity aliases Boolean true with string `"true"` or Boolean false;
- the new scenario's exact graph is accidentally used as evidence for the value rule without a stringify mutation;
- profile, scenario, example, differential, CIB, and Temporal catalog registration lands non-atomically.

Separating evidence uses independently constructed Boolean and string values, direct old/new-profile core execution, actual Java runtime types, raw and canonical evidence comparison, command-ID collisions, live state-preserving refusal, Worker replacement, history/replay, and a host bypass mutation.

The nearest unsupported claim is routing on a Boolean Process variable. That requires a separately approved expression-language increment and is not obtained merely because the runtime can store and project the value.

## Versioning consequences

Pre-release atomic replacement applies to the shared value union and every exhaustive producer/consumer, while the new profile is additive. Existing profile and scenario artifact bytes do not change. No retained production history baseline exists; approval of a durable baseline would require explicit migration, patch, replay, and rollback decisions.

The implementation must atomically update or satisfy the strict [scenario schema](../../contracts/schemas/scenario.schema.json), [CIB evidence schema](../../contracts/schemas/cibseven-evidence.schema.json), [semantic value contract](../../packages/semantic-core/src/contract.ts), [stimulus validator](../../packages/semantic-core/src/stimulus.ts), [semantic deployment admission](../../packages/semantic-core/src/semantic-process-admission.ts), [semantic command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [effect-data boundary](../../packages/semantic-core/src/semantic-process-data.ts), [Simple Boolean evaluator](../../packages/semantic-core/src/simple-boolean-expression.ts), [profile catalog](../../packages/semantic-core/src/semantic-profile-catalog.ts), [checked profile shapes](../../packages/semantic-core/src/checked-process-profile-shape.ts), [program profile shapes](../../packages/semantic-core/src/semantic-program-profile-shape.ts), and [graph-policy selector](../../packages/semantic-core/src/semantic-process-graph-policy.ts).

The Lean consumers are the [scenario contract](../../BpmnSemantics/Scenario.lean), [JSON support](../../BpmnSemantics/SemanticProcess/JsonSupport.lean), [execution admission](../../BpmnSemantics/SemanticProcess/Execution.lean), [profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean), [effect-patch data boundary](../../BpmnSemantics/SemanticProcess/Data.lean), [Simple Boolean evaluator](../../BpmnSemantics/SemanticProcess/SimpleBooleanExpression.lean), and [JSON encoder](../../BpmnSemantics/SemanticProcessJsonMain.lean). The source boundary must retain the same exact checked graph and IL through the [checkpoint compilation oracle](../../packages/bpmn-source/test/boolean-process-data-checkpoint-source.test.ts).

The Java consumers are the [scenario protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java), [variable binding bridge](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioVariableBindings.java), [scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java), [raw query evidence](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibStateQueryEvidence.java), and [state projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java). The retained-artifact consumers are the [raw value contract](../../scripts/contract-artifacts.ts) and [raw-to-canonical projector](../../scripts/contract-cib-evidence-projection.ts).

The Temporal consumers are the shared [canonical typed-tuple encoder](../../packages/temporal-adapter/protocol/src/canonical-encoding.ts), [command identity](../../packages/temporal-adapter/protocol/src/command-identity.ts), [effect transport](../../packages/temporal-adapter/protocol/src/effect-transport.ts), and [host interaction plan](../../packages/temporal-adapter/runner/src/host-interaction-plan.ts), plus the later profile, scenario, artifact, differential, runnable, and live-evidence registries. The shared encoder recognizes primitive Boolean so command and effect encoders remain exhaustive; profile admission still rejects Boolean effect data.

The Lean effect-patch owner must reject Boolean on both success and BPMN Error result paths. The Lean Simple Boolean evaluator must remain total over the widened union with Boolean counted as present, not null, and unequal to every string. The retained raw evidence contract must preserve Java Boolean as a distinct primitive, and the raw-to-canonical projector must map it to the Boolean tagged value without applying string conversion. A new focused `cib-variable-value-projection.test.ts` owns the Boolean-versus-string mutation and is registered in `test:contracts`; the existing 586/600-line artifact-projection test does not grow.

A new cohesive `semantic-profile-value-domain.ts` and Lean `SemanticProcess/ValueDomain.lean` own the profile/surface matrix so deployment and live admission cannot drift. A new family-specific differential case owner contains the Boolean case body; `pipeline-cases.ts` receives only an import and spread. A new Java value/profile collaborator keeps the scenario runner from acquiring a third responsibility. A new Java protocol owner receives extracted diagnostic/PVM/timing records before `BooleanValue` is added to the remaining variable protocol. These owners are created only after proposal approval.

### Owners this implementation grows

| Owner | Headroom |
|---|---:|
| [TypeScript value contract](../../packages/semantic-core/src/contract.ts) | 340 |
| [TypeScript stimulus validator](../../packages/semantic-core/src/stimulus.ts) | 216 |
| [TypeScript deployment admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 249 |
| [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 302 |
| [TypeScript graph-policy selector](../../packages/semantic-core/src/semantic-process-graph-policy.ts) | 532 |
| [Lean external execution](../../BpmnSemantics/SemanticProcess/Execution.lean) | 43 |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 203 |
| [Lean effect-patch data boundary](../../BpmnSemantics/SemanticProcess/Data.lean) | 479 |
| [Lean Simple Boolean evaluator](../../BpmnSemantics/SemanticProcess/SimpleBooleanExpression.lean) | 471 |
| [Java scenario protocol](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/ScenarioProtocol.java) | 163 |
| [Java scenario runner](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioRunner.java) | 19 |
| [Java state projector](../../runners/cibseven/src/main/java/org/bpmnlean/cibseven/CibSevenScenarioStateProjector.java) | 318 |
| [Retained CIB artifact contract](../../scripts/contract-artifacts.ts) | 13 |
| [Raw-to-canonical CIB projector](../../scripts/contract-cib-evidence-projection.ts) | 61 |
| [Temporal command identity](../../packages/temporal-adapter/protocol/src/command-identity.ts) | 434 |
| [Temporal canonical typed-tuple encoder](../../packages/temporal-adapter/protocol/src/canonical-encoding.ts) | 556 |
| [Temporal effect transport](../../packages/temporal-adapter/protocol/src/effect-transport.ts) | 460 |
| [Differential case catalog](../../packages/differential/test/pipeline-cases.ts) | 20 |
| [Effect transport test](../../packages/temporal-adapter/testkit/test/effect-transport.test.ts) | 30 |

The Java scenario protocol measures 598/600 nonblank lines, so its cohesive behavior-preserving extraction is mandatory before adding the value variant. The differential catalog measures 580/600, so it may receive only the family import/spread while the new case body lives in its own owner. The Java runner measures 577/600 and may receive only delegation calls; a larger change triggers extraction. Lean execution measures 552/600 and may receive only narrow value-policy calls. The effect-transport test measures 546/600, so its Boolean discriminator stays small and live evidence belongs in a new dedicated owner. Each condition stops applying when the linked source measurement changes, and the reviewability guard recomputes every headroom figure.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) and [contract artifacts](../../scripts/contract-artifacts.test.ts) | Reach every Boolean schema arm, retain existing artifact bytes, and reject malformed or wrong-profile values. |
| New focused `cib-variable-value-projection.test.ts`, registered in `test:contracts`, and [CIB observation fidelity](../../scripts/cib-observation-fidelity.test.ts) | Bind raw Java Boolean evidence to the canonical tagged value, reject text substitution, and keep the general fidelity table complete without growing the 586/600-line [artifact-projection test](../../scripts/contract-artifact-projections.test.ts). |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce cohesive source ownership, exhaustive variants, registries, and measured line limits. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep the widened inductive and profile-aware consumers exhaustive and the conformance theorems public and descriptive. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register one exact case and prove the stringify mutation reaches disagreement. |
| [runnable product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | Give the registered profile exactly one existing-host example without widening another profile. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Prevent Product 2, Workflow, host, or CIB details from defining value meaning. |
| [document reviewability](../../scripts/document-reviewability.test.ts), [independent review policy](../../scripts/independent-review-policy.test.ts), and [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Keep the governed lifecycle, owner inventory, receipts, and immutable routing complete. |
| [Markdown links](../../scripts/markdown-links.test.ts) and [normative references](../../scripts/normative-reference-resolution.test.ts) | Resolve every owner, guard, and normative basis. |

## Epistemic closure and cost boundary

The exact claim to establish is one primitive Boolean value carried by exact User Task completion, atomically merged into Process scope, independently observed by CIB, Lean, TypeScript, Temporal Query/result/history/replay, and rejected under every old profile and every non-selected surface. The claim does not establish a general value system, forms, assignment, Boolean routing, or a new host mechanism.

Meaningful mutations are Boolean-to-string conversion in Java, schema projection, command encoding, semantic merge, Query/result projection, or replay; old-profile Boolean acceptance; Process-start Boolean acceptance; effect-patch Boolean acceptance; command-ID aliasing; bypass merge outside the core; and non-atomic profile/scenario/example registration.

At closure, [the capsule cost ledger](../CAPSULE-COST-LEDGER.md) records the implementation baseline through the closure target and compares it with User Task completion data, the nearest completed increment changing the same value, CIB, core, Lean, differential, and Temporal layers. The closure review decides whether the widened-domain laws are genuinely value-parametric, whether shared schema/profile authority is an unresolved common mode, and whether the new value can be removed or stringified without an independent lane failing.

## Stop conditions

Stop and return to research or owner direction if:

- an existing profile ID or retained artifact must accept Boolean;
- Boolean Process Start, effect/mapping data, expression evaluation, E2 metadata, Product 2 behavior, or a dependency becomes necessary;
- the exact Java Boolean CIB observation cannot be retained without converting through text;
- deployment/scenario and live command admission cannot share one profile-value policy;
- command identity cannot distinguish Boolean, string, and null exactly;
- the value-parametric Lean laws require changing their observable result rather than adding an honest domain hypothesis;
- Temporal requires a new command, Workflow transition, Activity, Signal, Child Workflow, Search Attribute, or host-owned state write;
- the mandatory Java extraction cannot preserve existing JSON bytes and focused CIB results;
- the one-thread, one-CPU, no-swap, 3 GiB Lean admission build fails after the ownership split;
- the complete gate can pass only by weakening an old profile, artifact, schema oracle, mutation, or product boundary.

## Owner decisions requested

Approval of this proposal settles all of these together:

1. Select Boolean-only User Task completion before E2 because it is the smallest non-string carrier and prevents E2 from freezing a string-only typed-form contract.
2. Register `cibseven-2.2.0-user-task-boolean-completion-data-draft` with string/null Process Start and string/null/Boolean exact User Task completion.
3. Add `CIB-EXT-0010` for Java Boolean completion rather than broadening frozen string/null relationships `CIB-EXT-0005/0006`.
4. Keep effects, mappings, Process Start, Simple Boolean/JUEL, E2, Product 2, and all old profiles outside the new value capability.
5. Use a proved Lean lane to separate value-parametric laws from laws that need explicit string/null hypotheses.
6. Reuse the existing User Task Update and observation surfaces with mandatory stringification, profile-bypass, command-identity, outside-core, CIB, differential, Worker-replacement, history, and replay discriminators.
7. Perform the measured Java protocol extraction before semantic growth and keep the other near-limit owners to narrow integration calls or new cohesive family owners.
