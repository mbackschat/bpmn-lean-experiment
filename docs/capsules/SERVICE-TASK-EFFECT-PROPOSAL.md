# Service Task effect proposal

## Status

This is an unapproved semantic-capsule proposal. It defines the smallest Service Task and Temporal Activity account that would test the remaining external-effect feasibility risk. Its authorized phase-zero source/oracle probe is green; it authorizes no production implementation, profile extension, dependency, or retained-evidence replacement.

The project-wide [CIB Seven compatibility scope](../CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) is owner-approved, including this capsule's exact paired binding. The [dual semantic-core architecture](../DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) is owner-rejected, so the TypeScript semantic-core and Workflow language boundary is settled. This capsule still requires its own semantic approval. The green [phase-zero probe](#phase-zero-cib-seven-probe) removes the packaged-engine uncertainty but does not authorize checked-source, Lean, TypeScript, or Temporal production work.

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

There is one token, one Service Task activation, one effect descriptor, no variables or data, and no competing work.

## Required scope

- exact private executable `None Start Event → Service Task → None End Event` topology;
- exact paired Service Task binding: standard implementation URI `urn:bpmn-lean:effect:probe-v1` plus the Camunda-namespace bean token `${bpmnLeanEffectHandler}`, with `asyncBefore="true"`;
- one project-owned `probe-v1` effect descriptor and one successful result with no payload;
- one semantic effect occurrence and intent;
- one adapter-derived SHA-256 transport key whose complete typed input is committed semantic intent state;
- one `awaitEffect` Semantic Process IL mechanism;
- one Temporal Activity with explicit finite retry and timeout policy;
- plain success, fail-after-mutation-once reconciliation, Worker replacement, replay, stale or mismatched result refusal, and Activity-bypass evidence.

## Excluded scope

Effect payloads, variables, general JUEL evaluation, arbitrary bean resolution, Java class loading, `DelegateExecution` compatibility, field injection, data associations, BPMN `Operation`, Messages, service faults, BPMN Errors, boundary Events, incidents as semantic outcomes, retry exhaustion, compensation, cancellation, heartbeats, Local Activities, long-running work, multiple effects, effect races, external-task fetch-and-lock, production effect-service selection, and arbitrary Service Task implementation URIs are excluded.

A failed or exhausted host execution is an adapter or oracle failure outside the canonical semantic result. The capsule makes no cross-engine equivalence claim for that state.

## Normative basis

BPMN 2.0.2 Clause 10.3.3.1 defines a Service Task as a Task using a service or automated application. Table 10.8 defines the standard `implementation` URI and optional `operationRef`. Clause 13.3.3 says activation invokes the service, successful service completion completes the Service Task, and a service fault is treated as an interrupting error that fails the Activity.

This capsule selects only the successful activation-to-completion path. It does not reinterpret transport attempts as repeated BPMN Service Task activations and does not claim the excluded fault path.

The requirement disposition is recorded as pending in [BPMN-REQUIREMENT-LEDGER.md](../BPMN-REQUIREMENT-LEDGER.md). The CIB realization remains an unselected extension candidate in [CIB-BPMN-RELATION-REGISTER.md](../CIB-BPMN-RELATION-REGISTER.md) until owner approval and a green phase-zero probe.

## Verified feasibility facts

The pinned CIB Seven checkout and revision are recorded in [SOURCES.md](../SOURCES.md). At that revision:

- `BpmnParser.CAMUNDA_BPMN_EXTENSIONS_NS` is `http://camunda.org/schema/1.0/bpmn`;
- engine fixtures use the lexical prefix `camunda`, not `cibseven`, for `delegateExpression` and `asyncBefore`;
- the prefix is not semantic identity; admission resolves the prefix to the exact namespace URI and local name;
- `ManagementServiceImpl.executeJob` delegates to `ExecuteJobHelper`, whose failed-job listener invokes `DefaultJobRetryCmd` and decrements retries;
- the retained upstream async-job tests exercise public manual job execution and include a default-strategy assertion from three retries to two;
- the executable-job query treats an async-continuation job with a null due date as immediately executable when retries remain.

The last fact means `asyncBefore` does not provide timer-like eligibility. Automatic job execution is disabled, and the harness makes the decision to release the already-executable job as an explicit scheduling input.

Pinned `bpmn-moddle@10.0.0` imports the exact phase-zero source without a parser warning, retains the exact standard implementation URI and the two Camunda-namespace attributes through raw `$attrs`, and preserves the exact bytes through rejected executable admission. The bounded compiler still rejects the Service Task as unsupported; namespace-aware normalization remains production work for an approved capsule and requires no Camunda descriptor package.

## Competing CIB execution bindings

| Account | Observable mechanism | Decision |
|---|---|---|
| Synchronous delegate | The delegate runs inside the command that enters the Service Task; an exception rolls back engine state after the external effect might already have happened. | Reject as the capsule binding. It supplies no durable intermediate host wait corresponding to the core intent and makes effect-after-rollback the first problem. |
| External task | CIB exposes topic, fetch-and-lock, lease, completion, failure, retry, and incident protocols. | Defer. It is operationally close to a worker protocol but introduces multiple extension semantics and a second public command surface that this discriminator does not need. |
| `asyncBefore` continuation job plus exact delegate-expression bean | Starting the Process creates an immediately executable durable job before the Service Task. The disabled executor leaves it waiting until the harness explicitly releases it; CIB resolves the exact bean token to the project probe delegate. | Select, conditional on the phase-zero probe. It is the smallest durable oracle boundary, exercises a replacement-oriented handler identity, and exposes retry/reconciliation facts without importing external-task leases or general JUEL. |

The selected account does not claim that the CIB async-continuation job is the BPMN effect occurrence. Job existence and execution are engine-observed host facts. Mapping that job to one semantic effect occurrence and intent is adapter-derived from the admitted source and live Process instance.

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

The implementation URI and delegate-expression token are one profile-defined pair. Admission rejects either field alone, every alternative spelling or value, and any mismatched pair. The normalized contract assigns distinct authority: `handler` is Worker dispatch authority and `implementation` is effect-descriptor identity. Both come from the admitted pair; a Worker or adapter cannot select or change either independently.

Requiring the project URN is a probe-fixture profile choice, not the future migration-admission rule for existing CIB documents. A future migration profile may infer or supply descriptor identity for a real binding only through an explicit, versioned, separately evidenced mapping.

The checked Service Task retains a project-owned normalized source-binding record containing the standard implementation URI, handler identifier `bpmnLeanEffectHandler`, and the two extension QName/value pairs. Lean independently verifies that this exact record lowers to the one project effect descriptor. Recognizing this one complete lexical token is structural source admission, not JUEL evaluation. The Semantic Process IL and runtime contain no Camunda prefix, namespace, expression object, Java class, CIB job ID, retry count, or engine type.

The CIB register classification proposed on approval is:

- a bounded CIB extension entry for the exact Camunda-namespaced delegate-expression token and async continuation used to realize the Service Task;
- a configuration-specific entry for disabled automatic execution and explicit harness release of the immediately executable continuation job;
- a bounded normative-agreement entry for Service Task activation and successful completion only after the packaged probe and retained evidence are green.

## Checked source and Semantic Process IL

The checked graph adds one `serviceTask` node carrying:

```ts
type CheckedServiceTask = Readonly<{
  kind: "serviceTask";
  id: string;
  implementation: "urn:bpmn-lean:effect:probe-v1";
  sourceBinding: Readonly<{
    delegateExpressionAttribute: Readonly<{
      namespace: "http://camunda.org/schema/1.0/bpmn";
      value: "${bpmnLeanEffectHandler}";
    }>;
    asyncBeforeAttribute: Readonly<{
      namespace: "http://camunda.org/schema/1.0/bpmn";
      value: "true";
    }>;
  }>;
}>;
```

Lowering produces the reusable mechanism:

```ts
type AwaitEffect = Readonly<{
  kind: "awaitEffect";
  id: string;
  input: string;
  output: string;
  origin: Readonly<{ kind: "bpmnElement"; elementId: string }>;
  effect: Readonly<{
    kind: "service";
    implementation: "urn:bpmn-lean:effect:probe-v1";
    handler: "bpmnLeanEffectHandler";
  }>;
}>;
```

`awaitEffect` is justified by the Temporal Activity consumer and the effect-intent/refinement risk. It does not dispatch on a BPMN topology or name a CIB execution class.

## Semantic runtime contract

An effect occurrence uses the full identity:

```ts
type EffectOccurrenceId = Readonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;
```

An active intent contains the occurrence and descriptor:

```ts
type EffectIntent = Readonly<{
  id: EffectOccurrenceId;
  effect: Readonly<{
    kind: "service";
    implementation: "urn:bpmn-lean:effect:probe-v1";
    handler: "bpmnLeanEffectHandler";
  }>;
}>;
```

The semantic core owns this structured intent and its stability. A canonical typed encoding of definition identity plus the complete intent is the semantic idempotency material. The adapter renders that material as `effect-sha256:<digest>` for the external transport. The digest is a collision-resistant adapter encoding, not a Temporal, CIB, or BPMN identity and not a second source of semantic fields.

This split avoids making SHA-256 an operational-semantic primitive while ensuring every CIB or Temporal attempt receives the same externally usable key. A seeded mutation that includes a Temporal Run ID, Activity attempt, Activity ID, CIB job ID, or other host identity must produce two external mutations and fail the reconciliation witness.

The success stimulus is:

```ts
type CompleteEffect = Readonly<{
  kind: "completeEffect";
  commandId: string;
  effectId: EffectOccurrenceId;
}>;
```

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
  handler: "bpmnLeanEffectHandler";
  implementation: "urn:bpmn-lean:effect:probe-v1";
  idempotencyKey: string;
}>;
```

The Worker dispatches only by `handler`; it treats `implementation` as immutable descriptor identity and returns only `EffectExecutionResult`. The adapter derives both fields and the key from the same committed intent, so no host identifier, Activity return value, or independent registry lookup can create a mismatched binding.

## Stable semantic rules

### EFFECT-WAIT-01

Consuming the input token of `awaitEffect` activates exactly one occurrence and intent. Closure stops with the output place empty and logical time unchanged.

### EFFECT-INTENT-01

Exactly one intent exists for an active effect occurrence. Its full structured identity, descriptor, and canonical idempotency material depend only on admitted definition identity and committed runtime state and remain stable across observation, replay, and host attempts.

### EFFECT-RESULT-01

`completeEffect` commits exactly when the Process is running and the complete effect occurrence identity is active. It removes that active intent, produces one output token, and resumes ordinary supported closure to the None End Event.

### EFFECT-REFUSE-01

A result with any mismatched Process instance, element, or activation, or a result for an already consumed or never activated occurrence, is rejected with exact state preservation.

The Lean refusal theorem quantifies over the full occurrence-identity mismatch space. The checked non-law is an evaluator that accepts a result for an arbitrary element or activation and advances the Process.

### EFFECT-OBSERVE-01

While waiting, canonical state exposes one active wait of kind `effect` and one `openEffects` entry containing the full occurrence identity and descriptor. It exposes no caller interaction for effect completion. Host attempts, retry counts, CIB incidents, CIB job IDs, Temporal Activity IDs, and transport keys are excluded from canonical observations.

`openEffects` is an atomic pre-release wire-contract evolution. Every producer, consumer, schema, fixture, and retained evidence envelope changes together. CIB evidence is regenerated only through the explicit replacement command with fresh content bindings.

## Cross-target result realization

The answer-free scenario carries one `completeEffect` stimulus as explicit semantic input:

- Lean and the TypeScript semantic core apply it directly;
- CIB realizes it by explicit harness release and successful execution of the exact continuation job and probe delegate;
- the Temporal adapter does not receive this stimulus from the runner; after the Activity succeeds, it derives the identical stimulus exclusively from the committed core intent.

The content-bound command ID covers every stimulus field. Temporal never accepts an occurrence identity returned by the Activity as authority; it uses the committed intent that scheduled the Activity.

## Explicit host schedules

Host retry behavior is an explicit verifier-owned scheduling input, analogous to `completionDelivery`:

```ts
enum EffectExecutionSchedule {
  PlainSuccess = "plainSuccess",
  FailAfterMutationOnce = "failAfterMutationOnce",
}
```

This schedule is supplied only to CIB and Temporal harness adapters. It is not a BPMN stimulus, semantic outcome, or expected answer embedded in the neutral scenario. Lean and the pure core execute the single semantic scenario once.

The comparison has two layers:

1. the plain-success execution establishes exact four-target canonical agreement;
2. each host lane separately proves that `FailAfterMutationOnce` has the same canonical trace as its own `PlainSuccess` execution while raw evidence records two attempts.

This is more precise than claiming that Lean or the pure core execute transport retries. They supply the semantic reference trace; only CIB and Temporal exercise the hidden host schedules.

## Temporal Activity refinement

The Workflow loop:

1. applies the start stimulus and closes to the committed effect intent;
2. projects the intent from semantic-core state;
3. derives the transport key from the complete committed intent;
4. schedules one non-local probe Activity with the paired handler/descriptor and key;
5. uses `startToCloseTimeout: "5s"` and `maximumAttempts: 2`;
6. uses no heartbeat and admits no cancellation in this capsule;
7. after successful Activity resolution, derives `completeEffect` from the same committed intent and applies it through the ordinary semantic command path;
8. completes under the semantic-lifetime Workflow contract.

The Activity result carries only success. It does not carry semantic occurrence identity, logical time, host IDs, or an alternative descriptor.

The Activity boundary is language-neutral. The TypeScript Workflow and semantic core remain the single production interpreter account; the probe Activity may later be serviced by a TypeScript, Java, or Kotlin Worker without moving BPMN semantics into that Worker. The [CIB Seven compatibility scope proposal](../CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md#interpreter-and-worker-language-boundary) owns this polyglot boundary. A JVM Worker is not approved by this capsule, and any future Java claim requires explicit cross-SDK payload, retry, idempotency, failure, and Worker-replacement evidence rather than assumed converter compatibility.

If both attempts fail, the Activity failure remains an adapter failure and no semantic result is applied. Incident/exhaustion equivalence with CIB is outside this capsule and cannot be coerced into a canonical semantic outcome.

## Idempotency and lost-completion witness

The harness-owned probe service records invocations and one logical mutation per transport key. Under `FailAfterMutationOnce`, the first invocation performs the mutation and then throws before Activity completion is recorded. The second invocation receives the same key, reconciles the existing mutation, and returns success without repeating it.

Required observations are:

- invocation count `2`;
- logical external mutation count `1`;
- one `completeEffect` semantic command;
- canonical trace identical to plain success;
- Temporal Event History containing Activity scheduling and attempt evidence;
- replay preserving the exact canonical result and intent identity.

The corresponding CIB delegate uses the same schedule: the first public job execution performs the mutation and throws, the retained async-continuation job records retries `3 → 2`, and the second public execution reconciles the key and completes. Retry decrement and invocation count are raw CIB evidence only.

## Phase zero CIB Seven probe

Before checked-source, IL, Lean, TypeScript, or Temporal production work:

1. configure the exact `bpmnLeanEffectHandler` bean as the project probe `JavaDelegate`, then deploy the exact source shape to the packaged CIB Seven `2.2.0` oracle with automatic job execution disabled;
2. start the Process and require exactly one immediately executable async-continuation job with three retries;
3. require canonical adapter projection of one effect wait while recording that the semantic occurrence and intent are adapter-derived;
4. execute the job under `FailAfterMutationOnce` and require the public call to fail, the job to remain, retries to become two, invocation count two only after the second execution, and mutation count to remain one;
5. execute the same job again and require successful Process completion without administrative retry mutation;
6. retain a negative assertion that no timer-like due-date eligibility transition is claimed.

The red test is the exact fail-once/re-execute probe. If the packaged engine differs from the pinned-source account, if public manual execution does not perform the retry transition, or if the probe requires setting retries administratively, stop for owner direction and do not formalize the proposed semantics.

### Result

The phase-zero probe is green against packaged CIB Seven `2.2.0`. [The exact source fixture](../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.bpmn) deploys with no engine parser warning under the shared disabled-executor configuration. Start creates exactly one immediately executable async-continuation job at `ServiceTask_Record`, with three retries, a null due date, and no timer classification. The probe derives the activity ID from the public Job Definition, reads the standard implementation value and expanded-name delegate expression from the deployed BPMN model, counts the one live job, and applies the exact profile-pair comparator. A negative control deploys a different implementation URI and proves that comparator rejects it. Mapping the counted host wait to activation ordinal `1` remains adapter-decided because CIB exposes no semantic effect occurrence or engine-derived activation ordinal.

[The engine probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.java) registers only the exact `bpmnLeanEffectHandler` bean. Its first public `executeJob` invocation performs one probe mutation and throws; the same durable job remains executable with retries decremented from three to two. Its second public execution invokes the delegate again, observes the prior mutation, performs no second mutation, removes the job, and completes the Process. No call edits retries administratively, and no incident is created.

The same test deploys an equivalent source whose lexical prefix is `probe` and whose expanded attribute names remain `{http://camunda.org/schema/1.0/bpmn}delegateExpression` and `{http://camunda.org/schema/1.0/bpmn}asyncBefore`; exact bean resolution and async-before job creation still succeed. [The source-import guard](../../packages/bpmn-source/test/bpmn-source.test.mjs) independently requires warning-free `bpmn-moddle` import, exact-byte retention, the standard implementation URI, and the two raw foreign attributes. These results satisfy the compatibility-scope phase-zero obligations without selecting the proposed extension into a profile.

## CIB fidelity labels

| Claim | Fidelity |
|---|---|
| Service Task source and exact extension attributes were deployed | Engine-observed deployment fact |
| One async-continuation job exists and is immediately executable | Engine-observed host fact |
| Harness waits before releasing the job | Harness scheduling input |
| The job represents the selected semantic effect occurrence and intent | Adapter-derived from exact source and live instance |
| Delegate invocation and external mutation counts | Probe-service-observed |
| Retry decrement `3 → 2` | Engine-observed raw evidence |
| Successful second execution and Process completion | Engine-observed |
| Canonical occurrence identity, descriptor, and stable intent | Adapter-derived; checked independently by Lean and TypeScript |

No row presents the CIB job or retry count as an independent derivation of the semantic intent.

## Smallest separating witnesses

| Witness | Wrong account separated |
|---|---|
| Start reaches one observable effect wait and stable intent before external execution | Synchronous execution inside Process start is the semantic account |
| Full-identity mismatch and stale result are rejected with state preservation | Element ID or host callback alone authorizes progress |
| Fail-after-mutation-once produces two invocations and one mutation | Attempt, Run, Activity, or CIB job identity is used as the idempotency key |
| Mutating either Activity-request binding identity after intent commitment fails reconciliation | A Worker or adapter may independently choose the dispatch handler or descriptor identity |
| Host failure schedule has the same canonical trace as plain success | Transport attempts leak into BPMN observations |
| Activity-bypass mutation lacks a scheduled/completed Activity pair and fails | Pure trace agreement permits a fabricated external effect |
| Worker replacement while the Activity is pending still completes once | An in-memory Workflow callback implements the effect |
| CIB first failure records `3 → 2` and second execution completes | Administrative retry editing or automatic execution is mistaken for engine retry evidence |

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Effect activation ordinal | Semantic core from committed activation count | Full occurrence identity | Created on `awaitEffect`, removed on accepted result |
| Effect intent | Semantic core from occurrence and IL descriptor | `openEffects` | Exactly one per active occurrence |
| Typed idempotency material | Semantic core from definition identity and intent | Stable intent field or equivalent structured projection | Exists with the intent |
| SHA-256 transport key | Adapter from complete typed idempotency material | Not canonical | Stable across attempts; discarded from semantic state |
| CIB async-continuation job | CIB engine from `asyncBefore` | Raw evidence only | Created before Service Task, retained across failure, removed on success |
| CIB retry count | CIB engine | Raw evidence only | Decremented by failed-job handling |
| Temporal Activity Execution and attempts | Temporal server and Worker | Event History only | Scheduled from committed intent; retries under explicit policy |
| Harness effect schedule and probe store | Test harness | Verifier evidence only | Per isolated gate, cleaned afterward |

## Required evidence before graduation

- approved BPMN requirement disposition and CIB extension/configuration entries;
- green packaged-engine phase-zero probe with exact source bytes and no administrative retry mutation;
- strict source admission for the standard implementation URI and exactly two extension QNames, with hostile namespace, delegate-expression value, method/property expression, extra-attribute, extension-element, and parser-warning rejections;
- checked graph and `awaitEffect` schema changes with exact lowering equality;
- Lean direct relation, evaluator, evaluator-soundness bridge, exact successful trace, stable-intent law, quantified full-identity refusal theorem, and accept-any-result non-law;
- independently implemented TypeScript behavior and matching negative witnesses;
- atomic `openEffects` and `completeEffect` wire-contract evolution;
- plain-success four-target differential agreement;
- content-bound CIB evidence with fidelity labels and a meaningful mutation over effect wait, retry, or completion projection;
- CIB fail-after-mutation-once raw retry evidence and canonical equivalence to CIB plain success;
- Temporal Activity input derived only from committed intent, with a retained mutation proving that neither handler nor implementation identity can drift;
- Temporal fail-after-mutation-once reconciliation with two invocations, one mutation, one semantic result, and canonical equivalence to Temporal plain success;
- Activity-bypass mutation rejected by Event History evidence;
- Worker-replacement, semantic-lifetime completion, receipt reconciliation, cleanup, live-history replay, and exact Activity policy evidence;
- full applicable gate within existing feedback budgets without weakening an assertion.

On graduation, rename this document to `SERVICE-TASK-EFFECT-SPEC.md` and update [PLAN.md](../PLAN.md), [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), the documentation registries, requirement ledger, CIB relationship register, profile, and rule-to-evidence rows in the same atomic change.

## Stop conditions

Stop for owner direction if:

- the packaged CIB probe cannot reproduce fail-once retry decrement and clean manual re-execution without administrative retry changes;
- strict namespace-aware admission requires a new parser or descriptor dependency;
- the exact source needs extension content beyond the two selected attributes or CIB cannot resolve the exact bean without importing a general expression/container surface;
- the adapter cannot derive Activity input and result exclusively from committed core intent;
- a stable transport key requires host identity or attempt state;
- effect intent emission is not replay-stable and exactly once at the semantic boundary;
- retry or incident state enters canonical observations;
- canonical equivalence requires weakening raw CIB or Temporal history assertions;
- alignment requires changing existing closure, observation, lifecycle, or wire semantics for proof convenience;
- the complete gate exceeds its existing budget and cannot be restored without weakening evidence.

## Decisions still required

A later approval of this capsule, after the phase-zero probe is green, selects:

1. the exact success-only semantic account and exclusions;
2. the `asyncBefore` exact delegate-expression bean binding, conditional on phase zero;
3. namespace-aware admission of only the two exact Camunda extension attributes without general JUEL;
4. `awaitEffect`, full occurrence identity, structured committed intent, and adapter-rendered SHA-256 transport key;
5. a two-attempt, five-second start-to-close Temporal Activity policy with no heartbeat or cancellation;
6. separate explicit host schedules and adapter-local canonical-equivalence assertions;
7. retry exhaustion, CIB incidents, service faults, and external-task protocol as named reopen conditions rather than semantic outcomes.
