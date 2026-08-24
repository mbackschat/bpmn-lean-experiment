# Temporal Process lifecycle specification

## Status

**Implemented current pre-release contract.**

## Scope

This specification defines the production lifecycle shared by the admitted semantic capsules. It answers how semantic and host-capability admission is reported before Workflow creation, when the Temporal Workflow closes, how accepted command retries recover their semantic result, and how a distinct command addressed after closure is classified without inventing BPMN behavior.

It does not itself add BPMN semantics, a task inbox, general host cancellation, an external database, or an immutable deployment/history baseline. The [Workflow-chain production contract](#workflow-chain-production-contract) below owns bounded continuation, recovery, publication traversal, capacity, and deployment compatibility; the [archived proposal](archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md) retains its selected-design and review rationale. The [Intermediate Catch Timer specification](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) composes one semantic-core-owned wait with this lifecycle without making physical timer state semantic authority, the [Intermediate Catch Message specification](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) and [Message-addressed Receive Task specification](capsules/RECEIVE-TASK-MESSAGE-SPEC.md) compose their separately checked Message loci with the same passive Signal and private command-recovery lifecycle while retaining distinct channel arms, the [ordinary embedded Sub-Process completion specification](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) keeps the child definition-scope lifecycle inside the same semantic state machine without a Temporal Child Workflow, and the [Sub-Process Error-propagation specification](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) performs regional semantic cancellation without a Temporal cancellation command. The [Terminate End Event specification](capsules/TERMINATE-END-EVENT-SPEC.md) likewise computes containing-scope cancellation entirely inside the semantic core and reuses ordinary scope completion without a host cancellation command. The [bounded Call Activity specification](capsules/CALL-ACTIVITY-SPEC.md) composes one caller plus one linked called semantic Process instance under the caller's Workflow address, separates that host address from the called task identity, survives Worker replacement, and replays without a Temporal Child Workflow. The [Sequential Multi-Instance specification](capsules/SEQUENTIAL-MULTI-INSTANCE-PROPOSAL.md) composes one exact controller/User-Task/lifetime-Timer family with pre-arming continuation, inner-task turnover, natural aggregation, outer interruption, bounded recovery, and replay. The engine runner adds one exact known-Process User Task detail Query whose caller-selected Process-variable projection remains read-only and non-durable.

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

The executable comparison and pinned platform facts are recorded in the [Temporal production-lifecycle experiment](experiments/TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md).

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

`started` means semantic execution admission and the separate Temporal host-capability predicate both passed and Temporal created the Workflow. It exposes only the validated semantic Process-instance ID. SDK handles, clients, Run IDs, result polling, history, and description capabilities remain adapter-private. `rejected` means either the Semantic Process/start pair is unsupported or the host cannot schedule its potential wait-set shape. The adapter returns this result before `client.start`; Workflow execution does not classify admission.

`semantic` means the command was accepted by the Workflow or its previously completed exact Update was recovered. Live execution and retry recovery return the same public shape.

`processClosed` means the non-reusable Process address is retained, its Workflow has a valid completed semantic receipt, and no accepted Update exists for this exact command. It is an adapter lifecycle result. It must not be converted to `CommandOutcome.Rejected`, appended to the canonical BPMN trace, or presented as a Lean/CIB/TypeScript semantic transition.

`processUnknown` means no retained Workflow or terminal receipt can establish that address. It covers a never-existing address and an execution removed after Temporal retention; the adapter cannot distinguish them without another durable store.

Workflow cancellation, termination, timeout, failure, service unavailability, Worker unavailability, client deadline, malformed terminal receipt, and replay incompatibility are infrastructure failures. They do not become any member of this result union.

The raw Workflow result is deliberately `unknown`. New chain-enrolled executions return a private `bpmn-lean.workflow-terminal-result.v1` envelope containing the public receipt and bounded recovery entries. The one decoder also recognizes the exact pre-v1 five-field receipt and keeps its Message records only in a private normalized legacy view. No public old/new union or Message ledger crosses the Product 1 boundary.

A malformed command and reuse of one semantic command ID for a different well-formed stimulus are adapter request failures rather than semantic outcomes. Update ingress reports conflicting identity as non-retryable `BpmnCommandIdentityConflict` without failing or retrying the Workflow Task. Message Signal ingress validates before sending and reports malformed input as `BpmnMessageIngressInvalid`; a well-formed conflicting Signal cannot return a handler error, so the Workflow records `commandIdentityConflict` durably and the result Query/client translates that record to `BpmnCommandIdentityConflict`.

## Identity and retry contract

The semantic Process-instance ID, Temporal Workflow ID, Run ID, semantic command ID, and Temporal Update ID remain distinct.

The production adapter encodes the semantic Process-instance address as the typed tuple `["semanticProcessInstance", processInstanceId]`, hashes its UTF-8 JSON form with SHA-256, and prefixes the digest with `bpmn-process-sha256:`. It starts that Workflow ID with `workflowIdReusePolicy: "REJECT_DUPLICATE"`. The conformance harness may supply isolated Workflow IDs for independent disposable executions, but production start and command ingress derive the same ID from the semantic address. The encoding is host policy and never appears in canonical semantic state.

The Temporal Update ID for User Task completion, incident retry, and incident-gated root cancellation must be a deterministic content-bound key over:

1. the semantic command ID;
2. the stimulus kind;
3. every semantic field of the exact well-formed stimulus.

It must not be the command ID alone. The lifecycle experiment proves that the pinned server returns the first Update result when the same Update ID is reused with a different payload, without invoking the Workflow handler. A command-ID-only Update key would therefore bypass the semantic core’s conflicting-payload check.

The adapter defines one canonical typed stimulus encoding and a SHA-256 digest. An exact retry produces the same Update ID and recovers the same semantic result. Reusing a command ID with a different stimulus produces a different Update ID, so it cannot silently alias the first result.

The registered Service Task incident profile uses Update name `bpmn-retry-effect-incident` with one complete `retryIncident` stimulus. Its cancellation successor uses `bpmn-cancel-incident-process` with the complete published root Process and incident identity. The same retained-Update-first resolver owns User Task completion, incident retry, and incident cancellation, so response loss, Workflow closure, and exact retries share one lifecycle classification.

## Workflow lifetime contract

The production start boundary first checks the explicit manual, Message, or Timer start stimulus and Semantic Process program through semantic execution admission, then checks the program through the separate Temporal host-capability predicate. Only an `admitted` result reaches Workflow creation. Ordinary production starts call `client.start`. The Timer Start conformance witness may instead place the exact admitted program and resolved trigger in a test-owned one-action Schedule; it performs the same checks before Schedule creation, uses the service-returned execution Workflow/Run identity after the due action, and does not add Schedule state to the Workflow input or semantic state. The current conservative host predicate accepts passive User Task Update and Message Signal ingress, scope-owned passive User Task sets, internal `throwError` closure, linear Timer/User Task composition, and the one exact sequential Multi-Instance managed pair whose controller is program-bound to one Activity record, live inner User Task, and attached lifetime Timer. It rejects a token split combined with a Timer or effect wait as `concurrentHostDrivenWaits` and rejects every other Multi-Instance host shape.

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

Every Product 1 start supplies the fixed v1 Initial host input and enrolls in the exact `bpmn-workflow-chain-v1` patch. The branch validates exact Process, definition, start, first-execution, RuntimeState, recovery, and publication identity; measures every carried argument under the approved production ceilings; fences rollover in the main Workflow loop; drains accepted handlers and Signals; and calls `return await continueAsNew(...)` only from one stable nonterminal checkpoint. Terminal state is checked first and completes normally.

The cyclic User Task capacity witness has two lower-only host configurations. The event case crosses exactly three Runs and two Continue-As-New boundaries at four Events. The byte case crosses exactly two Runs at 48 KiB after accepted bounded stale completions grow Event History without changing semantic state. Both carry the exact open occurrence, preserve semantic command outcomes and the semantic-core final state, recover an exact prior-Run Update, reject changed content under the same command ID, return the closed v1 receipt, and replay every Run. The executable host-mechanism table reserves at most 205 Events and 1,953,792 bytes for one admitted Update/Signal activation, the larger Timer or Activity-result arm, Workflow Task completion, and Continue-As-New. Those maxima fit below the 10,240-Event and 10 MiB warnings after the 8,000-Event and 8 MiB triggers, and live history descriptions prove each actual overshoot remains below the matching reserve without an SDK rollover suggestion. Event History determines only private host rollover, never BPMN or CIB meaning. Incoming terminal state, malformed publication state, substituted Message identity, oversized state, and oversized host metadata fail closed through focused compiled-boundary tests.

The complete Continue-As-New payload preflight first applies every stricter Program, start, host, RuntimeState, recovery, and publication bound, then sums the canonical UTF-8 byte lengths of those six separately transported arguments under the 448 KiB aggregate ceiling. It does not encode or charge a synthetic JSON array wrapper. Exact fit succeeds and one byte over reports the exact observed aggregate. The same pure measurement runs before successor emission and incoming continuation restoration; successor overflow uses typed chain capacity, while an oversized incoming continuation remains a fail-closed continuation defect. The established cyclic witnesses prove that ordinary carried arguments preserve semantic state and replay across real boundaries.

The registered sequential Multi-Instance family has one narrower rollover contract inside this general chain. Outer entry may request Continue-As-New only at the stable pre-arming checkpoint after the semantic controller/User-Task/Timer state commits and before the native Timer command is emitted. Once the successor Run arms that Timer, every later rollover request is deferred until natural completion withdraws it or its callback is reduced; task turnover preserves the same semantic Timer occurrence and deadline. Incoming and command-admission validation require the exact program/operation/owner/controller/Activity/User-Task/one-Timer binding before projection or scheduling. The natural production witness crosses the pre-arming boundary, replaces the Worker, completes three ordered iterations in the armed Run, recovers one accepted result, publishes the exact ordered collection and E1/E2 batches, returns the terminal receipt, and replays both Runs. The interrupted witness completes one iteration, reduces the original Timer while the second task is active, crosses into a third Run only after that reduction, refuses the stale second task, exposes no partial output, completes the escalation task, and replays all three Runs. The exact-version capacity owner proves exact-16 fit, count-only exact-17 refusal, and headroom under every production Event, byte, activation, continuation, publication, recovery, and terminal bound without assigning semantic meaning to Event History.

The Workflow chain admits at most 128 Runs. Constructing Run 128 closes Run 127 into the 127th contiguous descriptor and validates the complete carried state through ordinary incoming admission. When Run 128 would need a successor, the Workflow raises nonretryable `BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED` with observed ordinal 129 before reading, closing, hashing, or extending the current publication segment. A received ordinal above 128 is malformed continuation instead of capacity recovery. This keeps the 128-entry directory ceiling independently enforced and exposes neither Run ID nor ordinal publicly.

Product 1 command clients address the Workflow chain by Workflow ID, validate the recovery Query's complete identity echo, preserve exact retry/conflict precedence, and keep Run identity private. Production Message witnesses independently lock the Initial envelope, patch history, closed public receipt, exact Signal payloads, and ordered private recovery entries. The forced Message witness additionally rejects one wrong-channel Signal immediately before Run 1 closes, carries the unchanged subscription into Run 2, accepts the valid delivery only after closure, preserves duplicate/conflict recovery into Run 3, matches the pure semantic-core trace, and replays all three Runs. The forced Timer witness closes Run 1 before arming the exact registered `PT1S` wait, carries the committed occurrence, deadline, and logical time, defers the still-triggered Event History threshold until fresh Run 2 retains work, then records exactly one durable Timer lifecycle and one derived semantic firing before replaying both Runs. The forced Service Task witness likewise closes Run 1 before Activity scheduling, carries the complete committed effect intent and content-bound request, holds the one successor Activity in flight while the same semantic wait is observed, then records one external mutation, one Activity lifecycle, and one derived semantic completion before replaying both Runs. An unseen Update crosses neither recovery bound before semantic queuing; an already accepted Signal or racing Update that cannot fit records the bounded failure before semantic evaluation. When the 512th recovery entry fills the production count bound, the Workflow first publishes and returns that command's semantic result, fences unseen ingress, gives terminal completion precedence, drains accepted handlers, and then fails the nonterminal Run with `BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED`. The retained failed Run resolves the filling command and its conflicts before returning capacity for unseen work; Product 1 preserves the same ordering. Product 1 publication clients select one paired E1/E2 segment against the latest Run, bind that immutable selection to an exact descriptor and global head snapshot, and query the exact retained Run privately. A changed current segment forces reselection; a missing selected Run is `unavailable`; only an exact pre-chain `QueryNotRegisteredError` enters the legacy direct-Query path. The selected-Run producer measures the complete private response under the 192 KiB canonical UTF-8 ceiling and returns the largest complete aligned E1/E2 batch prefix that fits. It never rewrites or splits a semantic-core publication batch, and it includes current/open snapshots only when the returned prefix reaches the immutable global head. The Product 1 client independently enforces the same bound before exposing the unchanged public E1/E2 results. At semantic terminal state, after the accepted queue and handlers drain, the Workflow constructs the exact private receipt-plus-recovery envelope and measures it under the same 192 KiB canonical UTF-8 contract before return. Exact-bound bytes return unchanged. An oversized envelope fails nonretryably as `BPMN_WORKFLOW_CHAIN_CAPACITY_EXHAUSTED` without replacing the committed closing result: the retained failed Run still resolves that result and its conflicts before its private recovery Query returns the exact terminal receipt for unseen work. Public publication and receipt contracts expose no recovery, descriptor, Workflow identity, or Run identity.

Worker replacement across the v1 boundary uses one stop-the-world deployment gate rather than rolling compatibility or Temporal Worker Versioning. Exact SHA-256 identities bind both old and candidate executable bundle bytes and every fleet-visible Worker identity. The gate completes Product 1 ingress fencing before it stops old Workers, requires an authoritative empty live-poller inventory, replays retained legacy and v1 histories under the candidate bytes, starts only bundle-bound candidate Workflow and Activity pollers, and reopens ingress only after the exact candidate-only inventory appears. Failure leaves ingress fenced and stops any candidate it started; it never automatically restarts the old bundle after a v1 marker may exist. The live witness proves the old bundle's nondeterminism at the chain patch marker and the candidate's replay plus semantic continuation of an open legacy User Task. This is deployment infrastructure evidence, not a BPMN or CIB observation.

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

## Message Signal ingress resolution

`submitMessageDelivery` requires the semantic Process address plus one complete well-formed `deliverMessage` stimulus. The caller-supplied subscription identity and resolved definition channel are both semantic address material; the Signal name is only transport.

The client validates the stimulus before Signal submission. A malformed or instance-conflicting request throws `BpmnMessageIngressInvalid` and emits no Signal. For well-formed input it sends `bpmn-deliver-message`, then polls the read-only `bpmn-message-delivery-result` Query for the exact stimulus. The Workflow-local ledger reports `pending`, the exact semantic outcome, or durable `commandIdentityConflict`. Only the main semantic loop records a semantic outcome.

An exact repeated Signal is coalesced to the original record and never causes a second core transition. Reuse of the command ID with a different well-formed Message stimulus records identity conflict without throwing from the Signal handler. Wrong subscription identity, wrong channel, pre-activation delivery, and stale delivery are ordinary semantic rejections because they are well-formed inputs that reach the core.

If the Workflow closes before the client receives its Query result, the private terminal envelope's ordered content-bound recovery entries recover the exact semantic outcome or identity conflict. The closed v1 public receipt contains no host ledger. Exact pre-v1 results normalize through the decode-only legacy seam and preserve their private Message records. If no matching entry or legacy record exists, the ordinary `processClosed`/`processUnknown` lifecycle classification applies. Signal transport acceptance alone never implies BPMN Message consumption.

## Conformance evidence extraction

The differential runner may transport a replay-reconstructed canonical trace through a post-completion Query. This is a harness-only evidence-extraction contract, not the production canonical-observation API.

The runner reconciles every Query-derived command outcome with the corresponding completed Update result payload in Event History and reconciles the terminal Query state with the validated completed Process receipt. Only intermediate stable-state observations remain Query-only; the differential comparison against the pure semantic core checks those observations independently. The same gate replays every fetched history.

The sequential stale-completion case has a deliberately split relation. CIB Seven, Lean, and the pure semantic core agree on the complete semantic trace including stale rejection. Temporal agrees exactly on the prefix through semantic completion and separately classifies the explicitly post-terminal command as adapter-owned `processClosed`; that classification is never coerced into a semantic outcome. The parallel live-sibling stale witness keeps the Process addressable while the stale command reaches the semantic core and therefore retains exact four-target semantic agreement.

## Verification contract

The focused Temporal gate must demonstrate:

- Workflow lifetime depends on terminal semantic state and contains no scenario-stimulus count;
- unsupported semantic input or host wait-set capability returns a typed pre-start rejection and creates no Workflow;
- linear Timer/User Task composition passes host capability, executes one durable Timer before later User Task ingress, and replays;
- a token split combined with a Timer or effect fails the conservative host-capability predicate;
- the exact sequential Multi-Instance profile alone admits one program-bound controller, Activity record, live inner User Task, and attached lifetime Timer, while a child-scope body, changed operation, wrong owner, missing or second Timer, or another Multi-Instance topology fails before Workflow creation or continuation evaluation;
- sequential Multi-Instance outer entry may cross one pre-arming Continue-As-New boundary, no Run rolls over while its native lifetime Timer is armed, natural task turnover preserves that Timer identity and deadline, and the natural and interrupted production schedules retain exact Update recovery, E1/E2 publication, terminal receipt, capacity comparison, Worker replacement, and replay;
- an admitted ordinary embedded Sub-Process exposes both scope-owned child User Tasks through the existing passive Update path, retains the sibling and withholds the outer continuation after the first child completion, then exposes the outer User Task only after exact child quiescence;
- replacing the Worker between child completions preserves the first completed Update result, child scope state, sibling task, later outer continuation, terminal receipt, and replay result;
- the ordinary embedded Sub-Process history contains zero Signals, Timers, Activities, Child Workflows, and cancellation events;
- an admitted Error-propagation Process commits Trigger Error through User Task Update ingress, performs `throwError` as internal closure, and exposes only Recover without a Signal, Timer, Activity, Child Workflow, or cancellation event;
- replacing the Worker immediately after the committed throw/catch/cancel Update recovers that accepted result and the Recover-only wait set before a fresh stale Sibling Work Update is rejected with state preservation;
- the Error-propagation Process completes after Recover and replays; a separately bundled Workflow fabricates the identical post-cancellation prefix without invoking the semantic core, retains pre-throw state, and is rejected when the next stale sibling command produces the wrong durable outcome and canonical suffix;
- an admitted Terminate End Process commits Trigger through User Task Update ingress, computes `terminateScope` and child `completeScope` as internal closure, and exposes only Outer without a Signal, Timer, Activity, Child Workflow, or cancellation event;
- replacing the Worker immediately after that committed Update recovers the result and Outer-only wait, a fresh stale Sibling Update rejects with exact state preservation, Outer completes, and the 20-event history replays;
- a test-owned Workflow that applies the wrong global-cancellation account closes after Trigger instead of exposing Outer, so the durable public discriminator reaches the exact semantic boundary without inferring cancellation from Event History;
- start precedes every external completion under immediate delivery and Worker restart;
- initial Process variables are visible at the first stable wait, retained through completion, and reconstructed identically by replay;
- a normal exact completion closes the Workflow with a validated completed receipt;
- every accepted racing Update completes before Workflow completion;
- an exact retry after closure returns the original semantic result;
- a bounded Call Activity keeps the root Workflow address distinct from the called task occurrence, rejects a caller-owned substitute while preserving the called wait, recovers an exact committed retry after Worker replacement without another accepted Update, then completes the caller and replays;
- complete User Task Update identity includes the complete canonical submitted string/null patch;
- a different task identity or submitted patch under the same semantic command ID cannot alias that result;
- a conflicting command identity that reaches the Workflow returns `BpmnCommandIdentityConflict` without a Workflow Task failure;
- malformed Message ingress returns `BpmnMessageIngressInvalid` without emitting a Signal;
- a wrong-channel Signal is durably accepted by Temporal but returned as semantic rejection with exact state preservation;
- the admitted direct-Message Receive Task Query exposes the complete direct subscription and delivery interaction, rejects malformed direct ingress before Signal submission, and rejects an operation-addressed channel with the same Message ID while preserving the direct wait;
- a direct Receive Task Signal accepted while no Worker polls is applied after replacement, recovered as one committed ledger/terminal-receipt result, leaves an exact completed canonical state, contains no Timer, Activity, Child Workflow, or cancellation event, and replays;
- a test-only definition mutation that replaces the direct arm with `operationMessage` diverges in the pre-delivery Query and rejects the exact direct delivery, while removing one Receive Task Signal makes the exact history assertion fail;
- exact duplicate Message delivery recovers the original outcome without a second semantic transition, while conflicting well-formed reuse is durably recorded and returned as `BpmnCommandIdentityConflict`;
- Worker absence after Message Signal acceptance preserves later semantic delivery, receipt recovery, and replay;
- a distinct post-closure command returns `processClosed`;
- a never-existing address returns `processUnknown`;
- Workflow-ID reuse and Update-With-Start command ingress are absent;
- Query and canonical result projections contain no Workflow ID, Run ID, or Update ID;
- Query-derived command outcomes and terminal state reconcile with durable Update results and the completed receipt;
- an outside-core completion-data write that forges the terminal variables but omits the corresponding core command result fails durable Query/Update reconciliation;
- an outside-core scope bypass that fabricates the outer continuation while a child sibling is still active fails the retained Update/state relation check;
- the sequential post-terminal schedule and parallel live-sibling stale witness preserve the semantic/adapter evidence split without coercion;
- the produced histories replay and every Worker/server resource is cleaned up;
- every non-Message Workflow path retains zero Signal Events, while each approved Intermediate Catch Message and Receive Task path contains its own exact ordered delivery Signal payloads and a seeded payload or history substitution fails the history check;
- a seeded command-ID-only Update-key mutation makes the payload-conflict witness fail.
- the successor profile alone selects one Activity attempt and admits the host-only technical-failure result, while every old profile keeps two attempts and refuses that arm;
- the first technical result submits `reportEffectFailure`, exposes one literal-generation-1 incident and no open effect, and survives Worker replacement before retry;
- incident retry uses a content-bound retained Update, restores the exact occurrence, and can recover the same committed outcome after terminal Workflow closure;
- a second technical result after retry creates no second semantic incident, leaves the last committed restored effect observable, fails with `BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED`, and replays;
- two distinct retry Updates race to exactly one committed and one rejected semantic outcome without duplicating the Activity;
- incident Activity history contains two separate one-attempt executions, durable history contains the accepted retry Update, and no host identifier appears in canonical state;
- the cancellation successor reaches the exact generation-1 incident after one Activity attempt, publishes the exact root Process and incident identity, stops the Worker, and submits the content-bound cancellation Update before replacement;
- replacement recovers one committed cancellation and its retained Update result, preserves committed Process data in a typed cancelled receipt, and makes a distinct later command return `processClosed` carrying that same receipt;
- the cancellation Workflow closes through ordinary Workflow completion, contains no Workflow cancellation-request, cancellation, or termination Event family, and replays; native Workflow termination and a completed-for-cancelled receipt substitution fail the refinement relation.
- every committed publishable command appends one complete contiguous transition batch before its existing result becomes observable, while rejection and closure-bound failure retain the exact accumulator;
- the publication Query is registered before start evaluation, returns retryable `notReady` at revision zero, pages only at complete-batch cursors under the effective limit, returns current only at head, rejects gaps and malformed producer facts, and remains pure under repeated reads;
- the selected-Run publication Query returns the largest complete aligned E1/E2 prefix within 192 KiB, accepts an exact fit, refuses a bound that cannot fit one complete pair, preserves deterministic remainder retrieval, and is independently rejected by Product 1 when an oversized response crosses the client boundary;
- the private terminal result returns unchanged at exactly 192 KiB, while one byte over fails as typed nonretryable chain capacity only after all sixteen registered-cycle completions return committed; the retained failed Run resolves the closing identity, rejects changed content, returns the exact terminal receipt for unseen work, contains no Workflow retry or Continue-As-New, and replays;
- Product 1 transport validates every public identity/range/current/fold equation without accepting a Program or exposing a Workflow address; real-server evidence retains exact pages through Worker replacement and terminal completion, and replays both the parallel and repeated-activation histories without reconstructing records from Event History.

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
