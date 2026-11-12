# Admission semantics

## Status

Adopted kernel owner document (W0 extraction, 2026-11-09). The kernel modules it cites are the executable authority; where they differ, the difference is a defect of one of them.

Admission decides whether a program lies inside the admitted surface before any instance runs. It is a rule per IL field, never a recognizer of whole topologies or of profile identifiers: [`Kernel/AdmissionRegistry.lean`](../../../Kernel/AdmissionRegistry.lean) returns the first refusal of the program, and each `Kernel.Admission.<F>` module owns the rules of one feature. Reading the BPMN source and admission are separate steps, and so are admission, normalization, execution, publication and host persistence. This document owns the cross-cutting rules, the reader's refusals and the profile-option refusals; each feature's own refusal codes and their reasons live in that feature's document.

## Interpretation

- Admission is the conjunction of reusable rules over the program, not a growing disjunction of exact whole-program topologies; a profile restricts the shapes it admits without that restriction becoming the general meaning of the construct ([scope][ppa-scope], [exact claim][ppa-claim]). A restriction is a refusal with a stable code on the field it concerns ([forward-compatible restrictions](../../../CLAUDE.md#forward-compatible-restrictions)), so admitting the field later widens the surface without reinterpreting accepted programs ([IL refusal rule](../IL-SPEC.md#refusal-by-field)).
- A profile is data: the selected relation options and the admitted field set ([profile][csm-profile]). It carries its exact authority, the pinned oracle release and environment for a CIB-backed profile, and no CIB target for a standards-only one; immutable CIB evidence fixes calibration, never a production deployment or history baseline. No code compares a profile identifier; the kernel reads only `ProfileOptions`.
- Order of refusal: referential integrity (`il.reference`), then the profile options, then each called process's binding, then each flow (its condition, then where the condition sits), then each element in program order, first refusal wins. A refused program is an `unsupported` deployment carrying the code and runs no input ([`Kernel/Run.lean`](../../../Kernel/Run.lean)).
- Admission and host capability are separate: a program the kernel admits but the host cannot schedule is refused by the host before a Workflow starts, never by a failure inside Workflow execution ([engineering rules](../ENGINEERING-POLICY.md#redgreen-semantic-workflow)).
- An admission widening is reviewed against two questions, the old contract's reopen conditions: can a newly admitted shape reach more than one enabled internal step without an independence or explicit-choice account, and can it reach a stable running state with no resumption surface ([exclusions][ppa-exclusions])?
- Input admission has three levels: strict decoding settles wire validity; scenario admission settles the profile's value domain, the stimulus families and the first start, checking every stimulus before execution so that an out-of-domain value anywhere makes the whole scenario unsupported with no command publication; command admission settles names, occurrence identity and state-dependent eligibility, and its refusal is an executable `rejected` outcome. The first start names the program's own process ([value admission][ppa-values]). The kernel implements decoding and command admission; scenario-level value admission is the scenario schema plus strict decoding, and the first start's process check is absent (see Open rows).
- Every parser warning blocks admission until a profile rule proves it safe, and exact bytes and normalized evidence are preserved even when compilation is refused (CLAUDE.md).

## Reader refusals

[`bpmn-source`'s kernel reader](../../../packages/bpmn-source/src/kernel-reader/model.ts) refuses only what it cannot read faithfully, each with a code; it chooses no semantics and never branches on a profile.

| Code | Refused |
|---|---|
| `source.tooLarge`, `source.encoding`, `source.doctype`, `source.identityMismatch`, `source.overlay` | source bytes outside the preservation contract |
| `source.noProcess`, `source.missingId`, `source.reference`, `source.containmentCardinality` | a model with no executable process, a missing identifier, a reference that does not resolve inside the document (the QName rule of the [flow semantics](FLOW-SEMANTICS-SPEC.md#references-and-qname-closure)) or malformed containment |
| `source.schema` | a document the pinned OMG `BPMN20.xsd` rejects, checked against a table generated from the schemas ([flow semantics](FLOW-SEMANTICS-SPEC.md#xsd-validity)) |
| `source.ambiguousBoolean` | an `xsd:boolean` attribute whose lexeme the parser's coercion does not preserve |
| `parser.failure`, `parser.warning` | a parse failure or any parser warning other than an unresolved reference, a duplicate identifier included |
| `reader.unknownElement`, `reader.unknownAttribute`, `reader.unknownAttributeValue`, `reader.unknownExtension`, `reader.factNotCarried` | content the reader has no faithful IL field for |
| `reader.eventDefinitionRef` | an Event naming a root-level EventDefinition, which pinned CIB never resolves (PC-BASIC-04) |
| `reader.eventDefinitionOnElement`, `reader.standardLoop`, `reader.eventSubProcessStart`, `reader.dataAssociationShape`, `reader.signalWithoutReference`, `reader.throwWithoutCode`, `reader.multiInstanceWithoutCount` | source shapes the IL cannot carry as written |
| `throw.message.implementation`, `throw.message.resultVariable`, `throw.message.ioMapping`, `throw.message.asynchronous`, `throw.message.listener` | a Message throw's CIB attributes that CIB would run and `MessageThrow` cannot carry ([propagation](PROPAGATION-SEMANTICS-SPEC.md#pc-message-09-a-message-throw-performs-its-send-through-an-effect)) |

Boolean coercion: `bpmn-moddle` reduces every `xsd:boolean` attribute to `value === "true"` without a warning, so `1`, which means true, reads as false. Any `Boolean`-typed attribute whose lexeme the coercion does not preserve is refused; `0` is admitted and `1` is not, which refuses exactly the disagreement, and an entity-encoded spelling is refused as well. The attribute set is the metamodel's `Boolean` properties, not a list. Enumerated defaults stay outside the rule, because BPMN 2.0.2's own machine-readable artifacts disagree on the only such literal (owner-confirmed 2026-08-07; [coercion rule][csm-boolean]).

## Profile options

A profile may select only behaviour the kernel implements ([`Kernel/Admission/Profile.lean`](../../../Kernel/Admission/Profile.lean)).

| Refusal code | Refused | Owning row |
|---|---|---|
| `profile.evaluator.juel` | the JUEL evaluator | PC-DATA-07 |
| `profile.compensationOrder.allAtOnce` | starting every compensation handler of a trigger at once | PC-COMPENSATION rows |
| `profile.compensationHandlerFailure.selected` | a selected handler-failure code | PC-COMPENSATION rows |
| `profile.errorExitCompensation.compensatesContained` | compensating the contained work of a Sub-Process an Error leaves, for a program with a Sub-Process retaining compensable work | PC-COMPENSATION rows, PC-TX-01 |
| `profile.multiInstanceCompensation.perInstance` | a compensation record per instance, for a program with a Multi-Instance Task or Call with a handler | PC-COMPENSATION rows |
| `profile.callBindingTime.invocation` | binding the called definition at invocation | PC-SCOPE-03 |
| `profile.timerZone` | a timer zone other than UTC | PC-TIMER-02 |
| `profile.abnormalScopeEnd.withoutOutflow` | the standards reading of an abnormal Sub-Process end, for a program that reaches one (a Terminate in a Sub-Process or at a called process's level, or an interrupting Event Sub-Process): the kernel has only the normal continuation | PC-TERMINATE-01, PC-SCOPE rows |

## Registry-level refusals

| Refusal code | Refused | Owner |
|---|---|---|
| `il.reference` | an identifier naming no element, boundary or flow of the right container, or naming two: a duplicate element, boundary or flow id; a flow whose ends lie in different containers or that enters a start; a flow missing from either end's list; a repeated list entry; a default flow that is not outgoing or is a candidate; a gateway candidate that is not outgoing; a Scope child that does not name the Scope as parent; a compensation handler that does not exist | every flow, list and parent must resolve, or a dangling reference reads as no reference (`Kernel.Admission.Flow.references`, `Kernel.Admission.Scopes.membership`) |
| `process.definition.binding` | a called process whose definition names its own version, version tag, deployment or tenant: it is bound at assembly to the one definition the program carries | [work](WORK-SEMANTICS-SPEC.md), PC-SCOPE-03 |
| `compensation.handlerMultiInstance` | an Activity marked `isForCompensation`, named by an Association or not, with Multi-Instance loop characteristics, whose asynchronous marks CIB skips (`BpmnParse.java:2416`) | [compensation](COMPENSATION-SEMANTICS-SPEC.md) |
| `compensation.handlerNotForCompensation`, `compensation.handlerFlow` | an element an Association names that is not marked `isForCompensation`, or a marked one, named or not, with a Sequence Flow | [compensation](COMPENSATION-SEMANTICS-SPEC.md) |
| `compensation.processEventSubProcess` | a Compensation Event Sub-Process at Process level (CIB-LIM-0044) | [compensation](COMPENSATION-SEMANTICS-SPEC.md) |
| `scope.implicitStart` | an Activity begun by its Scope's implicit start whose work cannot begin without a token | [scopes](SCOPES-SEMANTICS-SPEC.md) |

Every other code belongs to its feature: [data](DATA-SEMANTICS-SPEC.md) (`expression.*`, `mapping.*`, `flow.condition.*`, `element.origin.*`), [flow](FLOW-SEMANTICS-SPEC.md) (`gateway.*`, `flow.conditionalOutflow`, `link.*`), [work](WORK-SEMANTICS-SPEC.md) (`work.*`, `call.*`, `activity.*Mappings`, `activity.multiInstanceBody`, `activity.compensationHandler`), [subscriptions](SUBSCRIPTIONS-SEMANTICS-SPEC.md) (`timer.*`, `message.*`, `event.*`, `boundary.*`, `start.*`), [scopes](SCOPES-SEMANTICS-SPEC.md) (`scope.*`), [compensation](COMPENSATION-SEMANTICS-SPEC.md) (`compensation.implicit`, `compensation.dependency.boundary`), [propagation](PROPAGATION-SEMANTICS-SPEC.md) (`throw.*`), [multi-instance](MULTI-INSTANCE-SEMANTICS-SPEC.md) (`multiInstance.*`).

## Superseded restrictions

The old admission surface was a per-profile capability table of operation kinds and cardinalities over a structurally validated program, with exact checked-source topologies for a few profiles, global reachability and co-reachability, and whole-graph acyclicity except declared resumption cuts ([exact claim][ppa-claim]); its explicit exclusions enumerated what no profile admitted ([exclusions][ppa-exclusions], [absent][csm-absent], [nearest unsupported][csm-nearest], [IL boundary][csm-il]). The first composed profile's structured serial grammar and its exclusions were such a restriction, and its rule that admission proves properties instead of recognizing identifiers or model names, selected per declared profile, carries over as the per-field rule ([composed scope][cba-scope], [profile-conditional admission][cba-profile], [source admission][cba-source], [excluded][cba-excluded]). The kernel replaces the table with the per-field rules above and the coverage target's rows; it checks no reachability or acyclicity. A consolidated profile that admits a model an old profile refused lists it as a lifted refusal owned by its track ([profiles](../ARCHITECTURE-SPEC.md#profiles)). Two exclusions remain rules: no value outside a profile's declared domain, and no identifier normalization or locale-sensitive ordering (identifiers compare and sort by Unicode scalar values) ([absent][csm-absent]).

## Open rows

| Row | Owed |
|---|---|
| PC-DATA-02 | Scenario-level value admission per profile and the first start's process check are absent from the kernel (`Kernel/Run.lean` runs every decoded stimulus; `StartInput` carries no process identity); the row keeps its done state only if its acceptance test still passes after strict decoding |

## Sources

[ppa-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md#scope
[ppa-claim]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md#exact-claim
[ppa-values]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md#whole-scenario-value-admission
[ppa-exclusions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md#exclusions-and-re-open-conditions
[csm-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md#semantic-profile
[csm-il]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md#semantic-process-il
[csm-boolean]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md#boolean-attribute-coercion-at-source-admission
[csm-absent]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md#explicitly-absent
[csm-nearest]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md#nearest-unsupported-claims
[cba-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md#required-scope
[cba-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md#profile-conditional-admission
[cba-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md#source-admission-contract
[cba-excluded]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/archived/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md#excluded-scope
