# Temporal production-lifecycle experiment

## Status

**Executed adapter experiment; the restart-ordering correction is adopted, while the production lifecycle remains an unapproved proposal boundary.**

## Question

Can a production Workflow close when the semantic Process completes, preserve an accepted command result for an idempotent retry, refuse a genuinely new post-closure command without resurrecting the Process, and reconstruct the same semantic state after Worker restart?

The question separates BPMN-visible command outcomes from Temporal host lifecycle outcomes. It does not select the eventual public API or make retained prototype history immutable.

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

1. starts the current Workflow under an explicit `REJECT_DUPLICATE` Workflow-ID reuse policy;
2. reaches the exact open User Task;
3. stops the first Worker, starts a second Worker on the same Task Queue, and completes the task;
4. fetches the completed result and history, then stops the Worker;
5. retrieves the accepted completion result by its durable Update ID;
6. requires a distinct completion Update after Workflow closure to fail as `WorkflowNotFoundError` with the pinned server’s completed-execution classification;
7. requires `describe()` to report `COMPLETED`;
8. requires a second Workflow start under the same Workflow ID to fail rather than resurrect the semantic Process;
9. replays the captured history and tears down the server.

The result object is also checked not to contain the Temporal Workflow ID. Semantic Process-instance identity and host Workflow identity remain distinct.

## Red result and root correction

The first run failed after Worker restart. The original Workflow registered the completion Update handler before placing the semantic start stimulus in its queue. Temporal may run a handler as soon as it is registered, including while replaying a Workflow after restart, so completion could overtake start. An unusually early Update after initial Workflow start was the second instance predicted by the same mechanism.

The correction queues the admitted start stimulus before registering externally addressable handlers. The invariant is now explicit: no external completion can precede semantic Process start in the single semantic input queue, regardless of Worker cache state.

## Green result

The focused gate now passes the restart witness and all existing sequential, parallel, concurrent-delivery, duplicate-delivery, Update-before-completion, and replay checks.

The pinned platform establishes these bounded facts:

- Workflow state reconstructs across Worker shutdown and replacement;
- a completed accepted Update remains addressable through its Update ID after Workflow completion;
- a genuinely new Update is not accepted after Workflow completion;
- the completed execution remains describable during retention;
- explicit Workflow-ID non-reuse prevents accidental Process resurrection;
- replay reconstructs the same Workflow command history;
- none of those host identities enters the semantic result.

## Disposition

The experiment recommends the closed-Workflow account as the smallest initial production boundary:

- derive Workflow completion from terminal semantic state after draining accepted handlers;
- use the semantic command ID as the Temporal Update ID;
- on an uncertain client retry, recover the existing Update result before classifying the Workflow as closed;
- classify a distinct command addressed after closure as an adapter lifecycle result, never as an invented BPMN command outcome;
- reject Workflow-ID reuse for one semantic Process-instance address;
- defer a durable router, permanent entity, or external tombstone until a retention or discovery consumer requires one.

This is evidence for a proposal, not approval to change the production Workflow. The exact typed result union, race-resolution algorithm, terminal result shape, support window, and accepted-handler drain witness must be reviewed together before implementation.

## Non-claims and next discriminator

The probe does not establish a production Workflow whose lifetime is derived from semantic state, a public post-closure command API, behavior after Temporal retention deletion, cross-Run Update lookup, Continue-As-New, cancellation or failure classification, an external tombstone, or router/process atomicity.

The next discriminator is an owner-approved lifecycle proposal with a typed three-way result:

1. an accepted or recovered semantic command result;
2. a known closed semantic Process with no matching accepted command;
3. an unknown or no-longer-retained Process address.

Implementation must then add a live race witness in which accepted handlers drain before Workflow completion and a late distinct command is classified outside the semantic outcome type.
