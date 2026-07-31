# Temporal Process lifecycle specification

## Status

**Implemented current pre-release contract.**

## Scope

This specification defines the production lifecycle shared by the admitted semantic capsules. It answers how semantic and host-capability admission is reported before Workflow creation, when the Temporal Workflow closes, how accepted command retries recover their semantic result, and how a distinct command addressed after closure is classified without inventing BPMN behavior.

It does not itself add BPMN semantics, a task inbox, Activities, cancellation, Continue-As-New, an external database, or an immutable deployment/history baseline. The [Intermediate Catch Timer specification](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) composes one semantic-core-owned wait with this lifecycle without making physical timer state semantic authority, the [Intermediate Catch Message specification](capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md) composes one passive subscription with durable Signal ingress and result recovery, and the [ordinary embedded Sub-Process completion specification](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) keeps the child definition-scope lifecycle inside the same semantic state machine without a Temporal Child Workflow. The runnable MVP adds one exact known-Process User Task detail Query whose caller-selected Process-variable projection remains read-only and non-durable.

## Selected lifecycle

Adopt a **semantic-lifetime Workflow with a retention-bounded closed-result boundary**:

- one Temporal Workflow Execution hosts one semantic Process instance while that instance is semantically active;
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
      handle: WorkflowHandle<BpmnProcessWorkflow>;
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

type MessageDeliveryRecord =
  | Readonly<{
      kind: "semantic";
      stimulus: DeliverMessageStimulus;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: "requestFailure";
      stimulus: DeliverMessageStimulus;
      failure: "commandIdentityConflict";
    }>;

interface CompletedProcessReceipt {
  readonly definition: SemanticProcessIdentity;
  readonly processId: string;
  readonly processInstanceId: string;
  readonly finalState: StateObservation & {
    readonly status: ProcessStatus.Completed;
  };
  readonly messageDeliveryRecords: MessageDeliveryRecord[];
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

`started` means semantic execution admission and the separate Temporal host-capability predicate both passed and Temporal created the Workflow. `rejected` means either the Semantic Process/start pair is unsupported or the host cannot schedule its potential wait-set shape. The adapter returns this result before `client.start`; Workflow execution does not classify admission.

`semantic` means the command was accepted by the Workflow or its previously completed exact Update was recovered. Live execution and retry recovery return the same public shape.

`processClosed` means the non-reusable Process address is retained, its Workflow has a valid completed semantic receipt, and no accepted Update exists for this exact command. It is an adapter lifecycle result. It must not be converted to `CommandOutcome.Rejected`, appended to the canonical BPMN trace, or presented as a Lean/CIB/TypeScript semantic transition.

`processUnknown` means no retained Workflow or terminal receipt can establish that address. It covers a never-existing address and an execution removed after Temporal retention; the adapter cannot distinguish them without another durable store.

Workflow cancellation, termination, timeout, failure, service unavailability, Worker unavailability, client deadline, malformed terminal receipt, and replay incompatibility are infrastructure failures. They do not become any member of this result union.

A malformed command and reuse of one semantic command ID for a different well-formed stimulus are adapter request failures rather than semantic outcomes. Update ingress reports conflicting identity as non-retryable `BpmnCommandIdentityConflict` without failing or retrying the Workflow Task. Message Signal ingress validates before sending and reports malformed input as `BpmnMessageIngressInvalid`; a well-formed conflicting Signal cannot return a handler error, so the Workflow records `commandIdentityConflict` durably and the result Query/client translates that record to `BpmnCommandIdentityConflict`.

## Identity and retry contract

The semantic Process-instance ID, Temporal Workflow ID, Run ID, semantic command ID, and Temporal Update ID remain distinct.

The production adapter encodes the semantic Process-instance address as the typed tuple `["semanticProcessInstance", processInstanceId]`, hashes its UTF-8 JSON form with SHA-256, and prefixes the digest with `bpmn-process-sha256:`. It starts that Workflow ID with `workflowIdReusePolicy: "REJECT_DUPLICATE"`. The conformance harness may supply isolated Workflow IDs for independent disposable executions, but production start and command ingress derive the same ID from the semantic address. The encoding is host policy and never appears in canonical semantic state.

The Temporal Update ID must be a deterministic content-bound key over:

1. the semantic command ID;
2. the stimulus kind;
3. every semantic field of the exact well-formed stimulus.

It must not be the command ID alone. The lifecycle experiment proves that the pinned server returns the first Update result when the same Update ID is reused with a different payload, without invoking the Workflow handler. A command-ID-only Update key would therefore bypass the semantic core’s conflicting-payload check.

The adapter defines one canonical typed stimulus encoding and a SHA-256 digest. An exact retry produces the same Update ID and recovers the same semantic result. Reusing a command ID with a different stimulus produces a different Update ID, so it cannot silently alias the first result.

## Workflow lifetime contract

The production start boundary first checks the explicit start stimulus and Semantic Process program through semantic execution admission, then checks the program through the separate Temporal host-capability predicate. Only an `admitted` result calls `client.start`. The current conservative host predicate accepts passive User Task Update and Message Signal ingress, scope-owned passive User Task sets, and linear Timer/User Task composition, but rejects a token split combined with a Timer or effect wait as `concurrentHostDrivenWaits`.

The production Workflow receives that admitted Semantic Process program and one explicit start stimulus, including its required canonical string/null initial Process-variable list. It does not receive a future scenario command list.

The Workflow persists the semantic core's complete replacement runtime state, including definition-scope occurrences and the scope owner on every token and wait. Temporal does not project a child scope into a Child Workflow, Activity, Timer, Signal, cancellation command, or separate host lifecycle. Entry, child End consumption, quiescence, child completion, and the outer continuation remain internal core transitions within the one Process Workflow.

The start stimulus enters the single semantic input queue before any external handler becomes addressable. Only the main Workflow loop calls the semantic core, installs its initial Process variables, and mutates semantic state.

While semantic state is nonterminal, the loop waits for queued accepted inputs. When the semantic core reaches completed state, the loop:

1. applies every input already accepted into its queue so each accepted handler obtains a semantic result;
2. waits until `allHandlersFinished()` and the queue is empty;
3. returns one `CompletedProcessReceipt`;
4. accepts no host-defined grace period and waits for no future command.

Temporal decides whether a racing Update was accepted before the Workflow completion boundary. If accepted, it must complete with a semantic result before Workflow completion. If not accepted, the ingress contract resolves it through retained-result lookup and then `processClosed`.

Accepted-handler draining does not reserve acceptance for a future request and does not impose caller order on concurrent requests. Two distinct concurrent completions for one occurrence may therefore be durably accepted in either order; exactly one commits, one is rejected, and both orders must reach the same final semantic state. A caller that awaits terminal completion before submitting another distinct command chooses an explicit post-terminal schedule and receives `processClosed`.

## Command-ingress resolution

For one well-formed command and known semantic Process address:

1. derive the content-bound Update ID;
2. execute the completion Update and return `semantic` if it completes;
3. if Temporal reports the execution closed or not found, look up that exact Update ID first;
4. if the retained Update exists, return its original semantic result;
5. otherwise read and validate the retained completed Process receipt;
6. return `processClosed` only for that valid completed receipt;
7. return `processUnknown` only when neither execution nor receipt remains retained;
8. propagate every other host or transport failure as infrastructure failure.

Looking up the Update result before classifying closure closes the race where Temporal accepted the command but the caller lost its response as the Workflow completed.

## Message Signal ingress resolution

`submitMessageDelivery` requires the semantic Process address plus one complete well-formed `deliverMessage` stimulus. The caller-supplied subscription identity and resolved definition channel are both semantic address material; the Signal name is only transport.

The client validates the stimulus before Signal submission. A malformed or instance-conflicting request throws `BpmnMessageIngressInvalid` and emits no Signal. For well-formed input it sends `bpmn-deliver-message`, then polls the read-only `bpmn-message-delivery-result` Query for the exact stimulus. The Workflow-local ledger reports `pending`, the exact semantic outcome, or durable `commandIdentityConflict`. Only the main semantic loop records a semantic outcome.

An exact repeated Signal is coalesced to the original record and never causes a second core transition. Reuse of the command ID with a different well-formed Message stimulus records identity conflict without throwing from the Signal handler. Wrong subscription identity, wrong channel, pre-activation delivery, and stale delivery are ordinary semantic rejections because they are well-formed inputs that reach the core.

If the Workflow closes before the client receives its Query result, the completed receipt's ordered `messageDeliveryRecords` recover the exact semantic outcome or request failure. If no matching record exists, the ordinary `processClosed`/`processUnknown` lifecycle classification applies. Signal transport acceptance alone never implies BPMN Message consumption.

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
- an admitted ordinary embedded Sub-Process exposes both scope-owned child User Tasks through the existing passive Update path, retains the sibling and withholds the outer continuation after the first child completion, then exposes the outer User Task only after exact child quiescence;
- replacing the Worker between child completions preserves the first completed Update result, child scope state, sibling task, later outer continuation, terminal receipt, and replay result;
- the ordinary embedded Sub-Process history contains zero Signals, Timers, Activities, Child Workflows, and cancellation events;
- start precedes every external completion under immediate delivery and Worker restart;
- initial Process variables are visible at the first stable wait, retained through completion, and reconstructed identically by replay;
- a normal exact completion closes the Workflow with a validated completed receipt;
- every accepted racing Update completes before Workflow completion;
- an exact retry after closure returns the original semantic result;
- complete User Task Update identity includes the complete canonical submitted string/null patch;
- a different task identity or submitted patch under the same semantic command ID cannot alias that result;
- a conflicting command identity that reaches the Workflow returns `BpmnCommandIdentityConflict` without a Workflow Task failure;
- malformed Message ingress returns `BpmnMessageIngressInvalid` without emitting a Signal;
- a wrong-channel Signal is durably accepted by Temporal but returned as semantic rejection with exact state preservation;
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
- every pre-existing Workflow path retains zero Signal Events, while the Message path contains the exact ordered delivery Signal payloads and a seeded payload substitution fails the history check;
- a seeded command-ID-only Update-key mutation makes the payload-conflict witness fail.

The complete applicable pipeline must remain green. No production legacy lifecycle, finite scenario-stimulus-count lifetime, or compatibility branch is retained during pre-release.

## Optional and excluded functionality

An external tombstone or durable router is optional only after a consumer requires command-result or closed-address lookup beyond Temporal retention. That later proposal must specify its support window, atomic publication, rebuild or reconciliation path, authorization, cleanup, and failure classification.

Excluded from this specification:

- returning semantic rejection for a command never accepted by an already closed Workflow;
- keeping a Workflow alive solely to reject future commands;
- starting or reopening a Process through command ingress;
- Workflow-ID reuse, Update-With-Start, and host-derived semantic identity;
- Continue-As-New and cross-Run command-result lookup;
- cancellation, termination, timeout, reset, pause, failure, and operator-repair semantics, including exceptional child-scope interruption or propagation;
- Activities and effects beyond their separate capsules, Message payloads, key-based/global Message routing, modeled Message throw, Search Attributes, forms, variables beyond the current observation, task discovery, and timer forms or races beyond the separately specified exact Intermediate Catch Timer capsule.

## Re-open conditions

Reconsider the selected account only if:

- a required API consumer needs result lookup beyond Temporal retention;
- a future semantic profile permits commands after Process completion;
- Continue-As-New becomes necessary and accepted-result lookup cannot remain transparent across Runs;
- a platform limitation prevents reliable accepted-handler draining or exact Update-result recovery;
- an authorization or audit requirement needs an independently retained command ledger.
