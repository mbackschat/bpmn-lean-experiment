# Temporal production-lifecycle experiment

## Status

**Executed and resolved adapter experiment; the selected account is implemented by the [Temporal Process lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md).**

## Question

Can a production Workflow close when the semantic Process completes, preserve an accepted command result for an idempotent retry, refuse a genuinely new post-closure command without resurrecting the Process, and reconstruct the same semantic state after Worker restart?

The question separates BPMN-visible command outcomes from Temporal host lifecycle outcomes. It does not make the disposable histories immutable.

## Competing accounts

| Account | Intended benefit | Material cost or risk | Separator |
|---|---|---|---|
| Permanent semantic entity Workflow | Every later command can reach a live Update handler | The Workflow remains operationally running after semantic completion, requires an unbounded retention or Continue-As-New policy, and eventually needs another cleanup boundary | Complete the semantic Process, then require the host to remain running solely to reject a later command |
| Durable router or parent entity plus process Workflow | A stable address can survive closure of the process Workflow | Adds another durable state machine, cross-Workflow ordering, result publication, cleanup, and identity boundaries before a consumer requires them | Race a process completion against routing or terminal-result publication |
| Closed Workflow plus retained command/result lookup | Host completion follows semantic completion; accepted Update results remain retrievable by command ID | A new command after closure is a typed adapter lifecycle result rather than a fabricated semantic rejection; availability is bounded by Temporal retention unless an external tombstone is later added | Retrieve one accepted Update result after closure, then submit a distinct Update and require closed-host refusal |

## Source and executable boundary

The probe uses the exact sequential scenario, admitted Semantic Process program, installed Temporal TypeScript SDK `1.21.0`, and cached Temporal CLI `v1.8.1`. The pinned source revisions and licenses are recorded in [SOURCES.md](../SOURCES.md).

The executable witness is [production-lifecycle.test.mjs](../../packages/temporal-adapter/test/production-lifecycle.test.mjs) and runs inside the focused Temporal gate:

```sh
./scripts/pnpm.sh run test:temporal
```

The test:

1. derives the Workflow ID from the semantic Process address and starts under an explicit `REJECT_DUPLICATE` Workflow-ID reuse policy;
2. reaches the exact open User Task;
3. stops the first Worker, starts a second Worker on the same Task Queue, and completes the task;
4. fetches the completed result and history, then stops the Worker;
5. retrieves the accepted completion result by its durable Update ID;
6. reuses that Update ID with a different semantic command and observes that Temporal returns the first result without invoking the Workflow handler;
7. requires a distinct completion Update with a distinct Update ID after Workflow closure to fail as `WorkflowNotFoundError` with the pinned server’s completed-execution classification;
8. requires `describe()` to report `COMPLETED`;
9. requires a second Workflow start under the same Workflow ID to fail rather than resurrect the semantic Process;
10. replays the captured history and tears down the server.

The result object is also checked not to contain the Temporal Workflow ID. Semantic Process-instance identity and host Workflow identity remain distinct.

## Red result and root correction

The first run failed after Worker restart. The original Workflow registered the completion Update handler before placing the semantic start stimulus in its queue. Temporal may run a handler as soon as it is registered, including while replaying a Workflow after restart, so completion could overtake start. An unusually early Update after initial Workflow start was the second instance predicted by the same mechanism.

The correction queues the admitted start stimulus before registering externally addressable handlers. The invariant is now explicit: no external completion can precede semantic Process start in the single semantic input queue, regardless of Worker cache state.

The content-bound identity review exposed a second failure. A completion that reused the already accepted start command ID under a distinct Update ID reached the handler, whose ordinary `TypeError` failed and retried the Workflow Task instead of returning a stable request failure. The validator and handler now report non-retryable `BpmnCommandIdentityConflict`; the Workflow remains waiting and accepts the subsequent exact completion.

## Green result

The original focused probe gate passed the restart witness and all then-existing sequential, parallel, concurrent-delivery, duplicate-delivery, Update-before-completion, and replay checks.

The pinned platform establishes these bounded facts:

- Workflow state reconstructs across Worker shutdown and replacement;
- a completed accepted Update remains addressable through its Update ID after Workflow completion;
- Update-ID deduplication is payload-blind at the project boundary, so the Update ID must be bound to exact stimulus content rather than the command ID alone;
- a conflicting semantic command identity that reaches the Workflow fails as an explicit non-retryable application failure without corrupting state or wedging the Workflow Task;
- a genuinely new Update is not accepted after Workflow completion;
- the completed execution remains describable during retention;
- explicit Workflow-ID non-reuse prevents accidental Process resurrection;
- replay reconstructs the same Workflow command history;
- none of those host identities enters the semantic result.

## Accepted-before-closure ordering witness and correction

Production-lifecycle TDD tested whether the sequential stale-completion discriminator could preserve its old four-target trace under a semantic-lifetime Workflow without retaining future scenario stimuli in Workflow input. That would require the successful completion and stale repeat both to be accepted before closure, with the successful completion reaching the semantic core first.

Two delivery accounts fail different halves of that contract:

| Account | Established behavior | Failure |
|---|---|---|
| Sequential `startUpdate` calls that each wait for `ACCEPTED` | Caller submission order is explicit | The successful completion can run to terminal state and close the Workflow before the caller can obtain acceptance and submit the stale command |
| Concurrent `startUpdate` calls followed by accepted-handler draining | Both requests can be in flight before semantic completion | Temporal processes messages in server-received order, not JavaScript call order; the executable witness received the stale command first and produced `rejected` followed by `committed` |

`allHandlersFinished()` closes neither gap. It ensures that handlers already accepted by Temporal finish before Workflow return; it does not reserve acceptance for a later request or impose caller-selected order on concurrent requests.

The retained red run received the stale command first and produced `[rejected, committed]`. Its green race contract now asserts exactly one committed and one rejected outcome with identical final state, without pinning which command wins. This preserves the discovered, semantically permitted host nondeterminism as executable evidence.

The owner selected the evidence correction rather than an explicit sequence protocol, ordered-batch production ingress, or grace period:

- the sequential stale scenario remains untouched CIB Seven, Lean, and pure-core semantic evidence;
- its Temporal schedule explicitly awaits the completed receipt before submitting the stale command, compares the semantic prefix through completion, and separately requires adapter-owned `processClosed`;
- the parallel live-sibling scenario completes task A and then repeats A while task B keeps the Process active, so the stale command reaches the semantic core and all four targets agree on semantic rejection;
- the stable `UTASK-REFUSE-02` proposition is unchanged and is indexed by both capsules.

The Query evidence boundary was resolved without enlarging `CompletedProcessReceipt`. The differential runner may transport a replay-reconstructed trace through Query only as a harness extraction mechanism. It reconciles each command outcome against the corresponding durable Update result payload and the terminal state against the receipt; only intermediate observations remain Query-only and are independently compared with the pure semantic core. Production canonical observation remains an explicit open API decision.

## Disposition

The experiment selected the closed-Workflow account as the smallest initial production boundary:

- derive Workflow completion from terminal semantic state after draining accepted handlers;
- derive the Temporal Update ID from the semantic command ID and exact canonical stimulus content;
- on an uncertain client retry, recover the existing Update result before classifying the Workflow as closed;
- classify a distinct command addressed after closure as an adapter lifecycle result, never as an invented BPMN command outcome;
- reject Workflow-ID reuse for one semantic Process-instance address;
- defer a durable router, permanent entity, or external tombstone until a retention or discovery consumer requires one.

The owner approved the lifecycle account and evidence correction. The focused Temporal gate and complete differential now implement the resulting contract; [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) is the current authority.

## Non-claims

The experiment and graduated implementation do not establish behavior after Temporal retention deletion, cross-Run Update lookup, Continue-As-New, cancellation or failure classification, an external tombstone, router/process atomicity, or a production canonical-observation API.

The implemented lifecycle exposes the approved typed three-way result:

1. an accepted or recovered semantic command result;
2. a known closed semantic Process with no matching accepted command;
3. an unknown or no-longer-retained Process address.
