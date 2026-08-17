# Temporal Workflow-chain bounds and Continue-As-New proposal

## Status

**Draft for independent review and owner approval.**

This proposal selects the smallest complete Horizon 2 contract for Product 1. It does not authorize production implementation yet. Approval would authorize the bounded contract below, followed by the required first-green semantic checkpoint and closure review.

**Recommendation:** approve the bounded in-Temporal design. It preserves exact command and publication behavior without adding a Product 1 database, and it fails explicitly when a declared capacity is exhausted instead of weakening retry, conflict, history, or replay guarantees.

## Decision

One semantic Process instance remains one Temporal Workflow Execution chain addressed by one Workflow ID. Continue-As-New may replace a Run at a safe adapter checkpoint, but the chain remains one Process at every public engine and platform boundary. Temporal Run IDs and chain navigation remain private adapter facts.

The first implementation uses a versioned, bounded continuation carried through Temporal. It does not add external persistence. The continuation retains complete current semantic and host state, a compact lifetime command-recovery ledger, the current publication folds, and a bounded private segment directory. Prior publication and diagnostic batches remain in their closed Runs and are fetched privately while Temporal retains them. Product 2 continues to own durable platform projection rather than becoming Product 1 semantic authority.

The supported pre-release Process lifetime is finite and explicit: at most 128 Runs and at most 512 distinct recoverable external commands, subject also to the encoded-byte budgets below. Capacity exhaustion is a typed adapter infrastructure failure. It is never completion, cancellation, rejection, semantic failure, or unsupported BPMN behavior.

## Source basis and authority

This proposal specializes [Horizon 2 of the scalability roadmap](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md#horizon-2-bound-product-1-workflow-chains) and reopens the current [production lifecycle exclusion](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#optional-and-excluded-functionality). [Temporal execution research](research/TEMPORAL-EXECUTION-RESEARCH.md#continue-as-new) owns the source-grounded hosting facts: Continue-As-New starts a new Run with the same Workflow ID and empty Event History; carried state must be explicit; handlers must finish before rollover; Update deduplication is Run-local; and Run identity is not semantic identity.

The selected operating margins are below Temporal's documented default warnings and limits: 10,240 Events or 10 MiB warning thresholds, 51,200 Events or 50 MiB hard limits, a 256 KiB payload warning and 2 MiB payload limit, a 4 MiB transaction limit, ten in-flight Updates, and 2,000 total Updates per Run. These Temporal figures are ceilings and evidence inputs, not the project contract.

No BPMN requirement, CIB relationship, semantic profile, Semantic Process IL representation, pure semantic-core transition, canonical observation, or Lean theorem changes. This is a material Temporal refinement and public lifecycle-contract change, so it requires proposal, first-green semantic-checkpoint, and closure review.

## Required public contract

The public engine address remains the semantic Process-instance identity plus its opaque Process locator. Compile, start, observation, and command operations never accept or return a Run ID, Run ordinal, segment locator, Continue-As-New marker, or Temporal suggestion.

Continue-As-New produces no BPMN start, completion, cancellation, token, scope, timer, effect, incident, command, transition, or occurrence fact. It does not reset semantic logical time, public execution revision, flow-node occurrence identity, command identity, or definition identity.

An exact retry of any retained external command returns the first semantic outcome across every Run in the chain. Reuse of its semantic command ID with different canonical stimulus content remains `BpmnCommandIdentityConflict`. A distinct command submitted after semantic terminal closure remains `processClosed`. A missing or expired Workflow chain remains `processUnknown` only under the existing retention contract. Capacity failure and transient rollover routing remain infrastructure failures and are not coerced to any of those results.

The terminal Process receipt becomes a versioned semantic-lifecycle receipt containing definition identity, Process ID, Process-instance ID, and final committed state. The current host-only `messageDeliveryRecords` array moves out of that public receipt into the private bounded command-recovery envelope. The Product 1 client uses the private recovery data to preserve the exact existing Message result and conflict behavior, then exposes only the terminal receipt. This deliberately corrects a host-mechanism leak; it changes no Message semantic outcome.

The client must decode retained legacy receipts for already-started Workflows and normalize them to the new public receipt. New Workflows return only the new receipt contract. A public union that makes callers branch on the old host ledger is excluded.

## Budget measurement

`KiB` means 1,024 bytes. Encoded-value budgets measure the UTF-8 bytes of the existing canonical JSON representation before the default Temporal data converter adds Payload metadata. Every accepted value must pass the same pure measurement in the sending client or Activity and again at its deterministic Workflow consumer when a consumer exists. The gap between the largest project payload budget, 192 KiB, and Temporal's 256 KiB warning leaves converter and metadata headroom.

The Workflow measures a complete candidate successor before publishing or assigning it. If a semantic-core step would exceed a state, recovery, publication, or result budget, the adapter exposes none of that speculative candidate as committed and fails with the typed capacity failure. The semantic core remains pure and unaware of host budgets.

All constants belong to one versioned Product 1 protocol module and are verified against this table. Deployment configuration may lower a test threshold but may not raise a production threshold without reopening this proposal.

| Budget | Production bound | Required behavior |
|---|---:|---|
| Event History rollover trigger | SDK suggestion, or 8,000 Events, whichever occurs first | Request rollover at the next safe checkpoint; do not begin a new effect after the trigger |
| Event History byte rollover trigger | SDK suggestion, or 8 MiB, whichever occurs first | Same rule as Event count |
| Retained per-Run trace plus execution and occurrence batches | 2 MiB canonical bytes | Request rollover before appending a candidate that would cross the bound |
| Total accepted Updates per Run | 1,500 | Fence new Updates and roll over before Temporal's 2,000-Update limit |
| Concurrent in-flight Updates | 8 | Reject excess before Temporal accepts the Update |
| Accepted semantic-input queue | 64 entries and 256 KiB | Fence new Updates on exhaustion; a Signal overflow fails the Run as infrastructure |
| Pending Temporal Activities | 1 | Preserve the current single-effect host invariant |
| Pending Temporal Timers | 64 | Reject source admission or fail before scheduling a sixty-fifth timer |
| Pending Child Workflows, external Signals, and external cancellation requests | 0 | Remain unsupported by this host contract |
| Semantic Process program | 192 KiB | Reject before Workflow start; carry inline and verify exact identity in every Run |
| Initial start stimulus | 64 KiB | Reject before Workflow start |
| Signal, Update, or derived semantic stimulus | 64 KiB | Reject before transport where a response exists; fail closed for an oversized accepted Signal |
| Committed semantic RuntimeState | 64 KiB | Preflight the candidate before publication and assignment |
| One execution and occurrence publication batch together | 64 KiB | Refuse the candidate before either publication advances |
| Command-recovery ledger | 512 entries and 96 KiB | Fail at a safe checkpoint when either lifetime bound is reached |
| Publication continuation and segment directory | 128 Run descriptors and 64 KiB | Fail before a 129th Run would be required |
| Query response | 192 KiB | Return the largest complete batch prefix that fits; one batch is already bounded |
| Terminal Workflow result envelope | 192 KiB | Preflight before terminal completion |
| Effect Activity request or result | 64 KiB each | Measure before scheduling and before Activity return |
| Effect Activity failure projection | 16 KiB | Emit one bounded typed failure without copying an unbounded cause graph |
| Continue-As-New carried arguments in aggregate | 448 KiB | Split the versioned fields into separately measured Temporal arguments; no individual argument exceeds its row above |
| Workflow chain | 128 Runs | A required 129th Run fails with the typed capacity failure |

The 8,000-Event and 8 MiB triggers leave at least 2,240 Events and 2 MiB below Temporal's default warnings. The adapter still honors an earlier SDK suggestion. Direct Temporal clients, externally raised deployment limits, and input floods outside the published Product 1 client are unsupported and do not enlarge this contract.

## Versioned continuation

The private continuation schema is `bpmn-lean.workflow-continuation.v1`. The existing Workflow type gains one stable patch ID, `bpmn-workflow-chain-v1`, so retained pre-Horizon histories replay their old commands before enrolling in the continuation path. Removing or renaming that patch requires the ordinary Temporal patch-removal sequence and retained-history replay evidence.

The Workflow arguments separate the immutable Program, current semantic state, command recovery, and publication continuation so each remains independently measurable below its payload budget. The initial caller supplies no continuation. A continued Run accepts only the exact v1 discriminator, exact definition and Process identity, a positive successor ordinal, and internally consistent hashes, revisions, and segment boundaries.

The complete carried state is:

| Carried fact | Reason it is required |
|---|---|
| Exact Semantic Process program and semantic-profile identity | Preserve the admitted definition and avoid an external retrieval dependency |
| Start identity and semantic Process-instance identity | Preserve public Process identity and terminal receipt identity |
| Complete committed RuntimeState | Preserve tokens, scopes, variables, logical time, User Tasks, Message subscriptions, timers, effects, incidents, cancellation state, and nested Process state |
| Run ordinal and first-execution chain identity | Enforce the private chain bound and navigate retained segments without exposing Run identity |
| Recoverable external-command ledger | Preserve exact result recovery, duplicate coalescing, and conflicting-content detection across Runs |
| Execution publication head and current snapshot | Keep one global revision sequence and current committed position |
| Flow-node occurrence head, current open occurrences, retained private anchors, and last commit time | Preserve occurrence identity, pairing, and monotonic time across Runs |
| Closed-segment directory | Locate retained prior publication and diagnostic segments by private Run ID and exact revision interval |
| Adapter schema and patch identity | Reject incompatible continuation rather than reinterpret it |

No accepted semantic-input queue, active handler, pending Activity, armed Timer promise, scheduler callback, or partially materialized publication is carried. The rollover algorithm must first reduce those host facts to the committed state above. Open semantic timers, effects, waits, and incidents are carried inside RuntimeState and are deterministically re-established by the new Run.

## Command-recovery ledger

Only externally retryable commands need lifetime recovery. Start and adapter-derived Timer or effect stimuli are reconstructed from committed state and cannot cross the safe checkpoint while pending. Each recovery entry contains the exact semantic command ID, the SHA-256 digest of the existing canonical typed stimulus encoding, and its first `CommandOutcome` or durable identity-conflict resolution. The ledger uses the same canonical encoder and digest already used by content-bound Update identity.

An exact command ID and equal stimulus digest recovers the first result without entering the semantic core. An exact command ID and different digest produces the existing identity-conflict request failure. A previously unseen ID may enter the ordered input queue only while both ledger bounds have remaining capacity.

The 512-entry and 96 KiB limits are conjunctive. Long command IDs can exhaust bytes before entries. Once a newly committed result fills either bound, its waiting Update handler must receive that result, then the Workflow reaches the safe checkpoint and fails with `BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED` unless the Process is already terminal. The adapter never evicts an entry, uses a recent-window approximation, relies on Run-local Update deduplication, or forgets enough information to treat an old conflict as new work.

## Publication and trace segmentation

Execution publication, flow-node occurrence publication, and the harness-only canonical trace are segmented per Run. A rollover closes the current segment only after its last command result, execution batch, occurrence batch, current fold, and trace observations are mutually consistent. The next Run starts empty local batch arrays but retains the global heads, current folds, open occurrence anchors, and a descriptor for every closed segment.

The Product 1 client resolves a public cursor against the current Run's bounded private segment directory, queries the selected Run by private Run ID, and returns a page whose public `headRevision` is the current chain head. A page never splits a command batch or crosses a Run boundary. The next request at that segment boundary selects the following Run. Execution and occurrence pages always select the same segment and revision range.

If Temporal no longer retains a selected closed Run, the client returns the existing `unavailable` result. It does not return `gap`, invent a batch from Event History, or derive an occurrence from a state difference. Availability after Temporal retention remains unsupported. Product 2's independently persisted projection remains the durable operator-history owner and never becomes semantic authority.

The terminal result does not copy publication segments or the segment directory. Closed-Workflow observation continues through retained Queries and private segment traversal. The terminal result carries only the bounded terminal receipt and private command-recovery material required to close the command-response race.

## Safe rollover algorithm

Rollover is owned only by the main Workflow loop. A Signal handler, Update handler, Query handler, Timer continuation, Activity continuation, or scheduler helper cannot call Continue-As-New.

At every stable main-loop checkpoint, the Workflow applies this order:

1. If semantic state is terminal, fence new Updates, drain already accepted handlers and queued stimuli, and complete normally. Terminal state wins over a simultaneous rollover trigger.
2. If no rollover trigger or capacity boundary is present, resume the ordinary wait or effect loop.
3. Otherwise set a deterministic rollover fence. Validators reject newly arriving Updates with retryable `BpmnWorkflowRolloverInProgress` before Temporal accepts them. Signal handlers continue to validate, deduplicate, and synchronously enqueue accepted Messages.
4. Drain the accepted queue through the existing single semantic loop. Finish every accepted handler. Recheck the queue after `allHandlersFinished()` because a Signal accepted before the barrier may have appended work.
5. Repeat step 4 until `allHandlersFinished()` and an empty queue hold in the same Workflow activation. Do not start a new Activity or arm a new durable Timer while the fence is set.
6. Validate the complete continuation, close the current publication segment, and call Continue-As-New synchronously with no intervening `await`.

A public Update that races the fence retries the same content-bound request against the current Workflow ID. A public Signal is always sent without a Run ID. The forced evidence must demonstrate that a Signal accepted immediately before the closing command is applied exactly once, while one sent after the old Run closes reaches the new Run or produces a retryable infrastructure result that the client resubmits exactly once. No correctness claim rests on caller timing.

An open User Task or Message wait has no pending Temporal operation and may roll over. A durable Timer wait rolls over only before arming or after its callback has been reduced to committed semantic state. An effect rolls over only before scheduling or after its Activity result has been reduced; an in-flight Activity is never abandoned or copied. The current host admits no Child Workflow or outgoing external operation.

## Capacity and failure contract

`BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED` is a non-retryable typed Workflow application failure owned by the adapter. Its bounded details name only the exhausted budget, configured bound, observed value, Process-instance identity, current public revision, and Run ordinal. They contain no Program, RuntimeState, command, Activity result, trace, or Run ID.

The failure can occur only at a stable checkpoint or before an oversized candidate is exposed. It preserves the last committed state in retained Temporal history but does not publish a synthetic semantic transition. Product 1 command clients and Product 2 surface it as infrastructure unavailability requiring operator intervention. Automatic Workflow retry, automatic Workflow-ID reuse, silent continuation with truncated state, and automatic migration to external storage are excluded.

Malformed continuation, inconsistent segment boundaries, digest mismatch, unsupported schema, and lost committed anchors fail with distinct typed adapter defects. They do not reuse the capacity error and do not attempt best-effort recovery.

## Cross-target invariant matrix

| Invariant | Pure semantic core | Temporal Workflow | Product 1 client | Product 2 |
|---|---|---|---|---|
| One semantic Process across Runs | Unchanged Process-instance identity | Carry exact state under one Workflow ID | Address only the opaque Process locator | Store only semantic instance identity |
| Exact retry and conflict | Existing command outcomes | Carry bounded recovery entries | Retry by content-bound identity and normalize old/new receipts | Reuse published commands; never inspect Run IDs |
| Ordered committed state | Existing `applyStimulus` order | One fenced queue and main loop | No caller-order claim for concurrent requests | Consume numbered publications |
| Execution and occurrence continuity | Existing unnumbered complete deltas | Preserve global heads and open anchors | Traverse private segments | Persist validated suffixes transactionally |
| Timer and effect continuity | Open interactions remain semantic state | Re-establish only from committed RuntimeState | No special rollover API | No Temporal-history inference |
| Capacity exhaustion | No semantic outcome | Typed host failure with last commit retained | Infrastructure failure | Operator-visible unavailability |
| Run identity | Absent | Private navigation only | Never returned | Never stored as domain identity |

## Required executable evidence

The first production test must set a test-only Event History threshold low enough to force at least two Continue-As-New boundaries while every production byte and count ceiling remains unchanged. It must fail first because the current Workflow retains one Run and unbounded arrays. Green evidence must include:

- open User Task across rollover, exact completion, exact duplicate recovery, conflicting-content failure, terminal receipt, and replay of every Run;
- Message wait across rollover, a Signal accepted immediately before rollover, a post-boundary retry, exact duplicate coalescing, conflicting-content recovery, and no duplicate semantic transition;
- open Timer across rollover without a duplicate or lost firing and with unchanged semantic logical time;
- open effect before scheduling and a completed effect after Activity return, with no abandoned or duplicated Activity;
- execution-publication and flow-node-occurrence pages before, at, and after a segment boundary, including open occurrence pairing and a retained-segment `unavailable` classification;
- Worker replacement before the fence, after the fence, and in the new Run;
- terminal completion winning over a simultaneous rollover suggestion;
- forced command-entry, command-byte, queue, Program, RuntimeState, publication, Query, terminal-result, Activity, Run-count, and malformed-continuation failures at their exact boundary;
- history inspection proving each rollover command, no Workflow retry, no duplicate effect, and no public Run identity;
- replay of the legacy pre-patch history and every new Run under the candidate Worker bundle;
- an adversarial mutation that drops the immediately pre-rollover Message, which must fail the exact trace and command-result oracles;
- an adversarial mutation that clears the recovery ledger on rollover, which must fail duplicate and conflict recovery in the next Run;
- an adversarial mutation that resets publication revision or open occurrence anchors, which must fail cross-segment continuity.

The decisive focused gate is `./scripts/pnpm.sh run test:temporal`. Documentation, receipt, package-boundary, and source-hygiene consequences also run through `./scripts/pnpm.sh run test:infrastructure`. The root integrator then runs `./scripts/verify.sh`; every JavaScript or TypeScript gate follows the [long-running command receipt policy](TESTING-SPEC.md#long-running-javascript-and-typescript-commands).

## Atomic owner consequences

Approval changes no file by itself. The later implementation checkpoint must update these owners atomically with the production contract:

- [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) for the implemented lifecycle, terminal receipt, command recovery, rollover, failure, and exclusions;
- [TEMPORAL-TEST-EVIDENCE-MAP.md](TEMPORAL-TEST-EVIDENCE-MAP.md) and [TESTING-SPEC.md](TESTING-SPEC.md) for the exact forced-rollover, mutation, history, replay, and limit gates;
- [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) and [PLAN.md](PLAN.md) for the implemented and next-work boundary;
- [INTERMEDIATE-CATCH-MESSAGE-SPEC.md](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) and [SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md](capsules/SERVICE-TASK-INCIDENT-CANCELLATION-SPEC.md) for the host-only terminal-ledger move without changing their semantic accounts;
- [temporal protocol](../packages/temporal-adapter/protocol/src/contracts.ts), canonical command identity, lifecycle validators, and package guide for versioned continuation, budgets, failure types, internal terminal envelope, and legacy receipt normalization;
- [Temporal Workflow](../packages/temporal-adapter/workflow/src/workflow-implementation.ts), command/publication integration, publication accumulators, Message ledger, terminal receipt, and scheduler owners for the safe checkpoint and carried state;
- [Product 1 Temporal client](../packages/temporal-adapter/client/src/process-client.ts), shared semantic Update resolution, Message ingress, execution publication, and occurrence publication for chain-relative retry and private segment traversal;
- [Temporal testkit](../packages/temporal-adapter/testkit/test/production-lifecycle.test.ts) and retained history fixtures for the real-server and adversarial evidence.

`workflow-implementation.ts` currently has only 39 nonblank lines before the 600-line review target reported by `node scripts/what-binds.ts`. The implementation must first extract the existing handler or scheduler responsibilities in a separate non-semantic refactor rather than grow that owner through the review target. The protocol and client owners retain headroom, but new continuation and budget contracts should still use cohesive dedicated modules instead of accumulating unrelated lifecycle variants in `contracts.ts`.

No Lean, BPMN source, Semantic Process IL, semantic-core, CIB, shared wire-contract, platform database, or architecture-package owner changes. If implementation discovers that exact command recovery or publication continuity needs external Product 1 persistence, it stops and reopens this proposal before adding a package, database, Activity, or new authority boundary.

## Excluded functionality and reopen conditions

This proposal does not claim an unlimited Process lifetime, history availability after Temporal retention, automatic capacity expansion, external payload storage, payload codecs, archival restoration, multi-cluster replication, cross-Namespace operation, Workflow retry, Workflow Reset, Child Workflow partitioning, BPMN multi-instance behavior, or Horizon 3 throughput and latency capacity.

Reopen before raising any production budget, changing the 128-Run or 512-command lifetime, evicting recovery entries, carrying an accepted queue, exposing Run identity, changing the Process-to-Workflow cardinality, retrieving the Program externally, making Product 2 persistence part of command recovery, or treating capacity exhaustion as a semantic result.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `aa2a75457d3a003e40d1400a8da70dc4185817a8` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
