# Scopes semantics

`Kernel.Feature.Scopes` ([Lean](../../../Kernel/Feature/Scopes.lean)) owns the guarded type `ScopeKind` (`embedded`, `transaction`, `eventSubProcess`): entering a Scope, beginning its start Event or implicit children, arming its boundaries and Event Sub-Process starts, and completing it when its scope occurrence is idle. `Kernel.Admission.Scopes` ([Lean](../../../Kernel/Admission/Scopes.lean)) admits it. Idleness, the completion pipeline and generic subtree removal belong to `Kernel.Step` and `Kernel.State`; a Terminate End is dispatched by `Kernel.Feature.Propagation`, which owns `Throw`; Transaction cancellation is stated in [compensation](compensation.md); the variables a Scope declares and writes are stated in [data](data.md).

## Interpretation

### Entry and quiescent completion

- An embedded Sub-Process (BPMN 2.0.2 §10.3.5, §13.3.4) is instantiated when a token reaches it: each arrival creates exactly one fresh scope occurrence owned by the arriving occurrence and one entry token in it ([SUBPROC][subproc-normative], [SUBPROC rules][subproc-rules], `NSC-ENTER-01` in [NSC rules][nsc-rules]).
- A None End inside the Scope consumes only its own token and completes nothing while the occurrence owns other work (`SUBPROC-END-01`, `NSC-END-01`).
- A scope occurrence completes exactly when it owns no token, no open wait, no begun occurrence and no child scope occurrence, independently of declaration order and of other live occurrences of the same definition; completion removes the occurrence and continues the parent exactly once (`SUBPROC-QUIESCE-01`, `NSC-QUIESCE-01`, `CEA-QUIESCE-01` in [CEA rules][cea-rules]). The kernel's `Step.idle` is that test; a passive item (an Event Sub-Process start subscription) keeps nothing alive and is removed with its scope.
- A join inside a Scope fires only from tokens of its own scope occurrence; a completion in a nested scope never satisfies an outer join early, and work in one branch leaves every sibling unchanged (`NSC-JOIN-01`, `NSC-OUTSIDE-01`). Join semantics are stated in [flow](flow.md).
- Every outgoing flow of a None Start and of a completing Sub-Process receives a token in that one step, with no separate split step or position (BPMN 2.0.2 §10.5.1, §13.3.1, §13.3.4; `SCPH-START-01`, `SCPH-EXIT-01` in [SCPH rules][scph-rules]; [SCPH basis][scph-normative]). The kernel completes a Sub-Process with `Leave.outgoing`, which `Feature.Flow.outflow` turns into one token per outgoing flow.
- A command addressed to a completed or absent occurrence is rejected and changes nothing, before and after its Scope completes (`SUBPROC-REFUSE-01`, `NSC-REFUSE-01`, `CEA-REFUSE-01`).
- Declaration order of children and flows is not semantics ([SUBPROC admission][subproc-admission]).

### Concurrent activations and re-entry

- Each token reaching a Scope creates a fresh occurrence even while another occurrence of the same definition is live, and progress in one occurrence leaves every other occurrence, its tasks and tokens, and outside work unchanged (`CEA-OCCUR-01`, `CEA-ISOLATE-01`; [CEA basis][cea-normative]). Two arrivals through a converging Exclusive Gateway give two passes and two occurrences ([CEA basis][cea-normative]). Occurrences of one element are told apart by their activation number, counted per process instance and element ([CEA contract][cea-profile]).
- A Sequence Flow loop that re-enters a Scope or Call creates a new instance on every traversal (BPMN 2.0.2 Table 7.2, §13.3.4, §10.3.6; [SRE basis][sre-normative]): each traversal's occurrence has an activation one greater than the previous one and no identity is reused (`SRE-FRESH-01` in [SRE rules][sre-rules]); a re-entered Scope holds exactly its inputs evaluated at that entry and no local of an earlier occurrence is readable (`SRE-INIT-01`); values an earlier iteration wrote outward stay until replaced (`SRE-RETAIN-01`); each completion writes its outputs once from its own occurrence (`SRE-OUTPUT-01`); a command or result addressed to an earlier iteration's occurrence is rejected (`SRE-STALE-01`). Re-entry is visible only through activation numbers; the scope occurrence itself is never published ([SRE contract][sre-profile]).

### Terminate End

- A Terminate End (BPMN 2.0.2 §10.5.6, §13.2, §13.5.6, Table 12.22) consumes its token and atomically removes every other live owner in its scope occurrence's subtree, keeping that occurrence, which is then quiescent and completes through the ordinary scope completion; the Terminate End's own occurrence completes normally ([TEND basis][tend-normative], `TEND-REGION-01` in [TEND rules][tend-rules]). The kernel's `Propagation.arriveThrow` clears the scope with `State.clearInside` keeping its own occurrence.
- At the process level the instance completes without a parent token (`TEND-ROOT-01`). Inside a Sub-Process the reviewed account terminates only that Sub-Process instance (§13.5.6) and continues the parent exactly once through the Sub-Process's ordinary completion (`TEND-NESTED-01`; [TEND account][tend-account]) (kernel differs; reported): the kernel reads §13.3.4 and §13.5.6 as leaving the parent's continuation open (`AbnormalScopeEnd.withoutOutflow`), refuses such a program under that reading, and implements only the normal continuation selected by [CIB-INT-0007](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0007--a-sub-process-left-abnormally-completes-normally).
- Rejected accounts: terminating the root regardless of placement; lowering the Terminate End to the parent's outgoing flow; removing the scope occurrence together with its contents; exposing a half-terminated state ([TEND account][tend-account]). A stale command for cancelled work is rejected (`TEND-REFUSE-01`); termination adds no public field (`TEND-OBSERVE-01`). The pinned CIB cancels the concurrent executions of the flow scope first, in agreement, and no CIB relation is needed ([TEND CIB][tend-cib]).

### Event Sub-Processes

- An Event Sub-Process is dormant outside normal flow, has one triggered start and no incoming or outgoing parent flow (§10.3.5, §10.5.2, §13.5.4); its start subscription is armed when its parent scope occurrence is entered, as a passive item that keeps nothing alive and is removed when the parent completes, and dormant registration creates no scope or flow-node occurrence ([IMESP basis][imesp-source], [IMESP contract][imesp-contract]). The kernel holds the start Event's identity as an unbegun reservation (`Occurrence.begun = false`) and begins it only when the trigger arrives.
- An interrupting start interrupts all non-final ordinary work of the parent, active User Tasks included, while the parent's context is preserved for the handler; this reuses the reviewed Sub-Process interruption reading of §13.3.2 ([IMESP basis][imesp-source]; see [subscriptions](subscriptions.md#boundaries)). On delivery the subscription is consumed, ordinary work is cancelled and the handler scope is created in one atomic input; completed history stays completed and no cancelled path can resume ([IMESP contract][imesp-contract]). The kernel clears the parent occurrence, its other Event Sub-Process starts included, keeping the handler occurrence; the parent's own boundaries stay armed until the parent completes.
- When the handler completes it produces no parent token; at the process level the instance then completes ([IMESP contract][imesp-contract]). Ordinary completion before the trigger withdraws the dormant subscription and invents no handler lifecycle. Task completion and delivery are ordered inputs with no BPMN priority: whichever commits first makes the other stale.
- A non-interrupting start leaves the parent's work running; a Message start stays open with its identity and a cycle Timer re-arms ([REPEATABLE scope][rep-scope]); see [subscriptions](subscriptions.md#repetition).

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-AGR-0007](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion) | Agreement on quiescent completion of one embedded Sub-Process at one level; no new relation is needed for nested, concurrent or re-entered Scopes, which the standard settles ([SUBPROC CIB][subproc-cib], [NSC basis][nsc-normative], [CEA basis][cea-normative]). |
| [CIB-INT-0007](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0007--a-sub-process-left-abnormally-completes-normally) | Selected by `ProfileOptions.abnormalScopeEnd = completesNormally`: a Sub-Process left by a Terminate End or an interrupting Event Sub-Process completes normally and takes its outgoing flows. |
| [CIB-AGR-0022](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0022--a-none-starts-start-and-an-embedded-sub-processs-completion-take-every-unconditioned-outgoing-flow-in-their-one-step) | Agreement: a None Start and a completing Sub-Process take every unconditioned outgoing flow in one step ([SCPH basis][scph-normative]). |
| [CIB-EXT-0020](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes), [CIB-EXT-0021](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0021--call-variable-mappings-by-name-across-the-instance-boundary) | Their name-based inputs and outputs apply at each activation of a re-entered Scope or Call ([SRE basis][sre-normative]); stated in [data](data.md). |
| [CIB-AGR-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0001--sequential-process-and-user-task-lifecycle), [CIB-OP-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0001--cib-host-task-identity-mapped-to-project-semantic-task-identity) | Reused only for the User Tasks inside these Scopes; no evidence for termination or Event Sub-Processes ([TEND CIB][tend-cib], [IMESP basis][imesp-source]). |

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `profile.abnormalScopeEnd.withoutOutflow` | under the standards reading, a program with a Terminate End inside a Sub-Process or any interrupting Event Sub-Process | the kernel has only the normal continuation of CIB-INT-0007; see the reported difference above |
| `scope.eventSubProcess.interruptingMessage` | an interrupting Message Event Sub-Process | the kernel treats its meaning for the interrupted Scope as unselected (kernel differs from the reviewed account above; reported); PC-MESSAGE-06 |
| `timer.interruptingCycle` | an interrupting Event Sub-Process or boundary started by a cycle Timer | it has no second firing to give |
| `scope.multiInstance` | a Multi-Instance Sub-Process | PC-MI-04, PC-MI-05, PC-MI-06 |
| `scope.localVariableWithoutInput` | a declared Scope local without an input mapping | no initial value the kernel could choose |
| `scope.implicitStart` | a Gateway or Event that would begin at Scope entry without a none start, and an implicitly begun Activity whose work cannot begin without a token | BPMN 2.0.2 §13.3.4 begins them; the kernel has no token for them |
| `scope.transaction.method` | a Transaction method other than compensate | stated in [compensation](compensation.md) |
| `call.calledEventSubProcess` | a called process with an Event Sub-Process | stated in [work](work.md); PC-SCOPE-06 |
| `scope-implicit-start` (dynamic-only `unsupported`) | an implicit child that is neither Activity nor Scope | backstop of `scope.implicitStart` |

Superseded first-profile restrictions: the embedded, nested, concurrent and re-entry profiles bounded depth (three), User Task counts (128), the closure (eight internal steps, `SRE-BURST-01`), task-only branches, serial merge-target bodies, singleton host placement (`SCPH-SINGLE-01`), required Start bindings (`SRE-AVAILABLE-01`), and excluded data, boundaries, Event Sub-Processes, Calls, cycles and Terminate inside these Scopes ([SUBPROC profile][subproc-profile], [NSC scope][nsc-scope], [NSC admission][nsc-admission], [NSC contract][nsc-profile], [CEA scope][cea-scope], [CEA admission][cea-admission], [SCPH scope][scph-scope], [SCPH admission][scph-admission], [SCPH contract][scph-profile], [SRE scope][sre-scope], [SRE admission][sre-admission], [TEND profile][tend-profile], [TEND scope][tend-scope], [IMESP scope][imesp-scope]). Those were admission limits of the deleted implementation, stated as restrictions and never as the meaning of the constructs. The kernel admits any nesting, concurrency, re-entry and split its admission codes above and in the other feature documents do not refuse; its closure bound is a dynamic `closure-bound` refusal, and an unavailable input holds or rolls back as stated in [data](data.md).

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-SCOPE-01 | Nested embedded scopes with mixed activities and selected gateways complete at exact owned quiescence (the mechanism above); acceptance on the kernel's scenarios. |
| PC-SCOPE-02 | Repeated and concurrent activations of one embedded definition keep distinct lifetimes (the mechanism above); acceptance on the kernel's scenarios. |
| PC-SCOPE-06 | Exceptional Call return and propagated cancellation under the selected ancestor and output policy; called Event Sub-Processes are refused today. |
| PC-SCOPE-07 | Interruption removes the exact embedded, called or Multi-Instance subtree with its waits, effects and data and fences late results; generic removal is `State.clearInside`. |
| PC-TERMINATE-01 | Root and nested Terminate across all wait kinds and live handler work; the nested continuation is held by the reported difference and `profile.abnormalScopeEnd.withoutOutflow`. |
| PC-TERMINATE-02 | Terminate inside called children, both Multi-Instance modes and non-interrupting Event Sub-Process instances, with stale-result rejection. |
| PC-MESSAGE-06, PC-MESSAGE-07 | Interrupting Message Event Sub-Process (refused today) and repeatable non-interrupting Message Event Sub-Processes under root, embedded and Multi-Instance parents; stated in [subscriptions](subscriptions.md). |

## Sources

[subproc-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#normative-basis
[subproc-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#cib-seven-classification
[subproc-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#selected-source-profile
[subproc-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#admission-account
[subproc-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md#stable-semantic-rules
[nsc-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#normative-basis-and-cib-classification
[nsc-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope
[nsc-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#profile-and-public-contract
[nsc-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#admission
[nsc-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#stable-rules
[cea-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#normative-basis-and-cib-classification
[cea-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#required-optional-and-excluded-scope
[cea-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#profile-and-public-contract
[cea-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#admission
[cea-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md#stable-rules
[scph-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#normative-basis-and-cib-classification
[scph-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#required-optional-and-excluded-scope
[scph-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#profile-and-public-contract
[scph-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#admission
[scph-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-HOST-FLOW-LISTS-SPEC.md#stable-rules
[sre-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-REENTRY-SPEC.md#normative-basis-and-cib-classification
[sre-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-REENTRY-SPEC.md#required-optional-and-excluded-scope
[sre-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-REENTRY-SPEC.md#profile-and-public-contract
[sre-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-REENTRY-SPEC.md#admission
[sre-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SCOPE-REENTRY-SPEC.md#stable-rules
[tend-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINATE-END-EVENT-SPEC.md#normative-basis
[tend-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINATE-END-EVENT-SPEC.md#cib-relationship
[tend-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINATE-END-EVENT-SPEC.md#selected-account-and-rejected-alternatives
[tend-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINATE-END-EVENT-SPEC.md#exact-source-profile
[tend-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINATE-END-EVENT-SPEC.md#stable-semantic-rules
[tend-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINATE-END-EVENT-SPEC.md#required-optional-and-excluded
[imesp-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md#source-basis-and-interpretation
[imesp-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md#required-optional-and-excluded-scope
[imesp-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERRUPTING-MESSAGE-EVENT-SUBPROCESS-PROPOSAL.md#public-contract
[rep-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md#scope-and-boundary
