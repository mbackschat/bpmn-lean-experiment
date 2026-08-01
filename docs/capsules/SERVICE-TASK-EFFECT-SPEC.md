# Service Task effect specification

## Status

Implemented current capsule contract; exact evidence status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md).

## Role

This specification owns the approved bounded meaning, host-refinement contract, witnesses, and exclusions for one extension-bound Service Task effect. Exact current implementation and evidence status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), and immediate sequencing belongs in [PLAN.md](../PLAN.md).

The project-wide [CIB Seven compatibility scope](../CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) is owner-approved, including this capsule's exact paired binding. The [dual semantic-core architecture](../archived/DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is owner-rejected, so the TypeScript semantic-core and Workflow language boundary is settled. The green [phase-zero probe](#phase-zero-cib-seven-probe) removes the packaged-engine uncertainty.

## Question

Can the project admit one BPMN Service Task whose successful external effect is represented by a core-owned occurrence and intent, executed behind a stable idempotency identity, and completed by an explicit semantic result, while CIB Seven job retries and Temporal Activity attempts remain host evidence rather than BPMN observations?

The discriminator is:

```text
None Start
    ↓
Service Task
    ↓
None End
```

There is one token, one Service Task activation, one effect protocol, one business handler, no variables or data, and no competing work.

## Required scope

- exact private executable `None Start Event → Service Task → None End Event` topology;
- exact paired Service Task binding: standard implementation URI `urn:bpmn-lean:effect:probe-v1` plus the Camunda-namespace bean token `${bpmnLeanEffectHandler}`, with `asyncBefore="true"`;
- one profile-registered neutral Activity/probe descriptor, one exact raw `bpmnLeanEffectHandler` CIB source binding, and one successful result with no payload;
- one semantic effect occurrence and intent;
- one adapter-derived SHA-256 transport key whose complete typed input is committed semantic intent state;
- one `awaitEffect` Semantic Process IL mechanism;
- one Temporal Activity with explicit finite retry and timeout policy;
- plain success, fail-after-mutation-once reconciliation, Worker replacement, replay, stale or mismatched result refusal, and Activity-bypass evidence.

## Excluded scope

Effect payloads, variables, general JUEL evaluation, arbitrary bean resolution, Java class loading, `DelegateExecution` compatibility, field injection, data associations, BPMN `Operation`, Messages, service faults, BPMN Errors, boundary Events, incidents as semantic outcomes, retry exhaustion as semantics, compensation, supported Workflow cancellation or termination, heartbeats, Local Activities, long-running work, multiple effects, effect races, external-task fetch-and-lock, production effect-service selection, and arbitrary Service Task implementation URIs are excluded.

A failed or exhausted host execution is an adapter or oracle failure outside the canonical semantic result. The capsule makes no cross-engine equivalence claim for that state.

## Normative basis

BPMN 2.0.2 Clause 10.3.3.1 defines a Service Task as a Task using a service or automated application. Table 10.8 defines the standard `implementation` URI as the technology or coordination protocol and also defines optional `operationRef`; it does not make `implementation` the business-effect identity. Clause 13.3.3 says activation invokes the service, successful service completion completes the Service Task, and a service fault is treated as an interrupting error that fails the Activity.

This capsule selects only the successful activation-to-completion path. It does not reinterpret transport attempts as repeated BPMN Service Task activations and does not claim the excluded fault path.

The bounded success requirement disposition is recorded in [BPMN-REQUIREMENT-LEDGER.md](../BPMN-REQUIREMENT-LEDGER.md). The exact CIB realization is classified by `CIB-EXT-0001` and `CIB-CFG-0002` in [CIB-BPMN-RELATION-REGISTER.md](../CIB-BPMN-RELATION-REGISTER.md).

## Verified feasibility facts

The pinned CIB Seven checkout and revision are recorded in [SOURCES.md](../SOURCES.md). At that revision:

- `BpmnParser.CAMUNDA_BPMN_EXTENSIONS_NS` is `http://camunda.org/schema/1.0/bpmn`;
- engine fixtures use the lexical prefix `camunda`, not `cibseven`, for `delegateExpression` and `asyncBefore`;
- the prefix is not semantic identity; admission resolves the prefix to the exact namespace URI and local name;
- `ManagementServiceImpl.executeJob` delegates to `ExecuteJobHelper`, whose failed-job listener invokes `DefaultJobRetryCmd` and decrements retries;
- the retained upstream async-job tests exercise public manual job execution and include a default-strategy assertion from three retries to two;
- the executable-job query treats an async-continuation job with a null due date as immediately executable when retries remain.

The last fact means `asyncBefore` does not provide timer-like eligibility. Automatic job execution is disabled, and the harness makes the decision to release the already-executable job as an explicit scheduling input.

Pinned `bpmn-moddle@10.0.0` imports the exact source without a parser warning, retains the exact standard implementation URI and the two Camunda-namespace attributes through raw `$attrs`, and preserves the exact bytes. The bounded compiler admits only the exact namespace-normalized pair and requires no Camunda descriptor package.

## Competing CIB execution bindings

| Account | Observable mechanism | Decision |
|---|---|---|
| Synchronous delegate | The delegate runs inside the command that enters the Service Task; an exception rolls back engine state after the external effect might already have happened. | Reject as the capsule binding. It supplies no durable intermediate host wait corresponding to the core intent and makes effect-after-rollback the first problem. |
| External task | CIB exposes topic, fetch-and-lock, lease, completion, failure, retry, and incident protocols. | Defer. It is operationally close to a worker protocol but introduces multiple extension semantics and a second public command surface that this discriminator does not need. |
| `asyncBefore` continuation job plus exact delegate-expression bean | Starting the Process creates an immediately executable durable job before the Service Task. The disabled executor leaves it waiting until the harness explicitly releases it; CIB resolves the exact bean token to the project probe delegate. | Select. The green phase-zero probe establishes the binding facts; this is the smallest durable oracle boundary and exposes retry/re-execution facts without importing external-task leases or general JUEL. |

The selected account does not claim that the CIB async-continuation job is the BPMN effect occurrence. Job existence and execution are engine-observed host facts. Mapping that pre-activation host wait to the capsule's later semantic effect occurrence and intent is adapter-decided, not a derivation from CIB state.

## Source profile

The exact Service Task source shape is equivalent to:

```xml
<serviceTask
  id="ServiceTask_Record"
  implementation="urn:bpmn-lean:effect:probe-v1"
  camunda:delegateExpression="${bpmnLeanEffectHandler}"
  camunda:asyncBefore="true" />
```

The `camunda` prefix may be replaced by another XML prefix only when it resolves to the exact namespace URI `http://camunda.org/schema/1.0/bpmn`. Prefix spelling is not semantic. Exact source bytes and their digest remain preserved.

Admission accepts only:

- the standard `implementation` attribute with the exact URI above;
- one extension QName `{http://camunda.org/schema/1.0/bpmn}delegateExpression` with the exact lexical value `${bpmnLeanEffectHandler}`;
- one extension QName `{http://camunda.org/schema/1.0/bpmn}asyncBefore` with lexical value `true`;
- no extension elements, fields, listeners, method or property expressions, retry cycles, `asyncAfter`, topics, or other foreign attributes.

The implementation URI and delegate-expression token are one profile-defined source pair. Admission rejects either field alone, every alternative spelling or value, and any mismatched pair. The profile registers that exact pair to the neutral descriptor `urn:bpmn-lean:effect-protocol:activity-v1` plus `urn:bpmn-lean:effect-operation:probe-v1`. A Worker or adapter cannot select or change either neutral identity independently of the committed intent.

Requiring the source implementation URN is a probe-fixture profile choice, not the future migration-admission rule for existing CIB documents. A future migration profile may map a real binding to a neutral operation only through an explicit, versioned, separately evidenced profile registration. A second business effect under the Activity protocol receives a different operation identity; it does not invent a different protocol URI.

The source/profile boundary retains the exact implementation URI, handler token, and extension QName/value pairs as admission evidence, then emits only the registered neutral descriptor in the checked Service Task. Lean independently verifies neutral checked-graph-to-program lowering; it does not derive the raw Camunda-to-neutral registration. Recognizing this one complete lexical token is structural source admission, not JUEL evaluation. The checked graph, Semantic Process IL, Lean, and runtime contain no Camunda prefix, namespace, expression object, bean name, Java class, CIB job ID, retry count, or engine type.

The CIB register classification is:

- a bounded CIB extension entry for the exact Camunda-namespaced delegate-expression token and async continuation used to realize the Service Task;
- a configuration-specific entry for disabled automatic execution and explicit harness release of the immediately executable continuation job.

No bounded normative-agreement entry exists for activation-then-wait. CIB exposes a pre-activation continuation wait followed by atomic delegate invocation and Service Task completion; it never exposes the capsule's activated effect-in-flight state.

## Checked source and Semantic Process IL

The checked graph adds one `serviceTask` node carrying:

```ts
type CheckedServiceTask = Readonly<{
  kind: "serviceTask";
  id: string;
  descriptor: EffectDescriptor;
  inputMappings: readonly [];
  outputMappings: readonly [];
  bpmnErrorRoute: null;
}>;
```

Lowering produces the reusable mechanism:

```ts
type EffectDescriptor = Readonly<{
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1";
  operation: "urn:bpmn-lean:effect-operation:probe-v1";
}>;

type AwaitEffect = Readonly<{
  kind: "awaitEffect";
  id: string;
  input: string;
  output: string;
  origin: Readonly<{ kind: "bpmnElement"; elementId: string }>;
  effect: Readonly<{
    elementId: string;
    descriptor: EffectDescriptor;
  }>;
}>;
```

`awaitEffect` is justified by the Temporal Activity consumer and the effect-intent/refinement risk. It does not dispatch on a BPMN topology or name a CIB execution class. The operation carries no dormant `kind: "service"` discriminator because this capsule admits no second effect mechanism that would force one.

The semantic `effect.elementId` is redundant with but independently validated against `origin.elementId`, matching the established User Task and timer convention. Runtime occurrence identity is always constructed from the semantic payload field; source traceability uses `origin`. [The Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md) owns that general convention.

## Semantic runtime contract

The current scenario schema's `userTaskInstanceId` and `timerOccurrenceId` already share the same exact structure. This change introduces one schema `$defs.occurrenceId` and one TypeScript `OccurrenceId`, with semantic aliases for all three consumers:

```ts
type OccurrenceId = Readonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

type UserTaskInstanceId = OccurrenceId;
type TimerOccurrenceId = OccurrenceId;
type EffectOccurrenceId = OccurrenceId;
```

An active intent contains the occurrence and the one shared descriptor:

```ts
type EffectIntent = Readonly<{
  id: EffectOccurrenceId;
  descriptor: EffectDescriptor;
}>;
```

The semantic core owns this structured intent and its stability. It does not store a transport key or a second idempotency field in canonical state. A core-owned pure function projects the typed transport material from definition identity plus `openEffects`; the adapter renders that material as a digest. The digest is a collision-resistant adapter encoding, not a Temporal, CIB, or BPMN identity and not a second source of semantic fields.

This split avoids making SHA-256 an operational-semantic primitive while ensuring every Temporal attempt receives the same externally usable key. A seeded mutation that includes a Temporal Run ID, Activity attempt, Activity ID, or other host identity must produce two external mutations and fail the reconciliation witness. CIB computes no project transport key in this capsule.

The first tuple group is explicitly `EffectDefinitionKey`, not `SemanticProcessIdentity`: it contains three fields from `program.identity`, deliberately omits `compiler`, and adds sibling `program.processId`.

```ts
type EffectDefinitionKey = Readonly<{
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
  processId: string;
}>;
```

The transport material uses the already-implemented Workflow-safe canonical typed-tuple encoder:

```text
["effectTransport",
  [semanticProfile, sourceId, sourceSha256, processId],
  [processInstanceId, elementId, activation],
  [protocol, handler]]
```

The external key is `effect-transport-sha256:<sha256(utf8(canonicalEncoding))>`. Compiler identity is deliberately excluded: exact lowering equality already binds a compiler result to the admitted source, and a compiler-only bump must not reissue external idempotency identity for byte-identical source under the same profile. The key is stable across Activity attempts, replay, and Worker replacement, and deliberately changes when profile, source identity or bytes, Process definition, occurrence, protocol, or operation changes.

The success stimulus is:

```ts
type CompleteEffect = Readonly<{
  kind: "completeEffect";
  commandId: string;
  effectId: EffectOccurrenceId;
}>;
```

Its command identity uses a separate domain and exact typed encoding:

```text
["completeEffect", [processInstanceId, elementId, activation]]
```

The command ID is `complete-effect-sha256:<sha256(utf8(canonicalEncoding))>`. The distinct domain tag and prefix prevent substitution between the Activity transport key and semantic command ID.

There is no result payload in this capsule.

The successful execution result is nevertheless modeled as a closed discriminated union:

```ts
type EffectExecutionResult = Readonly<{
  kind: "success";
}>;
```

Do not replace this contract with `void`, a Boolean, or an untyped exception channel. The migration-target inventory may later justify a reviewed `bpmnError` variant and typed variable patch, but neither is admitted here. Temporal Activity failures and CIB retry or incident state remain host outcomes outside this semantic result union.

The language-neutral Activity request is derived from the committed intent:

```ts
type EffectRequest = Readonly<{
  protocol: "urn:bpmn-lean:effect-protocol:activity-v1";
  operation: "urn:bpmn-lean:effect-operation:probe-v1";
  idempotencyKey: string;
}>;
```

`EffectRequest` is exactly `EffectDescriptor` plus `idempotencyKey`. The Worker dispatches only by `operation`; it treats `protocol` as immutable protocol identity and returns only `EffectExecutionResult`. Any downstream binding from the neutral operation to a bean or Worker implementation is outside the semantic core. The adapter derives both fields and the key from the same committed intent, so no host identifier, Activity return value, or independent registry lookup can create a mismatched semantic binding.

## Stable semantic rules

### EFFECT-WAIT-01

Consuming the input token of `awaitEffect` activates exactly one occurrence and intent. Closure stops with the output place empty and logical time unchanged.

### EFFECT-INTENT-01

Exactly one intent exists for an active effect occurrence. Its full structured identity and descriptor depend only on admitted definition identity and committed runtime state and remain stable across observation, replay, and host attempts.

The first semantic checkpoint establishes the unique structured intent in the start-prefix observation and its dependence on committed core state. Replay and host-attempt stability are Temporal-refinement evidence and remain unclosed until that lane is implemented.

### EFFECT-RESULT-01

`completeEffect` commits exactly when the Process is running and the complete effect occurrence identity is active. It removes that active intent, produces one output token, and resumes ordinary supported closure to the None End Event.

### EFFECT-REFUSE-01

A result with any mismatched Process instance, element, or activation, or a result for an already consumed or never activated occurrence, is rejected with exact state preservation.

The Lean refusal theorem quantifies over the full occurrence-identity mismatch space. The checked non-law is an evaluator that accepts a result for an arbitrary element or activation and advances the Process.

The full mismatch space is exercised only by Lean and the TypeScript core. The Temporal Activity result carries no occurrence identity and the adapter derives `completeEffect` from the committed intent; CIB has no effect-result ingress identity. Neither adapter lane is evidence for this refusal proposition.

### EFFECT-OBSERVE-01

While waiting, canonical state exposes one active wait of kind `effect` and one `openEffects` entry containing the full occurrence identity and descriptor. It exposes no caller interaction for effect completion. Host attempts, retry counts, CIB incidents, CIB job IDs, Temporal Activity IDs, and transport keys are excluded from canonical observations.

`openEffects` is an atomic pre-release wire-contract evolution. Every producer, consumer, schema, fixture, and retained evidence envelope changes together. CIB evidence is regenerated only through the explicit replacement command with fresh content bindings.

`openEffects` remains a separate canonical detail field alongside `openTimers`; the two are not generalized into one collection. `activeWaits` already supplies the generic wait summary, while timer and effect detail records have different consumers and fields. Adding a second detailed consumer is enough to make this choice explicit, not enough to justify a union that no consumer needs.

## Cross-target result realization

The answer-free scenario carries one `completeEffect` stimulus as explicit semantic input:

- Lean and the TypeScript semantic core apply it directly;
- CIB realizes it by explicit harness release and successful execution of the exact continuation job and probe delegate;
- the Temporal adapter does not receive this stimulus from the runner; after the Activity succeeds, it derives the identical stimulus exclusively from the committed core intent.

The content-bound command ID covers every stimulus field. Temporal never accepts an occurrence identity returned by the Activity as authority; it uses the committed intent that scheduled the Activity.

Canonical output comparison does not make four semantic accounts. The normative/profile lane selects the meaning; Lean executes and proves that account; the independently written TypeScript core tests its transcription; Temporal proves durable refinement of committed core state; CIB contributes a compatibility/host-realization check whose waiting projection is adapter-decided. For `EFFECT-WAIT-01`, `EFFECT-INTENT-01`, and `EFFECT-OBSERVE-01`, plain-success comparison is therefore Lean plus TypeScript semantic evidence, Temporal refinement evidence, and one CIB host check—not four independent semantic derivations.

## Explicit host schedules

Host retry behavior is an explicit verifier-owned scheduling input, analogous to `completionDelivery`:

```ts
enum EffectExecutionSchedule {
  PlainSuccess = "plainSuccess",
  FailAfterMutationOnce = "failAfterMutationOnce",
}
```

This schedule is supplied only to CIB and Temporal harness adapters. It is not a BPMN stimulus, semantic outcome, or expected answer embedded in the neutral scenario. Lean and the pure core execute the single semantic scenario once.

The evidence contract uses one answer-free Service Task scenario, taking the pipeline from seven to eight scenarios. It does not add a ninth scenario for transport-key discrimination because that key is non-canonical and adapter-local.

| Lane | Service Task executions | Store and evidence contract |
|---|---:|---|
| Lean | 1 | Executes the semantic scenario once; no host schedule or probe store |
| TypeScript core | 1 | Executes the semantic scenario once; no host schedule or probe store |
| CIB | 2 | `PlainSuccess` produces the canonical result bound into retained CIB evidence; `FailAfterMutationOnce` uses fresh test-local delegate state and contributes raw retry/re-execution facts only. Each execution asserts empty initial state; CIB computes no project transport key. |
| Temporal pipeline | 2 | The primary execution uses `PlainSuccess`; the ordinary second plain isolation execution is deliberately replaced by `FailAfterMutationOnce`. Both use separate fresh stores asserted empty and must produce identical canonical results. |

The substitution preserves the isolation claim because two separately stored executions still agree exactly, while adding retry evidence instead of paying for a duplicate plain run. Across eight scenarios the pipeline therefore runs sixteen Temporal executions and replays nine histories: eight primary histories plus the Service Task failure-schedule history. Retained CIB evidence binds explicitly to `PlainSuccess`; retry facts remain raw-only.

The focused Temporal gate additionally owns an adapter-local two-instance key discriminator using two distinct semantic Process instance IDs against one deliberately fresh shared store, plus Worker replacement, exhausted-Activity failure, and Activity-bypass witnesses. The shared store is specific to the cross-instance discriminator; every ordinary execution uses an isolated store.

This is more precise than claiming that Lean or the pure core execute transport retries. They supply semantic reference results; only CIB and Temporal exercise host schedules, and only Temporal exercises the project transport key.

## Temporal Activity refinement

The Workflow loop:

1. applies the start stimulus and closes to the committed effect intent;
2. projects the intent from semantic-core state;
3. derives the transport key from the complete committed intent;
4. schedules one non-local probe Activity with the paired handler/descriptor and key;
5. uses `startToCloseTimeout: "2s"`, `scheduleToCloseTimeout: "10s"`, `maximumAttempts: 2`, `initialInterval: "100ms"`, and `backoffCoefficient: 1`;
6. uses no heartbeat and provides no Workflow retry policy;
7. after successful Activity resolution, derives `completeEffect` from the same committed intent and applies it through the ordinary semantic command path;
8. completes under the semantic-lifetime Workflow contract.

The Activity result carries only success. It does not carry semantic occurrence identity, logical time, host IDs, or an alternative descriptor.

The Activity boundary is language-neutral. The TypeScript Workflow and semantic core remain the single production interpreter account; the probe Activity may later be serviced by a TypeScript, Java, or Kotlin Worker without moving BPMN semantics into that Worker. The [CIB Seven compatibility scope proposal](../CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md#interpreter-and-worker-language-boundary) owns this polyglot boundary. A JVM Worker is not approved by this capsule, and any future Java claim requires explicit cross-SDK payload, retry, idempotency, failure, and Worker-replacement evidence rather than assumed converter compatibility.

If both attempts fail or the schedule-to-close limit expires, the Workflow Execution fails with typed adapter reason `BPMN_EFFECT_EXECUTION_EXHAUSTED`. No semantic result is applied, no completed receipt is produced, and the last committed semantic state still contains the unchanged active intent. This is an adapter/infrastructure failure, not a canonical semantic outcome, and it is not compared with CIB incident or exhaustion behavior.

The refinement state relation is explicit: Workflow committed semantic state equals the semantic core's committed state; an in-flight Activity implies exactly one corresponding active intent exists and remains unchanged; Activity attempts are refinement stutter; only a successful Activity result permits the adapter to derive and apply `completeEffect`.

Workflow cancellation or termination with an in-flight Activity remains an unresolved host risk rather than an admitted absence with no consequence: an external mutation may survive without a semantic result. The stable transport key is the reconciliation lever but does not by itself define cancellation recovery. Reopen before supporting cancellation, termination, compensation, or operator recovery.

The existing focused gate's owned bound remains the global 60-second test limit; no new 15-second focused-gate assertion is introduced. The 15-second assertion belongs only to the prepared warm pipeline. Red implementation must measure replacement-Worker startup within the `10s` schedule-to-close envelope and stop rather than weaken the Worker-loss witness if the margin is inadequate. The pipeline's new critical delay is the explicit `100ms` retry interval; the two-second Worker-loss timeout is exercised only in the focused gate.

## Idempotency and lost-completion witness

The harness-owned probe service records invocations and one logical mutation per transport key. Under `FailAfterMutationOnce`, the first invocation performs the mutation and then throws before Activity completion is recorded. The second invocation receives the same key, reconciles the existing mutation, and returns success without repeating it.

Required observations are:

- invocation count `2`;
- logical external mutation count `1`;
- one `completeEffect` semantic command;
- canonical trace identical to plain success;
- Temporal Event History containing Activity scheduling and attempt evidence;
- replay preserving the exact canonical result and intent identity.

The corresponding CIB delegate uses the same schedule name but not the project transport key: the first public job execution performs one test-local in-process mutation and throws, the retained async-continuation job records retries `3 → 2`, and the second public execution observes that local state and completes without a second mutation. CIB establishes engine retry decrement, public re-execution, and test-local one-mutation/two-invocation behavior only. Key-based reconciliation is Temporal-only evidence.

Transport-key evidence includes both over-inclusion and under-inclusion discriminators:

- a host-derived-key mutation adds Run or attempt identity and must turn the lost-completion witness into two mutations;
- two distinct semantic Process instance IDs executed against one fresh shared store must yield two keys and two mutations, separating committed-intent derivation from a hard-coded key;
- pairwise encoding tests vary every definition, occurrence, and descriptor field and require a distinct key; field-drop mutations for `processId`, `processInstanceId`, `elementId`, and `activation` must each collide on a constructed pair and be rejected.

The Workflow-safe digest implementation is already guarded before the key carries semantic weight: fixed SHA-256 vectors cover empty input, `abc`, 55/56/57/63/64/65-byte padding boundaries, and a supplementary-plane character; an exact multi-block effect-transport tuple is cross-checked against `node:crypto` outside Workflow code. Existing literal locks preserve the current Process-address, Update-stimulus, and timer-firing encodings and digests during the shared-encoder extraction.

The pinned Temporal server retains one final `ActivityTaskStarted` event for a successful retried Activity. Its `attempt` field is `2` and its `lastFailure` binds the hidden first failure; it does not append one durable started/failed pair per transient attempt. The focused evidence therefore combines this durable retry summary with the independently observed probe invocation count `2` and mutation count `1`.

## Phase zero CIB Seven probe

Before checked-source, IL, Lean, TypeScript, or Temporal production work:

1. configure the exact `bpmnLeanEffectHandler` bean as the project probe `JavaDelegate`, then deploy the exact source shape to the packaged CIB Seven `2.2.0` oracle with automatic job execution disabled;
2. start the Process and require exactly one immediately executable async-continuation job with three retries;
3. derive the activity ID from the public Job Definition, derive protocol and delegate-expression fields from the deployed model, count exactly one live job, require the profile pair, and record the activation/intent mapping as adapter-decided;
4. execute the job under `FailAfterMutationOnce` and require the public call to fail, the job to remain, retries to become two, invocation count two only after the second execution, and mutation count to remain one;
5. execute the same job again and require successful Process completion without administrative retry mutation;
6. retain a negative assertion that no timer-like due-date eligibility transition is claimed.

The red test was the exact fail-once/re-execute probe. If the packaged engine later differs from the pinned-source account, if public manual execution does not perform the retry transition, or if the probe requires setting retries administratively, stop for owner direction and reopen this specification.

### Result

The phase-zero probe is green against packaged CIB Seven `2.2.0`. [The exact source fixture](../../scenarios/service-task-effect/process.bpmn) deploys with no engine parser warning under the shared disabled-executor configuration. Start creates exactly one immediately executable async-continuation job at `ServiceTask_Record`, with three retries, a null due date, and no timer classification. The probe derives the activity ID from the public Job Definition, reads the standard implementation value and expanded-name delegate expression from the deployed BPMN model, counts the one live job, and applies the exact profile-pair comparator. Separate negative controls deploy a different implementation URI and a different delegate-expression bean token and prove that the comparator rejects each half of the pair. Mapping the counted host wait to activation ordinal `1` remains adapter-decided because CIB exposes no semantic effect occurrence or engine-derived activation ordinal.

[The engine probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.java) registers only the exact `bpmnLeanEffectHandler` bean. Its first public `executeJob` invocation performs one probe mutation and throws; the same durable job remains executable with retries decremented from three to two. Its second public execution invokes the delegate again, observes the prior mutation, performs no second mutation, removes the job, and completes the Process. No call edits retries administratively, and no incident is created.

The same test deploys an equivalent source whose lexical prefix is `probe` and whose expanded attribute names remain `{http://camunda.org/schema/1.0/bpmn}delegateExpression` and `{http://camunda.org/schema/1.0/bpmn}asyncBefore`; exact bean resolution and async-before job creation still succeed. [The source-import guard](../../packages/bpmn-source/test/bpmn-source.test.ts) independently requires warning-free `bpmn-moddle` import, exact-byte retention, the standard implementation URI, and the two raw foreign attributes. These results establish the compatibility-scope phase-zero obligations used by the selected extension profile.

## CIB fidelity labels

| Claim | Fidelity |
|---|---|
| Service Task source and exact extension attributes were deployed | Engine-observed deployment fact |
| One async-continuation job exists and is immediately executable | Engine-observed host fact |
| Harness waits before releasing the job | Harness scheduling input |
| The pre-activation job is mapped to the selected semantic effect occurrence and intent | Adapter-decided |
| Delegate invocation and test-local mutation counts | Probe-service-observed |
| Retry decrement `3 → 2` | Engine-observed raw evidence |
| Successful second execution and Process completion | Engine-observed |
| Canonical occurrence identity and descriptor at the initial wait | Adapter-decided in the CIB projection; defined and checked by Lean and TypeScript |

No row presents the CIB job, activation ordinal, or retry count as an independent derivation of the semantic intent. For `EFFECT-WAIT-01`, `EFFECT-INTENT-01`, and `EFFECT-OBSERVE-01`, CIB supplies a host-realization compatibility check only.

The activation comparator component cannot fail independently in this bounded probe: it is `Math.toIntExact(activationCount)` after the same count is required to equal one. The raw activity, implementation URI, and handler-token components are deployment-derived and can fail the profile comparator. The neutral descriptor is then produced by the shared profile registration rather than independently observed from CIB. This asymmetry is acceptable only under the explicit adapter-decided fidelity.

## Rule-to-evidence matrix

| Rule | Normative or profile clause | Lean | CIB Seven | TypeScript core | Temporal refinement | Negative or mutation guard |
|---|---|---|---|---|---|---|
| `EFFECT-WAIT-01` | BPMN 2.0.2 §13.3.3 under the success-only profile | Declarative `awaitEffect` relation, evaluator soundness, exact start prefix | Pre-activation continuation job plus adapter-decided singleton occurrence projection | Start closes at one effect wait with no output token | Committed wait state precedes Activity scheduling and is preserved across attempts | Synchronous/bypass accounts fail wait-state or Activity-history evidence |
| `EFFECT-INTENT-01` | Profile-registered raw binding to neutral protocol/operation pair | Exact neutral structured intent in the start prefix; no raw source-translation claim | Deployment-derived raw activity/binding mapped through the same registered profile rule; activation remains adapter-decided | Intent and transport material project only from admitted program and committed state | Same request/key across replay, retry, and Worker replacement | Raw-binding and neutral-operation mutations, host-identity over-inclusion, field-omission collisions, and two-instance shared-store witness |
| `EFFECT-RESULT-01` | BPMN 2.0.2 §13.3.3 successful service completion | Exact success trace | Public job execution invokes the bean and completes the Process | Matching `completeEffect` consumes the wait and closes | Activity success derives one content-bound completion from committed intent | Activity-bypass mutation preserves pure output but lacks durable Activity evidence |
| `EFFECT-REFUSE-01` | Project occurrence-identity admission rule | Quantified three-field mismatch theorem with exact state preservation and accept-any-result non-law | No claim: CIB has no semantic result-ingress identity | Every mismatch and stale/consumed result rejects with unchanged state | No claim: the adapter derives identity from committed intent | Never-activated and stale completion witnesses |
| `EFFECT-OBSERVE-01` | Project canonical observation boundary | Exact waiting and completed projections | Raw job/deployed-model facts reconstruct `openEffects`; raw binding mutation fails | One effect wait and neutral descriptor, no caller interaction | Query trace is reconciled with Activity history and completed receipt | Raw producer-binding mutation, canonical operation mutation, and canonical Activity-bypass mutation |

Canonical equality does not erase these fidelity distinctions. In particular, CIB is a host-realization check rather than a semantic account for the invented effect-in-flight state, and Temporal is refinement evidence rather than a second choice of BPMN meaning.

## Smallest separating witnesses

| Witness | Wrong account separated |
|---|---|
| Lean/core start reaches one effect intent while CIB records only a pre-activation host wait | Synchronous execution inside Process start is the semantic account; CIB independently derives the invented effect-in-flight state |
| Full-identity mismatch and stale result are rejected with state preservation | Element ID or host callback alone authorizes progress |
| Temporal fail-after-mutation-once produces two invocations and one mutation | Attempt, Run, or Activity identity is used as the idempotency key |
| Two semantic instance IDs share one fresh store and produce two keys/mutations; pairwise field-drop mutations collide | A hard-coded or under-inclusive transport key is treated as intent-derived |
| Host failure schedule has the same canonical trace as plain success | Transport attempts leak into BPMN observations |
| Activity-bypass mutation lacks a scheduled/completed Activity pair and fails | Pure trace agreement permits a fabricated external effect |
| Worker replacement while the Activity is pending still completes once | An in-memory Workflow callback implements the effect |
| CIB first failure records `3 → 2` and second execution completes with one test-local mutation | Administrative retry editing or automatic execution is mistaken for engine retry evidence |

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Effect activation ordinal | Semantic core from committed activation count | Full occurrence identity | Created on `awaitEffect`, removed on accepted result |
| Effect intent | Semantic core from occurrence and IL descriptor | `openEffects` | Exactly one per active occurrence |
| Typed idempotency material | Core-owned pure function over definition identity and `openEffects` | Not separately stored; verifier can recompute it | Derivable exactly while the intent exists |
| SHA-256 transport key | Adapter from complete typed idempotency material | Not canonical | Stable across attempts; discarded from semantic state |
| CIB async-continuation job | CIB engine from `asyncBefore` | Raw evidence only | Created before Service Task, retained across failure, removed on success |
| CIB retry count | CIB engine | Raw evidence only | Decremented by failed-job handling |
| Temporal Activity Execution and attempts | Temporal server and Worker | Event History only | Scheduled from committed intent; retries under explicit policy |
| Harness effect schedule and probe store | Test harness | Verifier evidence only | Fresh and asserted empty per ordinary execution; one deliberately fresh shared store only for the two-instance discriminator; cleaned afterward |

## Required evidence

- approved BPMN requirement disposition and CIB extension/configuration entries;
- green packaged-engine phase-zero probe with exact source bytes and no administrative retry mutation;
- strict source admission for the standard implementation URI and exactly two extension QNames, with hostile namespace, delegate-expression value, method/property expression, extra-attribute, extension-element, and parser-warning rejections;
- checked graph and `awaitEffect` schema changes with exact lowering equality;
- Lean direct relation, evaluator, evaluator-soundness bridge, exact successful trace, stable-intent law, quantified full-identity refusal theorem, and accept-any-result non-law;
- independently implemented TypeScript behavior and matching negative witnesses;
- one shared occurrence-ID schema/type reused by User Task, timer, and effect aliases, plus atomic separate `openEffects` and `completeEffect` wire-contract evolution;
- exact canonical plain-success comparison under the explicit per-lane judgement; never reported as four semantic derivations;
- content-bound CIB evidence with fidelity labels and a meaningful mutation over effect wait, retry, or completion projection;
- retained CIB evidence bound explicitly to `PlainSuccess`, with `FailAfterMutationOnce` retry details raw-only and no CIB transport-key claim;
- Temporal Activity input derived only from committed intent;
- Temporal fail-after-mutation-once reconciliation with two invocations, one mutation, one semantic result, and canonical equivalence to Temporal plain success;
- per-execution empty-store assertions, the adapter-local two-instance/shared-store discriminator, pairwise transport-field coverage, host-over-inclusion mutation, and `processId`/occurrence-field under-inclusion mutations;
- exact domain-separated transport and `completeEffect` encodings through the shared canonical encoder, fixed current digest locks, SHA-256 padding/multi-block/supplementary-plane vectors, and an exact transport cross-check against native crypto outside Workflow code;
- eight answer-free scenarios, sixteen Temporal executions, nine replayed histories, and the documented failure-schedule substitution for Service Task isolation;
- Activity-bypass mutation rejected by Event History evidence;
- Worker-replacement, exhausted-Activity typed Workflow failure, semantic-lifetime completion, receipt reconciliation, cleanup, live-history replay, and exact Activity policy evidence;
- full applicable gate within existing feedback budgets without weakening an assertion.

## Epistemic closure

The exact established claim is one successful, payload-free, extension-bound Service Task whose project-owned intent is durably executed once at the observation boundary under the stated retry/idempotency contract. The closest unsupported claim is service failure behavior: BPMN service faults, `BpmnError`, typed variable patches, retry exhaustion semantics, incidents, and cancellation recovery remain outside this specification.

The strongest common-mode risk is the shared reviewed source/profile account: Lean and TypeScript are separate transcriptions, not independent BPMN authorities, while CIB cannot derive the invented effect-in-flight state. That risk is kept explicit through fidelity labels, source/profile review, content-bound CIB host evidence, and mechanism mutations rather than majority voting.

Canonical observations depend only on admitted definition state, committed runtime state, and explicit semantic inputs. The scenario's `completeEffect` is applied directly only by Lean and the pure core; Temporal derives the identical command from committed intent after Activity success, and CIB realizes it through the explicit host schedule.

The nearest realistic wrong accounts are an accept-any-result evaluator, an under- or over-inclusive idempotency key, an in-memory callback that cannot survive Worker replacement, and an adapter that fabricates completion without an Activity. Each has a retained theorem, discriminator, restart witness, or history mutation. The profile and wire contracts remain under the pre-release replacement policy; no legacy effect reader, Workflow patch branch, or retained history baseline is introduced.

## Stop conditions

Stop for owner direction if:

- the packaged CIB probe cannot reproduce fail-once retry decrement and clean manual re-execution without administrative retry changes;
- strict namespace-aware admission requires a new parser or descriptor dependency;
- the exact source needs extension content beyond the two selected attributes or CIB cannot resolve the exact bean without importing a general expression/container surface;
- the adapter cannot derive Activity input and result exclusively from committed core intent;
- a stable transport key requires host identity or attempt state;
- effect intent emission is not replay-stable and exactly once at the semantic boundary;
- the exhausted-Activity path cannot fail the Workflow with the typed adapter reason while preserving the unchanged last committed semantic state;
- replacement-Worker startup cannot complete the second attempt inside the pinned ten-second schedule-to-close envelope under the focused gate's 60-second bound;
- retry or incident state enters canonical observations;
- canonical equivalence requires weakening raw CIB or Temporal history assertions;
- alignment requires changing existing closure, observation, lifecycle, or wire semantics for proof convenience;
- the complete gate exceeds its existing budget and cannot be restored without weakening evidence.

## Approved decisions

The owner approved:

1. the exact success-only semantic account and exclusions;
2. the green phase-zero `asyncBefore` exact delegate-expression bean binding;
3. namespace-aware admission of only the two exact Camunda extension attributes without general JUEL;
4. `awaitEffect`, shared occurrence identity, structured committed intent, neutral protocol/operation descriptor, separate `openEffects`, and adapter-rendered SHA-256 transport key;
5. a two-attempt Activity policy with two-second start-to-close, ten-second schedule-to-close, 100-millisecond fixed retry interval, no heartbeat, no Workflow retry policy, and typed adapter failure on exhaustion;
6. separate explicit host schedules, per-execution store isolation, the eight-scenario/sixteen-execution/nine-replay matrix, and adapter-local canonical-equivalence/key assertions;
7. retry exhaustion as typed adapter failure, with CIB incidents, BPMN service faults, cancellation/termination recovery, and external-task protocol as named reopen conditions rather than semantic outcomes.
