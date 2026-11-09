# Propagation semantics

The propagation feature owns throw Events and the search for a catcher of a raised Error, Escalation or Cancel. Its rules live in [Kernel/Feature/Propagation.lean](../../../Kernel/Feature/Propagation.lean), its admission in [Kernel/Admission/Propagation.lean](../../../Kernel/Admission/Propagation.lean); it dispatches on the guarded types `Throw` and `Raised`. Whether a catch trigger catches a raised event, and with what precedence, is asked of the subscriptions feature through `Ctx.catches` ([subscriptions](subscriptions.md)); a Compensation throw and a caught Cancel hand over to [compensation](compensation.md); a Terminate End's scope meaning is [scopes](scopes.md); a business error reported by an effect enters here from [work](work.md).

## Interpretation

### Throws without propagation

- **None End** consumes its token ([flow](flow.md)).
- **None Intermediate Throw** has no trigger, so its token moves on at once: its occurrence begins and ends in the micro-step its token arrives, owned by the scope occurrence carrying its path, and one token reaches each outgoing flow (§10.5.4, Table 10.89, §13.5.2) ([NIT basis][nit-basis], [NIT rules][nit-rules], [NIT contract][nit-contract]). Its source kind stays its own (`Header.sourceType`), never a Task or a merge.

### Raising an Error

- **Error End.** An Error End Event consumes its token and raises its Error from the scope occurrence it ran in; it produces no normal outgoing token (§10.5.1: an Error is critical and suspends execution at the throw location). An Error End in an executable Process carries a code; `bpmn-source` refuses one without ([SUBERR basis][suberr-basis], [SUBERR rules][suberr-rules]).
- **Business error from an effect.** A Service Task fault is an interrupting Error and the Activity fails (§13.3.3). An effect result that reports a business error leaves the Activity `raised`: no normal outflow, no compensation retention, journalled as cancelled; then the Error is raised with that Activity as its host, so its own boundaries are searched first and nothing of the Activity is left to interrupt ([BERROR basis][berror-basis], [BERROR transition][berror-transition], [BERROR rules][berror-rules], [MTBE contract][mtbe-contract]). Under the standards reading the error path writes no outputs, and a result carrying an output patch is rejected; [CIB-EXT-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0004--caught-error-output-mapping-before-activity-cleanup), [CIB-EXT-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0009---bounded-caught-error-output-mapping-before-activity-cleanup) and [CIB-EXT-0016](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0016--cib7-220-caught-business-error-output-mapping) select `ErrorPathOutputs.mapped`, which evaluates the Activity's output mappings against the reported patch before the Activity is left, so a reported null creates a present null variable ([BERROR owner decisions][berror-decisions]). A technical failure never becomes a business Error ([work](work.md)).
- **Error message.** The optional message travels with the raised Error and is published only in a failure record; it is never a matching key and never a Process variable ([BERROR rules][berror-rules]). The open effect publishes neither the error routes it could take nor a future code ([BERROR rules][berror-rules]).

### Finding the catcher

- **Search order** (§10.5.1, §13.5.3, §13.5.4): the boundaries of the Activity that raised the event, when an effect raised it; then, for each scope occurrence from the raising one outward, the Event Sub-Processes declared in that occurrence's element, then the boundaries on that element. The first level that has a catcher wins, so a nearer catch-all precedes a farther exact code; within one level the lowest precedence wins, an exact code before a catch-all, document order breaking ties ([CIB-INT-0010](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0010--at-one-catching-scope-an-event-sub-process-precedes-a-boundary-and-an-exact-code-precedes-a-catch-all)) ([SUBERR rules][suberr-rules], [BERROR basis][berror-basis]). Evaluator list order and source declaration order never pick between levels.
- **Where the search stops.** It never passes the scope occurrence of a compensation handler: an Error reaching it uncaught fails the handler ([compensation](compensation.md)). A Multi-Instance instance's scope occurrence offers no boundaries: they belong to the body, whose scope occurrence is the next one out (`BpmnParse:3291-3295`, §13.5.3). A called instance's root lies inside its Call's scope occurrence, so the search continues to the Call's boundaries and outward.
- **Matching** is by the attached route, never by a Process-wide code lookup: different boundaries may reference one Error, and independent Error declarations may share a code ([MTBE contract][mtbe-contract]).
- **Interruption.** A caught Error cancels the occurrence the boundary hangs on together with everything inside its scope occurrence, sibling waits included, keeps every activation counter monotonic, and puts exactly one token on the boundary's flows in the parent scope (§10.5, §13.5.3; an Error boundary always interrupts, Tables 10.91 and 10.92) ([SUBERR rules][suberr-rules], [BERROR rules][berror-rules]). A command addressed to a cancelled occurrence is rejected with the state unchanged.
- **Unhandled events.** No meaning is selected for an Error or Escalation that finds no catcher: the input is `unsupported` and commits nothing, never treated as a None End. The reviewed accounts refused an unmatched result as `rejected` and refused a model without a matching handler at admission ([BERROR unhandled][berror-unhandled], [SUBERR rules][suberr-rules]) (kernel differs; reported). CIB's default of ending the throwing path ([CIB-CFG-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0004--default-unmatched-bpmn-error-under-the-pinned-a12-engine)) is `UnhandledError.endsThrowingPath`, which admission refuses.

### Escalation and Cancel

- An Escalation End or intermediate throw raises its code by the same search; the intermediate throw also continues on its outgoing flows. A caught Escalation interrupts or not as its catcher says; a non-interrupting catch begins its handler and leaves the host running.
- A Cancel End raises Cancel, which only a Cancel boundary catches; on a Transaction it first runs the retained compensation ([compensation](compensation.md)).

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-AGR-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0005--exact-code-interrupting-error-boundary-event), [CIB-AGR-0010](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0010---product-neutral-exact-code-interrupting-error-boundary-event), [CIB-AGR-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0012--cib7-220-exact-code-business-error-recovery) | Agreement on the exact-code interrupting Error boundary of an effect |
| [CIB-AGR-0008](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0008--exact-code-error-propagation-from-an-embedded-sub-process) | Agreement on Error propagation from an embedded Sub-Process to its boundary |
| [CIB-AGR-0016](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0016--a-none-intermediate-throw-event-passes-its-token-on-at-once-and-records-one-activity-instance) | Agreement on the None Intermediate Throw |
| [CIB-INT-0010](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0010--at-one-catching-scope-an-event-sub-process-precedes-a-boundary-and-an-exact-code-precedes-a-catch-all) | Interpretation selected for precedence within one catching level |
| [CIB-CFG-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0004--default-unmatched-bpmn-error-under-the-pinned-a12-engine) | Configuration behind `UnhandledError.endsThrowingPath` (refused) |
| [CIB-EXT-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0004--caught-error-output-mapping-before-activity-cleanup), [CIB-EXT-0009](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0009---bounded-caught-error-output-mapping-before-activity-cleanup), [CIB-EXT-0016](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0016--cib7-220-caught-business-error-output-mapping) | Select `ErrorPathOutputs.mapped` |
| [CIB-EXT-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0003--exact-deferred-delegate-expression-and-typed-java-bpmn-error) | Extension: a delegate's Java `BpmnError` arrives as a typed business failure |
| [CIB-OP-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0003--synchronous-caught-error-mapped-to-a-durable-typed-result) | Operational mapping of CIB's synchronous catch onto an effect result |
| [CIB-OP-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0001--cib-host-task-identity-mapped-to-project-semantic-task-identity) | Operational mapping of the stale task refusal after interruption |
| [CIB-EXT-0022](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) | Pass-through extension whose forms a None Throw shares |

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `throw.message` | A Message throw | PC-MESSAGE-09 |
| `throw.signal` | A Signal throw | PC-SIGNAL-01 |
| `throw.error.message` | An Error throw whose message is an expression | The kernel reads only a literal message |
| `throw.compensation.activity`, `throw.compensation.asynchronous` | An Activity-targeted or asynchronous Compensation throw | [compensation](compensation.md) |
| `event.error.codeVariable`, `event.error.messageVariable`, `event.escalation.codeVariable` | A catch that writes the caught code or message to a variable | PC-ERROR-01, PC-ESCALATION-01 |
| `event.catch.error`, `event.catch.escalation`, `start.error`, `start.escalation` | An intermediate catch of a raised event, and a process-level start triggered by one | §10.5: raised events are caught by boundaries and Event Sub-Processes only |
| `profile.unhandledError.endsThrowingPath` | A profile selecting CIB's unmatched-Error default | No row selects it |
| `unhandled-error`, `unhandled-escalation`, `raise-cancel` (runtime, `unsupported`, dynamic-only) | A raised event without a catcher | Whether one exists depends on where the thrower runs (PC-ERROR-01, PC-ESCALATION-01) |
| `compensation-handler-escalation`, `compensation-handler-cancel` (runtime, `unsupported`, dynamic-only) | An Escalation or Cancel leaving a compensation handler | Not selected ([compensation](compensation.md)) |
| `error-path-outputs-not-accepted` (runtime, `rejected`) | A business error carrying an output patch under the standards reading | §13.3.2 |

**Superseded first-profile restrictions.** The deleted implementation admitted Error handling only as one exact code on one Task-attached or direct-parent boundary, with fixed topologies, a distinct profile per fixture, exact delegate tokens and no catch-all, Event Sub-Process, ancestor or Call propagation ([BERROR required scope][berror-required], [BERROR excluded scope][berror-excluded], [BERROR source profile][berror-profile], [MTBE representation][mtbe-representation], [SUBERR product boundary][suberr-product], [SUBERR source profile][suberr-profile], [SUBERR admission][suberr-admission], [SUBERR surface][suberr-surface]), and admitted a None Throw only in the forms of a pass-through Task ([NIT scope][nit-scope], [NIT admission][nit-admission]). These were admission bounds; the kernel admits every shape the codes above do not refuse, and catch-all matching, Event Sub-Process catchers and nearest-ancestor propagation are implemented by the search above.

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-ERROR-01 | The defined unhandled outcome (today `unsupported`); catch code and message variables; a non-interrupting Error boundary is not refused at admission (reported) |
| PC-ERROR-02 | Interrupting Error Event Sub-Processes are searched; refusal of a non-interrupting Error Event Sub-Process and rethrow are owed |
| PC-ERROR-03 | Error propagation from called children and Multi-Instance with selected error-data mapping |
| PC-ESCALATION-01 | Uncaught Escalation must continue rather than fail (today `unsupported`); code variables |
| PC-ESCALATION-02 | Escalation boundaries on User, Sub-Process and Call hosts and their Multi-Instance wrappers; duplicate-declaration refusal |
| PC-ESCALATION-03 | Escalation Event Sub-Processes in both modes, rethrow and exceptional output mapping |
| PC-MESSAGE-09 | Bound Message throws and Message End through the send effect (`throw.message`) |
| PC-SIGNAL-01 | Signal throws and their broadcast intent (`throw.signal`) |

## Sources

[nit-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-INTERMEDIATE-THROW-SPEC.md#normative-basis-and-cib-classification
[nit-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope
[nit-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-INTERMEDIATE-THROW-SPEC.md#profile-and-public-contract
[nit-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-INTERMEDIATE-THROW-SPEC.md#admission
[nit-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-INTERMEDIATE-THROW-SPEC.md#stable-rules
[berror-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#normative-basis
[berror-required]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#required-scope
[berror-excluded]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#excluded-scope
[berror-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#source-profile
[berror-transition]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#semantic-transition
[berror-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#stable-semantic-rules
[berror-unhandled]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#unhandled-error-boundary
[berror-decisions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/BOUNDARY-ERROR-SPEC.md#owner-decisions
[mtbe-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md#required-contract-and-exclusions
[mtbe-representation]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MIXED-TASK-BUSINESS-ERROR-PROPOSAL.md#representation-admission-and-progress
[suberr-product]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md#product-boundary
[suberr-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md#normative-basis
[suberr-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md#selected-source-profile
[suberr-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md#admission-account
[suberr-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md#stable-semantic-rules
[suberr-surface]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md#implemented-and-excluded-surface
