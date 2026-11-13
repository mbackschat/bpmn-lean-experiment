# Temporal Process lifecycle specification

## Status

**Implemented current pre-release contract.**

## Scope

This specification defines the production lifecycle shared by the admitted semantic capsules. It answers how semantic and host-capability admission is reported before Workflow creation, when the Temporal Workflow closes, how accepted command retries recover their semantic result, and how a distinct command addressed after closure is classified without inventing BPMN behavior.

It does not itself add BPMN semantics, a task inbox, general host cancellation, an external database, or an immutable deployment/history baseline. The [Workflow-chain production contract](#workflow-chain-production-contract) below owns bounded continuation, recovery, publication traversal, and capacity; the [archived proposal](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md) retains its selected-design and review rationale. The [Intermediate Catch Timer specification](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) composes one semantic-core-owned wait with this lifecycle without making physical timer state semantic authority, the [Intermediate Catch Message specification](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) and [Message-addressed Receive Task specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) compose their separately checked Message loci with the same passive Signal and private command-recovery lifecycle while retaining distinct channel arms, the [ordinary embedded Sub-Process completion specification](kernel/semantics/SCOPES-SEMANTICS-SPEC.md) keeps the child definition-scope lifecycle inside the same semantic state machine without a Temporal Child Workflow, and the [Sub-Process Error-propagation specification](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) performs regional semantic cancellation without a Temporal cancellation command. The [Terminate End Event specification](kernel/semantics/SCOPES-SEMANTICS-SPEC.md) likewise computes containing-scope cancellation entirely inside the semantic core and reuses ordinary scope completion without a host cancellation command. The [bounded Call Activity specification](kernel/semantics/WORK-SEMANTICS-SPEC.md) composes one caller plus one linked called semantic Process instance under the caller's Workflow address, separates that host address from the called task identity, survives Worker replacement, and replays without a Temporal Child Workflow. The [Sequential Multi-Instance specification](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md) composes one exact controller/User-Task/lifetime-Timer family with pre-arming continuation, inner-task turnover, natural aggregation, outer interruption, bounded recovery, and replay. The engine runner adds one exact known-Process User Task detail Query whose caller-selected Process-variable projection remains read-only and non-durable.

## Selected lifecycle

Adopt a **semantic-lifetime Workflow with a retention-bounded closed-result boundary**:

- one Temporal Workflow Execution is addressed by the caller/root semantic instance and hosts its admitted aggregate semantic execution while active: existing closed profiles contain one semantic Process instance, while the bounded Call Activity contract contains that caller plus its linked called semantic Process instance in the same core state without assigning BPMN identity to a Temporal Child Workflow; the exact called-task/caller-task lifecycle has durable Query, Update-result recovery, terminal receipt, history, mutation, and replay evidence;
- semantic program admission and the separate Temporal host-capability predicate both pass before Workflow creation, otherwise start returns a typed `rejected` result;
- the Workflow completes after the semantic core reaches terminal completed state and every already accepted handler has completed;
- a retry of an already accepted exact command recovers the original Update result;
- a distinct command first addressed after Workflow closure returns a typed adapter `processClosed` result, not semantic `rejected`;
- an address that Temporal no longer retains returns `processUnknown`;
- Workflow-ID reuse and Update-With-Start command ingress are forbidden, so a late command cannot create another semantic Process instance.

Temporal lifecycle results and semantic command outcomes remain different types.

## Alternatives

| Account | Benefit | Rejection or deferral rationale |
|---|---|---|
| Keep the semantic Workflow alive permanently | Every later command reaches the core | Host status remains running after semantic completion, cleanup has no semantic bound, history grows until Continue-As-New, and another retention policy is still required |
| Add a durable router or parent entity now | Stable address survives closure of the process Workflow | Introduces another durable state machine, result-publication races, cross-Workflow ordering, cleanup, and identity without a current retention or discovery consumer |
| Close with semantic completion and recover retained results | Host lifetime matches semantic lifetime and uses Temporal’s existing accepted-Update record | Selected; availability after history retention is explicitly bounded and may later justify a tombstone or router |

The executable comparison and pinned platform facts are recorded in the [Temporal production-lifecycle experiment](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/experiments/TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md).

## Public result contract

```ts
type BpmnProcessStartResult =
  | Readonly<{
      kind: "started";
      processInstanceId: string;
    }>
  | Readonly<{
      kind: "rejected";
      failure: BpmnProcessAdmissionFailure;
    }>;

enum ProcessCommandResultKind {
  Semantic = "semantic",
  ProcessClosed = "processClosed",
  ProcessUnknown = "processUnknown",
}

interface CompletedProcessReceipt {
  readonly format: "bpmn-lean.process-terminal-receipt.v1";
  readonly definition: SemanticProcessIdentity;
  readonly processId: string;
  readonly processInstanceId: string;
  readonly finalState: StateObservation & {
    readonly status: ProcessStatus.Completed;
  };
}

type ProcessCommandResult =
  | Readonly<{
      kind: ProcessCommandResultKind.Semantic;
      commandId: string;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: ProcessCommandResultKind.ProcessClosed;
      commandId: string;
      receipt: CompletedProcessReceipt;
    }>
  | Readonly<{
      kind: ProcessCommandResultKind.ProcessUnknown;
      commandId: string;
      processInstanceId: string;
    }>;
```

`started` means semantic execution admission and the separate Temporal host-capability predicate both passed and Temporal created the Workflow. It exposes only the validated semantic Process-instance ID. SDK handles, clients, Run IDs, result polling, history, and description capabilities remain adapter-private. `rejected` means either the Semantic Process/start pair is unsupported, the host cannot schedule its potential wait-set shape, or the Start's semantic command rolls back because a Choice without a default matches no condition (`startRolledBack`, [`XND-HOST-01`](kernel/semantics/FLOW-SEMANTICS-SPEC.md)). The adapter returns this result before `client.start`; Workflow execution does not classify admission.

`semantic` means the command was accepted by the Workflow or its previously completed exact Update was recovered. Live execution and retry recovery return the same public shape.

`processClosed` means the non-reusable Process address is retained, its Workflow has a valid completed semantic receipt, and no accepted Update exists for this exact command. It is an adapter lifecycle result. It must not be converted to `CommandOutcome.Rejected`, appended to the canonical BPMN trace, or presented as a Lean/CIB/TypeScript semantic transition.

`processUnknown` means no retained Workflow or terminal receipt can establish that address. It covers a never-existing address and an execution removed after Temporal retention; the adapter cannot distinguish them without another durable store.

Workflow cancellation, termination, timeout, failure, service unavailability, Worker unavailability, client deadline, malformed terminal receipt, and replay incompatibility are infrastructure failures. They do not become any member of this result union.

The raw Workflow result is deliberately `unknown`. New chain-enrolled executions return a private `bpmn-lean.workflow-terminal-result.v1` envelope containing the public receipt and bounded recovery entries. The one decoder also recognizes the exact pre-v1 five-field receipt and keeps its Message records only in a private normalized legacy view. No public old/new union or Message ledger crosses the Product 1 boundary.

A malformed command and reuse of one semantic command ID for a different well-formed stimulus are adapter request failures rather than semantic outcomes. Update ingress reports conflicting identity as non-retryable `BpmnCommandIdentityConflict` without failing or retrying the Workflow Task. Message Signal ingress validates before sending and reports malformed input as `BpmnMessageIngressInvalid`; a well-formed conflicting Signal cannot return a handler error, so the Workflow records `commandIdentityConflict` durably and the result Query/client translates that record to `BpmnCommandIdentityConflict`.

## Identity and retry contract

The semantic Process-instance ID, Temporal Workflow ID, Run ID, semantic command ID, and Temporal Update ID remain distinct.

The production adapter encodes the semantic Process-instance address as the typed tuple `["semanticProcessInstance", population, processInstanceId]`, where `population` is the engine population (named by its Task Queue) that hosts the instance: kernel-derived instance identities are unique only within one population, so two populations sharing a namespace never address one chain. It hashes its UTF-8 JSON form with SHA-256, and prefixes the digest with `bpmn-process-sha256:`. It starts that Workflow ID with `workflowIdReusePolicy: "REJECT_DUPLICATE"`. The conformance harness may supply isolated Workflow IDs for independent disposable executions, but production start and command ingress derive the same ID from the semantic address. The encoding is host policy and never appears in canonical semantic state.

The Temporal Update ID for User Task completion, incident retry, and incident-gated root cancellation must be a deterministic content-bound key over:

1. the semantic command ID;
2. the stimulus kind;
3. every semantic field of the exact well-formed stimulus.

It must not be the command ID alone. The lifecycle experiment proves that the pinned server returns the first Update result when the same Update ID is reused with a different payload, without invoking the Workflow handler. A command-ID-only Update key would therefore bypass the semantic core’s conflicting-payload check.

The adapter defines one canonical typed stimulus encoding and a SHA-256 digest. An exact retry produces the same Update ID and recovers the same semantic result. Reusing a command ID with a different stimulus produces a different Update ID, so it cannot silently alias the first result.

The registered Service Task incident profile uses Update name `bpmn-retry-effect-incident` with one complete `retryIncident` stimulus. Its cancellation successor uses `bpmn-cancel-incident-process` with the complete published root Process and incident identity. The same retained-Update-first resolver owns User Task completion, incident retry, and incident cancellation, so response loss, Workflow closure, and exact retries share one lifecycle classification.

## Workflow lifetime contract

The production start boundary first checks the explicit manual, Message, or Timer start stimulus and Semantic Process program through semantic execution admission, then checks the program through the separate Temporal host-capability predicate. Only an `admitted` result reaches Workflow creation. Ordinary production starts call `client.start`. The Timer Start conformance witness may instead place the exact admitted program and resolved trigger in a test-owned one-action Schedule; it performs the same checks before Schedule creation, uses the service-returned execution Workflow/Run identity after the due action, and does not add Schedule state to the Workflow input or semantic state. The current conservative host predicate accepts passive User Task Update and Message Signal ingress, scope-owned passive User Task sets, internal `throwError` closure, linear Timer/User Task composition, and the one exact sequential Multi-Instance managed pair whose controller is program-bound to one Activity record, live inner User Task, and attached lifetime Timer. Under the embedded Sub-Process completion profile it also accepts a token split beside data-free Service Task effect waits when the Program is well formed and inside the [nested scope-control class](kernel/semantics/SCOPES-SEMANTICS-SPEC.md), as the [concurrent scope Service Tasks](kernel/semantics/WORK-SEMANTICS-SPEC.md) family admits. It rejects every other token split combined with a Timer or effect wait as `concurrentHostDrivenWaits` and rejects every other Multi-Instance host shape.

The production Workflow receives that admitted Semantic Process program, one explicit start stimulus including its required canonical string/null initial Process-variable list, and the fixed v1 Initial host envelope carrying the production Event History count and byte thresholds. It does not receive a future scenario command list. Retained direct two-argument starts omit that host envelope and remain outside the patch only for exact pre-v1 replay compatibility.

The Workflow persists the semantic core's complete replacement runtime state, including definition-scope occurrences and the scope owner on every token and wait. Temporal does not project a child scope into a Child Workflow, Activity, Timer, Signal, cancellation command, or separate host lifecycle. Entry, child End consumption, quiescence, normal child completion, Error throw/catch, regional child cancellation, and the selected outer continuation remain internal core transitions within the one Process Workflow.

The start stimulus enters the single semantic input queue before any external handler becomes addressable. Only the main Workflow loop calls the semantic core, installs its initial Process variables, and mutates semantic state.

While semantic state is nonterminal, the loop waits for queued accepted inputs. When the semantic core reaches completed state, the loop:

1. applies every input already accepted into its queue so each accepted handler obtains a semantic result;
2. waits until `allHandlersFinished()` and the queue is empty;
3. returns one `CompletedProcessReceipt`;
4. accepts no host-defined grace period and waits for no future command.

Temporal decides whether a racing Update was accepted before the Workflow completion boundary. If accepted, it must complete with a semantic result before Workflow completion. If not accepted, the ingress contract resolves it through retained-result lookup and then `processClosed`.

Accepted-handler draining does not reserve acceptance for a future request and does not impose caller order on concurrent requests. Two distinct concurrent completions for one occurrence therefore have two valid lifecycle resolutions. If both are durably accepted, exactly one commits and one is rejected. If only the winner is durably accepted before Workflow completion, it commits and the losing request resolves through ingress as `processClosed`. Both resolutions reach the same final semantic state. `processUnknown` is not a valid result for this retained-address witness. A caller that awaits terminal completion before submitting another distinct command chooses an explicit post-terminal schedule and receives `processClosed`.

## Workflow-chain production contract

The generic host ([`@bpmn-lean/temporal-host`](../packages/temporal-host/src/workflow-host.ts)) runs each process instance as one Workflow chain. A Run carries its program, host configuration, population scope, encoded kernel state, publication cursor, population carry and its ordinal in one Continue-As-New argument. It continues as new only from a stable checkpoint: once a rollover trigger fires it starts no further Activity, waits until none is in flight, no arrival is queued and every accepted Update handler has finished. A terminal state completes the Workflow normally.

The generic host does not implement native Worker Deployment Versioning. The deleted adapter's contract (a Build ID from the Workflow bundle digest, `PINNED` Process and correlation-ingress Workflows, fresh-Namespace initialization and retained-Run Query obligations) is recorded in the [Worker deployment specification](TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md), and adopting it again is hosting work under the held delivery rows ([architecture](ARCHITECTURE.md#worker-deployment-ownership)).

### Workflow-chain capacity

The owner-approved table of 2026-08-17 ([archived proposal](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/docs/archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md)) bounds every chain; [`capacity.ts`](../packages/temporal-host/src/capacity.ts) holds its values and its one measure, the UTF-8 bytes of a value's canonical JSON. A bound is checked on the candidate the kernel's step produced, before the host commits it, publishes its journal or starts its work ([`chain-candidate.ts`](../packages/temporal-host/src/chain-candidate.ts)), so an overflow commits, publishes and starts nothing. Its refusal code is `host.capacity.<bound>`: a host restriction, never a meaning of the construct. A caller's Update over a bound is refused in its validator, so it never enters Event History; a population delivery or start over a bound fails with the code; a host arrival (a Timer, an Activity's result) over a bound halts the chain as an unsupported arrival does. Rollover triggers are no refusals: they make the Run continue as new. Deployment configuration may lower a test trigger (`historyEventBudget`) but no bound is raised without reopening the table.

| Budget | Bound | Behaviour | Code |
|---|---:|---|---|
| Event History Events | the SDK suggestion, or 8,000 Events, or the program's own lower budget | rollover trigger, after the activation that reaches it | — |
| Event History bytes | the SDK suggestion, or 8 MiB | rollover trigger | — |
| Retained publication batches of one Run | 2 MiB canonical bytes | rollover trigger once one more batch could cross it | — |
| Accepted Updates per Run | 1,500 | rollover trigger; a caller's Update beyond it is refused until the next Run | `host.capacity.updates` |
| Caller Updates in flight | 8 | refused in the validator | `host.capacity.updatesInFlight` |
| Pending Activities | 32 (raised 2026-11-13) | candidate refused | `host.capacity.pendingActivities` |
| Pending durable Timers | 64 | candidate refused | `host.capacity.pendingTimers` |
| Pending Child Workflows, external Signals and external cancellation requests | 0 | the host emits none | — |
| Program | 192 KiB | start or deployment refused before any Workflow starts | `host.capacity.program` |
| Start stimulus | 64 KiB | start refused before any Workflow starts | `host.capacity.start` |
| Caller, population or derived stimulus | 64 KiB | refused before it is applied | `host.capacity.stimulus` |
| Committed kernel state, without the last input's journal and outbox | 256 KiB (raised 2026-11-13) | candidate refused | `host.capacity.state` |
| One input's execution and occurrence publication batches together | 64 KiB | candidate refused | `host.capacity.publicationBatch` |
| Query answer | 192 KiB | paged: a publication page is the largest complete batch prefix that fits; the observation, state, host-view, pending-intent and start-outcome answers travel as the largest whole-code-point prefixes of their canonical JSON text; the population ingress's result and deployment Queries are not paged | — |
| Effect Activity request | 64 KiB | candidate refused | `host.capacity.effectRequest` |
| Effect Activity result | 64 KiB | the Activity fails non-retryably before it returns; a result arriving larger halts the chain | `host.capacity.effectResult` |
| Effect Activity failure projection | 16 KiB | a longer failure message halts the chain with the code instead | `host.capacity.effectFailure` |
| Continue-As-New argument, of a process chain or of the population ingress | 448 KiB | a process candidate refused; a successor that would exceed it halts the chain; see the population ingress below | `host.capacity.continuation` |
| Workflow chain | 128 Runs | a chain needing a 129th Run halts | `host.capacity.runs` |

Two values were raised on 2026-11-13, by the root's decision on measured numbers under the owner's standing direction:

- Pending Activities 1 to 32: the 1 preserved the deleted adapter's single-effect invariant, while the generic host runs concurrent effects; it would have refused 68 accepted witnesses of 18 done rows, and the realistic sixteen-body parallel Multi-Instance journey needs 16. 32 is the value the embedded Sub-Process profile already admitted.
- Committed state 64 KiB to 256 KiB, now measured without the per-input journal and outbox, which the publication batch and effect request rows bound: the realistic sixteen-body journey peaks at about 250,000 bytes (measured 2026-11-13), and its continuation still fits the unchanged 448 KiB.

Four rows of the approved table were retired on 2026-11-13 because their object does not exist in the generic host:

- Command-recovery ledger, 512 entries and 96 KiB: the host keeps no ledger of caller command results; Temporal deduplicates a retried Update by its Update ID within its Run, and any other retry reaches the kernel again, whose state decides it. The population delivery ledger, its last 1,024 outcomes, is carried inside the continuation row.
- Terminal Workflow result envelope, 192 KiB: there is no receipt-plus-recovery envelope; the Workflow's result is the fixed-shape `ProcessResult` (a status or a halt, and a revision), whose only variable text, a halt code, is bounded by the failure projection.
- Publication segment directory, 64 KiB: the chain carries only its publication cursor, not a directory of Run descriptors; the 128-Run row stays.
- Accepted semantic-input queue, 64 entries and 256 KiB: an Update applies its input in its own handler, so no input queue exists; the queued host arrivals are bounded by the pending Activity and Timer rows.

The population ingress Workflow carries its registry, chain registrations, Timer start ledger, command ledger, queue and in-flight fan-out in one Continue-As-New argument under the same 448 KiB row, beside its declared counts ([population ingress](kernel/ARCHITECTURE-SPEC.md#population-ingress)). A deployment, chain registration, queued command or Timer start that would leave the state at rest with less room than one settling answer needs is refused with `host.capacity.continuation` (a refused registration halts its chain). That answer reserve is the Query row plus the ledger entry's fixed overhead: a command's ledger entry is its `populationResult` answer, which the unpaged Query must return, inside `{"kind":"command","commandId":…,"digest":…,"answer":…}` instead of `{"kind":"settled","answer":…}`, and its identifier and digest were already carried in its queue entry, so the reserve is 196,608 + 51 − 28 = 196,631 bytes and an admission may fill 262,121 bytes ([`answerReserve`](../packages/temporal-host/src/population-carry.ts)). A fan-out stops by its answer's bytes as it stops at the receiver cap, with a last entry `failed {receiver, unsupported, host.population.fanOutCapacity}`: it reaches a receiver only with room left for the entry that receiver commits with and for the largest stop entry a later receiver could need, its identifiers bounded by the registered chains', the instances the fan-out started and the registered programs' longest element identifier; a receiver that fails commits nothing, so when its entry leaves no room the fan-out stops at it instead. Each entry is measured once, as it is recorded, and an emitted cascade stops within the same reserve. Every answer of a command therefore fits the Query row; a Signal start that rethrows its own Signal, whose started identities embed their emitter's ([#126](https://github.com/mbackschat/bpmn-lean-experiment/issues/126)), stops after 91 started instances at a 190,656-byte answer (measured 2026-11-13) where the receiver cap would allow 1,000. A settled item grows the ledger, which yields its oldest entries; only an emitted hand-off, which the ingress accepts unmeasured, can still leave an answer that does not fit, and that fails the ingress non-retryably, never runs it on past the bound. The in-flight fan-out is measured only when the ingress would continue as new during it, once per item, and holds that rollover until it settles when it does not fit; measuring it at every driver step made one cascade quadratic in its receivers. A queued command or deployment program also meets the stimulus and program rows.

Three kernel witnesses are refused on the host, each declared with its code in [`host-capacity-restrictions.ts`](../packages/differential/test/host-capacity-restrictions.ts), which both host targets check: PC-CF-06's accepted `automatic-loop-long-burst` publishes 2,604,132 bytes in one batch, so its start is `host.capacity.publicationBatch`, beyond Temporal's own payload limit as well; the closure-bound witness `automatic-loop-tail-at-closure-bound` is `host.capacity.publicationBatch` and `automatic-loop-waiting-branch-at-work-bound` is `host.capacity.state`. The kernel-runner witnesses are unchanged.

Detection follows an activation, so a Run overshoots a trigger by the work it drains before it rolls over. The [hosted capacity witnesses](../packages/temporal-host/test/host-capacity.temporal-test.ts) carry exactly 448 KiB across a real Continue-As-New and refuse one byte more before Event History, cross the 8 MiB trigger, reach the 128th Run and halt at the 129th, refuse one state byte over 256 KiB in the Update validator, and run the realistic sixteen-body journey on durable scheduling across Runs with its sixteen effects as concurrent Activities. The [memory-host witnesses](../packages/temporal-host/test/memory-host-capacity.test.ts) find each exact fit and its one-over refusal with the Workflow's own measure, and the [pure witnesses](../packages/temporal-host/test/capacity.test.ts) cover the triggers, the Update fence, paging and the ingress.

## Command-ingress resolution

For one well-formed Update command and known hosting Process address:

1. derive the content-bound Update ID and v1 recovery identity from the complete canonical stimulus;
2. execute the Update and return `semantic` if it completes;
3. after only an indeterminate Run-boundary result, Query the latest Run by Workflow ID with the exact recovery identity;
4. return `semantic` for `resolved`, throw `BpmnCommandIdentityConflict` for `identityConflict`, and retry the same content-bound Update for `unknownWhileActive`;
5. return `processClosed` only for `terminalWithoutEntry` with a validated terminal receipt;
6. throw typed `BpmnWorkflowChainCapacityExhausted` for `capacityFailedWithoutEntry`;
7. if the recovery Query is absent on an exact retained pre-v1 Workflow, use the legacy retained-Update and terminal-result decoder path;
8. return `processUnknown` only when neither the Workflow chain nor a retained terminal result remains, and propagate every other host or transport failure as infrastructure failure.

This chain-relative Query closes the response-loss race without depending on one Run's SDK handle. Message ingress sends its Signal once, polls the existing result Query while active, and enters the same identity-bound recovery path only when latest-Run routing becomes indeterminate.

An accepted Update interrupted by Workflow closure is indeterminate when the SDK returns `WorkflowUpdateFailedError` with an `ApplicationFailure` cause of exact type `AcceptedUpdateCompletedWorkflow`. The client resolves that command through the same recovery Query; the error alone supplies neither a semantic outcome nor the Workflow's own failure identity. Unrelated application failures remain infrastructure failures even when their message contains identical closure wording. The [service probe](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/packages/temporal-adapter/testkit/test/accepted-update-resolution-premise.test.ts) binds the pinned SDK type and same-command recovery across actual Continue-As-New.

Update and Message resolution capture the complete stimulus before the first asynchronous boundary. Submission, retries, recovery Queries, and retained results share one absolute native connection deadline; expiry terminates outstanding RPC work and preserves the SDK infrastructure error. A local polling-budget exhaustion is a `TimeoutError`. Neither error decides whether the semantic command committed: a caller retries the original command identity to recover the retained result. The [Worker-absence witness](https://github.com/mbackschat/bpmn-lean-experiment/blob/404a39d7/packages/temporal-adapter/testkit/test/workflow-command-deadline.test.ts) binds native timeout, replacement, one retained commit, terminal equality, and replay.

The hosting/root Process-instance ID selects the Workflow and validates its retained receipt. The completion stimulus independently retains the semantic task occurrence ID, which may belong to a distinct called Process hosted inside that Workflow. Client admission validates both shapes but does not require those identities to match; the semantic core accepts only the exact live task occurrence and rejects an unrelated occurrence without routing to another Workflow.

## Committed execution publication

The production Workflow owns one immutable committed-execution accumulator beside semantic RuntimeState. The semantic core returns an unnumbered publication only after a committed command reaches valid stable bounded closure and independently projects its current public token and scope positions. The Workflow then assigns contiguous revisions to the complete command batch, replaces the current head snapshot, and records the existing command outcome with no `await` between those deterministic state changes. Rejection, closure-bound failure, or missing publication changes no accumulator state. Revision is publication sequencing and never enters RuntimeState or BPMN meaning.

The unconditional `bpmn-execution-publication` Query is registered before the semantic input loop. At revision zero it returns retryable `notReady` for any valid cursor. At a positive head it returns only complete batches from an exact batch-boundary cursor, applies the requested or default batch-count limit, includes the current snapshot only when the page reaches head, and returns `gap` for an inside-batch or ahead cursor. Producer results are validated against the exact admitted Program before return. Query execution is pure and creates no history event.

The Temporal client separately validates the closed public transport against expected definition, Process, instance, cursor, limit, ordering, range, batch, and current equations. A page from revision zero additionally validates the complete position-delta fold from the empty position to the returned current head. A positive-cursor transport page validates only its visible suffix because the representation-free client has no authoritative pre-cursor position; the Workflow producer has already validated that suffix from its stored current position and logical time, and the Product 2 reconciler validates it again from its transactionally stored prior head. The client does not receive a Semantic Process program and does not claim to rederive private Program-operation or control-place correspondence. The engine API accepts that public identity plus the existing opaque Process locator and exposes no Workflow address. Real-server evidence proves exact start and completion revisions, positive-cursor paging, Worker replacement, completed terminal retrieval, repeated-activation identity, pure Query history stability, and exact replay. Product 2 evidence proves positive-cursor continuity, explicit unavailable/gap state, restart continuation, and revision-zero rebuild. Availability after Temporal retention remains deliberately unsupported rather than inferred.

Flow-node occurrence publication uses a second immutable accumulator and unconditional `bpmn-flow-node-occurrences` Query beside E1. A complete committed semantic step carries one lifecycle delta for every E1 transition. One cohesive Workflow transaction first derives and fully validates both successor publications with the retained commit-time anchor, then samples `Date.now()` exactly once and materializes both immutable successors before recording the existing command outcome, with no `await` between those boundaries. Rejected, bounded, ambiguous, duplicate-recovery, malformed, or incompletely publishable commands sample no time and advance neither accumulator. The public occurrence identity is `(processInstanceId, startRevision, startIndex)`; private wait, scope, Call Activity, and transition anchors remain only in Workflow state. The Query uses E1's exact complete-batch cursor and limit result, exposes `currentOpen` only at the head, and is pure. At a positive cursor, representation-free validation checks only the visible suffix, while Workflow validation uses its retained private open-anchor map and prior committed time. The strict Product 1 client and engine API expose only the public definition, Process, instance, cursor, and result through the opaque Process locator. Real-server evidence covers Worker replacement, positive-cursor paging, duplicate recovery, terminal retrieval, pure repeated Queries, exact E1 alignment, representative cancellation and pairing families, and exact history replay without deriving occurrence facts from Event History.

Chain-enrolled Runs retain E1 and E2 as one aligned local segment. Before rollover, the Workflow closes the pair with one digest-bound descriptor, appends it to a bounded private directory, carries the directory digest plus global publication heads and E2 open-occurrence anchors, and restores empty local batch arrays in the successor. A latest-Run selection returns one immutable global snapshot and the exact segment descriptor for the requested cursor; the selected Run serves only that local range, so no public page crosses a Run. E1 and E2 ranges, command IDs, transition revisions, and public heads remain aligned. The three-Run live witness proves segments `0..8`, `8..12`, and `12..16`, cursor reads at `0`, `4`, `8`, `12`, and `16`, two occurrence identities spanning Run boundaries, an unchanged closed receipt, and replay of every Run. Retention loss remains typed unavailability and is never repaired from Event History.

## Service Task incident hosting

The successor incident profile reuses the existing effect Activity type and every existing semantic success and `bpmnError` result byte. It selects `maximumAttempts: 1` and additionally accepts the payload-free host-only `{ kind: "technicalFailure" }` result. Every old profile retains `maximumAttempts: 2` and rejects that host-only arm before it can reach the semantic core.

For the first technical result, the Workflow derives `reportEffectFailure` from the one committed open effect and its private never-retried wait. The semantic command atomically suspends that exact wait in one literal-generation-1 incident. Query then exposes `openIncidents` and one `retryIncident` interaction while exposing no corresponding open effect. No Temporal attempt, Activity ID, exception, or Event History fact becomes incident identity.

The dedicated Update submits the exact published incident identity. A committed retry restores the same effect occurrence with its private one-retry marker set, and the Workflow schedules a new one-attempt Activity. Worker replacement between incident publication and retry preserves the Query, retained Update result, restored effect, and replay. An exact retry after Workflow completion recovers its original semantic outcome from Temporal's retained Update result.

If the restored effect returns `technicalFailure`, the Workflow raises typed host failure `BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED`. It submits no second report command, creates no generation-two semantic incident, and replay reconstructs the last committed state with the restored effect wait. Two different generation-1 retry command IDs may both be durably accepted, but deterministic Workflow queue order permits one commit and makes the other a semantic rejection.

The cancellation successor publishes the exact root Process and generation-1 incident identity after Retry. The client validates and content-binds those fields, and the Workflow enqueues the resulting `cancelIncidentProcess` stimulus through the same single semantic loop. A committed cancellation drains accepted handlers and returns a typed cancelled receipt through ordinary Workflow completion. Exact Update retry recovers the retained semantic result; a distinct later command returns `processClosed` with the same cancelled receipt. Worker replacement while the incident is open preserves Query state, accepted-result recovery, committed Process data, terminal receipt, history, and replay. The retained history contains one technical Activity attempt, Update acceptance/completion, and Workflow completion, with no Workflow cancellation-request, cancellation, or termination event. Test-owned native termination and completed-receipt substitutions are rejected.

## Compensation durability checkpoint

The exact registered Compensation source profile may cross Continue-As-New only while its committed maximal frontier is wholly unscheduled. The next Run preflights and starts the complete frontier before observing an Activity result; no scheduled or unreconciled Compensation Activity crosses a Run boundary. Definition, trigger, handler, effect, descriptor, and frozen arguments determine each stable Activity request and retry identity.

Concurrent Compensation Activities use `WAIT_CANCELLATION_COMPLETED` and an exact one-second heartbeat timeout. An Activity implementation that may remain live must heartbeat so a sibling's typed BPMN Error can deliver cancellation. The Workflow may publish the committed failed semantic state before cancellation acknowledgement, but it must not return the failed receipt until every removed sibling Activity has acknowledged cancellation. This heartbeat is a delivery mechanism and creates no BPMN fact.

The retained durability witness replaces the Worker before B/C scheduling, permits B response-loss retry without another mutation, preserves B's frozen input, permits C before B, starts A only after B, and returns the exact completed receipt. Its failure twin commits C's typed semantic failure before B cancellation drain, never starts A, returns the exact failed receipt only after B acknowledgement, orders those Activity and Workflow events in retained history, and replays every Run. These durability witnesses predate the [public registration](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md), which reuses the same exact topology and scheduler; they establish no wider Compensation or Transaction capability.

## Message Signal ingress resolution

`submitMessageDelivery` requires the semantic Process address plus one complete well-formed `deliverMessage` stimulus. The caller-supplied subscription identity and resolved definition channel are both semantic address material; the Signal name is only transport.

The client validates the stimulus before Signal submission. A malformed or instance-conflicting request throws `BpmnMessageIngressInvalid` and emits no Signal. For well-formed input it sends `bpmn-deliver-message`, then polls the read-only `bpmn-message-delivery-result` Query for the exact stimulus. The Workflow-local ledger reports `pending`, the exact semantic outcome, or durable `commandIdentityConflict`. Only the main semantic loop records a semantic outcome.

An exact repeated Signal is coalesced to the original record and never causes a second core transition. Reuse of the command ID with a different well-formed Message stimulus records identity conflict without throwing from the Signal handler. Wrong subscription identity, wrong channel, pre-activation delivery, and stale delivery are ordinary semantic rejections because they are well-formed inputs that reach the core.

If the Workflow closes before the client receives its Query result, the private terminal envelope's ordered content-bound recovery entries recover the exact semantic outcome or identity conflict. The closed v1 public receipt contains no host ledger. Exact pre-v1 results normalize through the decode-only legacy seam and preserve their private Message records. If no matching entry or legacy record exists, the ordinary `processClosed`/`processUnknown` lifecycle classification applies. Signal transport acceptance alone never implies BPMN Message consumption.

The definition-scoped correlation client uses a separate complete-address ingress and never accepts a Process locator or selected target. It checks the retained content-bound status before Update submission, treats explicit retained conflict as command identity failure, and polls only the accepted record's reserved result. A received validator-capacity failure remains nonsemantic; lost Update or Query evidence remains infrastructure-indeterminate and cannot trigger a blind retry. The public projection may expose a target only after semantic commit or retained target inconsistency, never while discovery or matching is unconfirmed.

## Conformance evidence extraction

The differential runner may transport a replay-reconstructed canonical trace through a post-completion Query. This is a harness-only evidence-extraction contract, not the production canonical-observation API.

The runner reconciles every Query-derived command outcome with the corresponding completed Update result payload in Event History and reconciles the terminal Query state with the validated completed Process receipt. Only intermediate stable-state observations remain Query-only; the differential comparison against the pure semantic core checks those observations independently. The same gate replays every fetched history.

The sequential stale-completion case has a deliberately split relation. CIB Seven, Lean, and the pure semantic core agree on the complete semantic trace including stale rejection. Temporal agrees exactly on the prefix through semantic completion and separately classifies the explicitly post-terminal command as adapter-owned `processClosed`; that classification is never coerced into a semantic outcome. The parallel live-sibling stale witness keeps the Process addressable while the stale command reaches the semantic core and therefore retains exact four-target semantic agreement.

## Verification contract

The [Workflow-chain capacity](#workflow-chain-capacity) section names the capacity witnesses.

The complete applicable pipeline must remain green. No production legacy lifecycle, finite scenario-stimulus-count lifetime, or compatibility branch is retained during pre-release.

## Optional and excluded functionality

An external tombstone or durable router is optional only after a consumer requires command-result or closed-address lookup beyond Temporal retention. That later proposal must specify its support window, atomic publication, rebuild or reconciliation path, authorization, cleanup, and failure classification.

Excluded from this specification:

- returning semantic rejection for a command never accepted by an already closed Workflow;
- keeping a Workflow alive solely to reject future commands;
- starting or reopening a Process through command ingress;
- Workflow-ID reuse, Update-With-Start, and host-derived semantic identity;
- host cancellation, termination, timeout, reset, pause, failure, and operator-repair semantics beyond the exact incident-gated root command; that command completes its Workflow normally and does not use Temporal cancellation or termination;
- Activities and effects beyond their separate capsules, Message payloads, key-based/global Message routing, modeled Message throw, Search Attributes, forms, variables beyond the current observation, task discovery, timer forms or races beyond the separately specified exact Timer capsules, and Multi-Instance hosting beyond the exact registered sequential User Task/data/lifetime-Timer slice.

## Re-open conditions

Reconsider the selected account only if:

- a required API consumer needs result lookup beyond Temporal retention;
- a future semantic profile permits commands after Process completion;
- a required publication, Message, Timer, effect, or deployment case cannot preserve the approved transparent cross-Run contract;
- a platform limitation prevents reliable accepted-handler draining or exact Update-result recovery;
- an authorization or audit requirement needs an independently retained command ledger.
