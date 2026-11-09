# Publication and observation semantics

This document owns what one input commits and what is observed of it: the outcome classes, the journal of micro-steps, flow-node occurrence identity and lifecycle, the state observation, internal scheduling and the publication a host derives from the journal. [`Kernel/State.lean`](../../../Kernel/State.lean) holds the journal and the failure classes, [`Kernel/Step.lean`](../../../Kernel/Step.lean) the step and closure, [`Kernel/Publish.lean`](../../../Kernel/Publish.lean) and [`Kernel/Host.lean`](../../../Kernel/Host.lean) the projections, [`Kernel/Run.lean`](../../../Kernel/Run.lean) the canonical result; the [temporal host's publication](../../../packages/temporal-host/src/publication.ts) numbers the journal. Compatibility means equivalent consequences at the declared observation boundary, never equal internal representations ([representation boundary][aah-repr]).

## Interpretation

### Outcomes and atomicity

- An input either commits one stable state or returns one failure: `rejected` (command admission refused it; state unchanged), `rolledBack` (its closure could not continue; the state before the command), `semanticFailure` or `unsupported`. Harness and infrastructure failures never appear among them ([outcomes][aah-obs]). A rolled-back command leaves the pre-command state but is not equivalent to no command ([outcomes][aah-obs]).
- Speculative state inside a command is never observable: a failure publishes no transition, lifecycle fact or commit time, and rollback undoes admission itself, including removal of a completed wait, not just the last internal batch ([effect boundary][aah-effect], [rollback boundary][cia-rollback], [command contract][cia-command], [atomic publication][epub-rules]).
- A closure that does not settle within the closure bound is reported, never truncated. The reviewed contract rolls the whole command back to the exact state before admission and classifies the bound as a harness failure before any observation ([command contract][cia-command], [required][cia-required]); `Step.settle` returns `unsupported "closure-bound"` with an observation (kernel differs; reported).
- An input naming an occurrence, wait, incident or effect the state lacks commits nothing and preserves the state ([ownership rules][aoo-rules]): `unknown-occurrence`, `unknown-user-task`, `unknown-timer`, `unknown-message-subscription`, `unknown-effect`, `unknown-incident`.
- Logical time never runs backward: an input stating a time before the clock is `rejected "logical-time-backward"`; a Timer firing without its own time happens at its deadline ([monotonicity][rsi-contract]).
- In a scenario, a rejected input that is not last is observed and the run continues; any other failure ends the run with that outcome (`Kernel/Run.lean`).

### Journal

- Each micro-step appends one `Transition`: its cause (the input's tag, a signal, an arrival on a flow, an idle scope occurrence), the element acted on, the owning scope occurrence, the occurrences it started with their source type, and the occurrences it ended with their terminal. The first transition is the input's own; the rest are the closure's micro-steps in executed order. Nothing else is journalled: no enabled step that did not run, no speculative admission, rejected command, host retry, Workflow Task, Activity attempt, Query or state difference ([exact committed sequence][epub-rules], [public contract][epub-contract]).
- Revision is publication sequencing, not runtime state: the journal is unnumbered, and a host numbers it ([public contract][epub-contract]).
- The published history retains every input's payload unredacted, so the exact inputs replayed under the exact program reconstruct the committed state ([trace completeness][epub-rules], [public contract][epub-contract]).

### Flow-node occurrences

- One start for each flow-node execution, then exactly one `completed` or `cancelled` terminal. A long-lived occurrence stays open across inputs; a pass-through element begins and completes in one micro-step; within one transition starts precede ends. No input, Sequence Flow, private wait, incident or root process is an occurrence; a called root process is not a flow node ([lifecycle][fnom-rules], [contract][fnom-contract]).
- Arming a subscription starts no occurrence: a boundary, Event Sub-Process start or Event-Based Gateway arm is a reservation with its identity issued, begun and journalled only when its trigger arrives ([lifecycle][fnom-rules]). An interrupting boundary that fires starts and completes, and the host occurrence and every open occurrence of its removed region are cancelled; a non-interrupting one leaves the host open; a matched Error cancels the throwing Activity and its boundary starts and completes in the same transition.
- An Event-Based Gateway's candidates, in the reviewed contract, each start at arming, and the losers are cancelled when one wins ([lifecycle][fnom-rules]); in the kernel they are reservations, so only the winner starts and the losers never appear (kernel differs; reported).
- A Gateway starts and completes once however many tokens it emits; a Sub-Process occurrence spans entry to completion; a Call Activity occurrence spans invocation to return; a Terminate End starts and completes and every other open occurrence of the terminated region is cancelled ([lifecycle][fnom-rules]). Removal journals each begun occurrence cancelled, deepest scope first, then by issue.
- An occurrence's key is its process instance, element, activation and role. Activation counts per process instance, element and role, from 1; a Multi-Instance body and its instances number apart. Element identifier alone is never an occurrence key ([exact position][epub-rules]). The reviewed public identity was instead the hosting instance, the start revision and the index among that transition's starts, with private anchors ([contract][fnom-contract]) (kernel differs; reported).
- Issuing: an activation counter only grows, so an identity is never reissued, not even after its occurrence ended. A reservation takes its number when armed and keeps it when it begins; a withdrawn reservation leaves its number unused ([issuing rule][iss-rule], [ownership account][aoo-account]).

### Attached subscriptions and regional removal

- Every subscription attached to an Activity occurrence names it (`OpenItem.attachedTo`), and its owner is the scope occurrence containing the Activity. Ending or cancelling the Activity occurrence, by whatever route, disarms everything attached to it, reservations included ([root mechanism][aoo-root], [ownership account][aoo-account], [required][aoo-required]).
- Removing a region removes every token, open item, occurrence, slot entry, variable set and child scope occurrence inside it, so no retained occurrence or subscription references a removed one ([regional preparation][reg-contract]).
- This is a project representation with no CIB relation ([CIB boundary][aoo-cib]). The reviewed decision to keep a separate Activity record only for an Activity that owns state beyond its body ([decisions][aoo-decisions]) is superseded by the flat state of the [proposal](../../LEAN-KERNEL-REWRITE-PROPOSAL.md#runtime-state-and-step), in which every flow-node occurrence has one record.

### State observation

- The observation states status, logical time, the instance root's variables in name order, the open waits in canonical order (process instance, element, activation, detail kind) and, when failed, the failure; the order in which an implementation opened its waits is never published (`Kernel/Run.lean`, `Kernel/Host.lean`).
- The reviewed observation contract requires multiplicity preserved, scope-qualified variables, the enabled external interactions, the command outcome, stable canonical identity derived from semantic ownership and lifecycle, logical rather than wall-clock time and failure categories rather than exception types; each profile declares which consequences it compares ([observation boundary][aah-boundary], [observation contract][aah-obs]). The kernel publishes the instance root's variables only, not those of inner scopes (kernel differs; reported).

### Internal scheduling

- Program collection order is not BPMN scheduling meaning. Simultaneously enabled internal steps may run in one canonical order only where that order is observationally irrelevant; a material choice is explicit semantic input, carried beside the external input and never inferred from Event History, Workflow Task order, host readiness, randomness or collection order. An overlapping choice with no such input does not commit. The published batch order is canonical and replay-stable; raw visit order stays private ([decision question][ic-question], [publication contract][ic-checkpoint], [final account][ic-final], [excluded][ic-final-work]).
- `Step.settle` resolves every enabled set by a fixed order: queued signals first, then tokens in list order, then the first idle scope occurrence. It has no ambiguous-choice outcome and no choice input (kernel differs; reported).
- No footprint, scheduler choice, raw visit order or Temporal identity is published ([checkpoint boundary][ic-boundary]); a host refuses a program that needs a choice schedule before any Workflow starts ([final account][ic-final]).

### Runtime invariants

- The reviewed runtime contract was one executable well-formedness predicate over the whole state plus separate two-state monotonicity relations ([contract][rsi-contract], [exclusions][rsi-exclusions], [well-formedness][esi-wf]). The [proposal](../../LEAN-KERNEL-REWRITE-PROPOSAL.md#runtime-state-and-step) replaces it: invariants live per feature in `Laws.<F>`, with no global well-formedness function. The facts that carry over: a not-started instance holds nothing; a completed or cancelled one holds no live occurrence or token; every token, open item and occurrence names a live scope occurrence; identities are unique per family; counters and logical time never decrease.

### Host publication

- One process instance is one Workflow chain under one Workflow ID. Continue-As-New produces no BPMN fact and resets neither logical time, revision, occurrence identity, command identity nor definition identity; Workflow, Run and segment identities never enter a public result ([chain decision][wcb-decision], [chain contract][wcb-contract]).
- Workflow completion derives from the terminal semantic state after accepted handlers drain; a command addressed after closure is an adapter lifecycle result, never an invented BPMN command outcome; one Process-instance address never reuses a Workflow ID ([lifecycle disposition][tpl-disposition]).
- Each journal transition is one revision, numbered from 1 across the chain; revision 0 is the empty cursor; an input's transitions form one batch, and a page holds complete batches only ([public contract][epub-contract], [durable boundary][epub-durable]).
- A reader at a cursor before the retained Run is told it is a gap; history after Temporal retention is unavailable, never reconstructed ([hosting absent][th-absent], [hosting nearest][th-nearest], [chain exclusions][wcb-excluded]). No caller order is imposed on concurrent distinct commands, no semantic policy is copied into the Workflow, and capacity exhaustion is not a semantic outcome ([hosting absent][th-absent], [chain exclusions][wcb-excluded]).
- The occurrence publication is aligned with the execution publication: same command, revisions and head, a transition without lifecycle change kept with two empty lists ([contract][fnom-contract]). The temporal host lists only transitions with facts and omits a batch with none (kernel differs; reported).
- A committed batch carries one deterministic Workflow clock sample, taken after stable closure and before publication; it is not BPMN logical time and never affects a semantic decision ([commit time][fnom-rules]).

### Deployment input

- A definition is deployed from its exact bytes and an optional source overlay whose identifier, digest and bytes are present together or absent together; the selection is captured at entry and the compiler's returned identity must equal it; omission selects no overlay, never a default ([deployment contract][bpd-deploy]). An overlay selects no semantic family: it binds exact source tokens and inert metadata only to capabilities the profile already admits ([overlay contract][a12-overlay]); a digest mismatch or non-strict overlay is refused as `source.overlay` ([admission](admission.md)).

### Platform consumption

Product 2 consumes the publication and never runs the kernel ([trace completeness][epub-rules]): it applies a page transactionally at its exact cursor, treats an overlapping retry as byte-identical or an integrity failure, rebuilds from revision 0 to the same rows, and records a gap rather than filling it from state differences, Event History, audit or another instance ([publication rules][epub-rules], [required][epub-required]). Flow-node metrics count starts per exact definition version, use completed occurrences only for duration, exclude called-process interiors, and suppress the whole snapshot when any member is unavailable ([metrics rules][fnom-rules], [metrics required][fnom-required]).

## CIB relations

None: publication and observation are project contracts, and CIB-visible facts enter through the feature documents' relations ([CIB boundary][aoo-cib]).

## Restrictions

| Code | Refused | Reason or owning row |
|---|---|---|
| `logical-time-backward` (rejected) | an input stating a time before the clock | logical time is monotone |
| `unknown-occurrence`, `unknown-user-task`, `unknown-timer`, `unknown-message-subscription`, `unknown-effect`, `unknown-incident` (rejected) | an input naming what the state lacks | command admission |
| `instance-not-started`, `instance-already-started`, `instance-not-running` (rejected) | an input against the wrong lifecycle | command admission |
| `closure-bound` (unsupported, dynamic-only) | a closure longer than the bound | its length depends on the run |

## Open rows

| Row | Owed |
|---|---|
| W0 semantic-publication contract | The re-cut shape (element identity, source element type, transition role, no IL kinds); whether per-transition logical time, token and scope position deltas and current positions ([exact position][epub-rules]) remain; the [schema](../../../contracts/schemas/semantic-publication.schema.json) still carries operation kinds |
| W0.3 host publication | Query arms `notReady`, `notFound`, `unavailable`, commit time, current snapshot, strict export and the aligned occurrence batches in the temporal host |
| Proof wave | `Laws.<F>` modules for the carried-over invariants (kernel status map open lane) |

## Sources

[aah-repr]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md#33-internal-representation-is-not-the-compatibility-boundary
[aah-boundary]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md#96-observation-boundary
[aah-effect]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md#144-transaction-and-effect-boundary
[aah-obs]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/ARCHITECTURE-AND-ASSURANCE-HANDOFF.md#16-canonical-observation-contract
[aoo-root]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#root-mechanism
[aoo-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#selected-account
[aoo-required]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#required-optional-and-excluded
[aoo-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#stable-semantic-rules
[aoo-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#cib-seven-relationship-boundary
[aoo-decisions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md#decisions-taken
[bpd-deploy]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/BUSINESS-PROCESS-PUBLIC-DELIVERY-PROPOSAL.md#public-deployment-contract
[a12-overlay]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/A12-ADD-ON-BOUNDARY-PROPOSAL.md#public-source-overlay-contract
[esi-wf]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ENGINE-SEMANTIC-INVARIANT-IMPLEMENTATION-MAP.md#runtime-state-well-formedness
[ic-question]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/INTERNAL-COMMUTATION-PROPOSAL.md#decision-question-and-boundary
[ic-checkpoint]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/INTERNAL-COMMUTATION-PROPOSAL.md#checkpoint-execution-and-publication-contract
[ic-final]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/INTERNAL-COMMUTATION-PROPOSAL.md#selected-final-closure-account
[ic-boundary]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/INTERNAL-COMMUTATION-PROPOSAL.md#implemented-checkpoint-boundary
[ic-final-work]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/INTERNAL-COMMUTATION-PROPOSAL.md#final-closure-required-optional-and-excluded-work
[reg-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/INTERNAL-REGIONAL-OWNERSHIP-CLOSURE-PROPOSAL.md#selected-preparation-contract
[iss-rule]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/RUNTIME-STATE-ACTIVITY-ISSUING-DISCIPLINE-PROPOSAL.md#selected-rule
[rsi-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/RUNTIME-STATE-INVARIANT-SPEC.md#contract
[rsi-exclusions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/RUNTIME-STATE-INVARIANT-SPEC.md#exclusions
[th-absent]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md#explicitly-absent
[th-nearest]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md#nearest-unsupported-claims
[wcb-decision]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md#decision
[wcb-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md#required-public-contract
[wcb-excluded]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/TEMPORAL-WORKFLOW-CHAIN-BOUNDS-PROPOSAL.md#excluded-functionality-and-reopen-conditions
[tpl-disposition]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/experiments/TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md#disposition
[epub-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md#public-contract
[epub-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md#stable-rules
[epub-durable]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md#durable-boundary
[epub-required]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md#required-optional-and-excluded-functionality
[fnom-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md#public-contract
[fnom-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md#stable-rules
[fnom-required]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md#required-optional-and-excluded-functionality
[cia-rollback]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERNAL-CLOSURE-ATOMICITY-REPAIR-SPEC.md#rollback-boundary
[cia-required]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERNAL-CLOSURE-ATOMICITY-REPAIR-SPEC.md#required-optional-and-excluded-functionality
[cia-command]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERNAL-CLOSURE-ATOMICITY-REPAIR-SPEC.md#command-contract
