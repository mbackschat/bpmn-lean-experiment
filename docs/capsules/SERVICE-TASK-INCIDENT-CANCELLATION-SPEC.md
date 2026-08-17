# Service Task incident-scoped Process cancellation specification

## Status

**Implemented, closure-reviewed, evidence-closed, and graduated.** This specification owns one successor CIB compatibility profile and one incident-gated external root Process cancellation command across the strict wire, TypeScript semantic core, proved Lean lane, configured CIB external-termination projection, exact four-target differential evidence, and live Temporal Worker-replacement, retained-Update, history, replay, and mutation evidence. General BPMN cancellation, arbitrary in-flight cancellation, Transaction Cancel, compensation, modeled Terminate behavior, Temporal Workflow cancellation, and Product 2 operations remain excluded.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d03f5285a9e16852e2d08da6da29864275e75c6b` | `fork-turns-none` | `approve-with-required-edits` | `4505dbf1f893d24ee282b89a5fdef0a37d1b920e` |
| Semantic checkpoint | `189c56f146fceab543d734bc5cba5f9a1fb0657c` | `fork-turns-none` | `approve-with-required-edits` | `f86a8250332f61ca0d5ff8b17669643df04c575c` |
| Closure | `312791297ea15debc7d382b6bebafcf1e44e6ddc` | `fork-turns-none` | `approve-with-required-edits` | `83a4c2600b1e86fd235f58631f18a8d0b92eea35` |

## Selected scope

One successor profile lets a caller cancel the exact hosting root Process only while addressing its exact published generation-1 Service Task incident, atomically removes the root's live execution region, preserves committed Process data and monotonic history, and closes with a typed cancelled receipt. The semantic core derives the unique root and owns the terminal state; CIB supplies a separately classified compatibility observation, Temporal transports the command durably, and Product 2 remains a later consumer.

## Authority and forward-compatible boundary

BPMN 2.0.2 Clause 10.5.1 distinguishes termination, which immediately ends active work without compensation or Event handling, from cancellation, which may compensate successfully completed Sub-Process work and roll back a Transaction. Clause 10.5.7 includes cancellation lifecycle states. Cancel End and Cancel Boundary Events are Transaction-only, while Clause 13.2 separately defines ordinary completion and modeled Terminate End abnormal termination.

This specification selects none of those modeled entry mechanisms. It defines an extra-model CIB-profile operator command that is available only for one exact published incident on the hosting root. Reusing the project's destructive subtree cleanup is forward-compatible only as a final cleanup primitive. A later standard BPMN cancellation account must perform its compensation, rollback, or Event behavior before cleanup, while modeled Terminate and interrupting Events keep their existing entry rules.

The successor profile is `cibseven-2.2.0-service-task-incident-cancellation-draft`. Its executable Program shape is identical to `cibseven-2.2.0-service-task-incident-draft` modulo semantic-profile identity and it reuses the exact [`service-task-effect` BPMN source](../../scenarios/service-task-effect/process.bpmn), checked graph, and Semantic Process IL. The profile artifact additionally admits the one canonical string Process-start binding used to discriminate committed-data preservation, so the profile itself is not byte-identical to Stage 1. It adds no BPMN source key, checked node, lowering rule, or IL operation.

The profile selects:

- `CIB-EXT-0014`, public external deletion of the selected incident-bearing root Process;
- `CIB-OP-0009`, mapping exact public root and incident identity to private CIB deletion and externally terminated history;
- `CIB-EXT-0006` for the exact string Process-start binding whose preservation the cancellation witness checks;
- the existing `CIB-EXT-0001`, `CIB-EXT-0013`, `CIB-OP-0008`, `CIB-CFG-0001`, `CIB-CFG-0002`, and `CIB-CFG-0008` relationships that own the underlying effect, incident, runner, and configured-oracle facts.

No CIB job, incident, execution, delete-reason, or historic database identity enters the semantic wire.

## Public contract

```ts
enum StimulusKind {
  // existing members remain byte-identical
  CancelIncidentProcess = "cancelIncidentProcess",
}

type CancelIncidentProcessStimulus = DeepReadonly<{
  kind: StimulusKind.CancelIncidentProcess;
  commandId: string;
  processInstanceId: string;
  incidentId: EffectIncidentId;
}>;

type CancelIncidentProcessInteraction = DeepReadonly<{
  kind: StimulusKind.CancelIncidentProcess;
  processInstanceId: string;
  incidentId: EffectIncidentId;
}>;

enum ProcessStatus {
  // existing members remain byte-identical
  Cancelled = "cancelled",
}

enum ControlStateKind {
  // existing members remain byte-identical
  Cancelled = "cancelled",
}
```

The wire is closed. It carries no scope occurrence, owner, reason, compensation flag, retry count, force flag, or host identity. Strict decoding rejects any such extra field. The duplicated Process identity is intentional address material: `processInstanceId`, `incidentId.effectId.processInstanceId`, and the running control identity must all be equal before a command can commit.

The terminal adapter contract is additive:

```ts
interface CancelledProcessReceipt {
  readonly format: "bpmn-lean.process-terminal-receipt.v1";
  readonly definition: SemanticProcessIdentity;
  readonly processId: string;
  readonly processInstanceId: string;
  readonly finalState: StateObservation & {
    readonly status: ProcessStatus.Cancelled;
  };
}

type TerminalProcessReceipt =
  | CompletedProcessReceipt
  | CancelledProcessReceipt;
```

Completed and cancelled receipts now share the closed v1 format and expose no host command ledger. The raw Workflow result is opaque and the adapter privately decodes the v1 terminal envelope or the exact pre-v1 receipt. `ProcessCommandResultKind.ProcessClosed.receipt` remains the public `TerminalProcessReceipt`. The cancellation Update itself returns the unchanged semantic `CommandOutcome.Committed`; the receipt describes subsequent host closure.

## Selected semantic algorithm

### ICANCEL-ADMIT-01

Before dispatch, require the exact successor profile and its exact reviewed Program shape, `Running` control, `initiationPending = false`, valid generation-1 incident associations, and the exact published cancellation stimulus. Every old profile, including the Stage 1 incident profile, rejects cancellation with exact state preservation. The Stage 1 profile continues to report and retry its incident unchanged.

### ICANCEL-ROOT-01

Require `stimulus.processInstanceId = state.control.instanceId` and `stimulus.incidentId.effectId.processInstanceId = state.control.instanceId`. Derive exactly one root occurrence satisfying both `parent = null` and `id.processInstanceId = state.control.instanceId`. Do not choose the first parentless occurrence and do not accept caller-supplied scope or owner data. Require exactly one live incident with the submitted identity and require its owner to belong to the derived root region.

### ICANCEL-COMMIT-01

Extend the shared scope-subtree cleanup relation so it removes every live owner in the root region, including tokens, ordinary waits, effect waits, effect incidents and their suspended waits, selected branch sets, event races, transitive called-Process regions, called-process ownership links, scope occurrences, and Activity-local variables owned by either an open or incident-suspended effect. Invoke that relation exactly once for the derived root and set control to `Cancelled(instanceId)`.

The transition preserves the complete Process-variable binding list, every activation high-water counter, `endOccurrences`, and logical time exactly. It emits no token, End occurrence, compensation, Event handler, output mapping, or internal closure step. The Process becomes terminal with `initiationPending = false`, empty live work, empty incidents, and no enabled interactions.

### ICANCEL-REFUSE-01

A wrong root identity, wrong or stale incident, duplicate cancellation, cancelled or completed state, malformed association, `initiationPending = true`, caller-supplied extra owner, incident-free state, or command under another profile rejects with exact state identity. A pending initiation is malformed for this command and is never repaired during cancellation. Deleting only the incident while leaving its root running is not a valid transition.

### ICANCEL-ORDER-01

Retry and cancellation are two distinct external semantic inputs. Canonical `enabledInteractions` family order remains User Task completion, Message delivery, incident Retry, then incident Cancel; adding Cancel preserves the complete Stage 1 ordering prefix. Swapping the simultaneously published Retry and Cancel entries is a strict projection and JSON-identity failure. Publication order grants neither command scheduling priority. Deterministic queue order is the explicit scheduler choice. If cancellation commits first, retry rejects against the terminal state. If retry commits first, cancellation rejects because the submitted incident is stale and the Process remains running with the reopened effect. The capsule does not claim confluence across those two orders.

## Runtime and observation consequences

The runtime gains typed `Cancelled(instanceId)`. `StateObservation.status` gains `cancelled`, and `EnabledInteraction` gains the exact cancellation interaction only for one eligible incident under the successor profile. `ObservationRequestKind` does not change.

A cancelled observation contains the preserved Process variables and logical time, with empty active waits, open tasks, Message subscriptions, timers, effects, incidents, and enabled interactions. The private terminal runtime has `initiationPending = false`. Activation counters and End history remain private state and are checked directly in TypeScript and Lean rather than projected as new public fields.

The unique-root and cleanup invariants apply to the complete runtime state. A malformed extra parentless occurrence, an incident outside the selected root, a duplicate incident, or an incident-owned Activity-local binding outside the cleanup region makes the command inadmissible rather than allowing partial cleanup.

## CIB Seven phase-zero evidence and mapping

The extended [`CibSevenServiceTaskIncidentPhaseZeroProbeTest`](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenServiceTaskIncidentPhaseZeroProbeTest.java) is research evidence and does not itself register the profile. With `createIncidentOnFailedJobEnabled = true`, it starts the exact Service Task Process with committed string variable `preserved = "before-cancel"`, drives the async job from retries three to zero, requires one matching `failedJob` incident, and calls:

```java
runtimeService.deleteProcessInstance(processInstanceId, "owner-requested", false, true);
```

The probe establishes that live Process, job, incident, execution, and task counts become zero; one historic Process remains with state `EXTERNALLY_TERMINATED`; and the committed Process variable remains readable from history. Its existing successful control now also requires historic state `COMPLETED`, so runtime absence alone cannot be projected as cancellation.

The registered CIB evidence adds successor-only raw historic-state diagnostics bound to the command after which they were observed. Canonical projection requires the existing exact job/incident partners before deletion and the exact externally terminated historic root afterward. It uses the scenario's stable semantic Process identity and never exports raw CIB identity or delete reason. Existing CIB evidence files and old raw producer arms remain byte-identical.

## Lean lane

The Lean lane is **proved**. A new `IncidentCancellation.lean` module owns the declarative cancellation relation and executable evaluator. A new conformance module proves:

- exact evaluator soundness against the relation;
- unique-root derivation from the submitted public identity;
- complete removal of every represented live owner in the selected root and transitive called regions;
- exact preservation of Process variables, activation counters, End history, and logical time;
- terminal cancelled projection with `initiationPending = false`, no live work, and no enabled interaction;
- exact state preservation for wrong root, wrong/stale incident, old profile, malformed association including `initiationPending = true`, and terminal-state refusal;
- the two specified retry/cancel queue orders without claiming order independence;
- strict JSON identity for the new stimulus, interaction, status, and canonical state projection.

`ScopeCancellation.lean` must gain incident-aware cleanup before the new transition delegates to it. `Execution.lean` has only 131 lines of reviewed headroom, so it receives only a narrow delegation arm; the new relation and proofs stay in their cohesive owners.

## Temporal hosting and refinement preflight

The cancellation stimulus arrives through Update name `bpmn-cancel-incident-process`. The adapter derives the Update ID through the existing canonical content-bound encoding of every stimulus field. A handler validates transport shape, enqueues the exact stimulus, and waits for the single semantic input loop; only that loop invokes `applyStimulus` and changes semantic state.

The exact Stage 1 incident profile and the exact cancellation successor select the same one-attempt incident Activity/report policy. Every unrelated profile retains the legacy Activity policy and exact prior result bytes. A focused policy oracle must prove that both incident profiles can turn the first typed technical failure into `reportEffectFailure`, while the Service Task effect profile and every other registered non-incident profile still reject that transport arm as unsupported.

After a committed cancellation, the Workflow drains already accepted handlers and returns `CancelledProcessReceipt` through ordinary Workflow completion. It does not request Temporal Workflow cancellation or termination, create a Cancellation Scope as semantic authority, cancel an Activity, inspect Event History, or derive cancellation from Workflow absence. The incident state has no in-flight Activity.

An exact Update retry recovers the retained semantic result through the identity-bound Workflow-chain recovery Query before terminal classification. A distinct later command returns `processClosed` with the cancelled receipt. Worker replacement between incident publication and cancellation must preserve Query state, accepted-result recovery, terminal receipt, and replay. The retained history must contain Update acceptance/completion and Workflow completion, with no Workflow cancellation-request, cancellation, or termination Event family.

The nearest adapter counterexamples are native Workflow cancellation, returning ordinary completed state, closing before the accepted Update result is durable, classifying a cancelled receipt as unknown, and bypassing the semantic core to delete the incident. Each receives a direct history, client, or mutation discriminator.

## Cross-target scenario and evidence

Register one answer-free scenario over the unchanged Service Task source and the new profile:

1. start with `preserved = "before-cancel"`;
2. report literal generation-1 failure;
3. cancel the exact root through the exact published incident identity.

Lean and TypeScript consume explicit report and cancellation stimuli. CIB realizes report through the configured failed job and cancellation through public root deletion. Temporal derives report from the transport-only result and accepts cancellation by Update. No target receives expected output, raw CIB identity, Temporal identity, or a caller-selected root scope.

| Rule | CIB/profile | Lean | TypeScript | Temporal | Separating evidence |
|---|---|---|---|---|---|
| `ICANCEL-ADMIT-01` | exact successor and incident partners | profile/program admission theorem | strict gate before dispatch | successor shares the exact Stage 1 incident Activity/report policy, then profile-aware Update | old-profile, pending-initiation, and extra-owner-field refusal |
| `ICANCEL-ROOT-01` | raw root linked privately | unique-root theorem | identity-first root selection | hosting address plus semantic identity | substituted nested/root identity and duplicate-parentless mutations |
| `ICANCEL-COMMIT-01` | runtime cleanup plus externally terminated history | cleanup and preservation theorem | one shared subtree removal | ordinary terminal completion | incident-only deletion, variable/counter loss, and completed-status mutations |
| `ICANCEL-REFUSE-01` | missing partner refuses projection | state-identity theorems | exact unchanged state | retained-result-first resolution | stale incident, terminal retry, and target-substitution cases |
| `ICANCEL-ORDER-01` | one selected schedule only | both ordered evaluations plus exact Retry-before-Cancel projection | both ordered tests plus strict swapped-interaction rejection | queue-order live test | swapped canonical entries, winner-priority, or confluent-result mutation |

The complete differential case compares the public cancellation trace across CIB, Lean, TypeScript, and Temporal. TypeScript and Lean separately compare private counters and full runtime preservation. The live Temporal witness stops the Worker at the incident, submits cancellation around Worker replacement, recovers the same Update result, validates the cancelled receipt, submits one distinct later command for `processClosed`, inspects Event families, replays, and includes a host-cancel mutation.

## Required, optional, and excluded functionality

Required:

- one successor profile and one closed incident-gated root cancellation command;
- one published cancellation interaction carrying exact root and incident identity;
- typed cancelled semantic state, public status, terminal receipt, and post-closure classification;
- incident-aware shared root/called-tree cleanup with exact Process-data and monotonic-history preservation;
- configured CIB phase-zero and registered raw evidence, proved Lean, independent TypeScript, four-target differential, Worker replacement, retained Update, history, mutation, and replay evidence.

Optional only if it changes no claim:

- another Worker replacement point after Update acceptance;
- another wrong-root strict-decoder fixture.

Excluded:

- general BPMN cancellation, Transaction Cancel, compensation, rollback, Event Sub-Process handling, interrupting Event behavior, modeled Terminate End reinterpretation, multi-instance cancellation, arbitrary Process deletion, caller-selected nested scope, or a reason field;
- incident retry and cancellation in one atomic command, automatic remediation, a second incident, editing retry policy, CIB retry counts or causes;
- Temporal Workflow cancellation, termination, reset, pause, Activity cancellation, Event History-derived semantics, Search Attributes, or Visibility authority;
- Product 2 incident aggregation, authorization, audit, HTTP, UI, or operator action state.

## Versioning consequences

This is one additive pre-release profile and strict-wire replacement. Existing profile, scenario, BPMN source, checked graph, IL, canonical result, CIB evidence, semantic result, and retained semantic behavior remain exact. The later shared host-lifecycle migration adds the closed v1 receipt discriminator, removes the Message ledger from every public terminal receipt, and retains the exact old result only through a decode-only adapter seam. The cancellation profile adds string Process-start data and cancellation capabilities while reusing the predecessor's executable Program shape. The semantic enum members still force exhaustive consumers to compile against their domain.

Implementation extracted terminal receipt construction, incident cancellation handling, CIB scenario validation, CIB external-termination projection, cancellation artifact projection, and the differential adapter-lifecycle relation into cohesive owners before extending their former near-limit aggregators. The [capsule cost ledger](../CAPSULE-COST-LEDGER.md) records the reproducible implementation boundary and comparison.

## Guards and review boundary

| Guard or oracle | Obligation |
|---|---|
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [artifact projection](../../scripts/contract-artifact-projections.test.ts), and [CIB fidelity](../../scripts/cib-observation-fidelity.test.ts) | Reach the new stimulus, interaction, cancelled state, receipt, and raw historic-state projection while preserving old artifacts. |
| [effect artifact consistency](../../scripts/effect-operation-artifact-consistency.test.ts) | Prove unchanged source and checked/IL structure modulo successor profile identity. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Keep the new relation, evaluator, and preservation/refusal facts public and independently buildable. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) and [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | Register the answer-free four-target cancellation schedule and reject target substitution. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep native cancellation, raw CIB identity, and Product 2 outside semantic authority. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce the named extractions, cohesive owners, registries, and reviewed line limits. |
| [review policy](../../scripts/independent-review-policy.test.ts), [document reviewability](../../scripts/document-reviewability.test.ts), and [review packet](../../scripts/semantic-review-packet.test.ts) | Require context-cold proposal review, a conditional semantic checkpoint, and closure review. |

The implementation is material because it changes the strict stimulus and status wire, runtime terminal state, enabled interactions, CIB mapping, Lean proof boundary, Temporal terminal receipt, and refinement claim. The receipt above records its completed proposal, semantic-checkpoint, and closure reviews.

## Epistemic closure and cost boundary

The exact claim is that one public generation-1 incident makes one hosting-root cancellation command eligible; committing it removes the complete live root region, preserves committed Process data and monotonic history, exposes typed cancellation, and closes durably without native Temporal cancellation. It does not establish general cancellation, compensation, arbitrary deletion, or Product 2 operations.

The strongest common-mode risk is that all project targets could agree on an invented cancellation state while CIB merely deletes runtime data. The raw CIB lane therefore retains both the externally terminated historic state and committed historic variable, and the successful control distinguishes normal completion. CIB still does not derive the project's occurrence identity, cleanup representation, or counters; those remain separately proved and implemented.

The nearest realistic wrong accounts are selecting the first parentless occurrence, accepting a caller-supplied nested scope, deleting only the incident, erasing Process variables or counters, reusing ordinary completed state, mapping runtime absence to cancellation, invoking Temporal cancellation, losing an accepted result at closure, or pretending retry/cancel order is confluent. Each has a direct strict-decoder, semantic, raw-CIB, history, or mutation discriminator.

Closure records the commit-bounded cost in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md) against the Stage 1 incident capsule and the Terminate End capsule, which changed the nearest runtime and cancellation owners.

## Re-open conditions

Re-open this specification and return to research or redesign if:

- a unique root cannot be derived from valid state without caller-supplied scope identity;
- shared cleanup cannot remove incident and called-tree owners symmetrically in Lean and TypeScript without changing already admitted behavior;
- the pinned CIB probe fails cleanup, externally terminated history, or committed-variable preservation;
- ordinary Temporal completion cannot retain a cancelled receipt and accepted Update result through the versioned terminal envelope and exact decode-only legacy seam;
- retry/cancel concurrency requires hidden priority rather than explicit queue order;
- implementation requires BPMN source, checked graph, or IL changes, native Temporal cancellation, Product 2 state, arbitrary in-flight cancellation, compensation, Transaction semantics, a second incident, or host retry facts;
- old-profile artifacts or histories must change rather than remain additive and byte-stable;
- the proved Lean lane cannot establish exact cleanup, preservation, and refusal identity within its declared bound.
