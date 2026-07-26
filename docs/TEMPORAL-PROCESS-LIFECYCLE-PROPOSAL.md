# Temporal process lifecycle proposal

## Status

**Recommended for owner approval; not implemented as the production Workflow contract.**

## Scope

This proposal defines the smallest production lifecycle for the existing sequential and balanced-parallel User Task capsules. It answers when the Temporal Workflow closes, how accepted command retries recover their semantic result, and how a distinct command addressed after closure is classified without inventing BPMN behavior.

It does not add BPMN semantics, a task inbox, Activities, timers, cancellation, Continue-As-New, an external database, or an immutable deployment/history baseline.

## Required decision

Adopt a **semantic-lifetime Workflow with a retention-bounded closed-result boundary**:

- one Temporal Workflow Execution hosts one semantic Process instance while that instance is semantically active;
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
enum ProcessCommandResultKind {
  Semantic = "semantic",
  ProcessClosed = "processClosed",
  ProcessUnknown = "processUnknown",
}

interface CompletedProcessReceipt {
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

`semantic` means the command was accepted by the Workflow or its previously completed exact Update was recovered. Live execution and retry recovery return the same public shape.

`processClosed` means the non-reusable Process address is retained, its Workflow has a valid completed semantic receipt, and no accepted Update exists for this exact command. It is an adapter lifecycle result. It must not be converted to `CommandOutcome.Rejected`, appended to the canonical BPMN trace, or presented as a Lean/CIB/TypeScript semantic transition.

`processUnknown` means no retained Workflow or terminal receipt can establish that address. It covers a never-existing address and an execution removed after Temporal retention; the adapter cannot distinguish them without another durable store.

Workflow cancellation, termination, timeout, failure, service unavailability, Worker unavailability, client deadline, malformed terminal receipt, and replay incompatibility are infrastructure failures. They do not become any member of this result union.

A malformed command and reuse of one semantic command ID for a different well-formed stimulus are adapter request failures rather than semantic outcomes. The conflicting-identity failure type is `BpmnCommandIdentityConflict`; it is non-retryable and must reject the Update without failing or retrying the Workflow Task.

## Identity and retry contract

The semantic Process-instance ID, Temporal Workflow ID, Run ID, semantic command ID, and Temporal Update ID remain distinct.

The platform derives one collision-safe Workflow ID from the semantic Process address and starts it with `workflowIdReusePolicy: "REJECT_DUPLICATE"`. The encoding is host policy and never appears in canonical semantic state.

The Temporal Update ID must be a deterministic content-bound key over:

1. the semantic command ID;
2. the stimulus kind;
3. every semantic field of the exact well-formed stimulus.

It must not be the command ID alone. The lifecycle experiment proves that the pinned server returns the first Update result when the same Update ID is reused with a different payload, without invoking the Workflow handler. A command-ID-only Update key would therefore bypass the semantic core’s conflicting-payload check.

The project must define one canonical typed stimulus encoding and a collision-resistant digest before implementation. An exact retry produces the same Update ID and recovers the same semantic result. Reusing a command ID with a different stimulus produces a different Update ID, so it cannot silently alias the first result.

## Workflow lifetime contract

The production Workflow receives an admitted Semantic Process program and one explicit start stimulus. It does not receive a future scenario command list.

The start stimulus enters the single semantic input queue before any external handler becomes addressable. Only the main Workflow loop calls the semantic core and mutates semantic state.

While semantic state is nonterminal, the loop waits for queued accepted inputs. When the semantic core reaches completed state, the loop:

1. applies every input already accepted into its queue so each accepted handler obtains a semantic result;
2. waits until `allHandlersFinished()` and the queue is empty;
3. returns one `CompletedProcessReceipt`;
4. accepts no host-defined grace period and waits for no future command.

Temporal decides whether a racing Update was accepted before the Workflow completion boundary. If accepted, it must complete with a semantic result before Workflow completion. If not accepted, the ingress contract resolves it through retained-result lookup and then `processClosed`.

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

## Required evidence before graduation

Implementation may graduate this document to `-SPEC` only when the focused Temporal gate demonstrates:

- Workflow lifetime depends on terminal semantic state and contains no scenario-stimulus count;
- start precedes every external completion under immediate delivery and Worker restart;
- a normal exact completion closes the Workflow with a validated completed receipt;
- every accepted racing Update completes before Workflow completion;
- an exact retry after closure returns the original semantic result;
- a different payload under the same semantic command ID cannot alias that result;
- a conflicting command identity that reaches the Workflow returns `BpmnCommandIdentityConflict` without a Workflow Task failure;
- a distinct post-closure command returns `processClosed`;
- a never-existing address returns `processUnknown`;
- Workflow-ID reuse and Update-With-Start command ingress are absent;
- Query and canonical result projections contain no Workflow ID, Run ID, or Update ID;
- the produced histories replay and every Worker/server resource is cleaned up;
- a seeded command-ID-only Update-key mutation makes the payload-conflict witness fail.

The complete applicable pipeline must remain green. The current conformance-scenario Workflow may be replaced only atomically; no production legacy lifecycle or compatibility branch is retained during pre-release.

## Optional and excluded functionality

An external tombstone or durable router is optional only after a consumer requires command-result or closed-address lookup beyond Temporal retention. That later proposal must specify its support window, atomic publication, rebuild or reconciliation path, authorization, cleanup, and failure classification.

Excluded from this proposal:

- returning semantic rejection for a command never accepted by an already closed Workflow;
- keeping a Workflow alive solely to reject future commands;
- starting or reopening a Process through command ingress;
- Workflow-ID reuse, Update-With-Start, and host-derived semantic identity;
- Continue-As-New and cross-Run command-result lookup;
- cancellation, termination, timeout, reset, pause, failure, and operator-repair semantics;
- Activities, effects, timers, messages, Search Attributes, forms, variables, and task discovery.

## Re-open conditions

Reconsider the selected account only if:

- a required API consumer needs result lookup beyond Temporal retention;
- a future semantic profile permits commands after Process completion;
- Continue-As-New becomes necessary and accepted-result lookup cannot remain transparent across Runs;
- a platform limitation prevents reliable accepted-handler draining or exact Update-result recovery;
- an authorization or audit requirement needs an independently retained command ledger.
