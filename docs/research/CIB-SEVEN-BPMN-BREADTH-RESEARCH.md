# CIB Seven 2.2.0 executable BPMN breadth

## Status

This research inventories the pinned CIB Seven core BPMN test-resource corpus to answer one scheduling question: which uncovered reusable BPMN Process Execution mechanism should follow the runnable Temporal MVP and the implemented scope-completion/Error-propagation pair?

The inventory is a roadmap input, not a BPMN conformance measure, a CIB compatibility percentage, or evidence that every matching fixture executes the tagged construct. BPMN meaning remains owned by the standard and approved capsules; exact implementation and evidence status remain in the [implementation map](../IMPLEMENTATION-MAP.md).

## Source boundary

The inspected checkout is the pristine CIB Seven source at `5a45b47ea22688d774de97277c3ff7013f54fdd2` recorded in [SOURCES.md](../SOURCES.md#cib-seven). Its core BPMN Java and resource trees are byte-identical to the published `v2.2.0` tag at `834a9874760de8a0107f7c1b32806e37f17fb017`, so the inventory orders work against the requested CIB Seven `2.2.0` baseline without treating the checkout's `2.3.0-SNAPSHOT` identity as a `2.2.0` executable profile.

The denominator is the 1,144 `*.bpmn` and `*.bpmn20.xml` files below `engine/src/test/resources/org/cibseven/bpm/engine/test/bpmn`. It excludes Java-built models, non-core modules, examples, model-API tests, and extension-only fixtures. Counts are file-level lexical occurrences and overlap: one file may contribute to several rows.

## Inventory method and reproducibility boundary

Run `pnpm research:cib-breadth [resource-root]` to reproduce the inventory. The dependency-free classifier walks a namespace-insensitive XML element tree, excludes comments, CDATA, and processing instructions, records file counts and occurrence counts separately, and classifies the candidate attributes and direct child EventDefinitions used below. Its fixture test locks prefix independence, nested Sub-Process classification, Message-addressed Receive Tasks, sequential/parallel Multi-Instance classification, Event Sub-Process interruption, and Intermediate Throw Event triggers.

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

No inspected Receive Task carries `operationRef` or `instantiate="true"`. This matters because the already implemented Intermediate Catch Message profile deliberately requires a complete Interface → Operation → input Message chain, whereas the CIB Receive Task corpus supplies only a direct `messageRef` when it supplies an address at all.

The exact compact CIB precedent is `ReceiveTaskTest.singleReceiveTask.bpmn20.xml`: None Start → Receive Task with `messageRef="newInvoice"` → None End, plus one root Message. `ReceiveTaskTest` observes one public Message subscription, consumes it with `messageEventReceived(subscription.name, executionId)`, removes the subscription, and completes the Process. The same Java test also exercises the addressless legacy `signal(executionId)` path; that path is deliberately not evidence for the selected BPMN Message account.

## Priority decision after Error propagation

A bounded Message-addressed Receive Task is selected next. It is not selected because 121 files contain the tag; it is selected because the 17-file/18-occurrence addressed subset has a compact public-service CIB precedent and can reuse the existing Message runtime and Temporal host seam while adding only the distinct BPMN Activity/source proposition.

The implemented, independently reviewed [Message-addressed Receive Task specification](../capsules/RECEIVE-TASK-MESSAGE-SPEC.md) selects the smallest closed Message-address representation. Its project-authored phase-zero probe is green against packaged CIB Seven `2.2.0`, selecting `cibseven-2.2.0-message-addressed-receive-task-draft` and `CIB-AGR-0009` before any wire replacement. The semantic checkpoint atomically replaces the former Interface/Operation/Message-only `MessageChannel` with explicit `operationMessage` and `directMessage` arms across current producers and consumers, preserving the existing operation-addressed case without optional Interface fields, an invented Operation, or a compatibility reader under the pre-release policy.

The selected first profile is exactly one root Message and one Message-addressed Receive Task in a linear root Process. It excludes the 104 addressless CIB fixtures, `operationRef`, instantiate behavior, correlation keys, payload/data mapping, Message Flow, Collaboration, business-key or global correlation, repeated activation, Multi-Instance, boundary Events, Sub-Process combinations, and modeled Message throw. Its CIB lane establishes agreement only for the exact public Message subscription and Process lifecycle observed by the project-authored probe; it does not make CIB an authority for vendor-neutral meaning.

Event Sub-Process is deferred despite its larger count because its interrupting/non-interrupting split and seven populated trigger families would either produce an artificially weak one-off slice or reopen scope creation, event routing, regional cancellation, repetition, and concurrency together. Multi-Instance remains high leverage but requires collection cardinality, repeated Activity-instance ownership, completion accounting, and cancellation. Call Activity likewise requires new lifecycle state rather than source-level reuse of an existing wait mechanism.

## Proto-MVP ordering after Receive Task

The reviewer proto-MVP schedules bounded Inclusive Gateway, Event-Based Gateway, and Call Activity slices in that order. This is a mechanism-leverage decision, not a claim that the 29-, 16-, and 145-file fixture signals are mutually comparable coverage units.

Inclusive Gateway comes first because it extends two implemented neutral mechanisms—Simple Boolean evaluation and flow-identified tokens—while forcing one missing distinction that reviewers can observe: a converging gateway must wait for all and only the branches selected by the matching split occurrence. Pinned CIB source contains public-lifecycle precedents in `InclusiveGatewayTest#testDivergingInclusiveGateway`, `#testMergingInclusiveGateway`, and `#testPartialMergingInclusiveGateway`, and its evaluator contains a graph-reachability join account. Those are probe seeds only. The first standards proposal deliberately uses the project language rather than CIB JUEL and selects no CIB relationship before a project-owned phase-zero probe.

Event-Based Gateway follows because the existing Message and Timer waits already expose the two heterogeneous trigger mechanisms needed for the smallest deferred-choice discriminator. Pinned CIB source tests both winner directions and loser cancellation in `EventBasedGatewayTest#testCatchSignalCancelsTimer` and `#testCatchTimerCancelsSignal`, plus a three-trigger case. The project candidate substitutes the already implemented operation-addressed Message catch for Signal and restricts the timer to exact `PT1S`; any later CIB agreement claim therefore needs its own exact project fixture and public-observation probe.

Call Activity follows the gateways despite its much larger lexical footprint because it crosses the definition and instance boundaries rather than adding another flow-local transition. `CallActivityTest#testCallSimpleSubProcess` is a compact public-service probe seed, but the first project proposition still has to resolve one `calledElement` QName, create a distinct called semantic Process instance, retain the parent-child link, and resume the caller exactly once after normal called completion. Imports, Global Tasks, data matching/mapping, version or tenant selection, recursion, exceptional propagation, cancellation, and Temporal Child Workflow identity remain separate decisions.

No new CIB relationship is selected by this research update. The [requirement dependency map](../BPMN-REQUIREMENT-LEDGER.md#reviewer-proto-mvp-dependency-map) records the neutral semantic deltas. Each future capsule may register a CIB relationship only together with the required project probe and verifier boundary; the source precedents above establish feasibility, not compatibility evidence.

## Earlier priority decision

Ordinary embedded Sub-Process entry and normal completion was selected before Error propagation for four reasons:

1. It is the largest uncovered structural foundation in this bounded corpus inventory: 265 fixture files contain an ordinary embedded Sub-Process.
2. It creates explicit definition scope, runtime scope occurrence, ownership, and normal quiescent completion once; Event Sub-Processes, boundary propagation, multi-instance bodies, transactions, and nested scopes can then add their distinct propositions without inventing a second scope model.
3. CIB already supplies a compact public-service precedent for the basic lifecycle, while a two-child project witness can separate quiescent completion from premature exit.
4. Its Temporal preflight needs only the existing passive User Task Update mechanism. It does not require Child Workflows, Temporal cancellation, Signals, Timers, Activities, or host races.

Implementing the error-only proposal first would install scope entry with deliberately absent normal output and completion. Ordinary completion would then require another breaking Semantic Process definition and runtime replacement. Reversing the order makes Error propagation a cancellation-and-handler extension over an already checked scope lifecycle.

## Ordered consequences

The implemented [ordinary embedded Sub-Process specification](../capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) closed first, followed by the [Error-propagation specification](../capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md) on the same definition/runtime scope foundation. Its bounded CIB Seven `2.2.0` public-lifecycle evidence agrees in both child-command orders under `CIB-AGR-0008` without making CIB the source of BPMN meaning. The executable refresh above re-ranks the remaining constructs against the mechanisms these two capsules established.

The refresh above completed the Receive Task re-ranking. After that slice closed, the proto-MVP order applies reusable-mechanism leverage again: Inclusive Gateway deepens typed conditional branching and synchronization, Event-Based Gateway composes existing wait families under a new race owner, and Call Activity then opens cross-definition instance lifecycle. Raw prevalence does not override those dependencies.

## Limits and re-open conditions

This inventory does not count BPMN requirements, behavioral variants, combinations, or negative cases. It does not measure Collaboration, choreography, human-resource products, forms, task lists, identity, deployment, or A12 adoption. Those surfaces retain their separate denominators and scope decisions.

Re-run the inventory when the pinned CIB breadth baseline changes, when the resource denominator changes materially, or after a mechanism closes and its reusable consequences change the cheapest next capsule. The command is a reproducible research instrument and its classifier test belongs to the infrastructure gate; its changing corpus output is not a committed golden file and is not an ordinary per-commit gate because the external checkout is optional. Do not re-run it after every implementation-only commit.
