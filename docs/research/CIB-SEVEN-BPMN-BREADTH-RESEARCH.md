# CIB Seven 2.2.0 executable BPMN breadth

## Status

This research inventories the pinned CIB Seven core BPMN test-resource corpus to answer one scheduling question: which uncovered reusable BPMN Process Execution mechanism should follow the runnable Temporal MVP and the implemented scope-completion/Error-propagation pair?

The inventory is a roadmap input, not a BPMN conformance measure, a CIB compatibility percentage, or evidence that every matching fixture executes the tagged construct. BPMN meaning remains owned by the standard and approved capsules; exact implementation and evidence status remain in the applicable detail maps routed by [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md).

## Source boundary

The inspected checkout is the pristine CIB Seven source at `5a45b47ea22688d774de97277c3ff7013f54fdd2` recorded in [SOURCES.md](../SOURCES.md#cib-seven). Its core BPMN Java and resource trees are byte-identical to the published `v2.2.0` tag at `834a9874760de8a0107f7c1b32806e37f17fb017`, so the inventory orders work against the requested CIB Seven `2.2.0` baseline without treating the checkout's `2.3.0-SNAPSHOT` identity as a `2.2.0` executable profile.

The denominator is the 1,144 `*.bpmn` and `*.bpmn20.xml` files below `engine/src/test/resources/org/cibseven/bpm/engine/test/bpmn`. It excludes Java-built models, non-core modules, examples, model-API tests, and extension-only fixtures. Counts are file-level lexical occurrences and overlap: one file may contribute to several rows.

## Inventory method and reproducibility boundary

Run `pnpm research:cib-breadth [resource-root]` to reproduce the inventory. The dependency-free classifier walks a namespace-insensitive XML element tree, excludes comments, CDATA, and processing instructions, records file counts and occurrence counts separately, and classifies the candidate attributes and direct child EventDefinitions used below. Its fixture test locks prefix independence, nested Sub-Process classification, Message-addressed Receive Tasks, sequential/parallel Multi-Instance classification, Event Sub-Process interruption, Intermediate Throw Event triggers, and Boundary Event trigger/interruption/attachment classification. The lexical scanner itself is a separate owner from BPMN classification, because it is a tolerant research reader rather than the parser-backed admission boundary.

The scanner deliberately retains lexical construct signal from malformed negative-deployment fixtures and labels those files rather than treating them as executable examples. At the pinned revision it labels exactly one of 1,144 files structurally malformed under this limited tag-balance check. This is not general BPMN XML validation; source admission remains the parser-backed checked-graph boundary.

Lexical counts are scheduling signals only. They can miss a construct created by a Java model builder, count an invalid or negative deployment fixture, and say nothing about behavioral depth. A candidate therefore still needs an exact standard proposition, an executable CIB probe when a CIB relationship is selected, and a bounded capsule before implementation.

## Broad fixture signals

| Construct | Files | Occurrences |
|---|---:|---:|
| User Task | 737 | 1,341 |
| any Sub-Process | 334 | 520 |
| Boundary Event | 298 | 394 |
| Service Task | 232 | 362 |
| Multi-Instance Loop Characteristics | 160 | 180 |
| Call Activity | 145 | 152 |
| Parallel Gateway | 144 | 248 |
| Timer Event Definition | 138 | 163 |
| Receive Task | 121 | 141 |
| Intermediate Throw Event | 116 | 126 |
| Error Event Definition | 111 | 177 |
| Message Event Definition | 109 | 136 |
| Escalation Event Definition | 80 | 135 |
| Compensation Event Definition | 78 | 192 |
| Signal Event Definition | 69 | 80 |
| Exclusive Gateway | 68 | 75 |
| Intermediate Catch Event | 67 | 89 |
| Conditional Event Definition | 44 | 54 |
| Script Task | 37 | 46 |
| Inclusive Gateway | 29 | 48 |
| Terminate Event Definition | 22 | 24 |
| Transaction | 21 | 23 |
| Manual Task | 19 | 36 |
| Event-Based Gateway | 16 | 16 |
| Cancel Event Definition | 14 | 30 |
| Send Task | 9 | 9 |
| Link Event Definition | 4 | 11 |
| Business Rule Task | 2 | 2 |
| Complex Gateway | 0 | 0 |

The 334 Sub-Process files split into 265 files with at least one ordinary embedded Sub-Process, 157 with at least one Event Sub-Process, and 88 containing both. The corpus contains 340 ordinary Sub-Process occurrences and 180 Event Sub-Process occurrences.

## Exact CIB precedent for ordinary completion

The pinned source test `org.cibseven.bpm.engine.test.bpmn.subprocess.SubProcessTest#testSimpleSubProcess` deploys `SubProcessTest.testSimpleSubProcess.bpmn20.xml` and uses public runtime and task services. Starting the Process exposes the child User Task, the public Activity-instance tree contains Process → Sub-Process → User Task, completing the task destroys the child scope, and the Process ends.

That source test is a strong probe seed, not retained project evidence. It neither supplies a project-owned answer-free scenario nor establishes the richer two-child completion-order discriminator selected below.

## Post-scope candidate split

The executable refresh separates the largest remaining families into materially different propositions:

| Candidate slice | Files | Occurrences | Deciding scope fact |
|---|---:|---:|---|
| Event Sub-Process | 157 | 180 | 95 files contain interrupting starts and 62 contain non-interrupting starts; Message, Escalation, Timer, Error, Compensation, Conditional, and Signal triggers are separate propositions |
| Call Activity with `calledElement` | 117 | 123 | Requires called-definition resolution, a separately owned Process instance, and cross-definition lifecycle |
| Receive Task with `messageRef` | 17 | 18 | Can reuse the implemented passive Message subscription, delivery, refusal, observation, Signal, and replay mechanisms after a bounded address-contract decision |
| Receive Task without `messageRef` | 104 | 123 | CIB exposes a legacy execution-signal wait rather than a definition-addressed BPMN Message; this is not selected by the standard capsule |
| Multi-Instance parallel | 85 | 86 | Requires activity-instance collection and completion accounting |
| Multi-Instance sequential | 76 | 94 | Requires repeated activation and loop state; 10 occurrences also have a completion condition |
| Intermediate Throw Compensation | 49 | 54 | Depends on compensation registration and invocation |
| Intermediate Throw Escalation | 35 | 36 | Requires a new propagation family and catch loci |
| Intermediate Throw Signal | 17 | 17 | Requires broadcast/routing semantics not established by direct subscription addressing |
| Intermediate Throw Message | 9 | 10 | Requires modeled outbound delivery rather than the existing inbound catch mechanism |
| Intermediate Throw None | 4 | 4 | Small but adds little CIB breadth or mechanism leverage |

## Boundary Event candidate split

Boundary Event is the largest structural family with no closed reviewed slice of its own, and its 298 files decompose along three independent dimensions. The classifier reports each dimension separately rather than as an 88-cell matrix.

| Dimension | Slice | Files | Occurrences |
|---|---|---:|---:|
| Interruption | interrupting | 248 | 337 |
| Interruption | non-interrupting | 53 | 57 |
| Trigger | Error | 79 | 97 |
| Trigger | Timer | 72 | 77 |
| Trigger | Compensation | 66 | 105 |
| Trigger | Escalation | 33 | 38 |
| Trigger | Message | 27 | 35 |
| Trigger | Conditional | 15 | 17 |
| Trigger | Cancel | 13 | 16 |
| Trigger | Signal | 9 | 9 |
| Attachment host | Sub-Process | 103 | 116 |
| Attachment host | User Task | 93 | 108 |
| Attachment host | Service Task | 70 | 115 |
| Attachment host | Call Activity | 30 | 31 |
| Attachment host | Transaction | 12 | 15 |
| Attachment host | Receive Task | 4 | 4 |
| Attachment host | other element | 5 | 5 |

Three invariants hold over the pinned corpus and each is an independent check on the classifier: the interruption slices, the trigger slices, and the attachment slices each sum to exactly 394 occurrences. The trigger sum matching the total additionally establishes that no inspected Boundary Event carries more than one Event Definition and that none carries zero, so triggers are partitioning here even though the counter permits multiplicity. No `attachedToRef` fails to resolve, and no Link or Terminate trigger appears in a boundary position.

Occurrence counts exceed file counts most sharply for Service Task hosts, at 115 occurrences across 70 files, which reflects repeated attachment fixtures rather than 115 distinct propositions.

The committed split deliberately does not cross trigger with host, because the per-trigger host question arises once per capsule and a stored matrix would mostly hold zeros. The one-off queries behind the decisions below report 25 files and 29 occurrences of an interrupting Timer attached to a User Task, 19 files and 19 occurrences attached to a Sub-Process, 5 files attached to a Call Activity, and 10 files and 11 occurrences of a non-interrupting Timer attached to a User Task; an interrupting Message boundary on a User Task is 16 files and 20 occurrences. For comparison, the largest single combination is an interrupting Compensation boundary on a Service Task at 39 files and 71 occurrences.

Both queries reproduce the committed dimension rules — `cancelActivity !== "false"` for interruption, the local name of the element `attachedToRef` resolves to for the host, the child event definition for the trigger — and their crossed cells sum to the same 394 occurrences the three stored dimensions each sum to. The second query additionally reproduces every figure the first one published, which is what makes it comparable to them rather than a separate measurement.

## Priority decision after the interrupting Sub-Process boundary Timer

A **non-interrupting Boundary Timer Event attached to a User Task** is selected next, at a measured 10 files and 11 occurrences. That is the smallest own count among the candidates weighed here, and it is selected because it enters the one dimension of the Boundary Event decomposition that no capsule has touched.

Two of the three committed dimensions are now covered at the same cell: interrupting, Timer, on a User Task and on an embedded Sub-Process. The host axis generalized when the Sub-Process capsule replaced both `UserTask`-only attachment predicates with a fail-closed enumerated host allowlist and parameterized the durable deadline scheduler over a family descriptor. The interruption axis has no coverage at all, and it is now the axis that compounds: 53 files and 57 occurrences are non-interrupting, every remaining trigger family would otherwise have to settle non-interruption for itself, and 62 of the 157 Event Sub-Process files start non-interrupting, which is the same mechanism in a different position.

Holding the trigger and the host fixed at the pair whose interrupting arm is already closed keeps the new proposition to exactly one thing: the handler token is created beside a still-active Activity instead of replacing it, so the enclosing scope holds two live branches and its completion must account for both. The separating witness sits at the approved public observation boundary and is the inverse of `ABTIMER-INTERRUPT-01`. After the deadline fires, the host User Task must still be waiting, and completing it must continue through the normal flow rather than the boundary flow. The capsule must also settle whether the fired deadline is consumed or stays armed, because a non-interrupting Timer repeats under a cycle expression while the reviewed `PT1S` duration form fires once; bounding that to one firing is a scope decision about a legal shape, not an assumed default.

Every prerequisite is closed, and this was checked against the implementations rather than inferred from the capsules. Boundary arming, withdrawal, and both race directions come from [the interrupting Activity boundary Timer specification](../capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) together with its durable host deadline in a cancellation scope. Concurrent live branches within one scope come from [the parallel fork/join specification](../capsules/PARALLEL-FORK-JOIN-SPEC.md). Completion over several branches comes from [the ordinary embedded Sub-Process completion specification](../capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md): `isScopeOccurrenceQuiescent` already requires no token and no wait of any kind, `oneCompletionStrategyPerScope` bounds `completeScope` per scope while placing no cardinality bound on `reachNoneEnd`, and the reachable wait sets stay inside the current adapter capability at one timer beside one User Task before the firing and two User Task waits after it.

The closest alternative is an interrupting boundary Message on a User Task, at 16 files and 20 occurrences. Its former near-tie rested on justifying the attachment mechanism, and that argument is spent because the mechanism is host-generic already. What it would still generalize is the boundary *arm*, which is deadline-shaped today; that generalization reaches Signal at 9 occurrences and partly Conditional at 17, while Escalation, Compensation, and Cancel are triggered from inside the scope and reuse none of it. [The Event-Based Gateway specification](../capsules/EVENT-BASED-GATEWAY-SPEC.md) already arms a Message subscription beside a Timer and withdraws the loser, so this is the cheaper capsule and the smaller unlock, and it stays available at the same cost afterwards.

The larger families stay deferred for reasons this refresh does not change. Multi-Instance is the largest untouched family at 160 files and 180 occurrences and `BPMN-MECH-LOOP-01` has no closed slice, but it introduces repeated Activity activation, which every capsule so far has excluded, and its collection form additionally requires a variable value domain that the current string/null representation does not have. Compensation remains the heaviest family. Escalation is a successor rather than a competitor here, because its defining behavior is non-interrupting propagation and an honest slice of it needs this mechanism first.

A12 prevalence again supplies no support in either direction, because no distinct A12 model contains a Timer Event Definition at all, as [the compatibility ledger](A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) records. This selection therefore rests on standards leverage and CIB breadth only.

No CIB relationship is selected by this decision. The pinned corpus supplies the scheduling signal only; a capsule may register a relationship solely together with a project-owned phase-zero probe and verifier coverage.

This planning decision does not approve a semantic account. The proposal, its independent cold review, and the owner's approval of its decisions remain separate steps.

## Priority decision after the interrupting Activity boundary Timer

This decision is **closed**: the [interrupting Sub-Process boundary Timer specification](../capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md) is implemented and evidence-closed, and `BPMN-SUBPROCESS-BOUNDARY-TIMER-01` carries its disposition in [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md).

An **interrupting Boundary Timer Event attached to an embedded Sub-Process** is selected next, at a measured 19 files and 19 occurrences. It is not the largest remaining combination; it is selected because it generalizes the boundary mechanism along the axis that compounds.

The two candidates needing no new host mechanism are close in size: this one at 19 files and 19 occurrences, and an interrupting boundary Message on a User Task at 16 files and 20 occurrences. Leverage separates them. Attaching to a scope makes the boundary mechanism host-generic over the largest host slice in the corpus, at 103 files and 116 occurrences, and five trigger families remain that would each otherwise have to settle the scope-host question for themselves. The Message trigger instead unlocks its own 27 files and 35 occurrences and nothing beyond them, because every other remaining trigger — Compensation, Escalation, Conditional, Cancel, and Signal — needs a new trigger family regardless of which of these two lands first. So the Message boundary is the cheaper capsule and the smaller unlock, and it stays available at the same cost afterwards.

Every prerequisite is closed. Boundary arming, withdrawal, and the both-directions race come from the [interrupting Activity boundary Timer specification](../capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) together with its durable host deadline in a cancellation scope; scope entry and quiescent completion come from the [ordinary embedded Sub-Process completion specification](../capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md); regional cancellation of a live child scope preserving monotonic counters comes from the [Sub-Process Error propagation specification](../capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md).

The distinct new proposition is correspondingly narrow: a deadline scoped to a *scope occurrence* rather than an Activity occurrence, racing that scope's own quiescent completion rather than a single task's completion, and cancelling a live child region that may hold a waiting child Activity. It must settle when the deadline arms relative to scope entry and whether child quiescence or the Sub-Process's outgoing flow withdraws it — the two are the same instant only under this profile's ordering and must not be assumed equal.

A12 prevalence deliberately supplies no support here. No distinct A12 model contains a Timer Event Definition at all, as [the compatibility ledger](A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) records, so this selection rests on standards leverage and CIB breadth only. A12 does break the tie against the two largest untouched families. That ledger records Multi-Instance Loop Characteristics as absent from every distinct model by name, and Compensation appears nowhere in its surface inventory, so neither family gains priority from prevalence; both also open a new mechanism family rather than reusing an evidenced host seam.

No CIB relationship is selected by this decision. The pinned corpus supplies the scheduling signal only; a capsule may register a relationship solely together with a project-owned phase-zero probe and verifier coverage.

This planning decision does not approve a semantic account. The proposal, its independent cold review, and the owner's approval of its decisions remain separate steps.

## Earlier priority decision after the full-profile product surface

This decision is **closed**: the [interrupting Activity boundary Timer specification](../capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) is implemented and evidence-closed, and `BPMN-BOUNDARY-TIMER-01` carries its disposition in [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md).

An **interrupting Boundary Timer Event attached to an Activity** is selected next. It is not selected because Boundary Event is the largest tag family; it is selected because it is the largest boundary combination that requires no new host mechanism.

Every prerequisite is closed: the exact `PT1S` timer wait and its durable Temporal hosting come from the [Intermediate Catch Timer specification](../capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md), Activity activation and completion from the [User Task specification](../capsules/USER-TASK-INTERACTION-SPEC.md), interrupting boundary-route lowering and Activity abandonment from the [boundary-error specification](../capsules/BOUNDARY-ERROR-SPEC.md), and regional cancellation of live runtime state from the [Sub-Process Error propagation specification](../capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md). The distinct new proposition is narrow and reviewable: a timer scoped to an Activity occurrence rather than to normal flow, armed on activation, withdrawn when the Activity completes first, and racing the Activity's own completion in both directions.

Interruption is also the dominant corpus shape at 337 of 394 occurrences, so the interrupting arm is the honest first slice rather than a convenient one.

The alternatives are deliberately deferred. Compensation carries the largest single combination but requires completed-work registration, context snapshots, and reverse-order invocation, which is the heaviest uncovered family in the map. Error boundaries are already closed on both Service Task and Sub-Process hosts, so their remaining 18-file Call Activity host adds a resolution question rather than a semantic mechanism. Escalation and Conditional each open a new trigger family. A non-interrupting boundary Timer requires concurrent token creation beside a still-active Activity, which is a separate proposition from interruption and should not be bundled into the first slice. Event Sub-Process remains deferred for the reasons recorded below.

No new CIB relationship is selected by this refresh. The pinned corpus supplies candidate probe seeds only; a boundary-timer capsule may register a CIB relationship only together with a project-owned phase-zero probe and verifier coverage.

## Receive Task address evidence

No inspected Receive Task carries `operationRef` or `instantiate="true"`. This matters because the already implemented Intermediate Catch Message profile deliberately requires a complete Interface → Operation → input Message chain, whereas the CIB Receive Task corpus supplies only a direct `messageRef` when it supplies an address at all.

The exact compact CIB precedent is `ReceiveTaskTest.singleReceiveTask.bpmn20.xml`: None Start → Receive Task with `messageRef="newInvoice"` → None End, plus one root Message. `ReceiveTaskTest` observes one public Message subscription, consumes it with `messageEventReceived(subscription.name, executionId)`, removes the subscription, and completes the Process. The same Java test also exercises the addressless legacy `signal(executionId)` path; that path is deliberately not evidence for the selected BPMN Message account.

## Priority decision after Error propagation

A bounded Message-addressed Receive Task is selected next. It is not selected because 121 files contain the tag; it is selected because the 17-file/18-occurrence addressed subset has a compact public-service CIB precedent and can reuse the existing Message runtime and Temporal host seam while adding only the distinct BPMN Activity/source proposition.

The implemented, independently reviewed [Message-addressed Receive Task specification](../capsules/RECEIVE-TASK-MESSAGE-SPEC.md) selects the smallest closed Message-address representation. Its project-authored phase-zero probe is green against packaged CIB Seven `2.2.0`, selecting `cibseven-2.2.0-message-addressed-receive-task-draft` and `CIB-AGR-0009` before any wire replacement. The semantic checkpoint atomically replaces the former Interface/Operation/Message-only `MessageChannel` with explicit `operationMessage` and `directMessage` arms across current producers and consumers, preserving the existing operation-addressed case without optional Interface fields, an invented Operation, or a compatibility reader under the pre-release policy.

The selected first profile is exactly one root Message and one Message-addressed Receive Task in a linear root Process. It excludes the 104 addressless CIB fixtures, `operationRef`, instantiate behavior, correlation keys, payload/data mapping, Message Flow, Collaboration, business-key or global correlation, repeated activation, Multi-Instance, boundary Events, Sub-Process combinations, and modeled Message throw. Its CIB lane establishes agreement only for the exact public Message subscription and Process lifecycle observed by the project-authored probe; it does not make CIB an authority for vendor-neutral meaning.

Event Sub-Process is deferred despite its larger count because its interrupting/non-interrupting split and seven populated trigger families would either produce an artificially weak one-off slice or reopen scope creation, event routing, regional cancellation, repetition, and concurrency together. Multi-Instance remains high leverage but requires collection cardinality, repeated Activity-instance ownership, completion accounting, and cancellation. Call Activity likewise requires new lifecycle state rather than source-level reuse of an existing wait mechanism.

## Proto-MVP ordering after Receive Task

The reviewer proto-MVP schedules bounded Inclusive Gateway, Event-Based Gateway, and Call Activity slices in that order. This is a mechanism-leverage decision, not a claim that the 29-, 16-, and 145-file fixture signals are mutually comparable coverage units.

Inclusive Gateway comes first because it extends two implemented neutral mechanisms—Simple Boolean evaluation and flow-identified tokens—while forcing one missing distinction that reviewers can observe: a converging gateway must wait for all and only the branches selected by the matching split occurrence. Pinned CIB source contains public-lifecycle precedents in `InclusiveGatewayTest#testDivergingInclusiveGateway`, `#testMergingInclusiveGateway`, and `#testPartialMergingInclusiveGateway`, and its evaluator contains a graph-reachability join account. Those are probe seeds only. The first standards proposal deliberately uses the project language rather than CIB JUEL and selects no new or Inclusive-specific CIB relationship before a project-owned phase-zero probe; its profile metadata may retain already-implemented interaction relationships.

Event-Based Gateway follows because the existing Message and Timer waits already expose the two heterogeneous trigger mechanisms needed for the smallest deferred-choice discriminator. Pinned CIB source tests both winner directions and loser cancellation in `EventBasedGatewayTest#testCatchSignalCancelsTimer` and `#testCatchTimerCancelsSignal`, plus a three-trigger case. The project candidate substitutes the already implemented operation-addressed Message catch for Signal and restricts the timer to exact `PT1S`; any later CIB agreement claim therefore needs its own exact project fixture and public-observation probe.

Call Activity follows the gateways despite its much larger lexical footprint because it crosses the definition and instance boundaries rather than adding another flow-local transition. `CallActivityTest#testCallSimpleSubProcess` is a compact public-service probe seed, but the first project proposition still has to resolve one `calledElement` QName, create a distinct called semantic Process instance, retain the parent-child link, and resume the caller exactly once after normal called completion. Imports, Global Tasks, data matching/mapping, version or tenant selection, recursion, exceptional propagation, cancellation, and Temporal Child Workflow identity remain separate decisions.

No new CIB relationship was selected by this research update. The implemented dispositions now live in the [reviewed requirement rows](../BPMN-REQUIREMENT-LEDGER.md#reviewed-requirements) and owning capsules. A capsule registers a CIB relationship only together with the required project probe and verifier boundary; the source precedents above establish feasibility, not compatibility evidence.

## Earlier priority decision

Ordinary embedded Sub-Process entry and normal completion was selected before Error propagation for four reasons:

1. It is the largest uncovered structural foundation in this bounded corpus inventory: 265 fixture files contain an ordinary embedded Sub-Process.
2. It creates explicit definition scope, runtime scope occurrence, ownership, and normal quiescent completion once; Event Sub-Processes, boundary propagation, multi-instance bodies, transactions, and nested scopes can then add their distinct propositions without inventing a second scope model.
3. CIB already supplies a compact public-service precedent for the basic lifecycle, while a two-child project witness can separate quiescent completion from premature exit.
4. Its Temporal preflight needs only the existing passive User Task Update mechanism. It does not require Child Workflows, Temporal cancellation, Signals, Timers, Activities, or host races.

Implementing the error-only proposal first would install scope entry with deliberately absent normal output and completion. Ordinary completion would then require another breaking Semantic Process definition and runtime replacement. Reversing the order makes Error propagation a cancellation-and-handler extension over an already checked scope lifecycle.

## Ordered consequences

The implemented [ordinary embedded Sub-Process specification](../capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) closed first, followed by the [Error-propagation specification](../capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) on the same definition/runtime scope foundation. Its bounded CIB Seven `2.2.0` public-lifecycle evidence agrees in both child-command orders under `CIB-AGR-0008` without making CIB the source of BPMN meaning. The executable refresh above re-ranks the remaining constructs against the mechanisms these two capsules established.

The refresh above completed the Receive Task re-ranking. After that slice closed, the proto-MVP order applied reusable-mechanism leverage again: Inclusive Gateway deepened typed conditional branching and synchronization, Event-Based Gateway composed existing wait families under a new race owner, and Call Activity then opened cross-definition instance lifecycle. Raw prevalence did not override those dependencies.

All three proto-MVP slices and the full-profile product surface are now closed, which is why the current refresh added the Boundary Event decomposition above: with those mechanisms implemented, the cheapest remaining proposition changed, exactly the re-open condition this document records below.

## Limits and re-open conditions

This inventory does not count BPMN requirements, behavioral variants, combinations, or negative cases. It does not measure Collaboration, choreography, human-resource products, forms, task lists, identity, deployment, or A12 adoption. Those surfaces retain their separate denominators and scope decisions.

Re-run the inventory when the pinned CIB breadth baseline changes, when the resource denominator changes materially, or after a mechanism closes and its reusable consequences change the cheapest next capsule. The command is a reproducible research instrument and its classifier test belongs to the infrastructure gate; its changing corpus output is not a committed golden file and is not an ordinary per-commit gate because the external checkout is optional. Do not re-run it after every implementation-only commit.
