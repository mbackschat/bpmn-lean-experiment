# Compensation semantics

## Status

Adopted kernel owner document (W0 extraction, 2026-11-09). The kernel modules it cites are the executable authority; where they differ, the difference is a defect of one of them.

`Kernel.Feature.Compensation` ([Lean](../../../Kernel/Feature/Compensation.lean)) owns `FeatureSlots.compensation`: the records of completed compensable work (`Compensable`) and the compensation runs in progress (`CompensationRun`), together with Transaction cancellation's compensation step. It dispatches on no guarded type of its own; [propagation](PROPAGATION-SEMANTICS-SPEC.md) hands it a Compensation throw or a caught Cancel through `Signal.compensate`, and the pipeline reports completions through `Hooks.completed` and `Hooks.handlerCompleted`. Admission is in `Kernel.Admission.Work`, `Kernel.Admission.Propagation`, `Kernel.Admission.Scopes` and `Kernel.Admission.Profile`.

## Interpretation

### Eligibility and retention

- Only successfully completed work with a compensation handler is compensable: an Activity with a boundary Compensation Event and its associated handler, or a Sub-Process containing a Compensation Event Sub-Process (BPMN 2.0.2 Tables 10.88 and 10.89, §13.5.5). An omitted `activityRef` selects every visible eligible record; it never makes handler-free work eligible ([CBR account][cbr-normative], [experiment result][cre-result]). The IL names one handler per subject (`Envelope.compensationHandler`).
- Eligibility is decided by the handler, lifetime by the scope: a completion of a subject with a handler is retained in the scope occurrence it completed in, and the record lives as long as that scope occurrence ([experiment result][cre-result], [`Compensation.completed`](../../../Kernel/Feature/Compensation.lean)). Retention is hidden semantic state, never reconstructed from publication ([experiment result][cre-result], [experiment scope][cre-scope]).
- A record carries the subject, its handler, the completed occurrence's identity and a completion ordinal; ordinals and identities are monotonic and never reused ([CBR contract][cbr-contract]). Active, interrupted or failed work completes nothing and retains nothing; an interrupting boundary path retains nothing ([CBR scope][cbr-scope], `TXC-RETAIN-01` in [TXC rules][txc-rules]).
- A boundary handler restores no context. A Compensation Event Sub-Process restores its parent's frozen completion-time context: the Process and Sub-Process variables visible inside the parent when it completed, never Task I/O, other Activities' local scopes, a live alias or an entry-time copy (§13.5.4, §13.5.5, §10.3.5, §10.4.1; [CESP account][cesp-normative], [CESP contract][cesp-contract]). Records and snapshots are keyed by the complete runtime occurrence, so a later per-instance account for loops and Multi-Instance parents needs no new identity ([CESP account][cesp-normative]).
- When a Sub-Process completes, the records retained inside it stay compensable: a Sub-Process with a handler keeps them as children its handler's own throw compensates, and one without a handler passes them to its parent's scope occurrence (§13.5.5; `Compensable.children`). The old accounts excluded implicit and recursive compensation and left OMG BPMN21-403 unresolved ([CBR account][cbr-normative], [CTH scope][cth-scope]), so admission refuses every program that would hand records on: `compensation.implicit` when a handler-less Scope's records would reach a parent occurrence a Compensation throw shares, `compensation.recursive` when the retaining Scope's handler body throws Compensation (PC-COMPENSATION-03 lifts them after its interpretation review).
- Leaving a scope occurrence without completing it drops every record retained in it ("presumed abort"; `State.leaveScope`), and ending the instance drops every record. The snapshot account retained a promoted root snapshot in the terminal state for a later parent host ([CESP scope][cesp-scope]); that retention is track work of PC-COMPENSATION-05, listed under the row below.

### Trigger and order

- A Compensation throw compensates the records retained in its own scope occurrence (BPMN 2.0.2 §10.7.2, §13.5.5): the run takes them out of retention atomically, so no other trigger can compensate them again, and the thrower continues only after every handler has completed; an empty set continues at once ([CTH basis][cth-normative], [CTH contract][cth-contract], [`Compensation.compensate`](../../../Kernel/Feature/Compensation.lean)). Only the global synchronous form is admitted.
- Order is the reverse of dependency: a direct Sequence Flow from subject A to subject B makes B's handler complete before A's starts; handlers without such a dependency run concurrently. Every pending handler none of whose successors is pending or running starts at once, in program order (§13.5.5; [CTH basis][cth-normative], [CSL account][csl-normative]). Completion chronology is not that order, and CIB's reverse creation-time order cannot implement it in general (`ProfileOptions.compensationOrder = dependency`). Gateway-mediated dependencies are not inferred ([CTH scope][cth-scope]).
- Each handler begins in a context scope occurrence of its own inside the run's scope, holding the restored context; its subject's child records move into that context, where a throw inside the handler compensates them ([`Compensation.beginHandler`](../../../Kernel/Feature/Compensation.lean)).
- A second trigger while a run is in progress in the same scope occurrence has no selected relation to the first and is refused (`compensation-concurrent-trigger`); so is a subject retained twice in one scope, which §13.5.5 compensates in reverse completion order (`compensation-repeated-subject`) ([CTH contract][cth-contract]).
- Compensation Start `isInterrupting`, Compensation Boundary `cancelActivity`, catch-side `waitForCompletion` and Association direction neither classify nor lower (Tables 10.87, 10.91, 10.92, 8.20; [CSL account][csl-normative]).

### Handler failure

- An Error a handler's effect reports and nothing inside the handler catches fails the process instance: the handler and its run fail, every token, item, occurrence and handler is removed, nothing continues, and the failed state publishes the run's trigger, the handler, the raising effect, the code and the message (`COMPH-FAIL-01`; [CTH contract][cth-contract], [`Compensation.failCompensation`](../../../Kernel/Feature/Compensation.lean)). BPMN 2.0.2 §13.3.2 names the handler states but not this disposition; it is a project interpretation, not BPMN or CIB transcription ([CTH basis][cth-normative]), selected by `ProfileOptions.compensationHandlerFailure = failsInstance`. A failed instance accepts no further input and is not a host failure; transport retries are never typed BPMN errors ([TXC rules][txc-rules]).
- Propagation never searches past a handler's context, so an event a handler leaves uncaught reaches the handler failure rule (see [propagation](PROPAGATION-SEMANTICS-SPEC.md)).

### Transaction cancellation

- A Transaction is a Sub-Process whose cancellation interrupts its running work and compensates its completed eligible work; its Cancel Boundary Event takes control after rollback and compensation finish (BPMN 2.0.2 §10.3.5). Ordinary interruption is no implicit compensation trigger, and quiescence alone does not implement protocol success ([TXC basis][txc-normative]).
- A Cancel End Event raises Cancel from the scope occurrence it ran in. A caught Cancel clears the Transaction's interior, compensates the records retained in it, and only once the last handler has completed cancels the Transaction occurrence and takes the Cancel boundary's flows in the parent; the Transaction's normal outflow never fires (`TXC-CANCEL-01`, `TXC-EMPTY-01`, `TXC-JOIN-01`; [`Propagation`](../../../Kernel/Feature/Propagation.lean)). With no eligible record the boundary is taken in the same step; unfinished work disappears uncompensated. Records of nested scopes the cancellation interrupts are dropped with them.
- A handler failure during cancellation fails the instance as above, and neither the boundary nor the normal flow continues (`TXC-FAIL-01`, a project extension of `COMPH-FAIL-01`, not a hazard boundary). Regional cancellation preserves everything outside the Transaction's region except its continuation (`TXC-FRAME-01`).
- `method` is omitted or exactly `##Compensate`, the XSD default; other spellings are neither case-folded nor aliased (OMG BPMN2-60; [TXC basis][txc-normative]).
- Publication: the Transaction stays open while it compensates, interrupted work closes as cancelled, the handler's lifecycle is published, and the Transaction then closes as cancelled before the boundary occurrence; retention and trigger ownership are no public fields, and there is no public cancel command ([TXC public][txc-public]).
- The old account rejected a Cancel boundary on an ordinary Sub-Process, a non-interrupting Cancel boundary and a Cancel End outside a Transaction before lowering (§10.5.5; [TXC contract][txc-contract]). The kernel refuses the same set (§10.5.5): `boundary.cancel.host` for a Cancel boundary on anything but a Transaction, `boundary.cancel.nonInterrupting` for a non-interrupting one, and `throw.cancel.outsideTransaction` for a Cancel throw whose direct parent is not a Transaction (`Admission.Subscriptions.boundary`, `Admission.Propagation.throwRecord`) (PC-TX-02).

## CIB relations

No register entry governs compensation or Transactions; every compensation account is standards-only and CIB's ordering, persistence and invocation algorithms stay outside the kernel ([CBR CIB][cbr-cib], [CESP CIB][cesp-cib], [CSL CIB][csl-cib], [CTH basis][cth-normative]). Two `ProfileOptions` fields name the CIB alternatives without selecting them:

| Option | Kernel reading | Alternative |
|---|---|---|
| `compensationOrder` | `dependency` (§13.5.5) | `reverseCreation`, CIB's reverse subscription creation order; refused, PC-COMPENSATION-01 |
| `compensationHandlerFailure` | `failsInstance` (`COMPH-FAIL-01`) | `selected`; refused, PC-COMPENSATION-01 |

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `throw.compensation.activity` | a targeted Compensation throw (`activityRef`) | PC-COMPENSATION-02 |
| `throw.compensation.asynchronous` | `waitForCompletion = false` | PC-COMPENSATION-02 |
| `activity.compensationHandler` | a handler on anything but a single User or Service Task, or on a Multi-Instance Activity | PC-COMPENSATION-03 |
| `activity.compensationHandler.input` | a handler with input mappings | PC-COMPENSATION-04 |
| `compensation.handlerWork` | a handler whose work cannot begin without a token (anything but none, manual, User or Service work) | PC-COMPENSATION-04 |
| `compensation.handlerMultiInstance` | a handler with Multi-Instance loop characteristics, whose asynchronous marks CIB skips (`BpmnParse.java:2416`) | PC-COMPENSATION-04 |
| `scope.transaction.method` | a Transaction method other than `##Compensate` | PC-TX-01 |
| `compensation.implicit`, `compensation.recursive` | a compensable Activity whose records a completed Sub-Process would hand to its parent beside a Compensation throw, or to a handler that throws Compensation | BPMN21-403 open; PC-COMPENSATION-03 |
| `boundary.cancel.host`, `boundary.cancel.nonInterrupting`, `throw.cancel.outsideTransaction` | a Cancel boundary off a Transaction or non-interrupting, a Cancel throw outside a Transaction | §10.5.5; PC-TX-02 |
| `profile.compensationOrder.reverseCreation`, `profile.compensationHandlerFailure.selected` | the CIB alternatives above | PC-COMPENSATION-01 |
| `compensation-concurrent-trigger`, `compensation-repeated-subject`, `compensation-dependency-cycle` (dynamic-only `unsupported`) | a second run in one scope, a subject retained twice, a dependency cycle among retained subjects | PC-COMPENSATION-02, PC-COMPENSATION-03 |
| `compensation-handler-error-without-effect`, `compensation-handler-escalation`, `compensation-handler-cancel` (dynamic-only `unsupported`) | an Error End, an Escalation or a Cancel leaving a handler | PC-COMPENSATION-04 |
| `raise-cancel` (dynamic-only `unsupported`) | a Cancel nothing catches | PC-TX-02 |

Superseded first-profile restrictions: the old checkpoints fixed one flat root with one User Task or Multi-Instance User Task family as subject, record and byte limits checked before completion, one root-owned trigger, three subjects with one dependency, one single-effect Service Task handler bound by a project URI, a String-only start binding sized against the snapshot and execution limits, one depth-one Transaction with a two-branch body and one eligible Task, and capacity limits per register and trigger ([CBR scope][cbr-scope], [CBR contract][cbr-contract], [CESP scope][cesp-scope], [CSL scope][csl-scope], [CTH scope][cth-scope], [CDS scope][cds-scope], [CDS rule][cds-rule], [CDS basis][cds-basis], [TXC scope][txc-scope], [TXC contract][txc-contract]). The kernel imposes no count or byte limit and admits handlers on any single User or Service Task and any Sub-Process, nested scopes, Transactions at any depth and any number of subjects; its codes above are the restrictions.

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-COMPENSATION-01 | The CIB relation for invocation order, visibility, context capture and handler failure; separating observations of completion chronology versus dependency order. |
| PC-COMPENSATION-02 | Targeted and asynchronous throws, repeated throws, Compensation End and explicit visibility through nested regions. |
| PC-COMPENSATION-03 | Eligibility for repeated subjects, effects, Calls and Multi-Instance bodies: the old account retains a Multi-Instance User Task once for the outer Activity, including zero items and a one-item early completion, while a sibling-cancelling early completion retains nothing ([CBR account][cbr-normative], [experiment record][cre-record]); §10.7.2's per-instance handlers for a Multi-Instance Sub-Process versus §13.5.5's once. |
| PC-COMPENSATION-04 | Handler bodies with human, Receive, effect, Call and Sub-Process work, typed data and handler failure other than an effect Error. |
| PC-COMPENSATION-05 | Compensation Event Sub-Processes for nested and Multi-Instance parents with one snapshot per instance, and handler precedence and explicit rethrow; whether a promoted root snapshot outlives the instance for a later parent host ([CESP scope][cesp-scope]). |
| PC-TX-01 | The successful Transaction path and its retention. |
| PC-TX-02 | Cancel over data-bearing work with several subjects and waiting handlers. |
| PC-TX-03 | Nested and Multi-Instance Transaction cancellation. |

## Sources

[cbr-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md#normative-account-and-selected-interpretation
[cbr-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md#required-optional-and-excluded-scope
[cbr-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md#program-and-runtime-contract
[cbr-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-BOUNDARY-HANDLER-RETENTION-PROPOSAL.md#cib-seven-relationship-boundary
[cds-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-SPEC.md#required-optional-and-excluded-functionality
[cds-rule]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-SPEC.md#stable-rule-and-transition-boundary
[cds-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-DURABILITY-START-DATA-REPAIR-SPEC.md#bpmn-and-cib-boundary
[cesp-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md#normative-account-and-selected-interpretation
[cesp-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md#required-optional-and-excluded-scope
[cesp-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md#runtime-context-and-lifecycle-contract
[cesp-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-PROPOSAL.md#cib-seven-relationship-boundary
[csl-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-SOURCE-LOWERING-PROPOSAL.md#normative-account-and-selected-interpretation
[csl-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-SOURCE-LOWERING-PROPOSAL.md#required-optional-and-excluded-scope
[csl-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-SOURCE-LOWERING-PROPOSAL.md#cib-seven-relationship-boundary
[cth-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#normative-authority-and-interpretation-boundary
[cth-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#required-optional-and-excluded-scope
[cth-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md#runtime-and-public-failure-contract
[txc-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TRANSACTION-CANCELLATION-SPEC.md#normative-authority-and-interpretation-boundary
[txc-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TRANSACTION-CANCELLATION-SPEC.md#required-scope-and-exclusions
[txc-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TRANSACTION-CANCELLATION-SPEC.md#definition-and-runtime-contract
[txc-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TRANSACTION-CANCELLATION-SPEC.md#semantic-rules
[txc-public]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TRANSACTION-CANCELLATION-SPEC.md#public-contract-and-observations
[cre-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/experiments/COMPENSATION-RETENTION-EXPERIMENT.md#scope-and-exclusions
[cre-result]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/experiments/COMPENSATION-RETENTION-EXPERIMENT.md#result
[cre-record]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/experiments/COMPENSATION-RETENTION-EXPERIMENT.md#recorded-for-the-compensation-capsules
