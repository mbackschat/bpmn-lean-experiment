# Temporal hosting implementation map

This detail map owns exact current Product 1 protocol, client, Workflow, Worker, runner, testkit, replay, durable-hosting, and Workflow-chain capacity status. Root routing and cross-area claims remain in [`implementation-status-router`](IMPLEMENTATION-MAP.md).

## Current boundary

One Temporal Workflow Execution chain durably hosts one semantic Process instance. Product starts are handle-free, Run identity stays private, public results are closed, and production chain enrollment enforces the implemented budgets before speculative exposure, scheduling, or terminal return. Forced Intermediate Catch Message, Intermediate Catch Timer, and Service Task effect rollover are evidenced, and Horizon 2 is closure-reviewed.

The implemented bounded Workflow-chain contract owns project Event History, payload, pending-operation, publication, chain, and recovery budgets; the safe rollover checkpoint; complete carried state; exact command-result and publication continuity; handle-free public start; stop-the-world deployment compatibility; and forced evidence. Every later repeating BPMN mechanism inherits this host boundary rather than reopening it. Temporal Run identity remains private.

Product 1 privately traverses paired E1 and occurrence-publication segments across Continue-As-New through SHA-bound descriptors and immutable latest-Run selection. Recovery, RuntimeState, paired publication, stimulus, Update, accepted-input queue, effect Activity, retained per-Run trace/publication, pending-Timer, Query-response, terminal-result, Event History, aggregate continuation, and 128-Run bounds are active before speculative exposure, scheduling, or return. Retry and conflict precede lifetime capacity, semantic terminal state and accepted-handler draining precede terminal-envelope capacity, and no public contract or host identity changes.

## Implemented

### Temporal adapter

- One semantic-lifetime Workflow receiving the start stimulus and admitted Semantic Process program
- handle-free `started | rejected` production start after semantic and host admission; success exposes only the Process-instance ID
- caller-configured Worker/client lifecycle with content-derived Workflow and command identities
- one core-owned semantic loop with committed-state Query projection, User Task Update ingress, payload-free Message Signal ingress, durable Timer wakeup, bounded effect Activity, and retained result recovery
- exact duplicate, changed-content conflict, semantic refusal, closed/unknown separation, and committed-state-only acknowledgement
- durable hosting for every closed family named in [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md#current-boundary), keeping embedded and called Process work inside one Workflow rather than assigning BPMN meaning to Child Workflows
- passive `mergeExclusive` host admission; the finite cycle witness reuses User Task Update, survives replacement, recovers one result, refuses a stale occurrence, takes both back-edges and the default exit, observes no rollover suggestion, and replays without a new host mechanism
- family-parameterized boundary-deadline scheduling with distinct typed shared-activation refusals, plus the managed Event-Based Gateway race and passive Message subscription class
- Worker replacement, accepted-result recovery, exact Query and history assertions, replay, cleanup, and a separately bundled semantic or host-bypass mutation for each distinct mechanism
- stop-the-world Workflow deployment admission: SHA-256 identities bind exact executable bundle bytes and fleet-visible Worker identities; the gate orders Product 1 ingress fencing, graceful old-Worker stop, empty authoritative poller inventory, candidate replay, candidate-only Workflow and Activity pollers, and ingress reopen; every failure stays fenced, a started bad candidate is stopped, and no old bundle is restarted automatically
- deployment compatibility evidence: the candidate replays both a retained two-argument legacy history and all three v1 Runs before polling; the old bundle fails the closed v1 Run on the `bpmn-workflow-chain-v1` marker; mixed old/new or incomplete poller inventories are refused; the legacy open User Task then resumes under the candidate and reaches the exact semantic-core terminal state without changing public Product 1, BPMN, or CIB facts
- forced Intermediate Catch Message rollover: a wrong-channel Signal is durably accepted and reduced once as semantic rejection immediately before Run 1 closes; the exact subscription and operation-addressed channel survive into Run 2; the valid delivery is sent only after that closure, commits once, and crosses into Run 3 as the trailing User Task; exact duplicate and changed-content recovery add no semantic transition; the closed v1 receipt, pure semantic-core trace, four exact Signal payloads, and all three replayed Runs preserve the registered standards-only Message profile and its unchanged User Task CIB premise
- forced Intermediate Catch Timer rollover: Run 1 closes before scheduling the committed definition-derived `PT1S` Timer; a fresh successor defers the still-triggered Event History threshold until it retains work, preserving the exact Timer occurrence, 1,000 ms deadline, and logical time zero; Run 2 records exactly one matched Timer-started/Timer-fired pair, derives one `fireTimer` stimulus, reaches the pure semantic-core terminal trace, and replays both Runs under the registered standards-only Timer profile and its unchanged `CIB-AGR-0004`/`CIB-CFG-0001` classifications
- forced Service Task effect rollover: Run 1 closes with the committed effect occurrence, neutral descriptor, empty request arguments, and content-bound transport key before any Activity is scheduled; Run 2 exposes the same semantic wait while one probe Activity is held in flight, then records exactly one schedule/start/completion lifecycle, derives one `completeEffect` stimulus, reaches the pure semantic-core terminal trace with one external mutation, and replays both Runs under the registered success-only profile and unchanged `CIB-EXT-0001`/`CIB-CFG-0002` classifications
- canonical start/completion data, effect transport, interaction/task projection, closed v1 receipts, private exact legacy normalization, and strict external-runtime configuration
- one live product example per distinct host mechanism, with reused mechanisms checked without a Temporal service and optional time-skipping calibration outside default verification
- direct `client.start` hosting for exact registered Message Start identity through the ordinary Workflow start input, with wrong Interface Operation rejection before Workflow creation, service acceptance while no Worker polls, later User Task completion, no Signal Event, exact history replay, and a test-owned Signal-With-Start discriminator
- test-owned one-action Temporal Schedule hosting for the registered Timer Start profile, with pre-Schedule zero-create refusal, Worker absence through the due occurrence, an exact stored Workflow-ID base kept distinct from the opaque service-returned Workflow/Run identity, base-as-execution refusal, exact downstream User Task completion, ten-event history inspection, action exhaustion, stored-action and direct-start mutations, and replay
- passive hosting for the registered Terminate End profile through existing User Task Updates, including Worker replacement after Trigger, committed-result recovery, Outer-only Query, stale Sibling refusal with exact state preservation, terminal completion, 20-event history inspection and replay, plus a test-owned Workflow whose wrong global cancellation closes instead of publishing Outer
- configured Task hosting through the existing Probe Activity and User Task Update path, including Worker replacement during the active Activity attempt, idempotent result reconciliation, exact terminal state, history inspection and replay, plus a test-owned effect bypass that exposes the User Task early
- registered Boolean completion through the existing Update path, with Worker replacement, old-profile refusal then valid completion, tagged projections, history/replay, and stringification/outside-core mutations
- registered User Task assignment/form metadata through the existing Query and Update path, with Worker replacement, exact passive projection, Boolean completion, metadata-free terminal state, history/replay, old-profile control, a Query-omission mutation, and a same-task source field-type variation bound in the Workflow-start program and Query
- registered Service Task incident hosting with an unchanged bare semantic Activity result union, exact successor-only one-attempt policy, host-only `technicalFailure`, Workflow-derived report command, committed incident Query, content-bound retained retry Update, exact effect restoration, Worker replacement, terminal result recovery, two-command race, typed post-retry host failure, history assertions, and replay
- registered incident-cancellation hosting with the shared one-attempt Activity/report policy, content-bound exact-root/exact-incident Update, Worker replacement while the incident is open, retained accepted-result recovery, typed cancelled receipt through ordinary Workflow completion, distinct late `processClosed`, preserved committed data, history and replay, and native-termination/completed-receipt mutations
- a Workflow revision accumulator/cursor Query, strict producer validation, representation-free client, opaque-locator engine API, and real retention evidence covering positive cursors, Worker replacement, terminal retrieval, repeated activation identity, pure Query history stability, and exact replay
- production Product 1 enrollment in the exact `bpmn-workflow-chain-v1` branch through a fixed Initial host envelope, with explicit production budgets, committed RuntimeState, bounded command recovery, and publication heads/current/open anchors carried across Runs; retained direct two-argument Workflow starts remain outside the patch for exact pre-v1 replay compatibility
- chain-relative recovery for User Task, Message, Retry, and Cancel through a private identity-echoing latest-Run Query, preserving retry/conflict precedence, capacity/closure classification, Call Activity identity separation, and public host-identity privacy
- production capacity: 512 recovery entries; atomic 64 KiB state, paired batches, and stimuli; 1,500 Updates/eight in flight; a 64-entry/256 KiB queue; refusals precede transport, acceptance, or evaluation; exact fills request rollover; failures omit Run IDs/candidates; failed histories replay
- effect Activity capacity: 64 KiB request before scheduling and result before return with Workflow revalidation; fixed 16 KiB cause-free exhaustion detail; oversized-result live failure at revision 3 replays
- retained per-Run capacity: exact incremental canonical accounting for trace plus aligned E1/E2 batches, a hard 2 MiB ceiling before mutation, and proactive rollover with room for the closing candidate plus one fence-racing Signal; a production-bound witness grows only rejected-command trace, crosses one rollover, preserves the open occurrence and early result, completes, and replays both Runs below the Event History trigger
- pending-Timer capacity: committed Timers are checked against 64 before scheduling; 65 fails through typed chain capacity, while admitted profiles retain one live Timer
- Event History capacity: lower-only v1 count and byte limits with production values of 8,000 Events and 8 MiB; deterministic SDK-suggestion, count, then byte trigger selection at the stable checkpoint; every trigger is deferred in a fresh continuation Run until that Run retains work, preventing an empty Continue-As-New loop without weakening continuation-input bounds; an executable Update/Signal, Timer, Activity-result, Workflow Task, and continuation cost table that fits one maximum admitted activation inside the 10,240-Event and 10 MiB warning margins; and live count-triggered three-Run plus byte-triggered two-Run witnesses that preserve the registered cyclic User Task trace, outcomes, occurrence identities, terminal receipt, and replay without using Event History as BPMN or CIB state
- aggregate continuation capacity: each of the six separately transported canonical payloads keeps its individual bound, their exact byte lengths sum under 448 KiB before successor emission and incoming admission, exact fit succeeds, and one byte over is reported without adding a synthetic array wrapper; successor overflow remains typed chain capacity while malformed or oversized incoming continuation remains a distinct fail-closed continuation defect
- Workflow-chain lifetime capacity: a valid required 128th Run carries 127 contiguous retained descriptors plus complete state, recovery, and publication; a required 129th successor fails nonretryably as typed chain capacity before the current segment directory is read or extended; an incoming ordinal 129 remains a distinct fail-closed continuation defect; descriptor-directory and Run limits remain independent and no ordinal or Run ID enters a public result
- private paired E1/E2 per-Run publication segments with strict descriptor/directory validation and SHA-bound continuation; immutable latest selection followed by an exact selected-Run Query; Run-local pages; selected retained-Run loss mapped to `unavailable`; legacy fallback only for `QueryNotRegisteredError`; and live evidence over Run 1 `0..8`, Run 2 `8..12`, Run 3 `12..16`, cursor pages `0/4/8/12/16`, two occurrence identities spanning Run boundaries, unchanged terminal receipt, no public Workflow/Run identity, and replay of all three Runs
- selected-Run Query-response capacity: a 192 KiB canonical UTF-8 ceiling at producer and client boundaries; the producer returns the largest complete aligned E1/E2 batch prefix that fits, never splits a command batch or Run segment, and withholds current/open snapshots until the page reaches the immutable head; exact-fit, one-byte-lower, oversized-client, malformed-pair, deterministic-remainder, and real BPMN cycle evidence preserve the original semantic-core batches unchanged
- terminal-result capacity: the exact private v1 receipt-plus-recovery envelope is measured under a 192 KiB canonical UTF-8 ceiling immediately before return; exact production-bound bytes return unchanged, while one byte over becomes nonretryable typed chain capacity after every accepted handler has its semantic result; the retained failed Run resolves the closing result and identity conflict before returning the exact terminal receipt for unseen work, exposes no Run identity or recovery material publicly, and replays

## Explicitly absent

### Temporal adapter

- retained result beyond Temporal retention
- production canonical-observation API
- protocol that imposes caller order on concurrent distinct commands
- semantic policy copies in the Workflow
- Message payloads, key-based/global correlation, modeled Message throw, and cross-Workflow Message routing
- Message ingress broker/router, definition-version fanout, or multi-target publication receipt
- committed Event History fixtures
- engine-global task discovery through Search Attributes; Product 2 instead owns its current-task projection from published engine facts
- any new Temporal primitive for User Task metadata
- a second semantic incident, arbitrary retry count or backoff, exception/cause projection, cancellation beyond the exact incident-gated root command, or Product 2 incident ingress
- any patch branch other than the exact `bpmn-workflow-chain-v1` checkpoint enrollment
- legacy representation fallback beyond the exact decode-only pre-v1 terminal-receipt normalization seam
- production history baseline
- general Worker versioning
- expression evaluation beyond pure Simple Boolean v1
- integer or String-list values outside exact M6 User Task completion, nested or heterogeneous values, or general effect faults/Error propagation beyond the direct-parent internal slice
- Activity heartbeats
- host cancellation recovery and exceptional child-scope interruption or propagation beyond the exact direct-parent Error slice
- timer forms/races/cancellation beyond the exact capsule
- post-retention publication reconstruction or archive
- timer forms or races beyond the implemented timer and boundary-event capsules, compensation, and Event Sub-Processes; Message payload, key-based or global correlation, modeled throw, Message Flow, and other Message Event loci beyond the direct payload-free catch
- multi-instance, migration, and Workflow-chain policies beyond the approved bounded Continue-As-New contract
- immutable profile or production Event History compatibility
- task inbox

## Evidence owners

The separate protocol, client, Workflow, Worker, runner, and testkit packages under [`packages/temporal-adapter/`](../packages/temporal-adapter/), [production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), and [Temporal evidence map](TEMPORAL-TEST-EVIDENCE-MAP.md) bind these claims. The [archived Workflow-chain proposal](archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md) retains the selected-design and review rationale.

## Nearest unsupported claims

- **Post-retention publication:** reconstruction or archive remains outside the bounded Workflow-chain contract, whose public result is `unavailable` after the selected retained Run disappears.
- **Workload isolation:** complete Horizon 3 with queue and Worker isolation, backpressure, tenant fairness, capacity observability, shared-store failover, representative mixed-model tests, and published throughput, latency, saturation, recovery, and cost evidence. More Workers or queue partitions alone do not constitute this result.
- **Hosting breadth:** Message payload and routing, general Worker versioning, Activity heartbeats, Search Attributes, general cancellation recovery, and broader timer, effect, and expression families remain absent.
