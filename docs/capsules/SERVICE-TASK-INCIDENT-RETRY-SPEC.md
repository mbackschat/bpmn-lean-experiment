# Service Task incident and retry specification

## Status

**Implemented, closure-reviewed, evidence-closed, and graduated.** This specification owns one configured CIB-profile Service Task incident, literal generation 1, and one exact retry of the same effect occurrence across the strict wire, TypeScript semantic core, proved Lean lane, configured CIB execution and projection, four-target differential evidence, runnable configuration, and Temporal Worker-replacement/history/replay evidence. A second semantic incident, generalized retry policy, cancellation, Product 2 incident operations, host causes, and retry counts remain excluded.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `56b9398` | `fork-turns-none` | `approve-with-required-edits` | `43228e3` |
| Semantic checkpoint | `818f642` | `fork-turns-none` | `approve-with-required-edits` | `1f20c00` |
| Closure | `9146be0` | `checkpoint-reviewer-warm` | `approve-with-required-edits` | `2fa4360` |

The superseded first proposal target `8be7e5f` and superseded first redesign target `278e63b` each received an isolated `fork-turns-none` review with verdict `reject`. The selected redesign therefore received a new context-cold proposal review. Closure used the approved checkpoint reviewer after augmented continuity manifest `13873c585671521f39db716b411bda8d555bae2e2fe0ed720cb8833ee676261f` proved the complete selected account, public contract, exclusions, and evidence strategy byte-identical. Two correction audits closed three owner/evidence findings; `2fa4360` is the final audited correction.

## Question

Should one successor profile turn one explicit technical Service Task execution result into a committed, publicly observable incident and permit one exact retry of the same effect occurrence while keeping later failures, Temporal attempts, CIB job identity, host exceptions, Product 2 state, cancellation, and general BPMN service-fault meaning outside this capsule?

The selected account uses one bounded CIB compatibility-overlay profile and one incident transition family. It makes a failure visible and permits one controlled retry without deriving semantic state from Temporal Event History, Workflow failure, a missing effect, CIB identity, or platform persistence.

## Authority and forward-compatible boundary

BPMN 2.0.2 Clause 13.3.3 describes a service fault as interrupting the Activity and being treated as an error. This specification does not claim that general account. It does not turn a thrown exception into BPMN Error, define WSDL faults, or broaden the existing exact-code boundary-Error capsule.

CIB Seven adds job retries and failed-job incidents outside bare BPMN execution. The new profile `cibseven-2.2.0-service-task-incident-draft` selects:

- selected [`CIB-EXT-0013`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0013-failed-job-service-task-incident-and-retry) for the failed async-before Service Task job, its public `failedJob` incident, and public retry reset;
- selected [`CIB-OP-0008`](../CIB-BPMN-RELATION-REGISTER.md#cib-op-0008-cib-failed-job-incident-mapped-to-a-semantic-effect-incident) for mapping raw CIB job and incident facts to a project-owned effect occurrence and literal semantic generation 1;
- selected `CIB-CFG-0008` for `createIncidentOnFailedJobEnabled = true`, independently separated from the disabled setting by the packaged-engine phase-zero probe.

The profile composes the existing `CIB-EXT-0001` Service Task binding and `CIB-CFG-0002` manual job-release configuration. It references the exact existing BPMN source path and produces the same structural checked graph and Semantic Process IL content. Checked graphs and IL programs are generated artifacts registered by pipeline cases, not retained JSON files. A structural-equivalence guard erases only `identity.semanticProfile` before comparing the predecessor and successor generated values; every other field must remain exactly equal.

This restriction is forward-compatible. The runtime retains the original effect occurrence and descriptor, so a later general BPMN fault account or another reviewed incident kind can add a distinct result route without reinterpreting this CIB-owned incident.

## Failure and transport classification

The semantic result remains unchanged:

```ts
type EffectExecutionResult =
  | { kind: "success"; localPatch: VariableBinding[] }
  | { kind: "bpmnError"; code: string; message: string | null; localPatch: VariableBinding[] };
```

`completeEffect` continues to accept only that semantic union. Technical failure belongs to a separate Temporal transport union:

```ts
type EffectActivityExecutionResult =
  | EffectExecutionResult
  | { kind: "technicalFailure" };
```

The Activity type is widened without wrapping its existing arms, so every existing `success` and `bpmnError` payload remains byte-identical in new histories and replays. The new profile may return the payload-free `technicalFailure` arm once while the effect wait has not previously been retried. The Workflow must convert that arm to `reportEffectFailure` and must never pass it to `completeEffect`. Existing profiles and a second technical result after the one retry classify the arm as host failure without submitting a semantic command. A thrown, timed-out, cancelled, malformed, or exhausted Activity remains host failure and creates no semantic incident.

The following classes remain disjoint:

| Class | Meaning and owner |
|---|---|
| `success` or `bpmnError` | Existing semantic effect completion |
| `technicalFailure` | Transport-only successful Activity result, admitted only for the successor profile |
| `effectExecutionFailed` | Committed semantic state under the successor CIB overlay |
| CIB job attempts, retry count, IDs, and exception text | Raw compatibility evidence only |
| Temporal attempts, `ActivityFailure`, timeout, and cancellation | Private hosting facts only |
| Product 2 action state | Deferred platform state only |

## Selected semantic contract

```ts
type EffectIncidentId = DeepReadonly<{
  effectId: EffectOccurrenceId;
  generation: 1;
}>;

type OpenEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: EffectIncidentId;
  effect: OpenEffect;
}>;

type ReportEffectFailureStimulus = DeepReadonly<{
  kind: "reportEffectFailure";
  commandId: string;
  effectId: EffectOccurrenceId;
  generation: 1;
}>;

type RetryIncidentStimulus = DeepReadonly<{
  kind: "retryIncident";
  commandId: string;
  incidentId: EffectIncidentId;
}>;

type SemanticEffectIncident = DeepReadonly<{
  id: EffectIncidentId;
  wait: SemanticEffectWait;
}>;
```

An effect wait privately retains `incidentAlreadyRetried: boolean`. The first technical result may report only while that marker is false, and the report must name literal generation 1. The incident moves the complete private wait into `SemanticEffectIncident.wait`, and `incident.id.effectId` must equal `incident.wait.id`. Retrying restores that exact wait with `incidentAlreadyRetried: true`. A later technical result is a typed host failure and never submits another `reportEffectFailure` command. The public `OpenEffectIncident` independently requires `incident.id.effectId` to equal `incident.effect.id`. The literal generation keeps one content-bound identity for the only admitted incident and no arithmetic or unbounded domain exists.

The Workflow-generated report command ID is exactly:

```text
report-effect-failure-sha256:<sha256(canonicalTypedTupleEncoding([
  "reportEffectFailure",
  [processInstanceId, elementId, activation],
  generation
]))>
```

The report is host-produced, not a caller Update. Its explicit stimulus remains in the neutral scenario wire so Lean, TypeScript, CIB projection, and Temporal can compare one command schedule.

## Stable semantic rules

### INCIDENT-REPORT-01

For a running Process with one exact live effect wait whose `incidentAlreadyRetried` marker is false, generation 1 atomically removes the open effect and moves the complete suspended wait into one `effectExecutionFailed` incident. The incident identity must equal the moved wait identity. An incident is owned by its moved wait's scope occurrence, makes that occurrence nonquiescent in TypeScript and Lean, and counts as an explicit resumption surface in both stable-state predicates. Process status remains running and mandatory internal closure cannot advance past the incident.

### INCIDENT-OBSERVE-01

Every `StateObservation` contains required `openIncidents`. An incident state exposes one incident active wait and one exact public incident, exposes no corresponding open effect, and exposes one retry interaction only for generation 1. It exposes no host cause, attempt, retry budget, raw CIB identity, Temporal identity, transport key, or Product 2 state.

### INCIDENT-RETRY-01

The exact generation-1 retry removes the incident and restores the same effect occurrence, owner, descriptor, arguments, output mappings, BPMN Error route, output place, Activity-local scope, and transport idempotency material with `incidentAlreadyRetried` set to true. It does not increment an activation counter or create a token.

### INCIDENT-REFUSE-01

A wire or artifact with a generation other than literal 1 fails strict decoding before a `Stimulus` exists, so no semantic command is submitted. Among typed stimuli, a wrong occurrence, duplicate report, stale incident, retry while the effect is open, report after the one retry, mismatched incident/wait identity, or either command under an old profile rejects with exact state preservation. Two different retry command IDs queued for generation 1 are distinct semantic commands: the first eligible command commits and the second rejects in deterministic queue order.

Before dispatching any stimulus, TypeScript `admit` and Lean command admission fail closed when `effectIncidents` is nonempty unless the Program names the exact successor profile, has the exact successor Service Task shape, and every incident association is valid. This gate applies to cross-program injected states as well as ordinary reachable states. A mismatched profile or a Program containing cancellation, Error-propagation, Terminate, Call Activity, or another operation family rejects the submitted command with exact state preservation; internal closure is never entered from that refused command.

### INCIDENT-SEPARATE-01

Existing success and typed `bpmnError` results never create an incident. A technical failure never enters a BPMN Error route and can never appear inside `completeEffect`. Existing profiles retain their current two-attempt Activity policy and exhausted-host-failure behavior.

## State and artifact versioning

`WaitKind` gains `incident`, `StateObservation` gains required `openIncidents`, and `EnabledInteraction` gains `retryIncident`. `ObservationRequestKind` does **not** change. Like the existing required `openMessageSubscriptions` field, `openIncidents` is part of every state projection while scenario and profile observation-request lists keep their exact bytes. Runtime association validation requires exactly one incident identity matching its moved wait, one live owning scope occurrence, one matching Activity-local variable scope, no duplicate occurrence in `effectWaits`, and literal generation 1. Malformed associations are nonresumable and both commands refuse them unchanged. `isStableStateResumable` and Lean `stableStateResumable` count a well-formed incident as resumable only because it exposes the exact retry interaction. Canonical active-wait order is User Task, Message, Timer, Effect, Incident; enabled-interaction order is User Task completion, Message delivery, then incident retry, each internally ordered by exact occurrence identity.

This is one pre-release canonical-result replacement. Every retained canonical state gains `openIncidents: []`, and retained CIB evidence envelopes replace only their canonical result arm as needed. Existing profile JSON, scenario JSON, raw old-profile producer facts, and BPMN source remain byte-identical. The successor pipeline cases produce new checked and IL values whose structural content is exactly the predecessor content modulo semantic-profile identity.

No parallel legacy schema is added. The public state shape, strict TypeScript stimulus and Activity-result validators, JSON Schema artifact validation, strict Lean JSON decoder, CIB protocol, differential comparison, Temporal Query, and every retained result advance atomically. Draft 2020-12 cannot express equality between the two nested occurrence objects, so a focused TypeScript incident-state validator, the Lean relation and projection theorem, the Java incident constructor/projector, and a non-schema artifact/fidelity mutation each enforce `incident.id.effectId = incident.effect.id` independently.

## CIB Seven phase-zero evidence and mapping

The committed [phase-zero probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) is pre-approval research evidence only. It uses the exact existing Service Task BPMN plus a test-owned mode-controlled delegate and proves:

1. with `createIncidentOnFailedJobEnabled = true`, three failed public job executions preserve the same job and Process while retries move `3 -> 2 -> 1 -> 0`;
2. retries zero exposes exactly one public self-rooted `failedJob` incident configured by that job and attached to the selected Service Task;
3. `setJobRetries(jobId, 1)` removes the incident and preserves the same job and Process;
4. another failure creates a new raw incident, then another reset plus an explicit handler-mode switch lets the same job complete successfully;
5. with the exact configuration disabled, the same retries-zero state exposes no incident.

The successor profile adds machine-readable `environment.createIncidentOnFailedJobEnabled: true`; the semantic-profile schema permits that field only as an optional CIB-environment property, so existing profile bytes remain unchanged. The CIB runner builds or reuses a warm engine bundle from the validated profile environment before executing its schedule. The successor profile requires the incident schedule, and the incident schedule requires the successor profile. Legacy profiles retain the pinned engine's existing effective setting because their environment does not declare this property. The disabled setting remains a phase-zero discriminator and is not applied to legacy profile execution. The phase-zero probe's later second raw incident remains research evidence about CIB and is outside the selected canonical mapping.

Raw incident evidence adds one optional incident-specific diagnostics snapshot containing the public job ID, retries, executability, due-date presence, Process and element associations, incident ID and type, configuration job ID, and self-rooted cause/root IDs. Existing `EffectJob` and every old raw producer arm remain byte-identical. The successor profile requires the diagnostics snapshot through the CIB fidelity validator. `CibSevenIncidentProjector` consumes and partitions the same public job list as the existing effect projector: its one matching retries-zero job becomes one incident active wait, one `openIncidents` value, and one retry interaction, and is absent from `openEffects`. Canonical projection requires exactly one matching retries-zero job and incident partner, constructs the literal `EffectIncidentId`, and enforces equality with the nested effect identity. It refuses the disabled configuration, missing or duplicate partners, wrong type, wrong job configuration, wrong Process or element, nonzero retries with an incident, zero retries without an incident, and old-profile leakage.

## Lean lane

The Lean lane is **proved**. A new `Incident.lean` module owns the report/retry relations and executable clauses. A new conformance module proves:

- report relation existence and evaluator soundness for literal generation 1;
- exact wait-to-incident projection and one exact incident-to-wait restoration;
- preservation of effect occurrence, owner, descriptor, arguments, mappings, route, output, Activity-local bindings, logical time, and every activation counter;
- wrong-occurrence, stale-incident, identity-mismatch, duplicate-report, and post-retry report refusal with complete state identity;
- success and `bpmnError` separation;
- strict JSON identity for the state, stimuli, interaction, and observations.

Lean represents the generation as `Nat`, but strict JSON and profile admission accept only literal 1; wrong-generation evidence belongs to strict decoder refusal rather than the semantic state-preservation theorem. No cancellation theorem or incident-cleanup rule belongs to this capsule. `Execution.lean` is already near its reviewed size boundary, so existing command admission must move to a cohesive `CommandAdmission.lean` owner before the new family delegates from execution.

## Temporal hosting and refinement preflight

The durable effect wait or its incident-owned suspended form remains committed Workflow state. `workflows.ts` owns two proxies for the same Activity type: the existing profiles select `maximumAttempts: 2`, while the successor profile selects `maximumAttempts: 1`. A guard proves the selection is exact and that every old profile retains two attempts.

The Activity returns the bare union `EffectExecutionResult | { kind: "technicalFailure" }`. The Workflow validates the result against the selected profile. Existing semantic arms retain their exact bytes and create the unchanged `completeEffect` stimulus. A successor-profile first `technicalFailure` creates the exact deterministic `reportEffectFailure` stimulus. After the one retry, another `technicalFailure` is a typed host failure and creates no semantic command. The single Workflow input loop remains the only caller of `applyStimulus`.

Retry uses Workflow Update name `bpmn-retry-effect-incident`, argument tuple `[RetryIncidentStimulus]`, and result `CommandOutcome`. The Temporal Update ID remains `contentBoundUpdateId(stimulus)`, whose canonical encoding includes the full stimulus, including caller command ID and complete nested incident identity. An exact same Update ID reuses Temporal's retained result. Two distinct command IDs are two Updates; deterministic Workflow queue order lets at most one commit against generation 1 and the other receives semantic rejection.

No Signal, Timer, Child Workflow, Search Attribute, Memo, Workflow cancellation, Event History read, Visibility query, or platform persistence creates or repairs an incident. Query projects committed `openIncidents`. Replay reconstructs the same literal incident identity from recorded transport results and accepted retry Updates.

The smallest live witness starts the successor profile, observes one open effect, receives technical failure, observes generation 1, replaces the Worker, retries through Update, observes the same effect occurrence, then completes successfully and replays. A Temporal-only negative witness retries once, receives another `technicalFailure`, proves no second report command or incident was committed and the last committed Query still contains the restored effect wait, then reproduces the typed host failure on replay. Mutations wrapping existing semantic results, using Temporal attempt as incident identity, forwarding technical failure to `completeEffect`, replacing the effect occurrence, losing Activity-local state, omitting the incident from quiescence/resumability, mismatching nested effect identity, or deriving incident state from Workflow failure must fail.

## Cross-target scenarios and evidence

Register one answer-free scenario that references the existing `scenarios/service-task-effect/process.bpmn` source path without copying it:

1. technical failure generation 1, retry generation 1, success;

Lean and the TypeScript core consume explicit report and retry stimuli. CIB realizes one report through public failed job executions and retry through public retry reset. Temporal derives report only from the transport-only Activity result and accepts retry only by Update. No target receives raw CIB identity, Temporal attempt, or expected canonical answer.

| Rule | Profile/CIB | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|
| `INCIDENT-REPORT-01` | enabled-setting failed-job incident | report relation | atomic wait suspension | transport result queues report | disabled-setting and delete-without-suspension mutations |
| `INCIDENT-OBSERVE-01` | independent raw job/incident queries | exact projection | required `openIncidents` | committed Query | Workflow-failure and missing-effect projection mutations |
| `INCIDENT-RETRY-01` | reset removes incident, same job/Process | exact restoration | same occurrence and counters | content-bound Update | new-occurrence and lost-local-state mutations |
| `INCIDENT-REFUSE-01` | literal adapter generation | identity theorems | exact preservation | retained Update and queue race | strict wrong-generation decode refusal, duplicate-report, post-retry failure, and two-command race cases |
| `INCIDENT-SEPARATE-01` | failed job is not BPMN Error | constructor separation | unchanged complete-effect union | separate transport decoder | technical-failure-to-complete and business-error-to-incident mutations |

## Required, optional, and excluded functionality

Required:

- one successor profile, one exact configured failed-job incident kind, one transport-only technical failure arm, and one report/retry transition family;
- one literal generation-1 incident and one exact retry, with later technical results remaining host failures;
- required `openIncidents` state projection with unchanged observation-request lists;
- new successor pipeline cases and structural checked/IL equivalence modulo profile identity;
- strict TypeScript, Lean, Java, schema, artifact, differential, runnable, and Temporal consumers;
- packaged phase-zero evidence, one answer-free scenario, content-bound raw evidence, Worker replacement, Update, Query, history, replay, post-retry host-failure evidence, and mutation discrimination;

Optional only if it changes no claim:

- an additional direct old-profile transport-failure refusal;
- an additional Worker replacement point after the incident retry reopens the effect.

Excluded:

- general BPMN service faults, WSDL operations, arbitrary exceptions, unmatched BPMN Error, compensation, escalation, Transaction, Event Sub-Process, multi-instance, external tasks, generalized retry policy, or incident kinds beyond this failed effect;
- public exception message, stack, cause, CIB job/incident ID, retry count, Temporal Workflow/Run/Activity/attempt identity, transport key, or Product 2 state;
- a second semantic incident, editing retry budgets, due-date scheduling, retry cycles, backoff, incident editing/deletion, or arbitrary Management Service compatibility;
- Process or scope cancellation, in-flight Activity cancellation, termination, pause, reset, M5 transition/token/position publication, Product 2 APIs, authorization, audit, UI, or cross-instance aggregation.

## Versioning consequences

The implementation changes the strict state/stimulus/result wire, semantic runtime, command admission, scope quiescence and stable-state resumability, profile catalog/admission, Lean contract/runtime/JSON, CIB protocol/evidence, differential artifacts, and Temporal transport/Update/Query. It does not change BPMN source admission, checked node variants, Semantic Process operations, lowering, existing profile files, existing scenario files, or the behavior of cancellation families. Exact command admission permits a nonempty incident collection only with the exact successor profile, exact successor Program shape, and valid association; it rejects every cross-program injected pairing before dispatch. Existing cancellation and call-removal implementations therefore remain unreachable from an incident-bearing state in Stage 1; their broad comments narrow to their currently admitted state families, and generic incident cleanup remains Stage 2.

The strict schema change is owned by the [scenario schema](../../contracts/schemas/scenario.schema.json), [CIB evidence schema](../../contracts/schemas/cibseven-evidence.schema.json), [semantic profile schema](../../contracts/schemas/semantic-profile.schema.json), and [schema registry](../../contracts/README.md). The six-line [canonical result schema](../../contracts/schemas/canonical-result.schema.json) remains unchanged because it delegates to the scenario result definition. The checked-process and Semantic Process schemas remain unchanged.

The successor profile adds its profile and README, and the new answer-free schedule shares the existing `scenarios/service-task-effect/process.bpmn` source. All twenty retained CIB evidence files replace only canonical states to add `openIncidents: []`; their raw producer observations remain exact. The two current A12 evidence files receive the same canonical field, while frozen legacy A12 evidence is normalized only at the current-versus-legacy comparison boundary.

### Implemented ownership

The implementation separates incident runtime and validation, strict artifact and raw CIB projection, Lean incident semantics and command admission, Temporal Activity-result policy and retry Update handling, configured CIB engine bundles and incident execution, and the four-target incident pipeline into focused owners. Existing Service Task success, typed BPMN Error, checked graph, Semantic Process IL, and cancellation owners retain their previous responsibilities.

### Guards and oracles

| Guard or oracle | Obligation |
|---|---|
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts), and [artifact projections](../../scripts/contract-artifact-projections.test.ts) | Reach the literal incident arm and strict wrong-generation decode refusal, replace canonical result artifacts, and preserve old profile/scenario/raw evidence bytes. |
| [effect artifact consistency](../../scripts/effect-operation-artifact-consistency.test.ts) | Prove exact source and structural checked/IL equivalence modulo successor profile identity. |
| [CIB observation fidelity](../../scripts/cib-observation-fidelity.test.ts) | Bind canonical incidents to independent configured raw job and incident facts. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce cohesive owners, extractions, registries, and line limits. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep incident facts public, descriptive, strict, and independently buildable. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register the answer-free schedule and catch target substitution. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep transport, CIB identity, Product 2, and cancellation outside neutral incident meaning. |
| [review policy](../../scripts/independent-review-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and [review packet](../../scripts/semantic-review-packet.test.ts) | Keep review routing, receipts, owners, and checkpoint boundary complete. |

## Epistemic closure and cost boundary

The claim to establish is one configured technical effect failure becoming one committed CIB-profile incident and one retry reopening the exact effect occurrence. A later technical result remains a typed host failure and creates no second semantic incident. The capsule does not establish general BPMN fault meaning, Process cancellation, automatic remediation, or Product 2 operations.

The strongest common-mode risk is the project-owned mapping from a raw CIB job/incident lifecycle to semantic effect identity and literal generation. The phase-zero probe closes the public engine lifecycle and configuration discriminator, but CIB still cannot derive the semantic occurrence or generation. Raw facts therefore remain independently visible while canonical projection constructs and checks the neutral identity.

The nearest wrong accounts are: existing semantic Activity results are wrapped; Activity transport failure enters `completeEffect`; Temporal attempt defines identity; retry creates a new activation; a second semantic incident is created; the incident fails to block normal scope completion; its nested effect identity drifts; old profile/scenario bytes change; or a missing open effect is treated as incident evidence. Each has a direct rejection, structural guard, theorem, mutation, or history discriminator.

[The capsule cost ledger](../CAPSULE-COST-LEDGER.md) records the implementation range and compares it with the existing Service Task effect capsule.

## Implementation result

The implementation realizes the selected account without widening it. The strict public state and stimuli, TypeScript semantic core, and proved Lean relation commit one literal-generation-1 incident by moving the complete effect wait, block ordinary scope completion, and restore the exact wait once with the private retried marker set. A pre-dispatch profile, shape, and association gate rejects malformed or cross-program incident state before any transition or closure work.

The configured CIB bundle retains independent public job and `failedJob` incident facts, projects exactly one matching retries-zero pair, resets the same job for retry, and records incident-specific raw diagnostics without adding host identity to canonical state. The registered answer-free case compares CIB, Lean, TypeScript, and Temporal and rejects checked/IL non-profile drift, raw association drift, nested effect-identity drift, target substitution, and lifecycle mutations.

Temporal preserves every existing semantic Activity result byte, selects one attempt only for the successor profile, converts the first host-only technical result into the deterministic report command, and accepts retry through the shared content-bound retained-Update mechanism. Live evidence covers Worker replacement, the restored effect, successful completion, response recovery after closure, two distinct retry commands with one commit and one rejection, a second technical result becoming typed host failure without another semantic incident, exact Activity and Update history, and replay. Product 2, cancellation, a second semantic incident, host causes, retry counts, and arbitrary policy remain absent.

## Stop conditions

Stop and return to research or owner direction if:

- the successor profile cannot pin and independently observe configured failed-job incident creation;
- semantic identity requires raw CIB identity, retry count, exception data, Temporal attempt, or platform state;
- technical failure must enter `completeEffect` or an Activity exception must define incident state;
- retry changes the effect occurrence, descriptor, arguments, mappings, route, output, counters, or Activity-local state;
- a second semantic incident, retry cycle, or unbounded generation domain becomes necessary;
- Process cancellation, in-flight cancellation, external-task behavior, Product 2 operations, or M5 projection becomes necessary;
- existing profile, scenario, source, and raw-producer bytes cannot remain exact, or generated checked/IL structure cannot remain equal modulo profile identity;
- the full gate can pass only by weakening schemas, raw CIB fidelity, Worker replacement, replay, or a seeded mutation.

## Adopted decisions

The owner approved these decisions on 2026-08-13:

1. Select `cibseven-2.2.0-service-task-incident-draft` as a configured successor to the success-only Service Task profile.
2. Select `CIB-EXT-0013`, `CIB-OP-0008`, and configured failed-job incident creation under `CIB-CFG-0008`.
3. Keep semantic `EffectExecutionResult` and its existing Activity payload bytes unchanged by widening the bare wire union with one transport-only technical failure arm.
4. Add one committed literal-generation-1 incident, required `openIncidents`, incident-owned suspended waits, exact retry, and report/retry stimuli while keeping later technical results as host failures.
5. Preserve exact old profile, scenario, source, and raw-producer bytes while replacing canonical result shapes and adding successor pipeline artifacts equal modulo profile identity.
6. Use a proved Lean lane and per-profile one-attempt versus two-attempt Temporal proxy selection.
7. Require configured phase-zero evidence, one answer-free schedule, raw-to-canonical CIB fidelity, Worker replacement, Update, Query, history, replay, the post-retry host-failure negative witness, and mutations.
8. Keep every cancellation fact for Stage 2 and every Product 2 incident operation for Stage 3.
