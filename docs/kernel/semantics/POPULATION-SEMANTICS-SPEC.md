# Population semantics

## Status

Adopted kernel owner document (W0 extraction, 2026-11-09). The kernel modules it cites are the executable authority; where they differ, the difference is a defect of one of them.

`Kernel.Population` ([Lean](../../../Kernel/Population.lean)) owns the mechanisms that span process instances: which instance, definition or start an input reaches. It never changes an instance itself; every input reaches an instance through `Kernel.Step.step`, and a scenario is one ordered list of stimuli mixing instance inputs and population stimuli. It dispatches on no guarded type of its own; it asks `Hooks.correlates` and `Hooks.selectStart` (owned by `Kernel.Feature.Subscriptions`, see [subscriptions](SUBSCRIPTIONS-SEMANTICS-SPEC.md)) for the facts that need one.

## Interpretation

### Message key correlation

- Correlation is BPMN 2.0.2 §8.4.2 key- and context-based correlation: a Process `CorrelationSubscription` binds the single `CorrelationProperty` of one `CorrelationKey` to an expression over the Process context, and the current Process values decide the match ([MKC][mkc-normative]). The kernel evaluates the bound criterion when a publication is matched, never when the subscription opens, so a later write to the bound variable changes what matches ([`Subscriptions.correlationMatches`](../../../Kernel/Feature/Subscriptions.lean)).
- The key domain is one non-empty String compared by exact equality; composite, null, empty, Boolean, numeric, structured and collection keys, wildcard and uninitialized matching are outside it ([MKC scope][mkc-scope]). A candidate whose key does not evaluate to a non-empty String is no match.
- Routing is exact-cardinality and fail-closed: exactly one current candidate is delivered to; zero (`noMatch`) or several (`ambiguous`) reject the publication and change no instance. Candidate order never picks a winner and no canonical sort becomes a tie-breaker ([MKC contract][mkc-contract]). The standard expects one active receive per key but does not license the engine to arbitrate when admitted facts contradict that ([MKC][mkc-normative]).
- A publication addresses one deployed definition, its process, the resolved Message channel and the correlation key, and carries the payload; it names no process instance or subscription. Two definitions whose local identifiers agree but whose source digest, overlay or profile differ are distinct addresses, and a publication to one never inspects the other's candidates ([MKC contract][mkc-contract]). The kernel's `DeploymentRef` is that address (source identifier and SHA-256, overlay, profile).
- The selected target rechecks the delivery itself (definition, channel, criteria and payload) before it withdraws the subscription and continues; it never trusts the population's selection ([MKC contract][mkc-contract]; `Subscriptions.admitFiring`). Publications are numbered in arrival order from 1 (the ingress ordinal) and every result carries its ordinal.
- Harness refusals are distinct from results: a publication naming no deployed definition, or carrying an empty payload, is a stable harness code (`publication-unknown-definition`, `publication-payload-empty`); an instance input that does not commit and a delivery its sole candidate refuses are results ([`Population.publish`](../../../Kernel/Population.lean)).
- The publication contract's capacity and infrastructure arms (queue and ledger capacity before acceptance, `infrastructureIndeterminate` with phase and target, content-bound command identity, no rematch after a target contradiction) are host contracts of the ingress, not kernel semantics; the kernel reports a sole candidate's refusal as the `failed` resolution with its target and never rematches ([MKC contract][mkc-contract]). Reported as a difference in the hand-back.

### Start selection

- A root start input selects the start Event it names if its trigger fires it, else the one start its trigger fires, and for a none trigger the sole none start; any other input selects nothing and is rejected as `no-start-event` ([`Subscriptions.selectStart`](../../../Kernel/Feature/Subscriptions.lean)). How a start trigger is admitted and fires is stated in [subscriptions](SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts).

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-LIM-0002](../../CIB-BPMN-RELATION-REGISTER.md#cib-lim-0002-modeled-bpmn-key-and-context-correlation-is-not-executed) | Classified limitation: CIB does not execute modeled key and context correlation. The kernel's standards reading `ProfileOptions.messageCorrelation = modeledKey` executes it; CIB evidence is a negative calibration, never a target ([MKC CIB][mkc-cib]). |
| [CIB-EXT-0025](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0025--message-correlation-by-api-criteria-and-delivered-variables) | CIB's API criteria and delivered variables; selected by `messageCorrelation = apiCriteria` and `deliveryVariables = installs`, both refused at admission until PC-MESSAGE-08 admits them. `CriterionTarget` already carries the local-variable, business-key and process-instance targets. |

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `profile.messageCorrelation.apiCriteria` | correlation by caller-supplied criteria | PC-MESSAGE-08 ([CIB-EXT-0025](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0025--message-correlation-by-api-criteria-and-delivered-variables)) |
| `profile.deliveryVariables.installs` | a delivery that installs its variables | PC-MESSAGE-08 |
| `message.correlation.keys` | more than one correlation key on a catch | compound criteria, PC-MESSAGE-08 |
| `message.correlation.value` | a criterion bound to anything but a variable read | the key domain above |
| `message.correlation.channel` | a correlated catch without Message, Interface and Operation | the publication addresses an Operation channel |
| `message.correlation.output` | a correlated catch that writes its payload | the payload is the key; it is never written ([MKC scope][mkc-scope]) |
| `message.correlation`, `work.receive.correlation` | correlation on a boundary, start or Receive Task | PC-MESSAGE-08, PC-MESSAGE-02 |
| `correlation-key-empty`, `correlation-key-type` (dynamic-only `unsupported`) | a bound key that evaluates to an empty or non-String value | the run's data; no admission can see it |
| `publication-unknown-definition`, `publication-payload-empty`, `instance-id-duplicate` | harness refusals of a population scenario | not semantic outcomes |

Superseded first-profile restrictions: the correlation profile admitted one Collaboration with two sequential catches, one Conversation and key, no Process-context change while the correlated wait is active, and no Message Start, Receive Task, boundary, throw or End correlation ([MKC scope][mkc-scope]). The kernel admits a correlated catch wherever a catch Event is admitted under the codes above and evaluates the criterion against the current state; the remaining exclusions are the codes above or open rows below.

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-MESSAGE-08 | Approved typed criteria over Process and local values, compound criteria, null and absence (`CorrelationMatch` already separates a present null from absence), concurrent same-definition instances; atomic delivery and payload commit. |
| PC-MESSAGE-02 | Multiple distinct root Message starts and Message/None mixtures with payload, exact selected-start identity and definition-version resolution; content-bound start recovery. Root start payload is refused today (`start.message.outputs`). |
| PC-TIMER-04 | Root Timer start schedules for duration, date and cycle bound to an exact definition version and start; no duplicate start after recovery. The engine-published start capability and version-pinned schedule ownership are fixed by the Timer start account ([TSTART scheduling][tstart-schedule]). |
| PC-SIGNAL-02 | Signal root starts and catches; broadcast creates each eligible start instance. Refused today (`start.signal`, `event.catch.signal`). |
| PC-SIGNAL-04 | Complete eligible-population broadcast with a defined discovery order, delivery failure and atomicity, content-bound recovery. `State.outbox` carries `BroadcastIntent`s; the population layer has no broadcast yet. |
| PC-CONDITION-02 | Conditional root start against submitted typed context with a finite result protocol over conditions and versions. Refused today (`start.condition`). |
| PC-SCOPE-03 | Called-definition version binding retained per instance across recovery (`InstanceData.definition`); every binding other than the assembled latest is refused (`work.call.binding`, `process.definition.binding`, `profile.callBindingTime.invocation`). |

## Sources

[mkc-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#normative-account-and-selected-interpretation
[mkc-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#required-optional-and-excluded-scope
[mkc-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#global-command-and-runtime-contract
[mkc-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#cib-seven-relationship-boundary
[tstart-schedule]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#definition-scheduling-boundary
