# Flow semantics

## Status

Adopted kernel owner document (W0 extraction, 2026-11-09). The kernel modules it cites are the executable authority; where they differ, the difference is a defect of one of them.

The flow feature owns how tokens move: starts leaving, gateways, Link Events, and every occurrence's outflow. Its rules live in [Kernel/Feature/Flow.lean](../../../Kernel/Feature/Flow.lean), its admission in [Kernel/Admission/Flow.lean](../../../Kernel/Admission/Flow.lean); it dispatches on the guarded type `GatewayKind` and on `Leave`, and it is the only module that adds tokens (`Hooks.outflow`). Per-token arrival is [Kernel/Step.lean](../../../Kernel/Step.lean)'s `arrive`; throw Events, including None Ends, are [propagation](PROPAGATION-SEMANTICS-SPEC.md); pass-through Tasks are [work](WORK-SEMANTICS-SPEC.md); scope completion is [scopes](SCOPES-SEMANTICS-SPEC.md).

## Interpretation

### Arrival and leaving

- **One occurrence per arriving token.** A token arriving on any incoming flow of any element begins one fresh occurrence of that element, independently of tokens on its other incoming flows; only Parallel and Inclusive joins collect arrivals (BPMN 2.0.2 §13.3.1 uncontrolled flow, the Activity note of §10.3, the Event notes of §10.5 and §10.5.4, the End Event rules of §10.5.3). The merge itself has no occurrence, no micro-step and no publication of its own: each arrival publishes exactly what one arrival at a single-incoming element of the same kind publishes ([IFI basis][ifi-basis], [IFI rules][ifi-rules], [IFI contract][ifi-contract], [NEF basis][nef-basis], [NEF rules][nef-rules], [NEF contract][nef-contract], [AISM basis][aism-basis], [AISM rules][aism-rules], [ACTH basis][acth-basis], [ACTH rules][acth-rules], [PTSM basis][ptsm-basis], [PTSM rules][ptsm-rules]). A second arrival never reuses the first arrival's occurrence.
- **Leaving takes every outgoing flow.** An element that leaves through its own outgoing selection puts one token on every outgoing flow in the micro-step it already is, with no step, position or occurrence for the split: an Activity's completion (§13.3.1 parallel split), a Start Event's start (§10.5.1, §13.2), an embedded Sub-Process's completion, and a pass-through node's activation ([ACSP basis][acsp-basis], [ACSP rules][acsp-rules], [ACSP contract][acsp-contract], [AISM contract][aism-contract], [ACTH contract][acth-contract], [PTSM contract][ptsm-contract]). An element without outgoing flows consumes its token.
- **An Activity's own selection.** Several outgoing flows of an Activity or Scope form a parallel split, conditioned ones an inclusive split, and a mix of both (§13.3.1, Figure 13.1): its completion takes every outgoing flow whose condition holds or that has none, its default flow only when it takes no other (§10.3.1 `default`), and, when it has outgoing flows but takes none, rolls the command back as an Inclusive split without a match does (Table 13.3, [CIB-INT-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0012--a-diverging-inclusive-gateway-that-selects-no-flow-rolls-its-command-back); CIB `BpmnActivityBehavior#performOutgoingBehavior` throws and rolls back too). An absent condition is always true, the reading [CIB-INT-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0005--an-inclusive-gateway-output-without-a-condition-is-always-taken) gives an Inclusive output. The kernel's `ownFlows` applies this to every element that leaves through its own selection; admission puts a condition only on an Activity's or Scope's non-default flows and on a gateway's candidates (`flow.conditionalOutflow`), so every other element takes all its flows. The standards reading writes an Activity's outputs before its outgoing conditions are evaluated (§13.3.2, `ConditionOrder.afterOutputs`), so a following decision reads the value the completion wrote ([SPC basis][spc-basis], [SPC rules][spc-rules], [SPC contract][spc-contract]); [CIB-INT-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0011--an-activitys-outgoing-conditions-evaluate-before-its-output-writes) selects the reverse order (`ConditionOrder.beforeOutputs`, read by `Hooks.select`). CIB installs a User Task's submitted variables before it leaves and runs its output parameters after, which neither order reproduces alone; the open-rows table lists it under PC-CF-07.
- **Ends and quiescence.** A None End consumes only its own token. A scope occurrence, the process root included, stays live while it holds a token, a blocking open item, a begun occurrence or a child; it completes exactly when the last of those is gone, and the root's completion completes the instance (§10.5.3, §13.5.6). Several None Ends, terminal unjoined forks, and terminal branches that reach their End without a wait are ordinary ([TFK basis][tfk-basis], [TFK rules][tfk-rules], [TFK contract][tfk-contract]).
- **No Sub-Process is required.** The process root is itself a scope; every flow rule holds identically in the root and in a Sub-Process body (§10.2, §10.4.1, §13.2–§13.5) ([SSM basis][ssm-basis], [SSM rules][ssm-rules], [SSM contract][ssm-contract]).
- **Start combinations.** A process has at most one initial start, a None or a Timer Start, and a Sub-Process at most one start, as pinned CIB parses them (`BpmnParse#selectInitial`, `BpmnParse#parseScopeStartEvent`); §10.5.2 admits several Start Events, which lie outside the target (`start.rootCombination`, `start.subProcessCombination`, PC-BASIC-01). Message, Signal and Conditional Starts beside them keep their own accounts.

### Exclusive Gateway

- **Ordered first-true routing.** One arrival consumes its token and puts exactly one token on the first candidate, in the process-level XML `sequenceFlow` declaration order, whose condition is true; no later condition is evaluated and no later branch receives a token; the default is taken exactly when every candidate is false (§13.4.2, Table 13.2, §10.6.2). The number of candidates is unbounded; gateway `<outgoing>` reference order does not matter ([XGW basis][xgw-basis], [XGW rules][xgw-rules], [XCA basis][xca-basis], [XCA rules][xca-rules], [XCA contract][xca-contract]). Candidate order is definition data, never runtime collection order or a host scheduling choice.
- **No match without a default rolls the command back.** When no candidate holds and there is no default, the input whose closure reached the gateway has outcome `rolledBack` with the exact pre-input state: a start creates no instance, a User Task completion leaves the task open with its values, and nothing is published ([XND basis][xnd-basis], [XND rules][xnd-rules], [XND contract][xnd-contract]). An effect result whose closure reaches it rolls back too, or, under `ContinuationFailure.incident`, becomes the effect's technical failure ([Step.lean](../../../Kernel/Step.lean) `effectContinuation`).
- **Conditions** are evaluated in the kernel by the profile's evaluator against the variables visible from the gateway's scope occurrence at the input's logical time ([Simple Boolean decision](../../SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)); a non-Boolean value is a semantic failure. The first accounts read only Process-scope bindings and refused body gateways for that reason ([IGR scope][igr-scope]); the kernel reads the visible scope chain, the data visibility of §10.4. Source text in another language is never routed to the evaluator by fallback: the old accounts required `Definitions.expressionLanguage` to name the Simple Boolean URI explicitly ([XGW admission][xgw-admission]). The source reader reads a condition with no `language` on it or on its Definitions as the BPMN default of `Definitions.expressionLanguage`, XPath, a `foreign` expression that `flow.condition.foreign` refuses under every profile; acceptance under CIB's default language is PC-DATA-07.
- **Exclusive merge.** A converging Exclusive Gateway passes each arriving token on at once, without synchronization and without input-order priority (Table 13.2 Simple Merge and Multi-Merge, §10.6.2) ([CYC basis][cyc-basis], [CYC account][cyc-account], [CYC rules][cyc-rules], [CYC decisions][cyc-decisions]). It is lowered as an Exclusive Gateway whose one unconditioned outgoing flow is its sole candidate.
- **Unconditioned flows of a diverging Exclusive Gateway.** A sole unconditioned non-default flow is a candidate whose condition always holds, tried in declaration order like the others, so declared first it is always taken and declared last it acts as a default; CIB's `ExclusiveGatewayActivityBehavior#doLeave` does the same. CIB refuses to parse a second unconditioned non-default flow and an unconditioned flow beside a default (`BpmnParse#validateExclusiveGateway`), and so does the kernel (`gateway.exclusive.unconditionedFlow`); a sole conditioned flow without a default, which CIB also refuses, is `gateway.exclusive.singleConditionWithoutDefault` (PC-CF-02).

### Parallel Gateway

- **Fork** puts one token on every outgoing flow in the micro-step that reaches it (§10.6.4, §13.4.1) ([RPF basis][rpf-basis], [RPF rules][rpf-rules], [PAR rules][par-rules]).
- **Join by incoming-flow provenance.** A join is ready only when every incoming flow holds a token in the same scope occurrence; a count of arrivals without their flow is insufficient. One activation consumes exactly one token per incoming flow, keeps every excess token, and leaves once on its outgoing flows ([PAR rules][par-rules], [PAR CIB][par-cib]). Each joined arrival is its own occurrence: the one that fires leaves with the outgoing flows, the others end with none, as CIB ends one activity instance per joined execution.
- **Order independence.** Completing branch work in either order reaches an equivalent final state and observation; the intermediate observation exposes the remaining wait but never a hidden join offer or token ([PAR rules][par-rules]). When root branches write one Process name, a reader after the join sees the value committed last ([RPF rules][rpf-rules], [RPF contract][rpf-contract]).

### Inclusive Gateway

- **Split.** One arrival evaluates every candidate against the same state and puts one token on every candidate whose condition is true or absent; the default alone when none holds (§10.6.3, Table 13.3). An absent condition is a condition that is always true, for selection, for the default rule and for the exception rule ([CIB-INT-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0005--an-inclusive-gateway-output-without-a-condition-is-always-taken)) ([IGR basis][igr-basis], [IGR rules][igr-rules], [IGR contract][igr-contract], [IGW rules][igw-rules]). Evaluation order is irrelevant (Table 13.3: pure expressions over one state). A gateway that lists no candidates and no default is a pure join and takes all its outgoing flows. A split with neither a true candidate nor a default rolls the command back like the Exclusive case (kernel `inclusiveChoice`; Table 13.3 names only an exception; [CIB-INT-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0012--a-diverging-inclusive-gateway-that-selects-no-flow-rolls-its-command-back)), as CIB's `stuckExecutionException` does.
- **Join.** The join fires once at least one incoming flow holds a token and no token, open item, child scope or other parked arrival still upstream in the same scope occurrence can reach an incoming flow that holds none without passing the gateway; it consumes one token from each filled flow and keeps every excess token. It is admitted wherever an Inclusive Gateway converges (PC-CF-04). The reviewed accounts selected an occurrence-owned record of the selected branches for structured acyclic regions, where the two rules agree ([IGR basis][igr-basis], [IGW rules][igw-rules], [IGW scope][igw-scope], [CIB-AGR-0017](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0017--a-structured-inclusive-join-fires-when-every-selected-branch-has-arrived)). The rule differs from Table 13.3's text in one case, a token that can reach both an empty and a filled incoming flow: Table 13.3 lets the join fire, the kernel keeps it waiting, as CIB does ([BPMN21-450](https://issues.omg.org/issues/BPMN21-450) is open on that clause). It differs from CIB's `InclusiveGatewayActivityBehavior#activatesGateway` in one class, two tokens that can arrive on the same incoming flow: CIB fires once the arrivals reach the incoming count, or waits for any token that can reach the gateway at all, and then joins every arrival; the kernel joins by incoming-flow provenance as its Parallel join does ([CIB-DEV-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow)). Unpaired and looping merges, joins fed by a Parallel block and joins whose unselected path is still reachable agree with the retained CIB evidence of [inclusive-join-compositions](../../../scenarios/open-rows/inclusive-join-compositions/README.md) under a JUEL reading of their conditions.

### Event-Based Gateway

- **Deferred choice.** A token reaching the gateway keeps its occurrence open and arms one subscription per configured catch Event, attached to the gateway's occurrence, with no branch token while armed and no half-armed state (§10.6.6, §13.4.4, Table 13.4 Deferred Choice) ([EBG basis][ebg-basis], [EBG rules][ebg-rules]).
- **First admitted trigger wins.** The first matching delivery or Timer firing in the explicit input order completes its arm, completes the gateway with no flows, and so disarms every other arm before the next observation; the losing branch never receives a token. Declaration order, configuration order and evaluator search order never select a winner, and no physical-simultaneity tie-break exists. A wrong or late stimulus, the loser's included, is rejected with the state unchanged ([EBG rules][ebg-rules]). Arms are reservations: each has a published identity from arming, and its occurrence begins only when it fires.

### Link Events

- A throwing Link continues at the one catching Link of the same name in the same process level or Sub-Process, as if a Sequence Flow connected the throw's predecessor to the catch's successor; the pair adds no wait (§10.5.5, Table 10.89) ([LNK basis][lnk-basis], [LNK rules][lnk-rules], [LNK contract][lnk-contract]). The old account published no occurrence for a Link pair; the kernel journals one occurrence of the throw and none of the catch, and the publication of a Link pair is track work of PC-BASIC-02, listed under the row below. Several throws of one name may target one catch (§10.5.5 "multiple source Link Events"). A catching Link that a Sequence Flow also reaches passes that token on like any intermediate Event; §10.5.5 describes a target without incoming flows but forbids none, and CIB runs it so.

### Cycles

- A Sequence Flow cycle (Table 7.2) re-enters elements with fresh occurrences: each traversal of an element begins an occurrence whose activation is one greater than the previous one of that element in the instance; a command addressed to an earlier activation is rejected with the state unchanged; termination is never asserted, and a schedule that keeps choosing the back-edge keeps the instance running ([CYC rules][cyc-rules], [CYC decisions][cyc-decisions], [CYC selection][cyc-selection]).
- **Closure bound.** The reviewed accounts admitted a cycle only when every cycle crosses an external-stimulus wait, and bounded each resumption's internal closure at admission ([CYC graph admission][cyc-graph], [MTC representation][mtc-representation], [SPC admission][spc-admission]). The kernel has no such admission check: a closure that does not settle within `Step.closureBound` micro-steps is `unsupported "closure-bound"`, a stable outcome class, and commits nothing; a static admission limit is PC-CF-06.

## Interchange forms and diagnostics (PC-BASIC-04, proposed)

**Status:** proposed interpretation awaiting its cold review ([kernel architecture review](../ARCHITECTURE-SPEC.md#review)); no code implements it yet. It decides which source forms of an executable model the `bpmn-source` reader admits, and which it refuses before a definition deploys. The pinned CIB Seven `2.2.0` parser bounds the target; BPMN 2.0.2 and its XSD decide meaning. Every refusal below is a reader refusal, so the engine rejects the definition with the reader's code before any instance starts, the same answer it gives an admission refusal.

### Event-definition forms

| Source form | BPMN 2.0.2 | Pinned CIB | Reading |
|---|---|---|---|
| One inline EventDefinition | §10.5.1, Tables 10.84 to 10.93 | parsed per position (`BpmnParse#parseIntermediateCatchEvent:1535-1555`, `#parseStartEvents`, `#parseBoundaryEvents`) | admitted, as today |
| `eventDefinitionRef` to a root-level EventDefinition | a reusable definition, §10.5.1 (catch and throw `eventDefinitionRefs`) | never read: `BpmnParse` has no `eventDefinitionRef`, so a catch carrying only a reference fails to parse ("Unsupported intermediate catch event type") and a Start, throw or End carrying one runs as a None Event | refused as `reader.eventDefinitionRef` (new) in every position; the reader today reads it as an inline definition, which would execute a trigger CIB erases |
| Several definitions, inline or referenced, `parallelMultiple` either way | a Multiple or Parallel Multiple Event, §10.5.1 | one definition by a fixed precedence (an intermediate catch tries Timer, Signal, Message, Link, Conditional in that order), `parallelMultiple` never read | refused as `reader.multipleEventDefinitions` (exists). The retained [multiple-event-definitions](../../../scenarios/open-rows/event-reference-forms/README.md) and parallel-multiple evidence show CIB arming the Timer alone and rejecting the Message; that is a CIB limitation to register, and the two ledger entries move from PC-BASIC-04 to it |
| Receive Task `instantiate="true"` | instantiates the Process, no incoming flow (§10.3.3, Table 10.10) | not read | refused, as the [coverage target](../../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) requires; the code is the open decision below |
| Event-Based Gateway `instantiate="true"` or `eventGatewayType="Parallel"` | an instantiating gateway has no incoming flow, and Parallel requires `instantiate` (§10.6.6) | neither attribute is read: reached by a flow, the gateway is an ordinary exclusive one; with no incoming flow and no start the deployment fails | refused as `reader.eventBasedGatewayInstantiate` (exists). The retained instantiating-with-start and parallel-with-start evidence, where CIB runs a plain race, is the same register limitation as the row above, and the two ledger entries move to it |

**Where these refusals live (open decision).** The [row traceability map](../ROW-TRACEABILITY-MAP.md) plans `work.receive.instantiate`, `event.multipleDefinitions` and `event.parallelMultiple` as admission codes over IL fields, while the IL has no field for any of them and the reader refuses Multiple Events today. Recommended: keep all four forms reader refusals (`reader.multipleEventDefinitions`, `reader.eventBasedGatewayInstantiate`, and new `reader.eventDefinitionRef` and `reader.receiveInstantiate`) and amend the map, because the [coverage target](../../PRACTICAL-CIB7-COVERAGE-TARGET.md) excludes them for good, so no later admission widens them and an IL field that only admission reads costs a shape edit without a reader. The alternative, IL fields refused in `Kernel.Admission`, follows the architecture's rule that semantic refusals live there and costs one shape commit.

### References and QName closure

- A reference typed `xsd:QName` in the XSD (`messageRef`, `signalRef`, `errorRef`, `escalationRef`, `operationRef`, `calledElement` excepted as an extension string) resolves inside the one Definitions document. An unprefixed `local` names the element whose `id` is `local`, which is CIB's reading (`BpmnParse#resolveName` qualifies it with `targetNamespace`). A prefixed `p:local` resolves the same way exactly when `p` is bound to the Definitions' `targetNamespace`, as XML namespace rules and CIB's `resolveName` both make it.
- A prefix bound to any other namespace names an import. BPMN `import` is outside the target (CIB's only importer reads XML Schema item definitions), so such a reference is refused as `source.reference` with the prefix in the evidence. An unbound prefix is a namespace error, refused as `parser.failure` or `source.reference`.
- `bpmn-moddle` resolves references by identifier only and reports `unresolved reference <p:local>` as a warning. One reviewed reader rule makes exactly that warning safe: `p` bound to `targetNamespace` and an element `local` of the property's declared type present; the reader then binds the reference itself. Every other unresolved reference stays `parser.warning`. Renaming identifiers consistently cannot repair a malformed reference, because its text names no identifier before or after the renaming.
- Witnesses: [event-reference-forms](../../../scenarios/open-rows/event-reference-forms/README.md). CIB accepts `message-ref-qname` (committed), refuses `message-ref-foreign-prefix`, `typo-message-ref`, its renamed twin and `dangling-signal-ref` at deployment, as the reading does.

### Preserved inert notation

Inert content is kept only in the exact source bytes, never in the IL, and never changes execution: BPMN DI, `documentation`, Text Annotations, Associations, Groups and Categories, Lanes and Lane Sets, names, `gatewayDirection`, the Definitions' `exporter` attributes, and a User Task's opaque `rendering` (as `source.ts` already treats it). A construct that has execution meaning in BPMN 2.0.2 or in pinned CIB is never inert: it is either read into the IL or refused with a stable code. An unknown element, attribute or extension stays refused (`reader.unknownElement`, `reader.unknownAttribute`, `reader.unknownExtension`).

### Parser warnings

Every `bpmn-moddle` warning blocks admission (`parser.warning`), except the two reviewed rules that prove one safe: a warning raised inside a User Task's opaque `rendering`, and the targetNamespace-prefixed reference above. No profile downgrades a warning.

### XSD validity

The reader admits documents the BPMN 2.0.2 XSD rejects: `operationRef` written as an attribute of `messageEventDefinition`, where `tMessageEventDefinition` declares it a child element (Semantic.xsd), and an artifact placed before the flow elements of a `process`, against `tProcess`'s sequence (flow elements, then artifacts). `bpmn-moddle` reads both. Proposed place of the check: `bpmn-source`'s source admission, after the import and before the reader, as a project-owned table of each admitted container's child order and each carried property's attribute-or-element form, generated from the pinned Semantic.xsd beside the existing [semantic process metamodel](../../../packages/bpmn-source/src/bpmn-2.0.2-semantic-process-metamodel.json) and refused as `source.schema` (new). A runtime XSD validator is rejected: it adds a native or WebAssembly dependency, which needs the owner's approval, for a check a generated table covers. The hosted `xmllint` validation of registered models stays the oracle: a guard runs every model the reader admits, and a set of XSD-invalid fixtures it must refuse, against both.

### Diagnostics

Each refusal names its stable code, the element identifier when one exists and the offending text as evidence; the reader stops at the first refusal in document order, so a renamed model refuses with the same code at the renamed element.

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-AGR-0006](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0006--divergent-exclusive-gateway-first-true-and-default-routing) | Agreement on first-true and default routing |
| [CIB-INT-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0001--exclusive-gateway-candidate-order-is-xml-sequence-flow-declaration-order) | Interpretation the standards reading shares: candidate order is XML declaration order |
| [CIB-INT-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0003--an-exclusive-gateway-whose-conditions-all-fail-rolls-its-command-back) | Interpretation selected for the no-match exception: `rolledBack` |
| [CIB-INT-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0012--a-diverging-inclusive-gateway-that-selects-no-flow-rolls-its-command-back) | Interpretation selected for the Inclusive no-match exception and, by the proposed boundary extension, an Activity's own selection: `rolledBack` |
| [CIB-AGR-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0003--balanced-two-branch-parallel-gateway-lifecycle) | Agreement on balanced fork and join |
| [CIB-DEV-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow) | Candidate deviation: the kernel joins by incoming-flow provenance, CIB by arrival count |
| [CIB-INT-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0005--an-inclusive-gateway-output-without-a-condition-is-always-taken) | Interpretation selected: an unconditioned Inclusive output is always taken |
| [CIB-AGR-0017](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0017--a-structured-inclusive-join-fires-when-every-selected-branch-has-arrived) | Agreement on the Inclusive join over structured regions |
| [CIB-AGR-0015](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0015--uncontrolled-incoming-sequence-flow-at-a-none-end-event-ends-each-token-separately) | Agreement on per-token arrival at a None End |
| [CIB-AGR-0019](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0019--a-pass-through-node-passes-each-arriving-token-on-its-own-and-one-activation-starts-every-outgoing-flow) | Agreement on per-token arrival and split at a pass-through node |
| [CIB-AGR-0020](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0020--a-user-service-or-send-task-starts-one-occurrence-per-arriving-token) | Agreement on per-token arrival at User, Service and Send Tasks |
| [CIB-AGR-0022](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0022--a-none-starts-start-and-an-embedded-sub-processs-completion-take-every-unconditioned-outgoing-flow-in-their-one-step) | Agreement on the split at a None Start and a Sub-Process completion |
| [CIB-AGR-0023](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0023--a-user-service-or-send-tasks-completion-takes-every-unconditioned-outgoing-flow-in-its-one-step) | Agreement on the split at a Task's completion |
| [CIB-AGR-0018](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0018--a-link-pair-continues-the-token-as-the-sequence-flow-it-replaces) | Agreement on Link continuation; CIB pairs names resource-wide |
| [CIB-AGR-0007](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion) | Agreement on quiescent completion, which terminal forks reuse |
| [CIB-EXT-0020](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes) | Selected extension whose concurrent clause covers root and body forks |
| [CIB-EXT-0022](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) | Selected extension for pass-through Tasks, including on Parallel branches |
| [CIB-INT-0011](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0011--an-activitys-outgoing-conditions-evaluate-before-its-output-writes) | Selects `ConditionOrder.beforeOutputs` |
| [CIB-CFG-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-cfg-0005--pinned-read-only-juel-condition-environment) | Oracle configuration for calibrating gateway order and default routing with JUEL conditions |
| [CIB-OP-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0004--synchronous-juel-command-rollback-mapped-to-speculative-semantic-commitment) | Operational mapping of CIB's command rollback onto `rolledBack` |
| [CIB-EXT-0026](../../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0026--a-continuation-failure-after-an-effect-result-fails-the-job) | Selects `ContinuationFailure.incident` for a rollback after an effect result |
| [CIB-AGR-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0001--sequential-process-and-user-task-lifecycle), [CIB-OP-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0001--cib-host-task-identity-mapped-to-project-semantic-task-identity) | Inherited provenance for the User Task lifecycle in cycles and races; they establish no cycle or race meaning |
| [CIB-AGR-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0004--literal-pt1s-intermediate-catch-timer-lifecycle) | Excludes competing events: no Event-Based Gateway agreement is recorded |

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `flow.condition.foreign` | A Sequence Flow condition outside the profile's evaluator | Only Simple Boolean is evaluated until M2 (PC-CF-02, PC-DATA-07) |
| `flow.conditionalOutflow` | A condition on a flow that is neither a conditional gateway's candidate nor an Activity's or Scope's non-default flow | It would be silently ignored (§10.3.1: a condition on a default "SHALL be ignored") |
| `gateway.exclusive.unconditionedFlow` | A diverging Exclusive Gateway with two unconditioned non-default flows, or one beside a default | CIB refuses both at parse (`BpmnParse#validateExclusiveGateway`) |
| `gateway.exclusive.singleConditionWithoutDefault` | An Exclusive Gateway whose one outgoing flow is conditioned, with no default | CIB refuses it at parse (PC-CF-02) |
| `gateway.eventBased.receiveArm` | An Event-Based Gateway arm that is not a catch Event | A Receive Task arm opens through the work feature's wait (PC-CF-05) |
| `gateway.eventBased.linkArm` | An Event-Based Gateway arm that is a catching Link | A catching Link has no incoming flow (§10.5.5) (PC-CF-05, PC-BASIC-02) |
| `link.catch` | A throwing Link without exactly one catching Link of its name among its siblings | §10.5.5 one target per name |
| `link.duplicateCatch` | Two catching Links of one name anywhere in the program | §10.5.5 one target per name; CIB pairs names resource-wide (PC-BASIC-02) |
| `start.rootCombination`, `start.subProcessCombination` | A second None or Timer Start of a process; a second start of a Sub-Process | Pinned CIB parses one (PC-BASIC-01) |
| `exclusive-gateway-no-outgoing-flow`, `inclusive-gateway-no-outgoing-flow`, `activity-no-outgoing-flow` (runtime, `rolledBack`) | No candidate holds and no default | [CIB-INT-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0003--an-exclusive-gateway-whose-conditions-all-fail-rolls-its-command-back), [CIB-INT-0012](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0012--a-diverging-inclusive-gateway-that-selects-no-flow-rolls-its-command-back) |
| `condition-not-boolean` (runtime, semantic failure) | A condition whose value is not Boolean | Unreachable under Simple Boolean, which is total |
| `closure-bound` (runtime, `unsupported`, dynamic-only) | A closure longer than `Step.closureBound` | A closure's length depends on the run (PC-CF-06) |

**Superseded first-profile restrictions.** The deleted implementation admitted gateways, merges, splits, Links and cycles only in exact topologies and profiles: fixed candidate and branch counts, a required default, root-only or body-only placement, no merge under a fork, no node that both merges and splits, a resource-wide unique Link name, an explicit expression-language declaration, single-scope and terminal-fork bounds, and a per-resumption closure limit checked at admission ([XGW admission][xgw-admission], [XGW exclusions][xgw-exclusions], [XCA scope][xca-scope], [XCA admission][xca-admission], [XND scope][xnd-scope], [XND admission][xnd-admission], [IGW scope][igw-scope], [IGW profile][igw-profile], [IGW surface][igw-surface], [IGR scope][igr-scope], [IGR admission][igr-admission], [PAR boundary][par-boundary], [PAR exclusions][par-exclusions], [RPF scope][rpf-scope], [RPF admission][rpf-admission], [PTPB scope][ptpb-scope], [PTPB admission][ptpb-admission], [PTSM scope][ptsm-scope], [PTSM admission][ptsm-admission], [AISM scope][aism-scope], [AISM admission][aism-admission], [ACTH scope][acth-scope], [ACTH admission][acth-admission], [ACSP scope][acsp-scope], [ACSP admission][acsp-admission], [IFI scope][ifi-scope], [IFI admission][ifi-admission], [NEF scope][nef-scope], [NEF admission][nef-admission], [LNK scope][lnk-scope], [LNK admission][lnk-admission], [CYC profile][cyc-profile], [CYC graph admission][cyc-graph], [CYC scope][cyc-scope], [CYC CIB][cyc-cib], [EBG scope][ebg-scope], [EBG profile][ebg-profile], [EBG surface][ebg-surface], [TFK scope][tfk-scope], [TFK admission][tfk-admission], [SSM scope][ssm-scope], [SSM admission][ssm-admission], [MTC representation][mtc-representation], [SPC scope][spc-scope], [SPC admission][spc-admission]). They were admission bounds recorded as broadening "without reinterpreting an admitted model", never readings of the standard, and their profile-growth bookkeeping ([PTPB contract][ptpb-contract], [PTPB basis][ptpb-basis], [PTPB rules][ptpb-rules]) is replaced by profiles as data. The kernel admits every topology the codes above do not refuse; each surviving limit is one of those codes.

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-CF-02 | Typed conditions beyond Simple Boolean (JUEL core level, M2); the sole unconditioned flow is executed |
| PC-CF-03 | Acceptance over human and automated branches, nested regions and separate body Ends; the mechanism is present |
| PC-CF-04 | Joins after Calls and Multi-Instance, whose witnesses wait on Multi-Instance admission (M5); typed conditions (M2); unstructured joins and the split without a match are executed |
| PC-CF-05 | Receive Task arms (`gateway.eventBased.receiveArm`); the identity of a re-armed race's arms, which the retained CIB evidence numbers 1 where the kernel numbers them by the arming gateway's activation; instantiating and Parallel Event-Based Gateways, which CIB reads as plain ones when a flow reaches them (`reader.eventBasedGatewayInstantiate`, PC-BASIC-04) |
| PC-CF-06 | A declared admission limit on automatic bursts and refusal of internal-only cycles before start; today only the dynamic `closure-bound` |
| PC-CF-07 | Conditional outflow and an Activity's default flow are executed on Simple Boolean; open: the JUEL witnesses (M2's core level); CIB's order of a submission, the outgoing conditions and the output parameters; Multi-Instance body splits (M5) |
| PC-CF-08 | The frozen cross-gateway composition matrix |
| PC-BASIC-01 | Several outgoing Start flows and concurrent None Ends are executed and start combinations refused; acceptance of root-versus-child completion |
| PC-BASIC-02 | Link: several sources and a catching Link with an incoming flow are executed; a Link after an Event-Based Gateway and two catches of one name are refused (`gateway.eventBased.linkArm`, `link.duplicateCatch`); the publication of a Link pair ([LNK contract][lnk-contract]) |
| PC-BASIC-03 | Renaming and permutation invariance: only Exclusive candidate order is semantic |
| PC-BASIC-04 | Interchange forms and diagnostics of the frozen cohort, owned by `bpmn-source`: the [proposed interpretation](#interchange-forms-and-diagnostics-pc-basic-04-proposed) awaits its cold review |
| PC-HUM-05 | Manual Task as pass-through with its source kind kept in `Header.sourceType` ([work](WORK-SEMANTICS-SPEC.md)) |

## Sources

[ifi-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/IMPLICIT-FAN-IN-PROPOSAL.md#normative-basis-and-cib-classification
[ifi-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/IMPLICIT-FAN-IN-PROPOSAL.md#required-optional-and-excluded-scope
[ifi-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/IMPLICIT-FAN-IN-PROPOSAL.md#profile-and-public-contract
[ifi-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/IMPLICIT-FAN-IN-PROPOSAL.md#admission
[ifi-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/IMPLICIT-FAN-IN-PROPOSAL.md#stable-rules
[nef-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-END-FAN-IN-SPEC.md#normative-basis-and-cib-classification
[nef-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-END-FAN-IN-SPEC.md#required-optional-and-excluded-scope
[nef-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-END-FAN-IN-SPEC.md#profile-and-public-contract
[nef-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-END-FAN-IN-SPEC.md#admission
[nef-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NONE-END-FAN-IN-SPEC.md#stable-rules
[aism-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#normative-basis-and-cib-classification
[aism-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#required-optional-and-excluded-scope
[aism-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#profile-and-public-contract
[aism-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#admission
[aism-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#stable-rules
[acth-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#normative-basis-and-cib-classification
[acth-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#required-optional-and-excluded-scope
[acth-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#profile-and-public-contract
[acth-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#admission
[acth-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#stable-rules
[acsp-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#normative-basis-and-cib-classification
[acsp-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#required-optional-and-excluded-scope
[acsp-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#profile-and-public-contract
[acsp-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#admission
[acsp-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#stable-rules
[ptsm-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#normative-basis-and-cib-classification
[ptsm-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope
[ptsm-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#profile-and-public-contract
[ptsm-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#admission
[ptsm-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules
[ptpb-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#normative-basis-and-cib-classification
[ptpb-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope
[ptpb-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#profile-and-public-contract
[ptpb-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#admission
[ptpb-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#stable-rules
[tfk-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINAL-FORKS-SPEC.md#normative-basis-and-cib-classification
[tfk-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINAL-FORKS-SPEC.md#required-optional-and-excluded-scope
[tfk-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINAL-FORKS-SPEC.md#profile-and-public-contract
[tfk-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINAL-FORKS-SPEC.md#admission
[tfk-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TERMINAL-FORKS-SPEC.md#stable-rules
[ssm-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SINGLE-SCOPE-MODELS-SPEC.md#normative-basis-and-cib-classification
[ssm-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SINGLE-SCOPE-MODELS-SPEC.md#required-optional-and-excluded-scope
[ssm-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SINGLE-SCOPE-MODELS-SPEC.md#profile-and-public-contract
[ssm-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SINGLE-SCOPE-MODELS-SPEC.md#admission
[ssm-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SINGLE-SCOPE-MODELS-SPEC.md#stable-rules
[xgw-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#normative-and-profile-basis
[xgw-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#source-and-admission-boundary
[xgw-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#semantic-rules
[xgw-exclusions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md#exclusions-and-nearest-unsupported-claim
[xca-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md#normative-basis-and-cib-classification
[xca-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md#required-optional-and-excluded-scope
[xca-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md#profile-and-public-contract
[xca-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md#admission
[xca-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-ARITY-SPEC.md#stable-rules
[xnd-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#normative-basis-and-cib-classification
[xnd-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#required-optional-and-excluded-scope
[xnd-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#profile-and-public-contract
[xnd-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#admission
[xnd-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EXCLUSIVE-CHOICE-WITHOUT-DEFAULT-SPEC.md#stable-rules
[cyc-selection]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#selection-basis
[cyc-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#normative-basis
[cyc-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#selected-account-and-rejected-alternatives
[cyc-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#exact-source-profile
[cyc-graph]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#resumption-bounded-graph-admission
[cyc-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#stable-semantic-rules
[cyc-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#required-optional-and-excluded
[cyc-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#cib-relationship
[cyc-decisions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/CYCLIC-CONTROL-FLOW-SPEC.md#approved-decisions
[par-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-FORK-JOIN-SPEC.md#cib-relationship
[par-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-FORK-JOIN-SPEC.md#approved-semantic-rules
[par-boundary]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-FORK-JOIN-SPEC.md#source-and-semantic-process-il-boundary
[par-exclusions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/PARALLEL-FORK-JOIN-SPEC.md#explicit-exclusions
[rpf-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ROOT-PARALLEL-FORKS-SPEC.md#normative-basis-and-cib-classification
[rpf-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope
[rpf-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ROOT-PARALLEL-FORKS-SPEC.md#profile-and-public-contract
[rpf-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ROOT-PARALLEL-FORKS-SPEC.md#admission
[rpf-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ROOT-PARALLEL-FORKS-SPEC.md#stable-rules
[igw-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-SPEC.md#scope
[igw-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-SPEC.md#exact-source-profile
[igw-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-SPEC.md#semantic-rules
[igw-surface]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-SPEC.md#required-optional-and-excluded-surface
[igr-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#normative-basis-and-cib-classification
[igr-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#required-optional-and-excluded-scope
[igr-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#profile-and-public-contract
[igr-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#admission
[igr-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#stable-rules
[ebg-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EVENT-BASED-GATEWAY-SPEC.md#scope
[ebg-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EVENT-BASED-GATEWAY-SPEC.md#normative-and-compatibility-basis
[ebg-profile]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EVENT-BASED-GATEWAY-SPEC.md#exact-source-profile
[ebg-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EVENT-BASED-GATEWAY-SPEC.md#semantic-rules
[ebg-surface]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/EVENT-BASED-GATEWAY-SPEC.md#required-optional-and-excluded-surface
[lnk-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/LINK-EVENTS-SPEC.md#normative-basis-and-cib-classification
[lnk-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/LINK-EVENTS-SPEC.md#required-optional-and-excluded-scope
[lnk-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/LINK-EVENTS-SPEC.md#profile-and-public-contract
[lnk-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/LINK-EVENTS-SPEC.md#admission
[lnk-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/LINK-EVENTS-SPEC.md#stable-rules
[mtc-representation]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MIXED-TASK-CONTROL-FLOW-PROPOSAL.md#representation-and-admission
[spc-basis]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#normative-basis-and-inherited-accounts
[spc-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#required-optional-and-excluded-scope
[spc-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#public-contract-and-layer-ownership
[spc-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#admission-algorithm
[spc-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/STRUCTURED-PROCESS-COMPOSITION-PROPOSAL.md#semantic-rules-and-separating-examples
